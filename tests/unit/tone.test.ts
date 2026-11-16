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

  it("is short: the task as title, one brief why, no name or wrapper", () => {
    const c = reminderCopy({ locale: "en", styles: ["warm_gentle"], task: "Glass of water", seed: "a" });
    expect(c.title).toBe("Glass of water");
    expect(c.body).not.toContain("Glass of water");
    expect(c.body.length).toBeLessThanOrEqual(40);
    expect(c.title).not.toMatch(/care for you|Sukhi/);
  });

  it("adds a light tone mark", () => {
    expect(reminderCopy({ locale: "en", styles: ["motivating"], task: "Walk", seed: "a" }).title).toBe("Walk 💪");
  });

  it("never uses playful framing for medicines or a doctor's plan", () => {
    for (const seed of ["a", "b", "c", "d", "e"]) {
      expect(reminderCopy({ locale: "en", styles: ["fun_playful"], task: "BP tablet", category: "medication", seed }).title).toBe("BP tablet");
      expect(reminderCopy({ locale: "en", styles: ["fun_playful"], task: "Walk", planMode: "clinician_instructions", motivation: "Fit", seed }).body).not.toBe("Fit");
    }
  });

  it("does not repeat a line seen recently", () => {
    const first = reminderCopy({ locale: "en", styles: ["warm_gentle"], task: "Glass of water", seed: "x" });
    const second = reminderCopy({ locale: "en", styles: ["warm_gentle"], task: "Glass of water", seed: "x", recent: [`${first.title} · ${first.body}`] });
    expect(second.body).not.toBe(first.body);
  });

  it("ties back to the person's own goal sometimes", () => {
    const bodies = Array.from({ length: 24 }, (_, i) => reminderCopy({ locale: "en", styles: ["warm_gentle"], task: "Walk", motivation: "Fit for my wedding", seed: String(i) }).body);
    expect(bodies.some((b) => b === "Fit for my wedding")).toBe(true);
    expect(bodies.filter((b) => b === "Fit for my wedding").length).toBeLessThan(12);
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
