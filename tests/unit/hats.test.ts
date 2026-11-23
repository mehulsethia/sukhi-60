import { describe, expect, it } from "vitest";
import { hatsFrom } from "@/domain/hats";

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
