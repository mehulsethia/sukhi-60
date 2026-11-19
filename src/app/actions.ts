"use server";
// Server actions. Each one re-verifies the session (requireUser) and validates input with
// Zod. Writes use the user's RLS-scoped client; the service role is used only for
// scheduling and for tables users may not write directly (link codes), always with the
// verified user id.
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { markReading, readIntoPlan } from "@/server/plan-reading";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { LIMITS, settings } from "@/lib/config";
import { materializeOccurrences, scheduleSnoozeReminder } from "@/server/core";
import { isValidTime, isValidTimeZone } from "@/domain/schedule";
import { generateLinkCode, hashLinkCode, randomToken, sha256Hex } from "@/domain/router";
import { PACK_KEYS, isPackKey, packFor, packMotivation, type PackKey } from "@/domain/templates";
import type { DraftItem } from "@/domain/extraction";
import { CONSENT_KINDS, writeConsentChoices } from "@/server/consents";
import { validateUpload } from "@/server/files";
import { sendWelcome } from "@/server/checkins";
import { draftQuickPlan } from "@/server/quick-plan";
import { afterDone, cleanCode, createCircle, joinCircle, leaveCircle, newInviteCode, react, REACTIONS, type Reaction } from "@/server/circle";
import { INVITE_COOKIE } from "@/lib/invite";
import { decideSuggestion, reportBarrier, respondToNudge, type SupportResult, type SuggestionOutcome } from "@/server/support";
import { removeSubscription, saveSubscription, sendPush } from "@/server/push";
import { ctext, notifyFamily } from "@/server/companion";
import { addDays, localDateOf } from "@/domain/schedule";
import { waLink } from "@/domain/wa-ui";
import { w } from "@/domain/wa-copy";
import { businessNumber } from "@/server/wa/data";
import { claimConnectRequest, savePhone } from "@/server/wa/link";
import { notify } from "@/server/wa/send";
import { correctReading } from "@/server/readings";
import { BARRIER_CODES, cleanMotivation, normalizeRestart, normalizeStyles, parseConfidence } from "@/domain/behaviour";

export type ActionState = { ok?: boolean; error?: string; data?: Record<string, unknown> } | null;

const time = z.string().refine(isValidTime, "invalid_time");
const tz = z.string().refine(isValidTimeZone, "invalid_timezone");
const bool = z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean());

async function setUiCookies(locale: string, a11y: { large_text: boolean; high_contrast: boolean; reduce_motion: boolean }) {
  const jar = await cookies();
  const opts = { path: "/", sameSite: "lax" as const, httpOnly: false, secure: process.env.NODE_ENV === "production", maxAge: 60 * 60 * 24 * 365 };
  jar.set("sukhi_locale", locale, opts);
  jar.set("sukhi_a11y", [a11y.large_text && "large", a11y.high_contrast && "contrast", a11y.reduce_motion && "motion"].filter(Boolean).join(","), opts);
}

const ProfileSchema = z.object({
  display_name: z.string().trim().max(80).optional().default(""),
  locale: z.enum(["en", "hi", "mr"]),
  timezone: tz,
  checkin_times: z.array(time).max(6),
  quiet_start: time,
  quiet_end: time,
  reminder_frequency: z.enum(["normal", "gentle", "off"]).optional().default("normal"),
  large_text: bool,
  high_contrast: bool,
  reduce_motion: bool,
  audio_replies: bool,
  limitations: z.string().trim().max(1000).optional().default(""),
  care_notes: z.string().trim().max(2000).optional().default(""),
});

function readProfile(fd: FormData) {
  return ProfileSchema.safeParse({
    display_name: fd.get("display_name") ?? "",
    locale: fd.get("locale"),
    timezone: fd.get("timezone"),
    checkin_times: fd.getAll("checkin_times").map(String).filter(Boolean),
    quiet_start: fd.get("quiet_start"),
    quiet_end: fd.get("quiet_end"),
    reminder_frequency: fd.get("reminder_frequency") ?? "normal",
    large_text: fd.get("large_text"),
    high_contrast: fd.get("high_contrast"),
    reduce_motion: fd.get("reduce_motion"),
    audio_replies: fd.get("audio_replies"),
    limitations: fd.get("limitations") ?? "",
    care_notes: fd.get("care_notes") ?? "",
  });
}

async function saveProfile(fd: FormData, onboarding: boolean) {
  const { supabase, user } = await requireUser();
  const p = readProfile(fd);
  if (!p.success) return { error: p.error.issues[0]?.message ?? "invalid_input" } as const;
  const v = p.data;
  // Voice mode is switched from the chat, not this form: keep the saved choice (off for new accounts).
  const prev = onboarding ? null : (await supabase.from("profiles").select("accessibility").eq("id", user.id).single()).data;
  const audioReplies = !!(prev?.accessibility as { audio_replies?: boolean } | null)?.audio_replies;
  const { error } = await supabase
    .from("profiles")
    .update({
      display_name: v.display_name || null,
      locale: v.locale,
      timezone: v.timezone,
      checkin_times: v.checkin_times,
      quiet_start: v.quiet_start,
      quiet_end: v.quiet_end,
      reminder_frequency: v.reminder_frequency,
      accessibility: { large_text: v.large_text, high_contrast: v.high_contrast, reduce_motion: v.reduce_motion, audio_replies: audioReplies },
      limitations: v.limitations || null,
      care_notes: v.care_notes || null,
      ...(onboarding ? { onboarded_at: new Date().toISOString() } : {}),
    })
    .eq("id", user.id);
  if (error) return { error: "save_failed" } as const;
  await setUiCookies(v.locale, v);
  return { supabase, user } as const;
}

async function writeConsents(fd: FormData, userId: string, supabase: Awaited<ReturnType<typeof requireUser>>["supabase"]) {
  const choices = Object.fromEntries(CONSENT_KINDS.map((k) => [k, fd.get(`consent_${k}`) === "on"])) as Record<(typeof CONSENT_KINDS)[number], boolean>;
  await writeConsentChoices(supabase, userId, choices);
}


type UserDb = Awaited<ReturnType<typeof requireUser>>["supabase"];

/** Insert extracted items as unconfirmed drafts with provenance (never scheduled until confirmed). */
async function insertDraftItems(supabase: UserDb, userId: string, planId: string, documentId: string, drafts: DraftItem[]) {
  if (drafts.length === 0) return null;
  return supabase.from("plan_items").insert(
    drafts.map((d) => ({
      plan_id: planId,
      user_id: userId,
      title: d.title.slice(0, 120),
      instructions: d.instructions?.slice(0, 1000) ?? null,
      category: d.category,
      schedule_kind: d.schedule_kind,
      times: d.times,
      weekdays: d.weekdays,
      weekly_target: d.schedule_kind === "weekly_target" ? (d.weekly_target ?? 1) : d.weekly_target,
      once_date: d.schedule_kind === "once" ? (d.once_date ?? new Date().toISOString().slice(0, 10)) : null,
      status: "draft" as const,
      provenance: "extracted" as const,
      source_document_id: documentId,
      source_page: d.source_page,
      source_snippet: d.source_snippet.slice(0, 1000),
      unresolved_fields: d.unresolved_fields,
    })),
  );
}

/** Store a plan source privately under the user's folder and return its document id. */
async function storePlanSource(supabase: UserDb, userId: string, file: File) {
  const v = await validateUpload(file, ["image/jpeg", "image/png", "image/webp", "application/pdf"], LIMITS.uploadMaxBytes);
  if (!v.ok) return null;
  const path = `${userId}/${v.file.sha256.slice(0, 24)}.${v.file.ext}`;
  const up = await supabase.storage.from("plan-sources").upload(path, v.file.bytes, { contentType: v.file.mime, upsert: false });
  if (up.error && !/exists|duplicate/i.test(up.error.message)) return null;
  const existing = await supabase.from("documents").select("id").eq("bucket", "plan-sources").eq("storage_path", path).maybeSingle();
  if (existing.data) return existing.data.id;
  const { data } = await supabase.from("documents").insert({ user_id: userId, bucket: "plan-sources", storage_path: path, mime_type: v.file.mime, size_bytes: v.file.size, sha256: v.file.sha256, original_name: file.name.slice(0, 200) }).select("id").single();
  return data?.id ?? null;
}

async function createTemplatePlan(supabase: Awaited<ReturnType<typeof requireUser>>["supabase"], userId: string, key: PackKey, locale: string) {
  const tpl = packFor(key, locale);
  const { data: plan, error } = await supabase.from("care_plans").insert({ user_id: userId, title: tpl.plan, mode: "personal_goal", status: "active", source_description: "Sukhi example routine (personal goal)" }).select("id").single();
  if (error || !plan) throw new Error("plan_create_failed");
  const { data: items, error: itemErr } = await supabase.from("plan_items").insert(tpl.items.map((i) => ({ ...i, plan_id: plan.id, user_id: userId, status: "confirmed" as const, provenance: "template" as const }))).select("id");
  if (itemErr) throw new Error("item_create_failed");
  return { planId: plan.id, itemId: items?.[0]?.id ?? null };
}

/**
 * Stated behavioural preferences from a form (onboarding or settings). Both questions are
 * optional; nothing stated means defaults apply at read time (warm_gentle, encouragement).
 */
function readBehaviour(fd: FormData) {
  const styles = normalizeStyles(fd.getAll("communication_styles").map(String));
  const restart = normalizeRestart(fd.get("restart_preference"));
  const motivation = cleanMotivation(fd.get("personal_motivation"));
  // More than two styles is a validation error, not something to silently trim.
  const tooMany = new Set(fd.getAll("communication_styles").map(String)).size > 2;
  return { styles, restart, motivation, tooMany };
}

const IntakeSchema = z.object({
  setup_for: z.enum(["self", "caregiver"]).nullable(),
  care_recipient_relation: z.enum(["parent", "spouse", "child", "grandparent", "sibling", "other"]).nullable(),
  care_recipient_name: z.string().max(80).nullable(),
  health_context: z.enum(["diagnosed", "wellness", "prefer_not"]).nullable(),
  conditions: z.array(z.enum(["diabetes", "bp", "heart", "thyroid", "skin_hair", "post_surgery", "respiratory", "joints", "kidney", "mental", "pregnancy", "other"])).max(12),
  care_situation: z.enum(["discharge", "new_plan", "existing"]).nullable(),
});

const CONDITION_TEXT: Record<string, string> = {
  diabetes: "diabetes", bp: "blood pressure", heart: "a heart condition", thyroid: "thyroid", skin_hair: "a skin or hair condition",
  post_surgery: "recovery after surgery", respiratory: "a breathing condition", joints: "joint or bone problems", kidney: "a kidney condition",
  mental: "mental health", pregnancy: "pregnancy care", other: "another condition",
};
const SITUATION_TEXT: Record<string, string> = {
  discharge: "Recently came home from hospital and is settling into a routine.",
  new_plan: "Has recently started a new treatment plan.",
  existing: "Wants help keeping up with a plan they already have.",
};

/** Plain-language context facts for the assistant, phrased as what the user told us. */
function intakeFacts(v: z.infer<typeof IntakeSchema>): string[] {
  const out: string[] = [];
  if (v.setup_for === "caregiver") out.push(`The account is run by a family caregiver (${v.care_recipient_relation ?? "relative"}) on behalf of ${v.care_recipient_name || "the person receiving care"}. Address the caregiver; refer to the care recipient in the third person.`);
  if (v.health_context === "diagnosed") {
    const conds = v.conditions.map((c) => CONDITION_TEXT[c]).filter(Boolean);
    out.push(`Follows a care plan from their doctor${conds.length ? ` (user-reported: ${conds.join(", ")})` : ""}. Help them follow it as written; never suggest treatment changes.`);
    if (v.care_situation && SITUATION_TEXT[v.care_situation]) out.push(SITUATION_TEXT[v.care_situation]);
  }
  if (v.health_context === "wellness") out.push("Is working on self-chosen wellbeing goals (no doctor's plan).");
  return out.map((s) => s.slice(0, 500));
}

export async function completeOnboarding(_prev: ActionState, fd: FormData): Promise<ActionState> {
  // Phone first: it is required, and a bad one should stop onboarding before anything is saved.
  {
    const { user } = await requireUser();
    const ph = await savePhone(createAdminClient(), user.id, String(fd.get("phone") ?? ""), String(fd.get("dial") ?? ""));
    if (!ph.ok) return { error: ph.error };
    if (ph.whatsappAccount) await askToJoin(ph.whatsappAccount, user.id);
  }
  const r = await saveProfile(fd, true);
  if ("error" in r) return { error: r.error };
  const { supabase, user } = r;
  try {
    await writeConsents(fd, user.id, supabase);
    // Intake answers: self-reported context for reminders and the assistant. Never a diagnosis.
    const intake = IntakeSchema.safeParse({
      setup_for: fd.get("setup_for") || null,
      care_recipient_relation: fd.get("care_recipient_relation") || null,
      care_recipient_name: String(fd.get("care_recipient_name") ?? "").trim() || null,
      health_context: fd.get("health_context") || null,
      conditions: fd.getAll("conditions").map(String),
      care_situation: fd.get("situation") || null,
    });
    if (intake.success) {
      const v = intake.data;
      await supabase.from("profiles").update({ ...v, care_recipient_relation: v.setup_for === "caregiver" ? v.care_recipient_relation : null, care_recipient_name: v.setup_for === "caregiver" ? v.care_recipient_name : null }).eq("id", user.id);
      const facts = intakeFacts(v);
      if (facts.length) await createAdminClient().from("memory_facts").insert(facts.map((content) => ({ user_id: user.id, kind: "context" as const, content, source_type: "onboarding" as const, status: "confirmed" as const })));
    }
    // Behavioural preferences (step 6) and personal motivation (step 5): optional.
    const b = readBehaviour(fd);
    if (!b.tooMany && (b.styles.length || b.restart || b.motivation)) {
      await supabase.from("profiles").update({
        communication_styles: b.styles,
        restart_preference: b.restart,
        personal_motivation: b.motivation,
        behaviour_prefs_updated_at: b.styles.length || b.restart ? new Date().toISOString() : null,
      }).eq("id", user.id);
    }
    const confidence = parseConfidence(fd.get("habit_confidence"));
    const tpl = String(fd.get("template") ?? "none");
    // Ready-made packs (one tap each) plus the older single-template field.
    const packs = [...new Set([...fd.getAll("packs").map(String), tpl])].filter(isPackKey).slice(0, 4);
    for (const key of packs) {
      const created = await createTemplatePlan(supabase, user.id, key, String(fd.get("locale") ?? "en"));
      if (confidence !== null) await supabase.from("habit_confidence").insert({ user_id: user.id, plan_id: created.planId, item_id: created.itemId, confidence });
    }
    if (packs.length) await materializeOccurrences(createAdminClient(), user.id, 7);
    // The assistant says hello first, so the chat is never empty.
    await sendWelcome(createAdminClient(), user.id).catch(() => undefined);
    // Came from a friend's invite link: join their circle now.
    const jar = await cookies();
    const invite = jar.get(INVITE_COOKIE)?.value;
    if (invite) {
      await joinCircle(createAdminClient(), user.id, invite).catch(() => undefined);
      jar.delete(INVITE_COOKIE);
    }
    if (tpl === "clinician") {
      const { data: plan, error: planErr } = await supabase
        .from("care_plans")
        .insert({
          user_id: user.id,
          title: String(fd.get("plan_title") || "My care team's instructions").slice(0, 120),
          mode: "clinician_instructions",
          status: "active",
          clinician_name: String(fd.get("clinician_name") ?? "").trim().slice(0, 120) || null,
          source_description: String(fd.get("source_description") ?? "").trim().slice(0, 500) || null,
        })
        .select("id")
        .single();
      if (planErr || !plan) throw new Error("plan_create_failed");
      if (confidence !== null) await supabase.from("habit_confidence").insert({ user_id: user.id, plan_id: plan.id, confidence });
      const file = fd.get("plan_file");
      let reading = false;
      if (file instanceof File && file.size > 0) {
        const docId = await storePlanSource(supabase, user.id, file);
        if (docId) {
          await supabase.from("care_plans").update({ source_document_id: docId }).eq("id", plan.id);
          // Read in the background: the person lands on their plan at once and sees progress there.
          const admin = createAdminClient();
          await markReading(admin, user.id, docId);
          const hint = String(fd.get("plan_hint") ?? "").slice(0, 600);
          const planId = plan.id;
          after(() => readIntoPlan(createAdminClient(), user.id, planId, docId, hint).then(() => undefined, () => undefined));
          reading = true;
        }
      }
      redirect(`/plan/${plan.id}?from=onboarding${reading ? "&reading=1" : ""}`);
    }
  } catch (e) {
    if (e && typeof e === "object" && "digest" in e) throw e; // let redirect() through
    return { error: "save_failed" };
  }
  redirect("/today");
}

export async function savePreferences(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const r = await saveProfile(fd, false);
  if ("error" in r) return { error: r.error };
  await materializeOccurrences(createAdminClient(), r.user.id, 7).catch(() => undefined);
  revalidatePath("/", "layout");
  return { ok: true };
}

/** Settings → Support style. Editable any time; never overwritten by learned signals. */
export async function saveSupportPreferences(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase, user } = await requireUser();
  const b = readBehaviour(fd);
  if (b.tooMany) return { error: "too_many_styles" };
  const { error } = await supabase
    .from("profiles")
    .update({ communication_styles: b.styles, restart_preference: b.restart, personal_motivation: b.motivation, behaviour_prefs_updated_at: new Date().toISOString() })
    .eq("id", user.id);
  if (error) return { error: "save_failed" };
  revalidatePath("/settings");
  revalidatePath("/today");
  return { ok: true };
}

/** Forget learned observations (counted from now on). Stated preferences are kept. */
export async function resetLearnedSignals(): Promise<ActionState> {
  const { supabase, user } = await requireUser();
  const { error } = await supabase.from("profiles").update({ learning_reset_at: new Date().toISOString() }).eq("id", user.id);
  if (error) return { error: "save_failed" };
  revalidatePath("/settings");
  return { ok: true };
}

/** Hide the "choose how Sukhi talks to you" prompt on this device. */
export async function dismissSupportPrompt() {
  await requireUser();
  (await cookies()).set("sukhi_support_prompt", "dismissed", { path: "/", sameSite: "lax", httpOnly: true, secure: process.env.NODE_ENV === "production", maxAge: 60 * 60 * 24 * 180 });
  revalidatePath("/today");
}

const BarrierInput = z.object({
  occurrence_id: z.string().uuid(),
  code: z.enum(BARRIER_CODES),
  key: z.string().min(8).max(120),
  nudge_id: z.string().uuid().nullable().optional(),
});

/** A reason tapped under a missed habit or a restart follow-up. Never changes the plan. */
export async function reportBarrierAction(input: { occurrence_id: string; code: string; key: string; nudge_id?: string | null }): Promise<{ ok: true; support: SupportResult } | { ok: false; error: string }> {
  const { user } = await requireUser();
  const v = BarrierInput.safeParse(input);
  if (!v.success) return { ok: false, error: "invalid_input" };
  try {
    const support = await reportBarrier(createAdminClient(), user.id, { occurrenceId: v.data.occurrence_id, code: v.data.code, idempotencyKey: v.data.key, nudgeEventId: v.data.nudge_id ?? null });
    return { ok: true, support };
  } catch (e) {
    return { ok: false, error: e instanceof Error && e.message === "not_found" ? "not_found" : "save_failed" };
  }
}

/** Accept or decline a suggestion. The only path by which a suggestion can change a plan. */
export async function decideSuggestionAction(input: { suggestion_id: string; decision: "accept" | "decline"; time?: string | null }): Promise<SuggestionOutcome> {
  const { supabase, user } = await requireUser();
  const id = z.string().uuid().safeParse(input.suggestion_id);
  if (!id.success || !["accept", "decline"].includes(input.decision)) return { ok: false, result: "invalid" };
  const r = await decideSuggestion(createAdminClient(), supabase, user.id, { suggestionId: id.data, decision: input.decision, time: input.time ?? null });
  if (r.ok && r.result === "accepted") {
    revalidatePath("/today");
    revalidatePath("/plan", "layout");
  }
  return r;
}

export async function respondToNudgeAction(nudgeId: string, response: "did_it" | "dismissed") {
  const { user } = await requireUser();
  if (!z.string().uuid().safeParse(nudgeId).success || !["did_it", "dismissed"].includes(response)) return;
  await respondToNudge(createAdminClient(), user.id, nudgeId, response);
}

export async function saveConsents(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase, user } = await requireUser();
  try {
    await writeConsents(fd, user.id, supabase);
  } catch {
    return { error: "save_failed" };
  }
  revalidatePath("/settings");
  return { ok: true };
}

/**
 * A quick reply tapped on a reminder or check-in in the chat. Records the check-in exactly
 * like a WhatsApp reply would, and writes both sides into the conversation.
 */
export async function chatQuickAction(occurrenceId: string, kind: "done" | "later" | "skipped" | "unable", key: string): Promise<{ ok: boolean; messages?: { id: string; role: "user" | "assistant"; content: string }[]; error?: string }> {
  const { supabase, user } = await requireUser();
  if (!z.string().uuid().safeParse(occurrenceId).success || !["done", "later", "skipped", "unable"].includes(kind) || key.length < 8) return { ok: false, error: "invalid_input" };
  const { data: occ } = await supabase.from("action_occurrences").select("id, plan_items!inner(title)").eq("id", occurrenceId).maybeSingle();
  if (!occ) return { ok: false, error: "not_found" };
  const title = (occ.plan_items as unknown as { title: string }).title;
  const { data, error } = await supabase.rpc("record_check_in", { p_occurrence: occurrenceId, p_kind: kind, p_idempotency_key: key });
  if (error) return { ok: false, error: error.message.includes("not_yet_due") ? "not_yet_due" : "save_failed" };
  if (kind === "later") await scheduleSnoozeReminder(createAdminClient(), user.id, occurrenceId);
  const r = (data ?? {}) as { result?: string; rewards?: { kind: string; points: number; label: string }[] };
  if (kind === "done") after(() => afterDone(createAdminClient(), user.id, r.rewards ?? []).catch(() => undefined));
  const { data: profile } = await supabase.from("profiles").select("locale").eq("id", user.id).single();
  const locale = profile?.locale ?? "en";
  const { reply, rewardLine } = await import("@/domain/replies");
  const t = await (await import("next-intl/server")).getTranslations();
  const ack = r.result === "already_recorded" || r.result === "already_counted" ? reply(locale, r.result, { title }) : reply(locale, `recorded_${kind}` as "recorded_done", { title });
  const pts = rewardLine(locale, r.rewards ?? []);
  const admin = createAdminClient();
  const ref = [{ type: "occurrence", id: occurrenceId, label: title }];
  const u = await admin.from("messages").insert({ user_id: user.id, role: "user", channel: "web", content: t(`chatUi.quick_${kind}`, { title }), source_refs: ref as never }).select("id, content").single();
  const a = await admin.from("messages").insert({ user_id: user.id, role: "assistant", channel: "web", content: [ack, pts].filter(Boolean).join(" "), source_refs: ref as never }).select("id, content").single();
  revalidatePath("/today");
  revalidatePath("/progress");
  revalidatePath("/circle"); // points, streaks and today counts
  return { ok: true, messages: [u.data && { id: u.data.id, role: "user" as const, content: u.data.content }, a.data && { id: a.data.id, role: "assistant" as const, content: a.data.content }].filter(Boolean) as { id: string; role: "user" | "assistant"; content: string }[] };
}

/** Daily activity for engagement metrics (one row per user per local day). */
export async function pingActivity() {
  const { supabase } = await requireUser();
  await supabase.rpc("touch_activity");
}

/** The chat was opened: clears the unread badge on this device. */
export async function markChatSeen() {
  await requireUser();
  (await cookies()).set("sukhi_chat_seen", new Date().toISOString(), { path: "/", sameSite: "lax", httpOnly: true, secure: process.env.NODE_ENV === "production", maxAge: 60 * 60 * 24 * 365 });
}

/** Chat mode toggle (Text / Voice). Stored as accessibility.audio_replies so Settings stays in sync. */
export async function setChatVoiceMode(on: boolean) {
  const { supabase, user } = await requireUser();
  const { data } = await supabase.from("profiles").select("accessibility").eq("id", user.id).single();
  const accessibility = { ...((data?.accessibility as Record<string, unknown> | null) ?? {}), audio_replies: z.boolean().parse(on) };
  await supabase.from("profiles").update({ accessibility }).eq("id", user.id);
}

/** Read a plan's source document again (after a failure or a stalled read), in the background. */
export async function retryPlanReading(fd: FormData) {
  const { supabase, user } = await requireUser();
  const planId = z.string().uuid().parse(fd.get("plan_id"));
  const { data: plan } = await supabase.from("care_plans").select("id, source_document_id").eq("id", planId).maybeSingle();
  if (!plan?.source_document_id) return;
  const docId = plan.source_document_id;
  await markReading(createAdminClient(), user.id, docId);
  after(() => readIntoPlan(createAdminClient(), user.id, planId, docId).then(() => undefined, () => undefined));
  revalidatePath(`/plan/${planId}`);
}

/** Mark in-app notifications as read on this device. */
export async function markNotificationsRead() {
  await requireUser();
  (await cookies()).set("sukhi_notif_seen", new Date().toISOString(), { path: "/", sameSite: "lax", httpOnly: true, secure: process.env.NODE_ENV === "production", maxAge: 60 * 60 * 24 * 365 });
}

// ---------------------------------------------------------------------------
// Plans
// ---------------------------------------------------------------------------
const PlanSchema = z.object({
  title: z.string().trim().min(1).max(120),
  mode: z.enum(["clinician_instructions", "personal_goal"]),
  clinician_name: z.string().trim().max(120).optional(),
  source_description: z.string().trim().max(500).optional(),
});

export async function createPlan(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase, user } = await requireUser();
  const p = PlanSchema.safeParse({ title: fd.get("title"), mode: fd.get("mode"), clinician_name: fd.get("clinician_name") || undefined, source_description: fd.get("source_description") || undefined });
  if (!p.success) return { error: "invalid_input" };
  const { data, error } = await supabase.from("care_plans").insert({ user_id: user.id, status: "active", ...p.data }).select("id").single();
  if (error || !data) return { error: "save_failed" };
  redirect(`/plan/${data.id}`);
}

export async function addTemplate(fd: FormData) {
  await addPacks([String(fd.get("template"))]);
}

/** Several packs at once (Today's picker). */
export async function addTemplates(fd: FormData) {
  await addPacks(fd.getAll("packs").map(String));
}

async function addPacks(raw: string[]) {
  const { supabase, user } = await requireUser();
  const keys = [...new Set(raw)].filter(isPackKey).slice(0, PACK_KEYS.length);
  if (!keys.length) return;
  const { data: prof } = await supabase.from("profiles").select("personal_motivation, locale").eq("id", user.id).single();
  const locale = prof?.locale ?? "en";
  for (const key of keys) await createTemplatePlan(supabase, user.id, key, locale);
  // Packs bring their "why": keep it as the person's goal if they haven't told us one.
  if (!prof?.personal_motivation) {
    const motivation = packMotivation(keys, locale);
    await supabase.from("profiles").update({ personal_motivation: motivation }).eq("id", user.id);
  }
  await materializeOccurrences(createAdminClient(), user.id, 7);
  revalidatePath("/plan");
  revalidatePath("/today");
}

/** "Tell Sukhi" (typed or spoken) → a ready personal plan, scheduled at once. */
export async function createQuickPlan(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase, user } = await requireUser();
  const text = String(fd.get("wish") ?? "").trim().slice(0, 1000);
  if (text.length < 3) return { error: "empty" };
  const r = await draftQuickPlan(text);
  if (!r.ok) return { error: r.error };
  const { data: plan, error } = await supabase.from("care_plans").insert({ user_id: user.id, title: r.plan.title, mode: "personal_goal", status: "active", source_description: "Made by Sukhi from your words (personal goal)" }).select("id").single();
  if (error || !plan) return { error: "save_failed" };
  const { error: itemErr } = await supabase.from("plan_items").insert(r.plan.items.map((i) => ({ ...i, instructions: null, weekdays: [], plan_id: plan.id, user_id: user.id, status: "confirmed" as const, provenance: "manual" as const })));
  if (itemErr) return { error: "save_failed" };
  if (r.plan.motivation) {
    const { data: prof } = await supabase.from("profiles").select("personal_motivation").eq("id", user.id).single();
    if (!prof?.personal_motivation) await supabase.from("profiles").update({ personal_motivation: r.plan.motivation.slice(0, 280) }).eq("id", user.id);
  }
  await materializeOccurrences(createAdminClient(), user.id, 7).catch(() => undefined);
  revalidatePath("/today");
  redirect(`/plan/${plan.id}`);
}

/** One step: photo of the doctor's note → plan; reading happens in the background. */
export async function createDoctorPlan(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase, user } = await requireUser();
  const file = fd.get("plan_file");
  if (!(file instanceof File) || file.size === 0) return { error: "missing_file" };
  const { data: plan, error } = await supabase.from("care_plans").insert({ user_id: user.id, title: String(fd.get("plan_title") || "My doctor's plan").slice(0, 120), mode: "clinician_instructions", status: "active" }).select("id").single();
  if (error || !plan) return { error: "save_failed" };
  const docId = await storePlanSource(supabase, user.id, file);
  if (!docId) return { error: "upload_failed" };
  await supabase.from("care_plans").update({ source_document_id: docId }).eq("id", plan.id);
  const admin = createAdminClient();
  await markReading(admin, user.id, docId);
  const hint = String(fd.get("plan_hint") ?? "").slice(0, 600);
  const planId = plan.id;
  after(() => readIntoPlan(createAdminClient(), user.id, planId, docId, hint).then(() => undefined, () => undefined));
  redirect(`/plan/${plan.id}?reading=1`);
}

export async function setPlanStatus(fd: FormData) {
  const { supabase, user } = await requireUser();
  const id = z.string().uuid().parse(fd.get("plan_id"));
  const status = z.enum(["active", "paused", "archived"]).parse(fd.get("status"));
  // Any manual status change clears a "pause until" date.
  await supabase.from("care_plans").update({ status, paused_until: null, pause_reason: null }).eq("id", id).eq("user_id", user.id);
  if (status === "active") await materializeOccurrences(createAdminClient(), user.id, 7);
  revalidatePath(`/plan/${id}`);
  revalidatePath("/today");
}

/** Pause a plan until a date (travel, festival, fasting...). It resumes by itself on that date. */
export async function pausePlanUntil(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase, user } = await requireUser();
  const id = z.string().uuid().safeParse(fd.get("plan_id"));
  const until = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).safeParse(fd.get("until"));
  const reason = z.enum(["travel", "festival", "fasting", "unwell", "other"]).safeParse(fd.get("reason") || "other");
  if (!id.success || !until.success || !reason.success) return { error: "invalid_input" };
  const { data: profile } = await supabase.from("profiles").select("timezone").eq("id", user.id).single();
  const today = localDateOf(new Date(), profile?.timezone ?? "Asia/Kolkata");
  if (until.data <= today || until.data > addDays(today, 90)) return { error: "invalid_date" };
  const { error } = await supabase.from("care_plans").update({ status: "paused", paused_until: until.data, pause_reason: reason.data }).eq("id", id.data).eq("user_id", user.id);
  if (error) return { error: "save_failed" };
  revalidatePath(`/plan/${id.data}`);
  revalidatePath("/plan");
  revalidatePath("/today");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Medicine stock (a count only: never changes the schedule or dose)
// ---------------------------------------------------------------------------
export async function setStock(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase, user } = await requireUser();
  const id = z.string().uuid().safeParse(fd.get("item_id"));
  const mode = fd.get("mode") === "add" ? "add" : fd.get("mode") === "clear" ? "clear" : "set";
  const count = z.coerce.number().int().min(0).max(10000).safeParse(fd.get("count") || 0);
  const perDose = z.coerce.number().int().min(1).max(20).safeParse(fd.get("units_per_dose") || 1);
  if (!id.success || !count.success || !perDose.success) return { error: "invalid_input" };
  const { data: item } = await supabase.from("plan_items").select("id, plan_id, stock_count").eq("id", id.data).eq("user_id", user.id).maybeSingle();
  if (!item) return { error: "not_found" };
  const next = mode === "clear" ? null : mode === "add" ? Math.min(10000, (item.stock_count ?? 0) + count.data) : count.data;
  const { error } = await supabase.from("plan_items").update({ stock_count: next, units_per_dose: perDose.data, stock_updated_at: new Date().toISOString() }).eq("id", item.id).eq("user_id", user.id);
  if (error) return { error: "save_failed" };
  revalidatePath(`/plan/${item.plan_id}`);
  revalidatePath("/today");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Phone notifications (web push)
// ---------------------------------------------------------------------------
const PushSub = z.object({ endpoint: z.string().url().startsWith("https://").max(1000), p256dh: z.string().min(10).max(200), auth: z.string().min(8).max(100), userAgent: z.string().max(300).nullable().optional() });

export async function savePushSubscriptionAction(input: { endpoint: string; p256dh: string; auth: string; userAgent?: string | null }): Promise<{ ok: boolean }> {
  const { user } = await requireUser();
  const v = PushSub.safeParse(input);
  if (!v.success) return { ok: false };
  return { ok: await saveSubscription(createAdminClient(), user.id, v.data) };
}

export async function removePushSubscriptionAction(endpoint: string) {
  const { user } = await requireUser();
  if (typeof endpoint !== "string" || endpoint.length > 1000) return;
  await removeSubscription(createAdminClient(), user.id, endpoint);
}

export async function sendTestPushAction(): Promise<{ sent: number }> {
  const { supabase, user } = await requireUser();
  const { data: p } = await supabase.from("profiles").select("locale").eq("id", user.id).single();
  const l = p?.locale ?? "en";
  return { sent: await sendPush(createAdminClient(), user.id, { title: ctext(l, "pushTestTitle"), body: ctext(l, "pushTest"), url: "/today", tag: "test" }) };
}

// ---------------------------------------------------------------------------
// Mood, stress and sleep (one per local day; no free text)
// ---------------------------------------------------------------------------
export async function saveMood(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase, user } = await requireUser();
  const v = z.object({
    mood: z.coerce.number().int().min(1).max(5),
    stress: z.coerce.number().int().min(1).max(3).nullable(),
    sleep_quality: z.coerce.number().int().min(1).max(3).nullable(),
    sleep_hours: z.coerce.number().min(0).max(16).multipleOf(0.5).nullable(),
  }).safeParse({ mood: fd.get("mood"), stress: fd.get("stress") || null, sleep_quality: fd.get("sleep_quality") || null, sleep_hours: fd.get("sleep_hours") || null });
  if (!v.success) return { error: "invalid_input" };
  const { data: profile } = await supabase.from("profiles").select("timezone").eq("id", user.id).single();
  const local_date = localDateOf(new Date(), profile?.timezone ?? "Asia/Kolkata");
  const { data: existing } = await supabase.from("mood_checkins").select("id").eq("user_id", user.id).eq("local_date", local_date).maybeSingle();
  const { error } = existing
    ? await supabase.from("mood_checkins").update(v.data).eq("id", existing.id)
    : await supabase.from("mood_checkins").insert({ user_id: user.id, local_date, ...v.data });
  if (error) return { error: "save_failed" };
  revalidatePath("/today");
  revalidatePath("/progress");
  revalidatePath("/circle"); // points, streaks and today counts
  return { ok: true, data: { low: v.data.mood <= 2 || v.data.stress === 3 } };
}

// ---------------------------------------------------------------------------
// Family: "let my family know" (patient-initiated, per event) and reading alerts
// ---------------------------------------------------------------------------
export async function shareNotWellAction(): Promise<{ ok: boolean; sent: number }> {
  const { supabase, user } = await requireUser();
  const { data: profile } = await supabase.from("profiles").select("timezone").eq("id", user.id).single();
  const sent = await notifyFamily(createAdminClient(), user.id, "not_well", localDateOf(new Date(), profile?.timezone ?? "Asia/Kolkata"));
  return { ok: true, sent };
}

export async function markFamilyAlertsSeen(accessId: string) {
  const { supabase, user } = await requireUser();
  if (!z.string().uuid().safeParse(accessId).success) return;
  await supabase.from("family_alerts").update({ seen_at: new Date().toISOString() }).eq("access_id", accessId).eq("member_user_id", user.id).is("seen_at", null);
}

// ---------------------------------------------------------------------------
// Doctor-visit prep: questions to ask (stored as confirmed "open question" memories)
// ---------------------------------------------------------------------------
export async function addDoctorQuestion(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const { user } = await requireUser();
  const q = z.string().trim().min(3).max(300).safeParse(fd.get("question"));
  if (!q.success) return { error: "invalid_input" };
  const { error } = await createAdminClient().from("memory_facts").insert({ user_id: user.id, kind: "open_question", content: q.data, source_type: "settings", status: "confirmed" });
  if (error) return { error: "save_failed" };
  revalidatePath("/visit");
  return { ok: true };
}

const ItemSchema = z
  .object({
    title: z.string().trim().min(1).max(120),
    instructions: z.string().trim().max(1000).optional(),
    category: z.enum(["medication", "activity", "measurement", "nutrition", "appointment", "rest", "other"]),
    schedule_kind: z.enum(["daily", "weekdays", "weekly_target", "once"]),
    times: z.array(time).max(8),
    weekdays: z.array(z.coerce.number().int().min(1).max(7)).max(7),
    weekly_target: z.coerce.number().int().min(1).max(7).nullable(),
    once_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
    window_minutes: z.coerce.number().int().min(15).max(1440),
    evidence_hint: z.enum(["none", "photo", "text", "any"]),
    allowed_alternatives: z.string().trim().max(500).optional(),
  })
  .superRefine((v, ctx) => {
    if ((v.schedule_kind === "daily" || v.schedule_kind === "weekdays" || v.schedule_kind === "once") && v.times.length === 0) ctx.addIssue({ code: "custom", message: "times_required" });
    if (v.schedule_kind === "weekdays" && v.weekdays.length === 0) ctx.addIssue({ code: "custom", message: "weekdays_required" });
    if (v.schedule_kind === "weekly_target" && !v.weekly_target) ctx.addIssue({ code: "custom", message: "weekly_target_required" });
    if (v.schedule_kind === "once" && !v.once_date) ctx.addIssue({ code: "custom", message: "date_required" });
  });

function parseItem(fd: FormData) {
  return ItemSchema.safeParse({
    title: fd.get("title"),
    instructions: fd.get("instructions") || undefined,
    category: fd.get("category"),
    schedule_kind: fd.get("schedule_kind"),
    times: String(fd.get("times") ?? "").split(",").map((s) => s.trim()).filter(Boolean),
    weekdays: fd.getAll("weekdays").map(String),
    weekly_target: fd.get("weekly_target") ? fd.get("weekly_target") : null,
    once_date: fd.get("once_date") || null,
    window_minutes: fd.get("window_minutes") || 180,
    evidence_hint: fd.get("evidence_hint") || "none",
    allowed_alternatives: fd.get("allowed_alternatives") || undefined,
  });
}

export async function saveItem(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase, user } = await requireUser();
  const intent = fd.get("intent") === "confirm" ? "confirm" : "draft";
  const itemId = z.string().uuid().safeParse(fd.get("item_id"));
  const planId = z.string().uuid().safeParse(fd.get("plan_id"));
  if (!planId.success || (fd.get("item_id") && !itemId.success)) return { error: "invalid_input" };
  const parsed = parseItem(fd);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "invalid_input" };
  const resolved = fd.get("resolved") === "on";

  try {
    if (itemId.success) {
      const { data: existing } = await supabase.from("plan_items").select("status, unresolved_fields").eq("id", itemId.data).maybeSingle();
      if (!existing) return { error: "not_found" };
      const unresolved = resolved ? [] : (existing.unresolved_fields ?? []);
      if (intent === "confirm" && unresolved.length) return { error: "unresolved_fields" };
      // One statement: the edit and the move back to draft land together (a confirmed item can't
      // change silently), so a failed save never strands the item as a half-edited draft.
      const { error } = await supabase.from("plan_items").update({ ...parsed.data, unresolved_fields: unresolved, status: "draft" }).eq("id", itemId.data);
      if (error) return { error: "save_failed" };
      if (intent === "confirm") {
        const { error: cErr } = await supabase.from("plan_items").update({ status: "confirmed" }).eq("id", itemId.data);
        if (cErr) return { error: "confirm_failed" };
      }
    } else {
      const { error } = await supabase.from("plan_items").insert({ ...parsed.data, plan_id: planId.data, user_id: user.id, status: intent === "confirm" ? "confirmed" : "draft", provenance: "manual" });
      if (error) return { error: "save_failed" };
    }
  } catch {
    return { error: "save_failed" };
  }
  // The item is saved; scheduling its reminders must not turn a save into an error.
  if (intent === "confirm") await materializeOccurrences(createAdminClient(), user.id, 7).catch(() => undefined);
  revalidatePath(`/plan/${planId.data}`);
  revalidatePath("/today");
  return { ok: true };
}

export async function setItemStatus(fd: FormData) {
  const { supabase, user } = await requireUser();
  const id = z.string().uuid().parse(fd.get("item_id"));
  const planId = z.string().uuid().parse(fd.get("plan_id"));
  const status = z.enum(["confirmed", "paused", "retired", "draft"]).parse(fd.get("status"));
  await supabase.from("plan_items").update({ status }).eq("id", id).eq("user_id", user.id);
  if (status === "confirmed") await materializeOccurrences(createAdminClient(), user.id, 7);
  revalidatePath(`/plan/${planId}`);
  revalidatePath("/today");
}

export async function addExtractedDrafts(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase, user } = await requireUser();
  const planId = z.string().uuid().parse(fd.get("plan_id"));
  const docId = z.string().uuid().parse(fd.get("document_id"));
  const picked = fd.getAll("pick").map(Number);
  const { data: doc } = await supabase.from("documents").select("id, extraction").eq("id", docId).single();
  const drafts = ((doc?.extraction as { drafts?: DraftItem[] } | null)?.drafts ?? []).filter((_, i) => picked.includes(i));
  if (!doc || drafts.length === 0) return { error: "nothing_selected" };
  await supabase.from("care_plans").update({ source_document_id: doc.id }).eq("id", planId);
  const res = await insertDraftItems(supabase, user.id, planId, doc.id, drafts);
  const error = res?.error;
  if (error) return { error: "save_failed" };
  revalidatePath(`/plan/${planId}`);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Check-ins and reviews
// ---------------------------------------------------------------------------
export async function checkIn(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase, user } = await requireUser();
  const occurrence = z.string().uuid().safeParse(fd.get("occurrence_id"));
  const kind = z.enum(["done", "later", "skipped", "unable", "missed"]).safeParse(fd.get("kind"));
  const key = z.string().min(8).max(120).safeParse(fd.get("idempotency_key"));
  if (!occurrence.success || !kind.success || !key.success) return { error: "invalid_input" };
  const reason = String(fd.get("reason") ?? "").slice(0, 300) || undefined;
  const barrier = z.enum(BARRIER_CODES).safeParse(fd.get("barrier"));
  const { data, error } = await supabase.rpc("record_check_in", { p_occurrence: occurrence.data, p_kind: kind.data, p_idempotency_key: key.data, p_reason: reason });
  if (error) return { error: error.message.includes("not_yet_due") ? "not_yet_due" : error.message.includes("paused") ? "paused" : "save_failed" };
  if (kind.data === "later") await scheduleSnoozeReminder(createAdminClient(), user.id, occurrence.data);
  if (kind.data === "done") after(() => afterDone(createAdminClient(), user.id, ((data as { rewards?: { kind: string; label: string }[] } | null)?.rewards) ?? []).catch(() => undefined));
  let support: SupportResult | null = null;
  // Optional reason chip on a skip: record it and offer safe, user-confirmed support.
  if (barrier.success && (kind.data === "skipped" || kind.data === "missed")) {
    const checkInId = (data as { check_in_id?: string } | null)?.check_in_id ?? null;
    support = await reportBarrier(createAdminClient(), user.id, { occurrenceId: occurrence.data, code: barrier.data, idempotencyKey: `ci:${key.data}`.slice(0, 120), checkInId }).catch(() => null);
  }
  revalidatePath("/today");
  revalidatePath("/progress");
  revalidatePath("/circle"); // points, streaks and today counts
  return { ok: true, data: { ...(data as Record<string, unknown>), support } };
}

export async function requestReview(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase, user } = await requireUser();
  const occurrence = z.string().uuid().parse(fd.get("occurrence_id"));
  const reason = z.string().trim().min(3).max(500).safeParse(fd.get("reason"));
  if (!reason.success) return { error: "invalid_input" };
  const evaluation = fd.get("evaluation_id") ? z.string().uuid().parse(fd.get("evaluation_id")) : null;
  // With a verdict attached it's an appeal against that verdict; either way a human decides.
  const { data: ev } = evaluation ? await supabase.from("evaluations").select("evidence_id").eq("id", evaluation).maybeSingle() : { data: null };
  const { data: occRow } = await supabase.from("action_occurrences").select("item_id").eq("id", occurrence).maybeSingle();
  if (!occRow) return { error: "not_found" }; // RLS: only the person's own tasks
  const { error } = await createAdminClient().from("review_requests").insert({ user_id: user.id, occurrence_id: occurrence, evaluation_id: evaluation, evidence_id: ev?.evidence_id ?? null, item_id: occRow?.item_id ?? null, reason: evaluation ? "The person disagrees with the assessment" : reason.data, patient_note: reason.data, source: evaluation ? "appeal" : "user" });
  if (error) return { error: "save_failed" };
  revalidatePath(`/actions/${occurrence}`);
  return { ok: true };
}

/** The person fixing numbers the AI read off their device. */
export async function fixReadingAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const { user } = await requireUser();
  const id = z.string().uuid().safeParse(fd.get("reading_id"));
  const text = z.string().trim().min(1).max(40).safeParse(fd.get("value"));
  if (!id.success || !text.success) return { error: "invalid" };
  const res = await correctReading(createAdminClient(), user.id, id.data, text.data);
  if (!res.ok) return { error: res.error };
  const occ = z.string().uuid().safeParse(fd.get("occurrence_id"));
  if (occ.success) revalidatePath(`/actions/${occ.data}`);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// WhatsApp linking
// ---------------------------------------------------------------------------
export async function createLinkCode(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const { user } = await requireUser();
  const purpose = fd.get("purpose") === "rebind" ? "rebind" : "link";
  const admin = createAdminClient();
  const since = new Date(Date.now() - 3600_000).toISOString();
  const { count } = await admin.from("link_codes").select("id", { count: "exact", head: true }).eq("user_id", user.id).gte("created_at", since);
  if ((count ?? 0) >= 5) return { error: "rate_limited" };
  const code = generateLinkCode();
  const expires = new Date(Date.now() + LIMITS.linkCodeMinutes * 60_000);
  // Only the peppered hash is stored.
  const { error } = await admin.from("link_codes").insert({ user_id: user.id, code_hash: await hashLinkCode(code, process.env.LINK_CODE_PEPPER!), purpose, expires_at: expires.toISOString() });
  if (error) return { error: "save_failed" };
  // One tap on the phone: opens WhatsApp with the code ready to send.
  const num = await businessNumber();
  return { ok: true, data: { message: `SUKHI-${code}`, expires_at: expires.toISOString(), wa_link: num ? waLink(num, `SUKHI-${code}`) : null } };
}

/** Save the phone number (required for every account; used to match WhatsApp). */
export async function savePhoneAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const { user } = await requireUser();
  const r = await savePhone(createAdminClient(), user.id, String(fd.get("phone") ?? ""), String(fd.get("dial") ?? ""));
  if (!r.ok) return { error: r.error };
  if (r.whatsappAccount) await askToJoin(r.whatsappAccount, user.id);
  revalidatePath("/settings");
  const next = String(fd.get("next") ?? "/today");
  redirect(next.startsWith("/") && !next.startsWith("//") ? next : "/today");
}

/** This phone already chats with Sukhi on a WhatsApp-made account: ask there to join the two. */
async function askToJoin(whatsappUserId: string, webUserId: string) {
  const admin = createAdminClient();
  const [{ data: wa }, { data: u }] = await Promise.all([admin.from("profiles").select("locale").eq("id", whatsappUserId).single(), admin.auth.admin.getUserById(webUserId)]);
  const l = wa?.locale ?? "en";
  const { maskEmail } = await import("@/domain/wa-ui");
  await notify(admin, whatsappUserId, { type: "buttons", body: w(l, "merge_prompt", { email: maskEmail(u.user?.email) }), buttons: [{ id: `lk:merge:${webUserId}`, title: w(l, "btn_merge") }, { id: "lk:no", title: w(l, "btn_not_now") }] }, `join-ask:${whatsappUserId}:${webUserId}`, { hold: true, respectQuiet: false }).catch(() => undefined);
}

/** Confirm step of "connect this WhatsApp to my web account" (link sent on WhatsApp). */
export async function connectWhatsAppAction(fd: FormData) {
  const { user } = await requireUser();
  const token = String(fd.get("token") ?? "");
  const admin = createAdminClient();
  let result: Awaited<ReturnType<typeof claimConnectRequest>>;
  try {
    result = await claimConnectRequest(admin, user.id, token);
  } catch {
    redirect(`/whatsapp/connect/${encodeURIComponent(token)}?e=failed`);
  }
  if (result === "invalid") redirect(`/whatsapp/connect/${encodeURIComponent(token)}?e=failed`);
  if (result === "other_account") redirect(`/whatsapp/connect/${encodeURIComponent(token)}?e=other`);
  const { data: p } = await admin.from("profiles").select("display_name, locale").eq("id", user.id).single();
  await notify(admin, user.id, { type: "buttons", body: w(p?.locale, result === "merged" ? "web_merged" : "web_connected", { name: p?.display_name?.split(" ")[0] ?? "" }), buttons: [{ id: "m:today", title: w(p?.locale, "row_today") }, { id: "m:menu", title: w(p?.locale, "btn_menu") }] }, `web-connected:${user.id}:${Date.now()}`, { respectQuiet: false }).catch(() => undefined);
  revalidatePath("/settings");
  redirect("/settings?wa=connected#wa");
}

export async function unlinkWhatsApp() {
  const { supabase, user } = await requireUser();
  await supabase.from("channel_bindings").update({ status: "revoked", opted_out_at: new Date().toISOString() }).eq("user_id", user.id).neq("status", "revoked");
  revalidatePath("/settings");
}

// ---------------------------------------------------------------------------
// Family support (patient-controlled; summary only)
// ---------------------------------------------------------------------------
export async function createFamilyInvite(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase, user } = await requireUser();
  const label = z.string().trim().min(1).max(80).safeParse(fd.get("label"));
  const scopes = fd.getAll("scopes").map(String).filter((s) => s === "weekly_summary" || s === "garden" || s === "alerts");
  if (!label.success || scopes.length === 0) return { error: "invalid_input" };
  const { data: consent } = await supabase.from("consents").select("granted").eq("kind", "family_sharing").maybeSingle();
  if (!consent?.granted) return { error: "family_consent_required" };
  const token = randomToken(32);
  const { error } = await supabase.from("family_access").insert({ patient_id: user.id, invitee_label: label.data, invite_token_hash: await sha256Hex(token), scopes });
  if (error) return { error: "save_failed" };
  revalidatePath("/settings");
  return { ok: true, data: { link: `${settings.appUrl()}/family/accept?token=${token}` } };
}

export async function revokeFamily(fd: FormData) {
  const { supabase, user } = await requireUser();
  const id = z.string().uuid().parse(fd.get("access_id"));
  await supabase.from("family_access").update({ status: "revoked" }).eq("id", id).eq("patient_id", user.id);
  revalidatePath("/settings");
}

export async function acceptFamilyInvite(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase } = await requireUser();
  const token = z.string().regex(/^[0-9a-f]{64}$/).safeParse(fd.get("token"));
  if (!token.success) return { error: "invalid" };
  const { data } = await supabase.rpc("accept_family_invite", { p_token: token.data });
  const r = data as { ok: boolean; access_id?: string } | null;
  if (!r?.ok) return { error: "invalid" };
  redirect(`/family/${r.access_id}`);
}

// ---------------------------------------------------------------------------
// Memory & rewards
// ---------------------------------------------------------------------------
export async function setMemoryStatus(fd: FormData) {
  const { supabase, user } = await requireUser();
  const id = z.string().uuid().parse(fd.get("memory_id"));
  const status = z.enum(["confirmed", "rejected"]).parse(fd.get("status"));
  await supabase.from("memory_facts").update({ status }).eq("id", id).eq("user_id", user.id);
  revalidatePath("/settings");
  revalidatePath("/visit");
}

export async function setRewardGoal(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase, user } = await requireUser();
  const title = z.string().trim().min(1).max(80).safeParse(fd.get("title"));
  const target = z.coerce.number().int().min(5).max(500).safeParse(fd.get("target_points"));
  if (!title.success || !target.success) return { error: "invalid_input" };
  const { data: ev } = await supabase.from("reward_events").select("points");
  const baseline = (ev ?? []).reduce((s, e) => s + e.points, 0);
  await supabase.from("reward_goals").update({ active: false }).eq("user_id", user.id).eq("active", true);
  const { error } = await supabase.from("reward_goals").insert({ user_id: user.id, title: title.data, target_points: target.data, baseline_points: baseline });
  if (error) return { error: "save_failed" };
  revalidatePath("/progress");
  return { ok: true };
}

export async function removeRewardGoal() {
  const { supabase, user } = await requireUser();
  await supabase.from("reward_goals").update({ active: false }).eq("user_id", user.id).eq("active", true);
  revalidatePath("/progress");
}

// ---------------------------------------------------------------------------
// Account deletion (irreversible; typed confirmation required)
// ---------------------------------------------------------------------------
export async function deleteAccount(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase, user } = await requireUser();
  if (fd.get("confirm") !== "DELETE") return { error: "confirm_mismatch" };
  const admin = createAdminClient();
  // Remove private files first (storage objects are not covered by the database cascade).
  for (const bucket of ["evidence", "plan-sources"]) {
    const { data: top } = await admin.storage.from(bucket).list(user.id, { limit: 1000 });
    const paths: string[] = [];
    for (const f of top ?? []) {
      if (f.id) paths.push(`${user.id}/${f.name}`);
      else (await admin.storage.from(bucket).list(`${user.id}/${f.name}`, { limit: 1000 })).data?.forEach((g) => paths.push(`${user.id}/${f.name}/${g.name}`));
    }
    if (paths.length) await admin.storage.from(bucket).remove(paths);
  }
  const { error } = await admin.auth.admin.deleteUser(user.id); // cascades to every patient table
  if (error) return { error: "delete_failed" };
  await supabase.auth.signOut();
  redirect("/");
}

// ---------------------------------------------------------------------------
// Circle (friends, leaderboard, feed)
// ---------------------------------------------------------------------------
export async function reactAction(postId: string, kind: string): Promise<{ ok: boolean; state?: string }> {
  const { user } = await requireUser();
  if (!z.string().uuid().safeParse(postId).success || !(REACTIONS as readonly string[]).includes(kind)) return { ok: false };
  const state = await react(createAdminClient(), user.id, postId, kind as Reaction).catch(() => "not_allowed" as const);
  revalidatePath("/circle");
  return { ok: state !== "not_allowed", state };
}

/** Join by a typed 5-digit code or an invite link's code. Lands on the joined circle. */
export async function joinCircleAction(fd: FormData) {
  const { user } = await requireUser();
  const raw = String(fd.get("code") ?? "").slice(0, 40);
  const admin = createAdminClient();
  const r = await joinCircle(admin, user.id, raw).catch(() => "invalid" as const);
  (await cookies()).delete(INVITE_COOKIE);
  const code = cleanCode(raw);
  const { data: c } = r === "joined" || r === "already" ? await admin.from("circles").select("id").eq("invite_code", code ?? "").maybeSingle() : { data: null };
  revalidatePath("/circle");
  redirect(`/circle?r=${r}${c ? `&c=${c.id}` : ""}`);
}

export async function createCircleAction(fd: FormData) {
  const { user } = await requireUser();
  const id = await createCircle(createAdminClient(), user.id, String(fd.get("name") ?? "")).catch(() => null);
  revalidatePath("/circle");
  redirect(id && id !== "too_many" ? `/circle?c=${id}&r=created` : "/circle?r=too_many");
}

export async function newCircleCodeAction(fd: FormData) {
  const { user } = await requireUser();
  const id = z.string().uuid().safeParse(fd.get("circle_id"));
  if (id.success) await newInviteCode(createAdminClient(), user.id, id.data);
  revalidatePath("/circle");
  redirect(`/circle${id.success ? `?c=${id.data}` : ""}`);
}

export async function dismissInviteAction() {
  await requireUser();
  (await cookies()).delete(INVITE_COOKIE);
  revalidatePath("/circle");
}

export async function leaveCircleAction(fd: FormData) {
  const { user } = await requireUser();
  const id = z.string().uuid().safeParse(fd.get("circle_id"));
  if (id.success) await leaveCircle(createAdminClient(), user.id, id.data);
  revalidatePath("/circle");
  redirect("/circle");
}
