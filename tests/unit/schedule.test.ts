import { describe, expect, it } from "vitest";
import { displayStatus, inQuietHours, isoWeekday, planOccurrences, reminderSendTime, weekStart, type SchedulableItem } from "@/domain/schedule";

const base: SchedulableItem = { id: "i1", plan_id: "p1", version: 3, schedule_kind: "daily", times: ["08:00", "20:00"], weekdays: [], weekly_target: null, once_date: null, window_minutes: 120 };

describe("planOccurrences", () => {
  it("stores UTC instants for local times in Asia/Kolkata", () => {
    const occ = planOccurrences(base, "Asia/Kolkata", "2026-11-10", 1);
    expect(occ).toHaveLength(2);
    expect(occ[0].due_at).toBe("2026-11-10T02:30:00.000Z");
    expect(occ[0].local_date).toBe("2026-11-10");
    expect(occ[0].local_time).toBe("08:00");
    expect(occ[0].window_end_at).toBe("2026-11-10T04:30:00.000Z");
    expect(occ[0].item_version).toBe(3);
  });

  it("handles DST transitions (Europe/London, last Sunday of March)", () => {
    const occ = planOccurrences({ ...base, times: ["08:00"] }, "Europe/London", "2026-03-28", 3);
    expect(occ.map((o) => o.due_at)).toEqual(["2026-03-28T08:00:00.000Z", "2026-03-29T07:00:00.000Z", "2026-03-30T07:00:00.000Z"]);
  });

  it("only schedules selected weekdays", () => {
    const occ = planOccurrences({ ...base, schedule_kind: "weekdays", times: ["07:00"], weekdays: [1, 3, 5] }, "Asia/Kolkata", "2026-11-09", 7);
    expect(occ.map((o) => isoWeekday(o.local_date))).toEqual([1, 3, 5]);
  });

  it("creates one weekly-target occurrence per ISO week with a target count", () => {
    const occ = planOccurrences({ ...base, schedule_kind: "weekly_target", weekly_target: 3, times: [] }, "Asia/Kolkata", "2026-11-11", 10);
    expect(occ).toHaveLength(2);
    expect(occ[0].local_date).toBe("2026-11-09");
    expect(occ[0].target_count).toBe(3);
    expect(new Date(occ[0].window_end_at).getTime() - new Date(occ[0].due_at).getTime()).toBe(7 * 86400000);
  });

  it("schedules a once item only on its date", () => {
    const occ = planOccurrences({ ...base, schedule_kind: "once", once_date: "2026-11-12", times: ["10:30"] }, "Asia/Kolkata", "2026-11-10", 5);
    expect(occ).toHaveLength(1);
    expect(occ[0].local_date).toBe("2026-11-12");
  });

  it("rejects invalid timezones", () => {
    expect(() => planOccurrences(base, "Mars/Olympus", "2026-11-10", 1)).toThrow("invalid_timezone");
  });

  it("weekStart returns Monday", () => {
    expect(weekStart("2026-11-15")).toBe("2026-11-09");
    expect(weekStart("2026-11-09")).toBe("2026-11-09");
  });
});

describe("quiet hours", () => {
  it("detects overnight windows", () => {
    expect(inQuietHours("23:00", "21:30", "07:30")).toBe(true);
    expect(inQuietHours("06:59", "21:30", "07:30")).toBe(true);
    expect(inQuietHours("07:30", "21:30", "07:30")).toBe(false);
    expect(inQuietHours("12:00", "21:30", "07:30")).toBe(false);
  });

  it("moves only the reminder to the end of quiet hours, never the due time", () => {
    const due = new Date("2026-11-10T17:00:00Z"); // 22:30 IST
    const r = reminderSendTime(due, "Asia/Kolkata", "21:30", "07:30");
    expect(r.shifted).toBe(true);
    expect(r.sendAt.toISOString()).toBe("2026-11-11T02:00:00.000Z"); // 07:30 IST next day
    const early = reminderSendTime(new Date("2026-11-10T00:30:00Z"), "Asia/Kolkata", "21:30", "07:30"); // 06:00 IST
    expect(early.sendAt.toISOString()).toBe("2026-11-10T02:00:00.000Z");
    const ok = reminderSendTime(new Date("2026-11-10T04:30:00Z"), "Asia/Kolkata", "21:30", "07:30");
    expect(ok.shifted).toBe(false);
  });
});

describe("displayStatus", () => {
  const occ = { status: "pending" as const, due_at: "2026-11-10T02:30:00Z", window_end_at: "2026-11-10T04:30:00Z" };
  it("pending -> due inside window", () => expect(displayStatus(occ, new Date("2026-11-10T03:00:00Z"))).toBe("due"));
  it("silence after the window is no_response, not missed", () => expect(displayStatus(occ, new Date("2026-11-10T05:00:00Z"))).toBe("no_response"));
  it("keeps explicit statuses", () => expect(displayStatus({ ...occ, status: "missed" }, new Date("2026-11-10T05:00:00Z"))).toBe("missed"));
  it("later becomes due after snooze", () =>
    expect(displayStatus({ ...occ, status: "later", snooze_until: "2026-11-10T03:00:00Z" }, new Date("2026-11-10T03:30:00Z"))).toBe("due"));
});
