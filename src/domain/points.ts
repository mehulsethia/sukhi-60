// Points rules shown to people, and the challenge score.
// Everyday points (Progress, weekly circle board) keep the 12-a-day cap on task points set in the
// database (_award). Challenges count every task at full value: rows past the cap are still
// recorded (with 0 points), so the full score can be rebuilt from them.

/** Full value of each capped kind; bonuses (return, milestone) keep their stored points. */
export const TASK_POINTS = { participation: 1, completion: 2, evidence_bonus: 1 } as const;

export interface RewardRow { kind: string; points: number }

/** Challenge score and tasks done from a person's reward rows inside the challenge dates. */
export function challengeScore(rows: readonly RewardRow[]): { points: number; done: number } {
  let points = 0, done = 0;
  for (const r of rows) {
    const full = TASK_POINTS[r.kind as keyof typeof TASK_POINTS];
    points += full ?? Math.max(0, r.points);
    if (r.kind === "completion") done++;
  }
  return { points, done };
}
