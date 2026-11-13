import "server-only";
import { languageInstruction } from "@/domain/language";
// Gentle Restart Engine (server side). Callers pass a userId established from a verified
// session; ownership is re-checked on every row. Nothing here changes a plan unless the
// user explicitly accepts a suggestion, and a barrier report never changes an
// occurrence's status (silence stays "unknown").
import { generateText } from "ai";
import type { AdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/database.types";
import { settings } from "@/lib/config";
import { getModel } from "./providers";
import { getConsents, materializeOccurrences } from "./core";
import {
  BEHAVIOUR_POLICY, chooseSupport, effectiveRestart, isClinicalItem, normalizeStyles, normalizeRestart,
  type BarrierCode, type ItemContext, type RestartPreference, type Strategy,
} from "@/domain/behaviour";
import { ALLOWED_OPTIONS, PROHIBITED_CONTENT, chooseWording, fill, paraphraseOrTemplate, safeLabel, type Generator, type RenderStyle, type TemplateDict } from "@/domain/nudges";
import { barrierDistribution, countResumes, mostEngagedStyle, styleResponseCounts, timingObservation } from "@/domain/learning";
import { addDays, isValidTime, localToUtc } from "@/domain/schedule";
import { quoteUntrusted, type Locale } from "@/domain/safety";
import en from "../../messages/en.json";
import hi from "../../messages/hi.json";
import mr from "../../messages/mr.json";

const DICT = { en: en.support, hi: hi.support, mr: mr.support } as const;
// Everyday, English-mixed register for Hindi/Marathi (see domain/language.ts).
const LANG: Record<string, string> = { en: languageInstruction("en"), hi: languageInstruction("hi"), mr: languageInstruction("mr") };
const loc = (l: string): Locale => (l === "hi" || l === "mr" ? l : "en");
const ui = (l: string, key: keyof typeof en.support, vars: Record<string, string | number> = {}) => fill(String((DICT[loc(l)] as Record<string, unknown>)[key] ?? en.support[key]), vars);
const tplDict = (l: string) => DICT[loc(l)].tpl as unknown as TemplateDict;

export interface BehaviourProfile {
  styles: ReturnType<typeof normalizeStyles>;
  restart: RestartPreference | null;
  motivation: string | null;
  locale: Locale;
  timezone: string;
  learningResetAt: string | null;
}

export async function getBehaviourProfile(db: AdminClient, userId: string): Promise<BehaviourProfile> {
  const { data } = await db.from("profiles").select("communication_styles, restart_preference, personal_motivation, locale, timezone, learning_reset_at").eq("id", userId).single();
  return {
    styles: normalizeStyles(data?.communication_styles),
    restart: normalizeRestart(data?.restart_preference),
    motivation: data?.personal_motivation ?? null,
    locale: loc(data?.locale ?? "en"),
    timezone: data?.timezone ?? "Asia/Kolkata",
    learningResetAt: data?.learning_reset_at ?? null,
  };
}

async function recentVariants(admin: AdminClient, userId: string, strategy: Strategy): Promise<string[]> {
  const { data } = await admin.from("nudge_events").select("template_or_variant_id").eq("user_id", userId).eq("strategy_id", strategy).order("created_at", { ascending: false }).limit(BEHAVIOUR_POLICY.recentVariantWindow);
  return (data ?? []).map((r) => r.template_or_variant_id);
}

/** Optional LLM generator: only with the feature flag, a configured model and AI consent. */
async function generatorFor(admin: AdminClient, userId: string): Promise<Generator | null> {
  if (!settings.supportLlmWording()) return null;
  const m = getModel();
  if (!m) return null;
  const consents = await getConsents(admin, userId);
  if (!consents.ai_processing) return null;
  return async (system, contract) => {
    const r = await generateText({ model: m.model, system, prompt: quoteUntrusted("contract", JSON.stringify(contract), 2000), timeout: { totalMs: 8_000 }, maxRetries: 0 });
    return r.text;
  };
}

export interface Wording { text: string; style: RenderStyle; variantId: string; source: "template" | "llm" }

export async function wordSupport(admin: AdminClient, userId: string, p: BehaviourProfile, strategy: Strategy, label: string, opts: { generate?: Generator | null; nudgeKind?: string } = {}): Promise<Wording> {
  const title = safeLabel(label);
  const recent = await recentVariants(admin, userId, strategy);
  const choice = chooseWording(tplDict(p.locale), strategy, p.styles, recent);
  if (!choice) throw new Error(`no_template:${strategy}`);
  const template = fill(choice.template, { title });
  const generate = opts.generate === undefined ? await generatorFor(admin, userId) : opts.generate;
  const r = await paraphraseOrTemplate({
    strategy,
    template,
    locale: p.locale,
    generate,
    contract: {
      language: LANG[p.locale], communicationStyle: choice.style, nudgeKind: opts.nudgeKind ?? "restart_offer", approvedStrategy: strategy,
      habitLabel: title, allowedOptions: ALLOWED_OPTIONS[strategy], prohibitedContent: PROHIBITED_CONTENT, maxSentences: 2,
      recentVariantIds: recent, approvedExample: template,
    },
  });
  return { text: r.text, style: choice.style, variantId: choice.variantId, source: r.source };
}

/** Re-render a stored variant (used to answer retries identically). */
function renderVariant(locale: string, variantId: string, label: string): string | null {
  const [strategy, style, n] = variantId.split(".");
  const t = tplDict(locale)[strategy]?.[style]?.[n];
  return t ? fill(t, { title: safeLabel(label) }) : null;
}

type OccRow = { id: string; user_id: string; local_time: string | null; local_date: string; status: string; item_id: string; plan_id: string; plan_items: { title: string; category: string; schedule_kind: string; status: string; version: number; times: string[]; care_plans: { mode: string; status: string } } };

async function loadOccurrence(admin: AdminClient, userId: string, occurrenceId: string): Promise<OccRow | null> {
  const { data } = await admin
    .from("action_occurrences")
    .select("id, user_id, local_time, local_date, status, item_id, plan_id, plan_items!inner(title, category, schedule_kind, status, version, times, care_plans!inner(mode, status))")
    .eq("id", occurrenceId)
    .eq("user_id", userId)
    .maybeSingle();
  return (data as unknown as OccRow) ?? null;
}

const itemCtx = (o: OccRow): ItemContext => ({ category: o.plan_items.category, planMode: o.plan_items.care_plans.mode, scheduleKind: o.plan_items.schedule_kind });

/** Observed completion time for this item/time, if the repeated-signal rule finds one. */
async function observedTime(admin: AdminClient, userId: string, itemId: string, scheduled: string | null, tz: string, since: string | null): Promise<string | null> {
  if (!scheduled) return null;
  const from = new Date(Math.max(Date.now() - BEHAVIOUR_POLICY.learningWindowDays * 86_400_000, since ? Date.parse(since) : 0)).toISOString();
  const { data } = await admin.from("check_ins").select("created_at, action_occurrences!inner(item_id, local_time)").eq("user_id", userId).eq("kind", "done").gte("created_at", from).eq("action_occurrences.item_id", itemId).eq("action_occurrences.local_time", scheduled).limit(60);
  const times = (data ?? []).map((c) => new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(c.created_at)));
  return timingObservation(scheduled, times)?.suggested ?? null;
}

export interface SupportSuggestionView { id: string; kind: "time_change" | "smaller_action"; fromTime: string | null; proposedTime: string | null; planId: string }
export interface SupportResult {
  reportId: string;
  strategy: Strategy;
  text: string;
  motivation: string | null;
  suggestion: SupportSuggestionView | null;
  duplicate: boolean;
}

/**
 * The user tapped a reason. Records it (idempotently), decides the safe strategy, words it
 * in their style and, for personal goals, creates a suggestion they must accept or decline.
 */
export async function reportBarrier(
  admin: AdminClient,
  userId: string,
  input: { occurrenceId: string; code: BarrierCode; idempotencyKey: string; checkInId?: string | null; nudgeEventId?: string | null; channel?: "web" | "whatsapp" },
  deps: { generate?: Generator | null } = {},
): Promise<SupportResult> {
  const occ = await loadOccurrence(admin, userId, input.occurrenceId);
  if (!occ) throw new Error("not_found");
  const p = await getBehaviourProfile(admin, userId);
  const title = occ.plan_items.title;

  const { data: inserted } = await admin
    .from("barrier_reports")
    .upsert(
      { user_id: userId, item_id: occ.item_id, occurrence_id: occ.id, check_in_id: input.checkInId ?? null, nudge_event_id: input.nudgeEventId ?? null, barrier_code: input.code, channel: input.channel ?? "web", idempotency_key: input.idempotencyKey },
      { onConflict: "user_id,idempotency_key", ignoreDuplicates: true },
    )
    .select("id")
    .maybeSingle();

  if (!inserted) {
    // Retry of the same tap: answer exactly as before, change nothing.
    const { data: prev } = await admin.from("barrier_reports").select("id, barrier_code").eq("user_id", userId).eq("idempotency_key", input.idempotencyKey).single();
    const [{ data: nudge }, { data: sug }] = await Promise.all([
      admin.from("nudge_events").select("strategy_id, template_or_variant_id").eq("dedupe_key", `barrier:${prev!.id}`).maybeSingle(),
      admin.from("support_suggestions").select("id, kind, proposal, status").eq("barrier_report_id", prev!.id).maybeSingle(),
    ]);
    const strategy = (nudge?.strategy_id ?? "supportive_checkin") as Strategy;
    const proposal = (sug?.proposal ?? {}) as { from_time?: string | null; proposed_time?: string | null };
    return {
      reportId: prev!.id,
      strategy,
      text: (nudge && renderVariant(p.locale, nudge.template_or_variant_id, title)) ?? ui(p.locale, "close"),
      motivation: strategy === "switch_encouragement" ? p.motivation : null,
      suggestion: sug && sug.status === "shown" ? { id: sug.id, kind: sug.kind as SupportSuggestionView["kind"], fromTime: proposal.from_time ?? null, proposedTime: proposal.proposed_time ?? null, planId: occ.plan_id } : null,
      duplicate: true,
    };
  }

  const decision = chooseSupport({
    userAllowsContact: true, inQuietHours: false, rateLimitExceeded: false,
    hasConcerningSymptomReport: input.code === "physical_discomfort",
    missIsConfirmed: true, restartPreference: p.restart, userRequestedHelp: true,
    barrierCode: input.code, item: itemCtx(occ),
  });
  const strategy: Strategy = decision.kind === "none" ? "supportive_checkin" : decision.kind;
  const w = await wordSupport(admin, userId, p, strategy, title, { generate: deps.generate });
  const now = new Date().toISOString();

  const { data: nudge } = await admin
    .from("nudge_events")
    .insert({ user_id: userId, item_id: occ.item_id, occurrence_id: occ.id, kind: "restart_offer", strategy_id: strategy, style_used: w.style, template_or_variant_id: w.variantId, wording_source: w.source, channel: input.channel ?? "web", user_initiated: true, delivered_at: now, dedupe_key: `barrier:${inserted.id}` })
    .select("id")
    .single();

  // The proactive follow-up that prompted this tap has been acknowledged (engagement, not completion).
  if (input.nudgeEventId) await admin.from("nudge_events").update({ acknowledged_at: now }).eq("id", input.nudgeEventId).eq("user_id", userId).is("acknowledged_at", null);

  let suggestion: SupportSuggestionView | null = null;
  const change = "change" in decision ? decision.change : null;
  if (change && occ.plan_items.status === "confirmed" && occ.plan_items.care_plans.status === "active" && !isClinicalItem(itemCtx(occ))) {
    const proposed = change === "time_change" ? await observedTime(admin, userId, occ.item_id, occ.local_time, p.timezone, p.learningResetAt) : null;
    const { data: sug } = await admin
      .from("support_suggestions")
      .insert({
        user_id: userId, item_id: occ.item_id, item_version: occ.plan_items.version, barrier_report_id: inserted.id, nudge_event_id: nudge?.id ?? null,
        kind: change, strategy_id: strategy, proposal: { from_time: occ.local_time, proposed_time: proposed } as Json,
        expires_at: new Date(Date.now() + BEHAVIOUR_POLICY.suggestionExpiryDays * 86_400_000).toISOString(),
      })
      .select("id")
      .single();
    if (sug) suggestion = { id: sug.id, kind: change, fromTime: occ.local_time, proposedTime: proposed, planId: occ.plan_id };
  }

  await admin.from("audit_events").insert({ user_id: userId, actor: "user", action: "barrier_reported", entity: "barrier_report", entity_id: inserted.id, details: { code: input.code, strategy, wording: w.source } as Json });
  return { reportId: inserted.id, strategy, text: w.text, motivation: strategy === "switch_encouragement" ? p.motivation : null, suggestion, duplicate: false };
}

export type SuggestionOutcome = { ok: true; result: "accepted" | "declined" | "kept"; newTime?: string; planId?: string } | { ok: false; result: "expired" | "stale" | "invalid" | "not_found" };

/**
 * The explicit confirmation step. Declining changes nothing. Accepting a time change moves
 * one time of a personal, non-medication item through the normal draft → confirm path,
 * with the user's own RLS-scoped client. Past history and points are untouched.
 */
export async function decideSuggestion(admin: AdminClient, userDb: AdminClient, userId: string, input: { suggestionId: string; decision: "accept" | "decline"; time?: string | null }): Promise<SuggestionOutcome> {
  const { data: s } = await admin.from("support_suggestions").select("*").eq("id", input.suggestionId).eq("user_id", userId).maybeSingle();
  if (!s) return { ok: false, result: "not_found" };
  if (s.status === "accepted") return { ok: true, result: "accepted" };
  if (s.status === "declined") return { ok: true, result: "declined" };
  if (s.status !== "shown") return { ok: false, result: s.status === "stale" ? "stale" : "expired" };
  const now = new Date().toISOString();
  const close = (status: string, applied: Json | null = null) => admin.from("support_suggestions").update({ status, decided_at: now, applied }).eq("id", s.id).eq("status", "shown");
  if (new Date(s.expires_at) < new Date()) {
    await close("expired");
    return { ok: false, result: "expired" };
  }
  if (input.decision === "decline") {
    await close("declined");
    await admin.from("audit_events").insert({ user_id: userId, actor: "user", action: "suggestion_declined", entity: "support_suggestion", entity_id: s.id, details: { kind: s.kind } });
    return { ok: true, result: "declined" };
  }

  const { data: item } = await userDb.from("plan_items").select("id, plan_id, status, version, category, schedule_kind, times, care_plans!inner(mode, status)").eq("id", s.item_id).eq("user_id", userId).maybeSingle();
  const plan = item?.care_plans as unknown as { mode: string; status: string } | undefined;
  const fresh = !!item && !!plan && item.status === "confirmed" && item.version === s.item_version && plan.status === "active" && !isClinicalItem({ category: item.category, planMode: plan.mode, scheduleKind: item.schedule_kind });
  if (!fresh) {
    await close("stale");
    return { ok: false, result: "stale" };
  }

  if (s.kind === "smaller_action") {
    // The user edits the smaller version themselves in My plan (draft → confirm there).
    await close("accepted", { opened_editor: true });
    await admin.from("audit_events").insert({ user_id: userId, actor: "user", action: "suggestion_accepted", entity: "support_suggestion", entity_id: s.id, details: { kind: s.kind } });
    return { ok: true, result: "accepted", planId: item.plan_id };
  }

  const from = (s.proposal as { from_time?: string | null }).from_time ?? null;
  const to = input.time ?? null;
  if (!to || !isValidTime(to) || !(item.schedule_kind === "daily" || item.schedule_kind === "weekdays") || !from || !item.times.includes(from)) return { ok: false, result: "invalid" };
  const times = [...new Set([...item.times.filter((t) => t !== from), to])].sort();
  if (times.join(",") === [...item.times].sort().join(",")) {
    await close("declined", { kept: true });
    return { ok: true, result: "kept" };
  }
  // Same two-step path as editing a confirmed item in My plan: back to draft, then re-confirm.
  const back = await userDb.from("plan_items").update({ status: "draft" }).eq("id", item.id).eq("user_id", userId);
  if (back.error) return { ok: false, result: "invalid" };
  const upd = await userDb.from("plan_items").update({ times, status: "confirmed" }).eq("id", item.id).eq("user_id", userId);
  if (upd.error) {
    await userDb.from("plan_items").update({ status: "confirmed" }).eq("id", item.id).eq("user_id", userId);
    return { ok: false, result: "invalid" };
  }
  await materializeOccurrences(admin, userId, 7).catch(() => undefined);
  await close("accepted", { from_time: from, to_time: to });
  await admin.from("audit_events").insert({ user_id: userId, actor: "user", action: "suggestion_accepted", entity: "support_suggestion", entity_id: s.id, details: { kind: s.kind, from_time: from, to_time: to } });
  return { ok: true, result: "accepted", newTime: to };
}

/** "I did it" / "Not now" on a proactive follow-up. Only the user's own nudges. */
export async function respondToNudge(admin: AdminClient, userId: string, nudgeId: string, response: "did_it" | "dismissed") {
  await admin
    .from("nudge_events")
    .update({ acknowledged_at: new Date().toISOString(), outcome: response === "did_it" ? "completed" : "dismissed" })
    .eq("id", nudgeId)
    .eq("user_id", userId);
}

// ---------------------------------------------------------------------------
// Proactive follow-up after a lapse (called at the first check-in slot of the day)
// ---------------------------------------------------------------------------
type FollowupProfile = { id: string; locale: string; timezone: string; communication_styles?: string[] | null; restart_preference?: string | null };

/**
 * At most one gentle follow-up about yesterday, inside the user's existing check-in slot
 * (consent, quiet hours and reminder frequency were already checked by the caller). It
 * only ever asks; changes come later and only with an explicit yes. Returns true if sent.
 */
export async function runRestartFollowup(admin: AdminClient, profile: FollowupProfile, today: string, now = new Date(), deps: { generate?: Generator | null } = {}): Promise<boolean> {
  const userId = profile.id;
  const yesterday = addDays(today, -1);
  const { data: lapses } = await admin
    .from("action_occurrences")
    .select("id, item_id, status, local_time, plan_items!inner(title, category, schedule_kind, status, care_plans!inner(mode, status))")
    .eq("user_id", userId)
    .eq("local_date", yesterday)
    .eq("target_count", 1)
    .in("status", ["missed", "skipped", "no_response"])
    .eq("plan_items.status", "confirmed")
    .eq("plan_items.care_plans.status", "active")
    .order("due_at");
  if (!lapses?.length) return false;

  // Lapses the user already explained need no follow-up.
  const { data: explained } = await admin.from("barrier_reports").select("occurrence_id").eq("user_id", userId).in("occurrence_id", lapses.map((l) => l.id));
  const told = new Set((explained ?? []).map((e) => e.occurrence_id));

  const dayStart = localToUtc(today, "00:00", profile.timezone).toISOString();
  const [{ count: sentToday }, { data: lastProactive }] = await Promise.all([
    admin.from("nudge_events").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("user_initiated", false).gte("created_at", dayStart),
    admin.from("nudge_events").select("item_id, created_at").eq("user_id", userId).eq("user_initiated", false).order("created_at", { ascending: false }).limit(20),
  ]);
  const restart = normalizeRestart(profile.restart_preference);
  const daysSince = (iso: string) => (now.getTime() - Date.parse(iso)) / 86_400_000;
  const lastAny = lastProactive?.[0]?.created_at;
  const spaceRespected = !lastAny || daysSince(lastAny) >= BEHAVIOUR_POLICY.giveSpaceMinDaysBetweenFollowups;
  const recentlyAsked = (itemId: string) => (lastProactive ?? []).some((n) => n.item_id === itemId && daysSince(n.created_at) < BEHAVIOUR_POLICY.sameItemMinDaysBetweenFollowups);

  const target = lapses.find((l) => !told.has(l.id) && !recentlyAsked(l.item_id));
  if (!target) return false;
  const item = target.plan_items as unknown as { title: string; category: string; schedule_kind: string; care_plans: { mode: string } };
  const confirmedMiss = target.status === "missed" || target.status === "skipped";

  const decision = chooseSupport({
    userAllowsContact: true, inQuietHours: false,
    rateLimitExceeded: (sentToday ?? 0) >= BEHAVIOUR_POLICY.maxRecoveryNudgesPerDay,
    hasConcerningSymptomReport: false, missIsConfirmed: confirmedMiss, restartPreference: restart,
    userRequestedHelp: false, spaceRespected,
  });
  if (decision.kind === "none") return false;
  const strategy = decision.kind;

  // Repeated lapses on a personal goal: the offer mentions trying it a simpler way.
  const { count: lapses7 } = await admin.from("action_occurrences").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("item_id", target.item_id).gte("local_date", addDays(today, -7)).lt("local_date", today).in("status", ["missed", "skipped", "no_response"]);
  const clinical = isClinicalItem({ category: item.category, planMode: item.care_plans.mode, scheduleKind: item.schedule_kind });
  const pref = effectiveRestart(restart);
  const offerKey = pref === "give_space" ? "offer_give_space" : !clinical && (lapses7 ?? 0) >= BEHAVIOUR_POLICY.repeatedMissThreshold ? "offer_simpler_alternative" : clinical && pref === "simpler_alternative" ? "offer_encouragement" : (`offer_${pref}` as const);

  const p: BehaviourProfile = { styles: normalizeStyles(profile.communication_styles), restart, motivation: null, locale: loc(profile.locale), timezone: profile.timezone, learningResetAt: null };
  const nudgeKind = strategy === "ask_barrier" ? "barrier_question" : "gentle_reminder";
  const w = await wordSupport(admin, userId, p, strategy as Strategy, item.title, { generate: deps.generate, nudgeKind });
  const { data: nudge } = await admin
    .from("nudge_events")
    .upsert({ user_id: userId, item_id: target.item_id, occurrence_id: target.id, kind: nudgeKind, strategy_id: strategy, style_used: w.style, template_or_variant_id: w.variantId, wording_source: w.source, channel: "system", user_initiated: false, delivered_at: now.toISOString(), dedupe_key: `followup:${target.id}` }, { onConflict: "dedupe_key", ignoreDuplicates: true })
    .select("id")
    .maybeSingle();
  if (!nudge) return false; // already followed up on this lapse

  const text = `${w.text} ${ui(p.locale, offerKey)}`.trim();
  const refs = [{ type: "restart", id: target.id, label: item.title }, { type: "nudge", id: nudge.id, label: target.status }];
  const { error } = await admin.from("messages").upsert(
    { user_id: userId, role: "assistant", channel: "system", content: text.slice(0, 1000), source_refs: refs as unknown as Json, provider_message_id: `restart:${target.id}` },
    { onConflict: "provider_message_id", ignoreDuplicates: true },
  );
  return !error;
}

// ---------------------------------------------------------------------------
// What Sukhi has noticed (Settings). Descriptive, repeated signals only, since the last reset.
// ---------------------------------------------------------------------------
export interface LearnedSummary {
  topBarrier: { code: BarrierCode; n: number } | null;
  resumes: number;
  timing: { itemId: string; title: string; scheduled: string; suggested: string; observations: number }[];
  engagedStyle: string | null;
  hasData: boolean;
}

export async function getLearnedSummary(db: AdminClient, userId: string, learningResetAt: string | null, tz: string): Promise<LearnedSummary> {
  const sinceMs = Math.max(Date.now() - BEHAVIOUR_POLICY.learningWindowDays * 86_400_000, learningResetAt ? Date.parse(learningResetAt) : 0);
  const since = new Date(sinceMs).toISOString();
  const [{ data: barriers }, { data: occ }, { data: dones }, { data: nudges }] = await Promise.all([
    db.from("barrier_reports").select("barrier_code").eq("user_id", userId).gte("created_at", since),
    db.from("action_occurrences").select("item_id, local_date, status").eq("user_id", userId).gte("status_changed_at", since).lt("window_end_at", new Date().toISOString()),
    db.from("check_ins").select("created_at, action_occurrences!inner(item_id, local_time, plan_items!inner(title, category, schedule_kind, care_plans!inner(mode)))").eq("user_id", userId).eq("kind", "done").gte("created_at", since).limit(500),
    db.from("nudge_events").select("style_used, acknowledged_at").eq("user_id", userId).eq("user_initiated", false).gte("created_at", since),
  ]);
  const dist = barrierDistribution((barriers ?? []).map((b) => b.barrier_code as BarrierCode));
  const top = dist[0] && dist[0].n >= 2 ? dist[0] : null; // never on a single event

  const groups = new Map<string, { itemId: string; title: string; scheduled: string; times: string[] }>();
  for (const c of dones ?? []) {
    const o = c.action_occurrences as unknown as { item_id: string; local_time: string | null; plan_items: { title: string; category: string; schedule_kind: string; care_plans: { mode: string } } };
    if (!o.local_time || isClinicalItem({ category: o.plan_items.category, planMode: o.plan_items.care_plans.mode, scheduleKind: o.plan_items.schedule_kind })) continue;
    const k = `${o.item_id}|${o.local_time}`;
    const g = groups.get(k) ?? { itemId: o.item_id, title: o.plan_items.title, scheduled: o.local_time, times: [] };
    g.times.push(new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(c.created_at)));
    groups.set(k, g);
  }
  const timing = [...groups.values()].flatMap((g) => {
    const obs = timingObservation(g.scheduled, g.times);
    return obs ? [{ itemId: g.itemId, title: g.title, scheduled: g.scheduled, suggested: obs.suggested, observations: obs.observations }] : [];
  });
  const resumes = countResumes(occ ?? []);
  const engagedStyle = mostEngagedStyle(styleResponseCounts(nudges ?? []));
  return { topBarrier: top, resumes, timing, engagedStyle, hasData: !!top || resumes > 0 || timing.length > 0 || !!engagedStyle };
}
