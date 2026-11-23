import { describe, expect, it } from "vitest";
import { hatsFrom, waMode } from "@/domain/hats";

describe("hatsFrom", () => {
  const none = { hasPlan: false, isDoctor: false, follows: 0 };
  it("a new person is a patient", () => expect(hatsFrom(none)).toEqual(["patient"]));
  it("family only, until they start a plan", () => {
    expect(hatsFrom({ ...none, follows: 1, primaryRole: "family" })).toEqual(["family"]);
    expect(hatsFrom({ ...none, follows: 1, hasPlan: true, primaryRole: "family" })).toEqual(["patient", "family"]);
  });
  it("doctor only, or doctor who is also a patient and family", () => {
    expect(hatsFrom({ ...none, isDoctor: true, primaryRole: "doctor" })).toEqual(["doctor"]);
    expect(hatsFrom({ hasPlan: true, isDoctor: true, follows: 2, primaryRole: "doctor" })).toEqual(["patient", "doctor", "family"]);
  });
  it("a patient who also follows someone keeps the patient hat without a plan yet", () => {
    expect(hatsFrom({ ...none, follows: 1, primaryRole: "patient" })).toEqual(["patient", "family"]);
  });
});

describe("waMode", () => {
  const now = Date.parse("2026-11-23T10:00:00Z");
  it("non-doctors are always on the patient side", () => expect(waMode({ isDoctor: false, primaryRole: "doctor" }, now)).toBe("patient"));
  it("doctor-only accounts are always on the doctor side", () => expect(waMode({ isDoctor: true, primaryRole: "doctor" }, now)).toBe("doctor"));
  it("a doctor who is also a patient: patient side unless clinic mode is open", () => {
    expect(waMode({ isDoctor: true, primaryRole: "patient" }, now)).toBe("patient");
    expect(waMode({ isDoctor: true, primaryRole: "patient", doctorUntil: "2026-11-23T10:20:00Z" }, now)).toBe("doctor");
    expect(waMode({ isDoctor: true, primaryRole: "patient", doctorUntil: "2026-11-23T09:59:00Z" }, now)).toBe("patient");
  });
});
