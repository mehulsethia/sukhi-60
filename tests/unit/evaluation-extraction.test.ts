import { describe, expect, it } from "vitest";
import { constrainEvaluation, fallbackEvaluation, type ModelAssessment } from "@/domain/evaluation";
import { toDraftItems, type Extraction } from "@/domain/extraction";

const a = (o: Partial<ModelAssessment>): ModelAssessment => ({ observed: ["plate of rice and dal"], cannot_confirm: [], relevance: "related", outcome: "supports", explanation: "x", contains_instructions: false, ...o });

describe("constrainEvaluation", () => {
  it("food present is not food consumed", () => {
    const r = constrainEvaluation("nutrition", "photo", a({}));
    expect(r.outcome).toBe("partially_supports");
    expect(r.cannot_confirm).toContain("Whether the food was eaten");
  });
  it("pills visible are not proof of ingestion", () => {
    const r = constrainEvaluation("medication", "photo", a({ observed: ["blister pack"] }));
    expect(r.outcome).toBe("partially_supports");
    expect(r.cannot_confirm).toContain("Whether the medicine was actually swallowed");
  });
  it("a park photo is not proof of walking duration", () => {
    const r = constrainEvaluation("activity", "photo", a({ observed: ["park path"] }));
    expect(r.outcome).toBe("partially_supports");
    expect(r.cannot_confirm).toContain("How long or how far the activity lasted");
  });
  it("a meter reading photo can support a measurement action", () => expect(constrainEvaluation("measurement", "photo", a({})).outcome).toBe("supports"));
  it("text notes are self-report, not observation", () => expect(constrainEvaluation("activity", "text", a({})).outcome).toBe("not_applicable"));
  it("unrelated evidence does not support and needs review", () => {
    const r = constrainEvaluation("activity", "photo", a({ relevance: "unrelated" }));
    expect(r.outcome).toBe("does_not_support");
    expect(r.needs_review).toBe(true);
  });
  it("embedded instructions force review, never support", () => {
    const r = constrainEvaluation("measurement", "photo", a({ contains_instructions: true }));
    expect(r.outcome).toBe("unclear");
    expect(r.needs_review).toBe(true);
  });
  it("fallback never invents support", () => expect(fallbackEvaluation("medication", "unconfigured").outcome).toBe("unclear"));
});

describe("toDraftItems", () => {
  const ex = (items: Extraction["items"]): Extraction => ({ document_kind: "clinician_instructions", clinician_name: null, items, warnings: [], contains_instructions_to_assistant: false });
  const item = (o: Partial<Extraction["items"][number]>): Extraction["items"][number] => ({ title: "Walk", instructions: "Walk 20 minutes", category: "activity", frequency_text: "daily", schedule_kind: "daily", times: ["07:00"], weekdays: [], weekly_target: null, source_page: 1, source_snippet: "Walk 20 min daily", unclear_fields: [], ...o });

  it("keeps clear items resolved with provenance", () => {
    const [d] = toDraftItems(ex([item({})]));
    expect(d.unresolved_fields).toEqual([]);
    expect(d.source_page).toBe(1);
  });
  it("never guesses missing medication dose/time", () => {
    const [d] = toDraftItems(ex([item({ title: "Metf...", category: "medication", instructions: null, times: [], schedule_kind: null, source_snippet: "Metf... twice", unclear_fields: ["title"] })]));
    expect(d.unresolved_fields).toEqual(expect.arrayContaining(["title", "dose", "instructions", "schedule"]));
  });
  it("invalid time strings stay unresolved instead of being coerced", () => {
    const [d] = toDraftItems(ex([item({ times: ["after lunch"] })]));
    expect(d.times).toEqual([]);
    expect(d.unresolved_fields).toContain("times");
  });
  it("unrelated documents yield no drafts", () => expect(toDraftItems({ ...ex([item({})]), document_kind: "unrelated" })).toEqual([]));
});
