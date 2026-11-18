import { describe, expect, it } from "vitest";
import { challengeScore } from "@/domain/points";

describe("challenge score", () => {
  it("counts every task at full value, ignoring the daily cap", () => {
    // 6 tasks done in a day: the database stored 12 points (capped), the challenge counts 18.
    const rows = Array.from({ length: 6 }, (_, i) => [
      { kind: "participation", points: i < 4 ? 1 : 0 },
      { kind: "completion", points: i < 4 ? 2 : 0 },
    ]).flat();
    expect(challengeScore(rows)).toEqual({ points: 18, done: 6 });
  });

  it("adds photo and bonus points; an honest skip is 1", () => {
    expect(challengeScore([
      { kind: "participation", points: 1 }, { kind: "completion", points: 2 }, { kind: "evidence_bonus", points: 0 },
      { kind: "participation", points: 1 }, // skipped task
      { kind: "return", points: 3 }, { kind: "milestone", points: 2 },
    ])).toEqual({ points: 10, done: 1 });
  });
});
