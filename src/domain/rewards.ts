// Progress derivations. Reward ISSUANCE rules live in SQL
// (supabase/migrations/*_state_functions.sql, functions _award / apply_check_in_internal)
// so they are atomic and replay-proof. This module only derives display state.

export const REWARD_RULES = {
  participation: { points: 1, per: "occurrence", note: "Honest response: done, skipped, unable or missed" },
  completion: { points: 2, per: "occurrence (weekly target: distinct day, up to target)" },
  evidence_bonus: { points: 1, per: "occurrence", note: "Evidence assessed as supporting" },
  return: { points: 3, per: "local day", note: "First completion after a recent non-completed day" },
  milestones: { first_step: 2, three_days_week: 2, five_days_week: 3 },
  daily_cap: 12,
  never_subtracts: true,
} as const;

export interface ProgressStats {
  points: number; // only ever grows; a missed day can never reduce it
  milestones: number;
  returns: number; // successful restarts after a break
}

export function progressFromEvents(events: { kind: string; points: number }[]): ProgressStats {
  return {
    points: events.reduce((s, e) => s + Math.max(0, e.points), 0),
    milestones: events.filter((e) => e.kind === "milestone").length,
    returns: events.filter((e) => e.kind === "return").length,
  };
}

export interface DaySummary {
  date: string;
  scheduled: number;
  completed: number; // self_reported + evidence_supported
  evidenceSupported: number;
  responded: number; // any explicit answer incl. skipped/unable/missed
  noResponse: number;
}

export function summarizeWeek(
  dates: string[],
  occ: { local_date: string; status: string }[],
): DaySummary[] {
  return dates.map((date) => {
    const day = occ.filter((o) => o.local_date === date);
    const c = (s: string[]) => day.filter((o) => s.includes(o.status)).length;
    return {
      date,
      scheduled: day.length,
      completed: c(["self_reported", "evidence_supported"]),
      evidenceSupported: c(["evidence_supported"]),
      responded: c(["self_reported", "evidence_supported", "skipped", "unable", "missed"]),
      noResponse: c(["no_response"]),
    };
  });
}

export function goalProgress(totalPoints: number, goal: { target_points: number; baseline_points: number } | null) {
  if (!goal) return null;
  const earned = Math.max(0, totalPoints - goal.baseline_points);
  return { earned, target: goal.target_points, done: earned >= goal.target_points, ratio: Math.min(1, earned / goal.target_points) };
}

/** Days this week with at least one honest answer (done, skipped, unable or missed). */
export function activeDays(week: DaySummary[]): number {
  return week.filter((d) => d.responded > 0).length;
}
