// Garden & progress derivations. Reward ISSUANCE rules live in SQL
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

export type GardenStage = "seed" | "sprout" | "seedling" | "young_plant" | "budding" | "blooming" | "flourishing";

const STAGES: { stage: GardenStage; min: number }[] = [
  { stage: "seed", min: 0 },
  { stage: "sprout", min: 5 },
  { stage: "seedling", min: 15 },
  { stage: "young_plant", min: 35 },
  { stage: "budding", min: 60 },
  { stage: "blooming", min: 100 },
  { stage: "flourishing", min: 160 },
];

export interface GardenState {
  points: number;
  stage: GardenStage;
  stageIndex: number;
  nextStageAt: number | null;
  progressToNext: number; // 0..1
  flowers: number; // one per milestone, decorative
  leaves: number; // returns grow extra leaves: restarting is celebrated
}

/** Points only accumulate; a missed day can never reduce the garden. */
export function gardenFromEvents(events: { kind: string; points: number }[]): GardenState {
  const points = events.reduce((s, e) => s + Math.max(0, e.points), 0);
  let idx = 0;
  for (let i = 0; i < STAGES.length; i++) if (points >= STAGES[i].min) idx = i;
  const next = STAGES[idx + 1];
  const cur = STAGES[idx];
  return {
    points,
    stage: cur.stage,
    stageIndex: idx,
    nextStageAt: next ? next.min : null,
    progressToNext: next ? (points - cur.min) / (next.min - cur.min) : 1,
    flowers: Math.min(12, events.filter((e) => e.kind === "milestone").length),
    leaves: Math.min(8, events.filter((e) => e.kind === "return").length),
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
