// Plan extraction contract: the model may only TRANSCRIBE what is legible, with page and
// snippet provenance. Anything unclear stays unresolved; the user must resolve and confirm
// each item before anything is scheduled. Never guess drug names, units, frequencies or times.
import { z } from "zod";
import { isValidTime } from "./schedule";

const nullableStr = (max: number) => z.string().max(max).nullable();

export const ExtractedItemSchema = z.object({
  title: nullableStr(120).describe("Name of the action/medicine exactly as written; null if illegible."),
  instructions: nullableStr(600).describe("Instruction text as written (dose, with food, etc.); null if unclear."),
  category: z.enum(["medication", "activity", "measurement", "nutrition", "appointment", "rest", "other"]),
  frequency_text: nullableStr(120).describe("Frequency exactly as written, e.g. 'twice daily'; null if absent."),
  schedule_kind: z.enum(["daily", "weekdays", "weekly_target", "once"]).nullable().describe("Only if explicit; else null."),
  times: z.array(z.string()).max(8).describe("Explicit clock times HH:MM only; empty if not written."),
  weekdays: z.array(z.number().int().min(1).max(7)).max(7),
  weekly_target: z.number().int().min(1).max(7).nullable(),
  source_page: z.number().int().min(1).nullable(),
  source_snippet: z.string().max(400).describe("Verbatim text this item came from."),
  unclear_fields: z.array(z.enum(["title", "instructions", "frequency", "times", "dose", "unit", "schedule"])).max(7),
});
export type ExtractedItem = z.infer<typeof ExtractedItemSchema>;

export const ExtractionSchema = z.object({
  document_kind: z.enum(["clinician_instructions", "discharge_summary", "prescription", "personal_notes", "unrelated", "unreadable"]),
  clinician_name: nullableStr(120),
  items: z.array(ExtractedItemSchema).max(20),
  warnings: z.array(z.string().max(300)).max(10),
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
  source_page: number | null;
  source_snippet: string;
  unresolved_fields: string[];
}

const MED_DOSE_RE = /\b\d+(\.\d+)?\s?(mg|mcg|µg|g|ml|iu|units?|tabs?|tablets?|caps?|puffs?|drops?)\b/i;

/**
 * Turn model output into DRAFT plan items. Missing/unclear values become entries in
 * unresolved_fields (the DB refuses to confirm an item while any remain).
 */
export function toDraftItems(ex: Extraction): DraftItem[] {
  if (ex.document_kind === "unrelated" || ex.document_kind === "unreadable") return [];
  return ex.items.map((it) => {
    const unresolved = new Set<string>(it.unclear_fields);
    if (!it.title) unresolved.add("title");
    const validTimes = it.times.filter(isValidTime);
    if (validTimes.length !== it.times.length) unresolved.add("times");
    if (!it.schedule_kind) unresolved.add("schedule");
    if ((it.schedule_kind === "daily" || it.schedule_kind === "weekdays") && validTimes.length === 0) unresolved.add("times");
    if (it.schedule_kind === "weekdays" && it.weekdays.length === 0) unresolved.add("schedule");
    if (it.schedule_kind === "weekly_target" && !it.weekly_target) unresolved.add("schedule");
    if (it.category === "medication") {
      // Medication without a legible dose/unit in either field stays unresolved.
      const text = `${it.instructions ?? ""} ${it.source_snippet}`;
      if (!MED_DOSE_RE.test(text)) unresolved.add("dose");
      if (!it.instructions) unresolved.add("instructions");
    }
    return {
      title: it.title ?? "Unclear item",
      instructions: it.instructions,
      category: it.category,
      schedule_kind: it.schedule_kind ?? "daily",
      times: validTimes,
      weekdays: it.weekdays,
      weekly_target: it.weekly_target,
      source_page: it.source_page,
      source_snippet: it.source_snippet,
      unresolved_fields: Array.from(unresolved),
    };
  });
}
