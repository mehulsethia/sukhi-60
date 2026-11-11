// Learning & Optimization Engine, deliberately simple. Descriptive counts only: no scores,
// no models, no causal claims. Explicit preferences always win over anything here, and
// nothing is applied without the user's confirmation.
import { BEHAVIOUR_POLICY, type BarrierCode, type CommunicationStyle } from "./behaviour";

const mins = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
const hhmm = (m: number) => {
  const x = ((Math.round(m) % 1440) + 1440) % 1440;
  return `${String(Math.floor(x / 60)).padStart(2, "0")}:${String(x % 60).padStart(2, "0")}`;
};
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** Signed difference reported − scheduled in minutes, wrapped to [-720, 720). */
export function minuteOffset(scheduled: string, reported: string): number {
  return ((mins(reported) - mins(scheduled) + 1440 + 720) % 1440) - 720;
}

/**
 * Timing observation for one scheduled time of one item. Returns a suggested time only
 * when there are enough completions, they agree in direction, and the median shift is
 * large enough. Rounded to 15 minutes. This is a suggestion to show, never an action.
 */
export function timingObservation(scheduled: string, reportedLocalTimes: string[], policy = BEHAVIOUR_POLICY): { suggested: string; observations: number; medianShift: number } | null {
  if (reportedLocalTimes.length < policy.minObservationsForTimingSuggestion) return null;
  const offs = reportedLocalTimes.map((r) => minuteOffset(scheduled, r));
  const med = median(offs);
  if (Math.abs(med) < policy.timingShiftMinutes) return null;
  const sameSide = offs.filter((o) => Math.sign(o) === Math.sign(med) && Math.abs(o) >= policy.timingShiftMinutes / 2).length;
  if (sameSide / offs.length < policy.timingAgreementShare) return null;
  return { suggested: hhmm(Math.round((mins(scheduled) + med) / 15) * 15), observations: offs.length, medianShift: Math.round(med) };
}

export function barrierDistribution(codes: BarrierCode[]): { code: BarrierCode; n: number }[] {
  const m = new Map<BarrierCode, number>();
  for (const c of codes) m.set(c, (m.get(c) ?? 0) + 1);
  return [...m.entries()].map(([code, n]) => ({ code, n })).sort((a, b) => b.n - a.n || a.code.localeCompare(b.code));
}

/** Sent vs acknowledged per style. Acknowledgement is engagement, not proof of completion. */
export function styleResponseCounts(nudges: { style_used: string; acknowledged_at: string | null }[]): Partial<Record<CommunicationStyle, { sent: number; engaged: number }>> {
  const out: Partial<Record<CommunicationStyle, { sent: number; engaged: number }>> = {};
  for (const n of nudges) {
    if (n.style_used === "neutral") continue;
    const k = n.style_used as CommunicationStyle;
    const e = (out[k] ??= { sent: 0, engaged: 0 });
    e.sent++;
    if (n.acknowledged_at) e.engaged++;
  }
  return out;
}

/** The style with the most engagements, if it has enough observations to mention at all. */
export function mostEngagedStyle(counts: ReturnType<typeof styleResponseCounts>, minSent = BEHAVIOUR_POLICY.minObservationsForTimingSuggestion): CommunicationStyle | null {
  const rows = Object.entries(counts).filter(([, v]) => v!.sent >= minSent && v!.engaged > 0);
  if (rows.length < 2) return null; // nothing to compare
  rows.sort((a, b) => b[1]!.engaged / b[1]!.sent - a[1]!.engaged / a[1]!.sent);
  return rows[0][0] as CommunicationStyle;
}

const LAPSE = ["missed", "skipped", "no_response", "unable"];
const DONE = ["self_reported", "evidence_supported"];

/**
 * How many times a lapse on an item was followed by a completion of the same item within
 * the recovery window. Rows: one per closed occurrence, any order.
 */
export function countResumes(occ: { item_id: string; local_date: string; status: string }[], windowDays = BEHAVIOUR_POLICY.recoveryWindowDays): number {
  const byItem = new Map<string, { local_date: string; status: string }[]>();
  for (const o of occ) (byItem.get(o.item_id) ?? byItem.set(o.item_id, []).get(o.item_id)!).push(o);
  let n = 0;
  for (const rows of byItem.values()) {
    rows.sort((a, b) => a.local_date.localeCompare(b.local_date));
    let lapseDate: string | null = null;
    for (const r of rows) {
      if (LAPSE.includes(r.status)) {
        lapseDate ??= r.local_date;
      } else if (DONE.includes(r.status) && lapseDate) {
        const gap = (Date.parse(r.local_date) - Date.parse(lapseDate)) / 86_400_000;
        if (gap > 0 && gap <= windowDays) n++;
        lapseDate = null;
      }
    }
  }
  return n;
}

// ---------------------------------------------------------------------------
// Pilot metric dictionary: the shared definitions used by the admin report, so reminders
// are never confused with completed actions. All metrics are descriptive.
// ---------------------------------------------------------------------------
export const METRIC_DEFINITIONS = {
  onboarding_completion: "Users who finished onboarding ÷ users who started it (signed up).",
  habit_completion_rate: "Self-reported or evidence-supported completions ÷ closed opportunities with a KNOWN status (done, skipped, unable, missed). Unknown (no reply) is excluded from both and reported separately.",
  unknown_status: "Closed opportunities with no reply (no_response). Never counted as missed.",
  recovery_after_lapse: `Users with a reported or unknown lapse who later report completing the SAME habit within ${BEHAVIOUR_POLICY.recoveryWindowDays} days ÷ users with a lapse.`,
  sustained_consistency: "Completion rate per ISO week over the pilot, known statuses only.",
  nudge_engagement: "Acknowledged proactive nudges ÷ delivered proactive nudges. Opening is not completion; replies to the user's own taps are excluded.",
  barrier_distribution: "Counts of voluntarily reported barrier categories.",
  suggestion_acceptance: "Accepted time/smaller-action suggestions ÷ suggestions shown (expired counted as not accepted).",
  satisfaction: "Not collected yet. Needs a brief optional feedback question; never inferred from clicks.",
} as const;

/** Completion rate with unknowns excluded from numerator and denominator. */
export function completionRate(statuses: string[]): { done: number; known: number; unknown: number; rate: number | null } {
  const known = statuses.filter((s) => DONE.includes(s) || ["skipped", "unable", "missed"].includes(s)).length;
  const done = statuses.filter((s) => DONE.includes(s)).length;
  const unknown = statuses.filter((s) => s === "no_response").length;
  return { done, known, unknown, rate: known ? Math.round((1000 * done) / known) / 10 : null };
}
