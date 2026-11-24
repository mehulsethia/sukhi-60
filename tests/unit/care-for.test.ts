import { describe, expect, it } from "vitest";
import { switchOptions, weekPct, weekStrip } from "@/domain/care-for";

describe("weekStrip", () => {
  it("covers the last seven days ending today, counting done and planned", () => {
    const days = weekStrip([
      { local_date: "2026-11-23", status: "self_reported" },
      { local_date: "2026-11-23", status: "open" },
      { local_date: "2026-11-22", status: "evidence_supported" },
      { local_date: "2026-11-22", status: "paused" },
      { local_date: "2026-11-17", status: "missed" },
      { local_date: "2026-11-16", status: "self_reported" }, // outside the window
    ], "2026-11-23");
    expect(days.map((d) => d.date)).toEqual(["2026-11-17", "2026-11-18", "2026-11-19", "2026-11-20", "2026-11-21", "2026-11-22", "2026-11-23"]);
    expect(days[6]).toEqual({ date: "2026-11-23", done: 1, total: 2 });
    expect(days[5]).toEqual({ date: "2026-11-22", done: 1, total: 1 });
    expect(days[0]).toEqual({ date: "2026-11-17", done: 0, total: 1 });
    expect(weekPct(days)).toBe(50);
  });
  it("no plan means no percentage", () => expect(weekPct(weekStrip([], "2026-11-23"))).toBeNull());
});

describe("switchOptions", () => {
  const f = [{ id: "a1", name: "Kamla" }];
  it("one role gets one option (no switcher)", () => {
    expect(switchOptions(["patient"], [])).toHaveLength(1);
    expect(switchOptions(["family"], f)).toHaveLength(1);
    expect(switchOptions(["doctor"], [])).toHaveLength(1);
  });
  it("patient who cares for someone and is a doctor", () => {
    expect(switchOptions(["patient", "doctor", "family"], f).map((o) => o.href)).toEqual(["/today", "/family/a1", "/clinic"]);
  });
});
