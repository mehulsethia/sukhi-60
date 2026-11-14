import { describe, expect, it } from "vitest";
import { benefitFor, reminderCopy, toneInstruction } from "@/domain/tone";
import { TEMPLATES, PACK_KEYS, isPackKey } from "@/domain/templates";
import { isValidTime } from "@/domain/schedule";

describe("outcome-led reminders", () => {
  it("maps habits to an outcome", () => {
    expect(benefitFor({ title: "Glass of water" })).toBe("water");
    expect(benefitFor({ title: "30-minute walk" })).toBe("walk");
    expect(benefitFor({ title: "Screens off, sleep by 11" })).toBe("sleep");
    expect(benefitFor({ title: "Metformin 500", category: "medication" })).toBe("medicine");
    expect(benefitFor({ title: "Anything", planMode: "clinician_instructions" })).toBe("medicine");
  });

  it("says why, in the chosen tone, with the person's name", () => {
    const c = reminderCopy({ locale: "en", styles: ["motivating"], task: "Glass of water", name: "Riya Shah", seed: "a" });
    expect(c.title).toContain("Riya");
    expect(c.body).toContain("Glass of water");
    expect(c.body.length).toBeGreaterThan("Glass of water".length + 10);
  });

  it("never uses playful framing for medicines", () => {
    for (const seed of ["a", "b", "c", "d", "e"]) {
      const c = reminderCopy({ locale: "en", styles: ["fun_playful"], task: "BP tablet", category: "medication", seed });
      expect(c.title).not.toContain("👀");
    }
  });

  it("ties back to the person's own goal sometimes", () => {
    const bodies = ["1", "2", "3", "4", "5", "6", "7", "8"].map((seed) => reminderCopy({ locale: "en", styles: ["warm_gentle"], task: "Walk", motivation: "Fit for my wedding", seed }).body);
    expect(bodies.some((b) => b.includes("Fit for my wedding"))).toBe(true);
  });

  it("writes Hindi and Marathi in Devanagari", () => {
    expect(reminderCopy({ locale: "hi", styles: ["warm_gentle"], task: "Walk", seed: "x" }).body).toMatch(/[ऀ-ॿ]/);
    expect(reminderCopy({ locale: "mr", styles: ["simple_practical"], task: "Walk", seed: "x" }).body).toMatch(/[ऀ-ॿ]/);
  });

  it("tone guidance follows the stated style", () => {
    expect(toneInstruction(["fun_playful"])).toMatch(/playful/);
    expect(toneInstruction([])).toMatch(/warm/);
  });
});

describe("ready-made packs", () => {
  it("are valid, schedulable plans with a motivation", () => {
    for (const k of PACK_KEYS) {
      const p = TEMPLATES[k];
      expect(isPackKey(k)).toBe(true);
      expect(p.motivation.length).toBeGreaterThan(3);
      expect(p.items.length).toBeGreaterThan(0);
      for (const i of p.items) {
        if (i.schedule_kind === "weekly_target") expect(i.weekly_target).toBeGreaterThan(0);
        else expect(i.times.length).toBeGreaterThan(0);
        expect(i.times.every(isValidTime)).toBe(true);
      }
    }
    expect(isPackKey("nope")).toBe(false);
  });
});
