// Plan extraction contract. The model transcribes the document line by line, then turns each
// instruction into a DRAFT item with page/snippet provenance. When handwriting is hard to read
// it gives its best reading AND a confidence level, instead of blanking the field: the user
// sees "We read this as X — please check" rather than "Unclear item". Low-confidence fields
// stay in unresolved_fields, and the DB refuses to confirm an item while any remain, so a
// human still checks every item against the photo before anything is scheduled.
import { z } from "zod";
import { isValidTime } from "./schedule";

// No length/count limits in the schema: Claude's structured outputs can't enforce them, and
// the SDK would still reject a whole answer for one overlong field. Results are trimmed below.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const nullableStr = (_max: number) => z.string().nullable();

/** Meal/day anchors written on Indian prescriptions ("after lunch", "HS", "1-0-1"). */
export const SLOTS = ["on_waking", "before_breakfast", "after_breakfast", "before_lunch", "after_lunch", "before_dinner", "after_dinner", "bedtime"] as const;
export type Slot = (typeof SLOTS)[number];

/** Default clock time per anchor. Shown as a suggestion the user confirms or edits. */
export const SLOT_TIMES: Record<Slot, string> = {
  on_waking: "07:00",
  before_breakfast: "08:00",
  after_breakfast: "08:45",
  before_lunch: "13:00",
  after_lunch: "13:45",
  before_dinner: "20:00",
  after_dinner: "20:45",
  bedtime: "22:00",
};

const FORMS = ["tablet", "capsule", "syrup", "drops", "injection", "inhaler", "cream_ointment", "lotion_solution", "shampoo", "serum", "powder", "other", "not_medicine"] as const;
/** Forms where a dose amount (1 tab, 5 ml, 2 puffs) is expected to be written. */
const DOSED_FORMS = new Set(["tablet", "capsule", "syrup", "drops", "injection", "inhaler", "powder"]);

export const ExtractedItemSchema = z.object({
  source_snippet: z.string().describe("Verbatim text this item came from, copied from the transcription. Use ... for illegible parts."),
  source_page: z.number().int().nullable(),
  title: nullableStr(120).describe("Best reading of the medicine/action name, e.g. 'Dutas 0.5 mg' or 'Walk 20 minutes'. Null only if nothing at all is legible."),
  title_confidence: z.enum(["high", "medium", "low"]).describe("high = clearly legible; medium = probable reading; low = a guess."),
  title_alternatives: z.array(z.string()).describe("Other plausible readings of the name when confidence is not high."),
  form: z.enum(FORMS),
  category: z.enum(["medication", "activity", "measurement", "nutrition", "appointment", "rest", "other"]),
  dose_text: nullableStr(80).describe("Amount per use as written, e.g. '1 tab', '1 cap', '5 ml', 'apply thin layer'. Null if not written."),
  instructions: nullableStr(600).describe("Plain-language instruction combining dose, timing and duration as written, e.g. '1 capsule after lunch for 10 weeks'."),
  frequency_text: nullableStr(120).describe("Frequency as written, e.g. 'BD', '1-0-1', 'alternate days'."),
  schedule_kind: z.enum(["daily", "weekdays", "weekly_target", "once"]).nullable().describe("daily, weekdays (specific days, e.g. alternate days), weekly_target (N times a week, any day), once (single event, e.g. review visit)."),
  slots: z.array(z.enum(SLOTS)).describe("Meal/day anchors written or clearly implied by standard notation: 'after lunch' -> after_lunch; 'HS' -> bedtime; '1-0-1' -> after_breakfast + after_dinner; 'BD' alone -> leave empty."),
  times: z.array(z.string()).describe("Only clock times literally written on the page, HH:MM 24h. Usually empty."),
  weekdays: z.array(z.number().int()).describe("1=Mon..7=Sun, for schedule_kind=weekdays. Alternate days -> [1,3,5,7]."),
  weekly_target: z.number().int().nullable(),
  duration_text: nullableStr(80).describe("Course length as written, e.g. '10 wks', '3 months'."),
  once_date: nullableStr(10).describe("For a review/follow-up visit with a written date: YYYY-MM-DD. Otherwise null."),
  unclear_fields: z.array(z.enum(["title", "instructions", "frequency", "times", "dose", "unit", "schedule"])).describe("Fields that are illegible, ambiguous or a guess."),
});
export type ExtractedItem = z.infer<typeof ExtractedItemSchema>;

export const ExtractionSchema = z.object({
  orientation: z.enum(["upright", "rotated_90_clockwise", "rotated_90_counterclockwise", "upside_down"]).describe("How the page appears in the image."),
  transcription: z.string().describe("Line-by-line transcription of ALL handwritten and printed instruction lines, in reading order, before structuring. Mark illegible parts with [?]."),
  document_kind: z.enum(["clinician_instructions", "discharge_summary", "prescription", "personal_notes", "unrelated", "unreadable"]),
  clinician_name: nullableStr(120),
  document_date: nullableStr(10).describe("Date written on the document, YYYY-MM-DD, if legible."),
  items: z.array(ExtractedItemSchema),
  warnings: z.array(z.string()),
  contains_instructions_to_assistant: z.boolean(),
});
export type Extraction = z.infer<typeof ExtractionSchema>;

export interface DraftItem {
  title: string;
  instructions: string | null;
  category: ExtractedItem["category"];
  schedule_kind: "daily" | "weekdays" | "weekly_target" | "once";
  times: string[];
  weekdays: number[];
  weekly_target: number | null;
  once_date?: string | null;
  source_page: number | null;
  source_snippet: string;
  unresolved_fields: string[];
  /** How sure the reader was about the name. Older stored drafts lack these fields. */
  confidence?: "high" | "medium" | "low";
  alternatives?: string[];
  /** Times derived from meal anchors ("after lunch" -> 13:45): suggestions the user checks. */
  suggested_times?: boolean;
  timing_text?: string | null;
}

const MED_DOSE_RE = /\b\d+(\.\d+)?\s?(mg|mcg|µg|g|ml|iu|units?|tabs?|tablets?|caps?|capsules?|puffs?|drops?|sachets?)\b/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Clock times for the given anchors, sorted and de-duplicated. */
export function slotTimes(slots: readonly Slot[]): string[] {
  return [...new Set(slots.map((s) => SLOT_TIMES[s]))].sort();
}

function slotLabel(s: Slot) {
  return s.replace(/_/g, " ");
}

/**
 * Turn model output into DRAFT plan items. Missing, unclear or low-confidence values become
 * entries in unresolved_fields (the DB refuses to confirm an item while any remain).
 */
const cut = (v: string | null | undefined, n: number) => (v == null ? null : v.slice(0, n));

/** Clamp model output to the limits the app and database expect. */
export function cleanExtraction(ex: Extraction): Extraction {
  return {
    ...ex,
    transcription: ex.transcription.slice(0, 8000),
    clinician_name: cut(ex.clinician_name, 120),
    document_date: cut(ex.document_date, 10),
    warnings: ex.warnings.slice(0, 10).map((w) => w.slice(0, 300)),
    items: ex.items.slice(0, 20).map((it) => ({
      ...it,
      source_snippet: it.source_snippet.slice(0, 400),
      source_page: it.source_page && it.source_page >= 1 ? Math.round(it.source_page) : null,
      title: cut(it.title, 120),
      title_alternatives: it.title_alternatives.slice(0, 3).map((x) => x.slice(0, 80)),
      dose_text: cut(it.dose_text, 80),
      instructions: cut(it.instructions, 600),
      frequency_text: cut(it.frequency_text, 120),
      slots: it.slots.slice(0, 8),
      times: it.times.slice(0, 8),
      weekdays: [...new Set(it.weekdays.map(Math.round).filter((d) => d >= 1 && d <= 7))],
      weekly_target: it.weekly_target && it.weekly_target >= 1 ? Math.min(7, Math.round(it.weekly_target)) : null,
      duration_text: cut(it.duration_text, 80),
      once_date: cut(it.once_date, 10),
      unclear_fields: [...new Set(it.unclear_fields)],
    })),
  };
}

export function toDraftItems(raw: Extraction): DraftItem[] {
  const ex = cleanExtraction(raw);
  if (ex.document_kind === "unrelated" || ex.document_kind === "unreadable") return [];
  return ex.items.map((it) => {
    const unresolved = new Set<string>(it.unclear_fields);
    if (!it.title || it.title_confidence !== "high") unresolved.add("title");

    const writtenTimes = it.times.filter(isValidTime);
    if (writtenTimes.length !== it.times.length) unresolved.add("times");
    const anchorTimes = writtenTimes.length ? [] : slotTimes(it.slots);
    const times = writtenTimes.length ? writtenTimes : anchorTimes;
    const suggested = writtenTimes.length === 0 && anchorTimes.length > 0;

    let kind = it.schedule_kind;
    // A dated review visit is a one-off appointment even if the model left the kind empty.
    if (!kind && it.category === "appointment" && it.once_date) kind = "once";
    if (!kind) unresolved.add("schedule");
    if ((kind === "daily" || kind === "weekdays" || kind === "once") && times.length === 0) unresolved.add("times");
    if (kind === "weekdays" && it.weekdays.length === 0) unresolved.add("schedule");
    if (kind === "weekly_target" && !it.weekly_target) unresolved.add("schedule");
    const onceDate = it.once_date && DATE_RE.test(it.once_date) ? it.once_date : null;
    if (kind === "once" && !onceDate) unresolved.add("schedule");

    if (it.category === "medication") {
      const text = `${it.dose_text ?? ""} ${it.instructions ?? ""} ${it.source_snippet}`;
      if (DOSED_FORMS.has(it.form) && !MED_DOSE_RE.test(text)) unresolved.add("dose");
      if (!it.instructions && !it.dose_text) unresolved.add("instructions");
    }

    const timing = it.slots.length ? it.slots.map(slotLabel).join(", ") : null;
    const instructions =
      it.instructions ??
      ([it.dose_text, timing, it.duration_text ? `for ${it.duration_text}` : null].filter(Boolean).join(" · ") || null);

    return {
      title: it.title?.trim() || "Unclear item",
      instructions,
      category: it.category,
      schedule_kind: kind ?? "daily",
      times,
      weekdays: it.weekdays,
      weekly_target: it.weekly_target,
      once_date: onceDate,
      source_page: it.source_page,
      source_snippet: it.source_snippet,
      unresolved_fields: Array.from(unresolved),
      confidence: it.title ? it.title_confidence : "low",
      alternatives: it.title_alternatives.filter((a) => a && a !== it.title),
      suggested_times: suggested,
      timing_text: timing,
    };
  });
}
