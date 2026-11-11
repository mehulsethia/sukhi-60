import { describe, expect, it } from "vitest";
import { constrainEvaluation, fallbackEvaluation, ModelAssessmentSchema, type ModelAssessment } from "@/domain/evaluation";
import { ExtractionSchema, toDraftItems, type Extraction } from "@/domain/extraction";

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
  it("a video that shows the pill being swallowed can fully support", () => {
    const r = constrainEvaluation("medication", "video", a({ observed: ["person places tablet in mouth", "drinks water"], action_observed: true }));
    expect(r.outcome).toBe("supports");
    expect(r.cannot_confirm).not.toContain("Whether the medicine was actually swallowed");
  });
  it("a video that only shows the items stays partial", () => {
    const r = constrainEvaluation("medication", "video", a({ observed: ["blister pack on table"], action_observed: false }));
    expect(r.outcome).toBe("partially_supports");
  });
  it("an assessment with too many observations is trimmed, not rejected", () => {
    const big = a({ observed: Array.from({ length: 12 }, (_, i) => `thing ${i}`), explanation: "e".repeat(900) });
    expect(ModelAssessmentSchema.safeParse(big).success).toBe(true);
    const r = constrainEvaluation("measurement", "photo", big);
    expect(r.observed).toHaveLength(8);
    expect(r.explanation.length).toBe(600);
  });
  it("fallback never invents support", () => expect(fallbackEvaluation("medication", "unconfigured").outcome).toBe("unclear"));
});

describe("toDraftItems", () => {
  const ex = (items: Extraction["items"]): Extraction => ({ orientation: "upright", transcription: "", document_kind: "clinician_instructions", clinician_name: null, document_date: null, items, warnings: [], contains_instructions_to_assistant: false });
  const item = (o: Partial<Extraction["items"][number]>): Extraction["items"][number] => ({
    source_snippet: "Walk 20 min daily 07:00", source_page: 1, title: "Walk", title_confidence: "high", title_alternatives: [], form: "not_medicine", category: "activity",
    dose_text: null, instructions: "Walk 20 minutes", frequency_text: "daily", schedule_kind: "daily", slots: [], times: ["07:00"], weekdays: [], weekly_target: null,
    duration_text: null, once_date: null, unclear_fields: [], ...o,
  });

  it("keeps clear items resolved with provenance", () => {
    const [d] = toDraftItems(ex([item({})]));
    expect(d.unresolved_fields).toEqual([]);
    expect(d.source_page).toBe(1);
    expect(d.suggested_times).toBe(false);
  });
  it("never confirms a missing medication dose or schedule", () => {
    const [d] = toDraftItems(ex([item({ title: "Metf...", title_confidence: "low", form: "tablet", category: "medication", instructions: null, times: [], schedule_kind: null, source_snippet: "Metf... twice", unclear_fields: [] })]));
    expect(d.unresolved_fields).toEqual(expect.arrayContaining(["title", "dose", "instructions", "schedule"]));
  });
  it("shows a best reading instead of 'Unclear item', but still asks the user to check it", () => {
    const [d] = toDraftItems(ex([item({ title: "Dutas 0.5 mg", title_confidence: "medium", title_alternatives: ["Dutas 0.5 mg", "Dutasteride 0.5"], form: "tablet", category: "medication", dose_text: "1 tab", slots: ["after_dinner"], times: [], source_snippet: "T. Dutas 0.5mg 1 tab after dinner" })]));
    expect(d.title).toBe("Dutas 0.5 mg");
    expect(d.unresolved_fields).toContain("title");
    expect(d.unresolved_fields).not.toContain("dose");
    expect(d.alternatives).toEqual(["Dutasteride 0.5"]);
  });
  it("turns meal anchors into suggested times instead of leaving them blank", () => {
    const [d] = toDraftItems(ex([item({ title: "Doxy 100", form: "capsule", category: "medication", dose_text: "1 cap", instructions: "1 cap after lunch for 10 weeks", slots: ["after_lunch"], times: [], source_snippet: "1 cap after lunch } 10 wks" })]));
    expect(d.times).toEqual(["13:45"]);
    expect(d.suggested_times).toBe(true);
    expect(d.unresolved_fields).toEqual([]);
  });
  it("1-0-1 style anchors produce two times", () => {
    const [d] = toDraftItems(ex([item({ slots: ["after_dinner", "after_breakfast"], times: [] })]));
    expect(d.times).toEqual(["08:45", "20:45"]);
  });
  it("topical products don't require a numeric dose", () => {
    const [d] = toDraftItems(ex([item({ title: "Pelliwash shampoo", form: "shampoo", category: "medication", instructions: "Use on alternate days", schedule_kind: "weekdays", weekdays: [1, 3, 5, 7], slots: ["on_waking"], times: [], source_snippet: "Pelliwash shampoo alt days" })]));
    expect(d.unresolved_fields).not.toContain("dose");
  });
  it("a dated review visit becomes a one-off appointment", () => {
    const [d] = toDraftItems(ex([item({ title: "Review visit", category: "appointment", schedule_kind: null, once_date: "2026-01-15", slots: [], times: ["11:00"], source_snippet: "R/v after 10 wks (15/01/2026)" })]));
    expect(d.schedule_kind).toBe("once");
    expect(d.once_date).toBe("2026-01-15");
    expect(d.unresolved_fields).toEqual([]);
  });
  it("invalid time strings stay unresolved instead of being coerced", () => {
    const [d] = toDraftItems(ex([item({ times: ["after lunch"] })]));
    expect(d.times).toEqual([]);
    expect(d.unresolved_fields).toContain("times");
  });
  it("overlong model output is trimmed, not rejected", () => {
    const long = item({ title: "X".repeat(300), source_snippet: "s".repeat(900), title_alternatives: ["a", "b", "c", "d", "e"], weekdays: [0, 1, 9, 3, 3], weekly_target: 12 });
    const raw = { ...ex(Array.from({ length: 25 }, () => long)), transcription: "t".repeat(9000) };
    expect(ExtractionSchema.safeParse(raw).success).toBe(true);
    const drafts = toDraftItems(raw);
    expect(drafts).toHaveLength(20);
    expect(drafts[0].title.length).toBe(120);
    expect(drafts[0].source_snippet.length).toBe(400);
    expect(drafts[0].weekdays).toEqual([1, 3]);
    expect(drafts[0].weekly_target).toBe(7);
  });
  it("unrelated documents yield no drafts", () => expect(toDraftItems({ ...ex([item({})]), document_kind: "unrelated" })).toEqual([]));
});
