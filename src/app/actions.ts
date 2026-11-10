"use server";
// Server actions. Each one re-verifies the session (requireUser) and validates input with
// Zod. Writes use the user's RLS-scoped client; the service role is used only for
// scheduling and for tables users may not write directly (link codes), always with the
// verified user id.
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { LIMITS, settings } from "@/lib/config";
import { materializeOccurrences, scheduleSnoozeReminder } from "@/server/core";
import { isValidTime, isValidTimeZone } from "@/domain/schedule";
import { generateLinkCode, hashLinkCode, randomToken, sha256Hex } from "@/domain/router";
import { TEMPLATES } from "@/domain/templates";
import type { DraftItem } from "@/domain/extraction";
import { CONSENT_KINDS, writeConsentChoices } from "@/server/consents";

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
      accessibility: { large_text: v.large_text, high_contrast: v.high_contrast, reduce_motion: v.reduce_motion, audio_replies: v.audio_replies },
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

async function createTemplatePlan(supabase: Awaited<ReturnType<typeof requireUser>>["supabase"], userId: string, key: keyof typeof TEMPLATES) {
  const tpl = TEMPLATES[key];
  const { data: plan, error } = await supabase.from("care_plans").insert({ user_id: userId, title: tpl.plan, mode: "personal_goal", status: "active", source_description: "Sukhi example routine (personal goal)" }).select("id").single();
  if (error || !plan) throw new Error("plan_create_failed");
  const { error: itemErr } = await supabase.from("plan_items").insert(tpl.items.map((i) => ({ ...i, plan_id: plan.id, user_id: userId, status: "confirmed" as const, provenance: "template" as const })));
  if (itemErr) throw new Error("item_create_failed");
  return plan.id;
}

export async function completeOnboarding(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const r = await saveProfile(fd, true);
  if ("error" in r) return { error: r.error };
  const { supabase, user } = r;
  try {
    await writeConsents(fd, user.id, supabase);
    // "What brings you here" becomes confirmed context for the assistant (never a diagnosis).
    const REASON_TEXT: Record<string, string> = {
      discharge: "Recently came home from hospital and is settling into a routine.",
      new_plan: "Has recently started a new treatment plan.",
      existing: "Wants help keeping up with a plan they already have.",
      wellbeing: "Is working on personal wellbeing goals.",
    };
    const reason = String(fd.get("reason") ?? "");
    if (REASON_TEXT[reason]) {
      await createAdminClient().from("memory_facts").insert({ user_id: user.id, kind: "context", content: REASON_TEXT[reason], source_type: "onboarding", status: "confirmed" });
    }
    const tpl = String(fd.get("template") ?? "none");
    if (tpl === "walk" || tpl === "water" || tpl === "stretch") {
      await createTemplatePlan(supabase, user.id, tpl);
      await materializeOccurrences(createAdminClient(), user.id, 7);
    }
    if (tpl === "clinician") redirect("/plan?new=clinician");
  } catch (e) {
    if (e && typeof e === "object" && "digest" in e) throw e; // let redirect() through
    return { error: "save_failed" };
  }
  redirect("/today?welcome=1");
}

export async function savePreferences(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const r = await saveProfile(fd, false);
  if ("error" in r) return { error: r.error };
  await materializeOccurrences(createAdminClient(), r.user.id, 7).catch(() => undefined);
  revalidatePath("/", "layout");
  return { ok: true };
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
  const { supabase, user } = await requireUser();
  const key = String(fd.get("template"));
  if (key !== "walk" && key !== "water" && key !== "stretch") return;
  await createTemplatePlan(supabase, user.id, key);
  await materializeOccurrences(createAdminClient(), user.id, 7);
  revalidatePath("/plan");
  revalidatePath("/today");
}

export async function setPlanStatus(fd: FormData) {
  const { supabase, user } = await requireUser();
  const id = z.string().uuid().parse(fd.get("plan_id"));
  const status = z.enum(["active", "paused", "archived"]).parse(fd.get("status"));
  await supabase.from("care_plans").update({ status }).eq("id", id).eq("user_id", user.id);
  if (status === "active") await materializeOccurrences(createAdminClient(), user.id, 7);
  revalidatePath(`/plan/${id}`);
  revalidatePath("/today");
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
  const itemId = fd.get("item_id") ? z.string().uuid().parse(fd.get("item_id")) : null;
  const planId = z.string().uuid().parse(fd.get("plan_id"));
  const parsed = parseItem(fd);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "invalid_input" };
  const resolved = fd.get("resolved") === "on";

  if (itemId) {
    const { data: existing } = await supabase.from("plan_items").select("status, unresolved_fields").eq("id", itemId).single();
    if (!existing) return { error: "not_found" };
    // A confirmed item can't change silently: back to draft first (versioned), then edit.
    if (existing.status === "confirmed") {
      const { error } = await supabase.from("plan_items").update({ status: "draft" }).eq("id", itemId);
      if (error) return { error: "save_failed" };
    }
    const unresolved = resolved ? [] : existing.unresolved_fields;
    const { error } = await supabase.from("plan_items").update({ ...parsed.data, unresolved_fields: unresolved }).eq("id", itemId);
    if (error) return { error: "save_failed" };
    if (intent === "confirm") {
      if (unresolved.length) return { error: "unresolved_fields" };
      const { error: cErr } = await supabase.from("plan_items").update({ status: "confirmed" }).eq("id", itemId);
      if (cErr) return { error: "confirm_failed" };
    }
  } else {
    const { error } = await supabase.from("plan_items").insert({ ...parsed.data, plan_id: planId, user_id: user.id, status: intent === "confirm" ? "confirmed" : "draft", provenance: "manual" });
    if (error) return { error: "save_failed" };
  }
  if (intent === "confirm") await materializeOccurrences(createAdminClient(), user.id, 7);
  revalidatePath(`/plan/${planId}`);
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
  const { error } = await supabase.from("plan_items").insert(
    drafts.map((d) => ({
      plan_id: planId,
      user_id: user.id,
      title: d.title.slice(0, 120),
      instructions: d.instructions?.slice(0, 1000) ?? null,
      category: d.category,
      schedule_kind: d.schedule_kind,
      times: d.times,
      weekdays: d.weekdays,
      weekly_target: d.schedule_kind === "weekly_target" ? (d.weekly_target ?? 1) : d.weekly_target,
      once_date: d.schedule_kind === "once" ? new Date().toISOString().slice(0, 10) : null,
      status: "draft" as const,
      provenance: "extracted" as const,
      source_document_id: doc.id,
      source_page: d.source_page,
      source_snippet: d.source_snippet.slice(0, 1000),
      unresolved_fields: d.unresolved_fields,
    })),
  );
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
  const { data, error } = await supabase.rpc("record_check_in", { p_occurrence: occurrence.data, p_kind: kind.data, p_idempotency_key: key.data, p_reason: reason });
  if (error) return { error: error.message.includes("not_yet_due") ? "not_yet_due" : error.message.includes("paused") ? "paused" : "save_failed" };
  if (kind.data === "later") await scheduleSnoozeReminder(createAdminClient(), user.id, occurrence.data);
  revalidatePath("/today");
  revalidatePath("/progress");
  return { ok: true, data: data as Record<string, unknown> };
}

export async function requestReview(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase, user } = await requireUser();
  const occurrence = z.string().uuid().parse(fd.get("occurrence_id"));
  const reason = z.string().trim().min(3).max(500).safeParse(fd.get("reason"));
  if (!reason.success) return { error: "invalid_input" };
  const evaluation = fd.get("evaluation_id") ? z.string().uuid().parse(fd.get("evaluation_id")) : null;
  const { error } = await supabase.from("review_requests").insert({ user_id: user.id, occurrence_id: occurrence, evaluation_id: evaluation, reason: reason.data, source: "user" });
  if (error) return { error: "save_failed" };
  revalidatePath(`/actions/${occurrence}`);
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
  return { ok: true, data: { message: `SUKHI-${code}`, expires_at: expires.toISOString() } };
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
  const scopes = fd.getAll("scopes").map(String).filter((s) => s === "weekly_summary" || s === "garden");
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
