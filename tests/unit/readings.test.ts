import { describe, expect, it } from "vitest";
import { cleanReading, formatReading, parseReadingText } from "@/domain/readings";
import { REVIEW_PROMISE_HOURS, reviewDue } from "@/domain/proof";

describe("device readings", () => {
  it("keeps a normal blood pressure reading with pulse", () => {
    const r = cleanReading({ kind: "blood_pressure", value: 128, value2: 82, pulse: 74, unit: "mmHg", legible: true });
    expect(r).toEqual({ kind: "blood_pressure", value: 128, value2: 82, pulse: 74, unit: "mmHg" });
    expect(formatReading(r!)).toBe("128/82 mmHg, pulse 74");
  });
  it("drops illegible, swapped or impossible numbers instead of fixing them", () => {
    expect(cleanReading({ kind: "blood_pressure", value: 128, value2: 82, unit: "mmHg", legible: false })).toBeNull();
    expect(cleanReading({ kind: "blood_pressure", value: 82, value2: 128, unit: "mmHg" })).toBeNull();
    expect(cleanReading({ kind: "blood_pressure", value: 1280, value2: 82, unit: "mmHg" })).toBeNull();
    expect(cleanReading({ kind: "spo2", value: 140, unit: "%" })).toBeNull();
    expect(cleanReading({ kind: "steps", value: 4000, unit: "" })).toBeNull();
  });
  it("drops a bad pulse but keeps the main reading", () => {
    expect(cleanReading({ kind: "blood_pressure", value: 130, value2: 85, pulse: 900, unit: "mmHg" })?.pulse).toBeNull();
  });
  it("normalises units and infers them only when unambiguous", () => {
    expect(cleanReading({ kind: "glucose", value: 112, unit: "mg/dl" })?.unit).toBe("mg/dL");
    expect(cleanReading({ kind: "glucose", value: 6.2, unit: "mmol/l" })).toMatchObject({ value: 6.2, unit: "mmol/L" });
    expect(cleanReading({ kind: "glucose", value: 6.2, unit: "" })).toBeNull(); // mmol or mg? don't guess
    expect(cleanReading({ kind: "glucose", value: 140, unit: null })?.unit).toBe("mg/dL");
    expect(cleanReading({ kind: "temperature", value: 98.6, unit: "" })?.unit).toBe("°F");
    expect(cleanReading({ kind: "temperature", value: 36.84, unit: "C" })).toMatchObject({ value: 36.8, unit: "°C" });
    expect(cleanReading({ kind: "weight", value: 72.4, unit: "" })).toBeNull();
    expect(cleanReading({ kind: "weight", value: 160, unit: "lbs" })?.unit).toBe("lb");
  });
  it("formats spo2", () => {
    expect(formatReading(cleanReading({ kind: "spo2", value: 97, pulse: 78, unit: "%" })!)).toBe("SpO₂ 97%, pulse 78");
  });
  it("parses typed corrections in the reading's own unit", () => {
    expect(parseReadingText({ kind: "blood_pressure", unit: "mmHg" }, "130/84 72")).toMatchObject({ value: 130, value2: 84, pulse: 72 });
    expect(parseReadingText({ kind: "blood_pressure", unit: "mmHg" }, "130")).toBeNull();
    expect(parseReadingText({ kind: "temperature", unit: "°C" }, "37,2")).toMatchObject({ value: 37.2 });
    expect(parseReadingText({ kind: "glucose", unit: "mg/dL" }, "sorry it was 118")).toMatchObject({ value: 118 });
    expect(parseReadingText({ kind: "glucose", unit: "mg/dL" }, "no")).toBeNull();
  });
});

describe("review turnaround", () => {
  const now = new Date("2026-11-19T12:00:00Z");
  it("promises appeals and flags, not audits or waiting ones", () => {
    expect(reviewDue({ source: "audit", status: "open", created_at: now.toISOString() }, now)).toBeNull();
    expect(reviewDue({ source: "appeal", status: "waiting_patient", created_at: now.toISOString() }, now)).toBeNull();
    expect(reviewDue({ source: "appeal", status: "open", created_at: now.toISOString() }, now)?.hoursLeft).toBe(REVIEW_PROMISE_HOURS);
  });
  it("is overdue after the promise", () => {
    const old = new Date(now.getTime() - (REVIEW_PROMISE_HOURS + 1) * 3600_000).toISOString();
    expect(reviewDue({ source: "flag", status: "open", created_at: old }, now)?.overdue).toBe(true);
  });
});
