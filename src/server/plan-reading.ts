import "server-only";
// Background prescription reading. Onboarding (and "Try again") store the document, mark it
// pending and return immediately; this runs after the response (Next.js after()) and inserts
// the draft items into the plan. The plan page polls the document status and refreshes.
import type { AdminClient } from "@/lib/supabase/admin";
import { extractPlanDraft } from "./ai-tasks";
import type { DraftItem } from "@/domain/extraction";
import en from "../../messages/en.json";
import hi from "../../messages/hi.json";
import mr from "../../messages/mr.json";

/** A pending read older than this is treated as failed (the function was cut off). */
export const READING_STALE_MS = 4 * 60_000;

const DICT = { en, hi, mr } as const;
function msg(locale: string, key: keyof typeof en.reading, vars: Record<string, string | number> = {}) {
  const d = (DICT[locale as keyof typeof DICT] ?? en).reading as Record<string, string>;
  return (d[key] ?? en.reading[key]).replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ""));
}

function draftRows(drafts: DraftItem[], userId: string, planId: string, documentId: string) {
  return drafts.map((d) => ({
    plan_id: planId,
    user_id: userId,
    title: d.title.slice(0, 120),
    instructions: d.instructions?.slice(0, 1000) ?? null,
    category: d.category,
    schedule_kind: d.schedule_kind,
    times: d.times,
    weekdays: d.weekdays,
    weekly_target: d.schedule_kind === "weekly_target" ? (d.weekly_target ?? 1) : d.weekly_target,
    once_date: d.schedule_kind === "once" ? (d.once_date ?? new Date().toISOString().slice(0, 10)) : null,
    status: "draft" as const,
    provenance: "extracted" as const,
    source_document_id: documentId,
    source_page: d.source_page,
    source_snippet: d.source_snippet.slice(0, 1000),
    unresolved_fields: d.unresolved_fields,
  }));
}

/** "pending" | "done" | "failed" | "stale" (pending too long: the background run was cut off). */
export function readingState(status: string, extraction: unknown, now = Date.now()): "pending" | "done" | "failed" | "stale" | "none" {
  if (status === "done") return "done";
  if (status === "failed") return "failed";
  if (status !== "pending") return "none";
  const started = (extraction as { started_at?: string } | null)?.started_at;
  return started && now - new Date(started).getTime() > READING_STALE_MS ? "stale" : "pending";
}

/** Mark the document as being read, so the plan page shows progress immediately. */
export async function markReading(admin: AdminClient, userId: string, documentId: string) {
  await admin.from("documents").update({ extraction_status: "pending", extraction: { started_at: new Date().toISOString() } as never }).eq("id", documentId).eq("user_id", userId);
}

/** Read the document and add its drafts to the plan; tells the user in the chat when done. */
export async function readIntoPlan(admin: AdminClient, userId: string, planId: string, documentId: string, hint?: string) {
  const ex = await extractPlanDraft(admin, userId, documentId, { hint }).catch(() => ({ ok: false as const, error: "model_error" as const }));
  const { data: profile } = await admin.from("profiles").select("locale").eq("id", userId).single();
  const locale = profile?.locale ?? "en";
  // Early exits (AI off, no consent, unsupported type) never set a status; record the failure
  // so the plan page stops waiting and offers "Try again" or manual entry.
  if (!ex.ok) await admin.from("documents").update({ extraction_status: "failed", extraction: { error: ex.error } as never }).eq("id", documentId).eq("user_id", userId);
  let added = 0;
  if (ex.ok && ex.drafts.length) {
    // Retrying must not duplicate drafts from an earlier read of the same document.
    await admin.from("plan_items").delete().eq("plan_id", planId).eq("user_id", userId).eq("source_document_id", documentId).eq("status", "draft");
    const { data } = await admin.from("plan_items").insert(draftRows(ex.drafts, userId, planId, documentId)).select("id");
    added = data?.length ?? 0;
  }
  const text = added ? msg(locale, "chatDone", { n: added }) : ex.ok ? msg(locale, "chatNone") : msg(locale, "chatFailed");
  await admin.from("messages").insert({ user_id: userId, role: "assistant", channel: "system", content: text });
  return { ok: ex.ok, added };
}
