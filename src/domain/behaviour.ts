// Adaptive Behaviour Engine: profile defaults and the deterministic decision policy.
// The policy decides WHAT support is allowed. Wording is a separate step (src/domain/nudges.ts).
// It works with no LLM at all, and it never changes a plan by itself.

export const COMMUNICATION_STYLES = ["warm_gentle", "fun_playful", "motivating", "simple_practical"] as const;
export type CommunicationStyle = (typeof COMMUNICATION_STYLES)[number];

export const RESTART_PREFERENCES = ["encouragement", "simpler_alternative", "gentle_push", "give_space"] as const;
export type RestartPreference = (typeof RESTART_PREFERENCES)[number];

export const BARRIER_CODES = ["forgot", "busy", "low_motivation", "routine_disrupted", "too_difficult", "physical_discomfort", "other", "prefer_not_to_say"] as const;
export type BarrierCode = (typeof BARRIER_CODES)[number];

export const DEFAULT_STYLE: CommunicationStyle = "warm_gentle";
export const DEFAULT_RESTART: RestartPreference = "encouragement";
export const MOTIVATION_MAX = 280;

/**
 * Pilot thresholds. These are HYPOTHESES for the pilot, not established clinical or
 * behavioural rules. They're kept here and only here so the team can tune them.
 */
export const BEHAVIOUR_POLICY = {
  /** Proactive recovery messages (follow-ups after a lapse) per user per local day. */
  maxRecoveryNudgesPerDay: 1,
  /** With "give me space": at most one proactive follow-up in this many days. */
  giveSpaceMinDaysBetweenFollowups: 3,
  /** Without "give me space": at most one proactive follow-up about the same item in this many days. */
  sameItemMinDaysBetweenFollowups: 2,
  /** Repeated lapses on one item in the last 7 days before the follow-up mentions trying it differently. */
  repeatedMissThreshold: 2,
  /** Completions needed before Sukhi mentions a timing pattern. */
  minObservationsForTimingSuggestion: 4,
  /** Share of observations that must point the same way. */
  timingAgreementShare: 0.75,
  /** Median shift (minutes) between scheduled and reported time before it's worth mentioning. */
  timingShiftMinutes: 60,
  /** Look-back for learned signals (days). */
  learningWindowDays: 21,
  /** A suggestion expires if not answered within this many days. */
  suggestionExpiryDays: 3,
  /** "Recovery after lapse": completion of the same item within this many days of a lapse. */
  recoveryWindowDays: 3,
  /** How many recent variants are avoided when choosing wording. */
  recentVariantWindow: 4,
} as const;

/** Stated styles, cleaned: valid values only, de-duplicated, at most two. Empty means "not answered". */
export function normalizeStyles(input: readonly unknown[] | null | undefined): CommunicationStyle[] {
  const out: CommunicationStyle[] = [];
  for (const v of input ?? []) {
    if (typeof v === "string" && (COMMUNICATION_STYLES as readonly string[]).includes(v) && !out.includes(v as CommunicationStyle)) out.push(v as CommunicationStyle);
  }
  return out.slice(0, 2);
}

/** The styles to use when wording a message. Falls back to warm_gentle when none are stated. */
export function effectiveStyles(stated: readonly unknown[] | null | undefined): CommunicationStyle[] {
  const s = normalizeStyles(stated);
  return s.length ? s : [DEFAULT_STYLE];
}

export function normalizeRestart(v: unknown): RestartPreference | null {
  return typeof v === "string" && (RESTART_PREFERENCES as readonly string[]).includes(v) ? (v as RestartPreference) : null;
}

export function effectiveRestart(v: unknown): RestartPreference {
  return normalizeRestart(v) ?? DEFAULT_RESTART;
}

/** Integer 1–10, or null when skipped/invalid. */
export function parseConfidence(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).trim());
  return Number.isInteger(n) && n >= 1 && n <= 10 ? n : null;
}

export function cleanMotivation(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.replace(/\s+/g, " ").trim().slice(0, MOTIVATION_MAX);
  return s || null;
}

export function isBarrierCode(v: unknown): v is BarrierCode {
  return typeof v === "string" && (BARRIER_CODES as readonly string[]).includes(v);
}

// ---------------------------------------------------------------------------
// Decision policy
// ---------------------------------------------------------------------------
export type Strategy =
  | "gentle_checkin"        // status unknown or first follow-up: ask kindly, offer help
  | "ask_barrier"           // a confirmed lapse: one short "what got in the way?" question
  | "suggest_reminder_time" // forgot
  | "suggest_reschedule"    // busy
  | "switch_encouragement"  // low motivation
  | "offer_flexible_plan"   // routine disrupted
  | "offer_smaller_action"  // too difficult (personal, non-clinical goals only)
  | "safety_first"          // physical discomfort or concerning symptoms: no activity substitutions
  | "care_team_checkin"     // a clinician-provided or medication item: keep the plan as written
  | "supportive_checkin";   // other / prefer not to say

export type SupportDecision =
  | { kind: "none"; reason: "contact_not_permitted" | "user_prefers_space" | "rate_limited" | "nothing_to_follow_up" }
  | { kind: Strategy; reason: string; change: "time_change" | "smaller_action" | null };

export interface ItemContext {
  /** item_category from the plan item */
  category: string;
  /** plan_mode of the item's plan */
  planMode: string;
  /** daily/weekdays items have times that can be moved; weekly targets and one-offs don't */
  scheduleKind: string;
}

/** Items Sukhi must never re-time or shrink: medication, or anything from a clinician's plan. */
export function isClinicalItem(item: ItemContext): boolean {
  return item.category === "medication" || item.planMode === "clinician_instructions";
}

/** Safe strategy for a reported barrier. Clinical items never get change offers. */
export function strategyForBarrier(code: BarrierCode, item: ItemContext): Extract<SupportDecision, { change: unknown }> {
  if (code === "physical_discomfort") return { kind: "safety_first", reason: "physical_discomfort", change: null };
  if (code === "other" || code === "prefer_not_to_say") return { kind: "supportive_checkin", reason: code, change: null };
  if (code === "low_motivation") return { kind: "switch_encouragement", reason: code, change: null };
  if (isClinicalItem(item)) return { kind: "care_team_checkin", reason: `${code}:clinical_item`, change: null };
  const movable = item.scheduleKind === "daily" || item.scheduleKind === "weekdays";
  switch (code) {
    case "forgot":
      return movable ? { kind: "suggest_reminder_time", reason: code, change: "time_change" } : { kind: "supportive_checkin", reason: `${code}:not_movable`, change: null };
    case "busy":
      return movable ? { kind: "suggest_reschedule", reason: code, change: "time_change" } : { kind: "supportive_checkin", reason: `${code}:not_movable`, change: null };
    case "routine_disrupted":
      return movable ? { kind: "offer_flexible_plan", reason: code, change: "time_change" } : { kind: "supportive_checkin", reason: `${code}:not_movable`, change: null };
    case "too_difficult":
      return { kind: "offer_smaller_action", reason: code, change: "smaller_action" };
  }
}

export interface DecisionContext {
  /** reminders consent granted and reminder_frequency != off */
  userAllowsContact: boolean;
  inQuietHours: boolean;
  rateLimitExceeded: boolean;
  /** the user's own words matched the concern screen, or they reported physical discomfort */
  hasConcerningSymptomReport: boolean;
  /** user explicitly reported missed/skipped; false for silence (no_response) */
  missIsConfirmed: boolean;
  restartPreference: RestartPreference | null;
  /** true when the user is the one asking (tapped a reason or "help me restart") */
  userRequestedHelp: boolean;
  /** "give me space" users: has the minimum gap since their last proactive follow-up passed? */
  spaceRespected?: boolean;
  barrierCode?: BarrierCode | null;
  item?: ItemContext | null;
}

/**
 * Choose the next permitted support. Safety comes first for anything the user said.
 * Contact limits (consent, quiet hours, caps, space) apply to proactive messages only.
 * A response to something the user just tapped is not a new notification.
 */
export function chooseSupport(ctx: DecisionContext): SupportDecision {
  if (ctx.hasConcerningSymptomReport && ctx.userRequestedHelp) return { kind: "safety_first", reason: "symptom_report", change: null };
  if (!ctx.userRequestedHelp) {
    if (!ctx.userAllowsContact || ctx.inQuietHours) return { kind: "none", reason: "contact_not_permitted" };
    if (ctx.rateLimitExceeded) return { kind: "none", reason: "rate_limited" };
    if (effectiveRestart(ctx.restartPreference) === "give_space" && !ctx.spaceRespected) return { kind: "none", reason: "user_prefers_space" };
    if (ctx.hasConcerningSymptomReport) return { kind: "safety_first", reason: "symptom_report", change: null };
    // A proactive follow-up only ever asks; it never proposes a change on its own.
    return ctx.missIsConfirmed ? { kind: "ask_barrier", reason: "missed_habit", change: null } : { kind: "gentle_checkin", reason: "status_unknown", change: null };
  }
  if (!ctx.barrierCode) return ctx.missIsConfirmed ? { kind: "ask_barrier", reason: "missed_habit", change: null } : { kind: "gentle_checkin", reason: "status_unknown", change: null };
  if (!ctx.item) return { kind: "supportive_checkin", reason: "no_item", change: null };
  return strategyForBarrier(ctx.barrierCode, ctx.item);
}

/** Humour is only used when the person chose it, and never around symptoms or clinical plans. */
export function humourAllowed(strategy: Strategy): boolean {
  return !["safety_first", "care_team_checkin", "supportive_checkin"].includes(strategy);
}
