import { describe, expect, it } from "vitest";
import { daysLeft, dosesPerDay } from "@/server/companion";

const base = { stock_count: 30, units_per_dose: 1, schedule_kind: "daily", times: ["08:00", "20:00"], weekdays: [] as number[], weekly_target: null };

describe("medicine stock", () => {
  it("derives doses per day from the schedule as written", () => {
    expect(dosesPerDay(base)).toBe(2);
    expect(dosesPerDay({ ...base, schedule_kind: "weekdays", times: ["08:00"], weekdays: [1, 3, 5] })).toBeCloseTo(3 / 7);
    expect(dosesPerDay({ ...base, schedule_kind: "weekly_target", times: [], weekly_target: 7 })).toBe(1);
    expect(dosesPerDay({ ...base, schedule_kind: "once" })).toBe(0);
  });
  it("counts whole days left, or null when not tracked", () => {
    expect(daysLeft(base)).toBe(15);
    expect(daysLeft({ ...base, units_per_dose: 2 })).toBe(7);
    expect(daysLeft({ ...base, stock_count: 0 })).toBe(0);
    expect(daysLeft({ ...base, stock_count: null })).toBeNull();
    expect(daysLeft({ ...base, schedule_kind: "once" })).toBeNull();
  });
});
