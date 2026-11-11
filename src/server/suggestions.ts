import "server-only";
import type { AdminClient } from "@/lib/supabase/admin";
import { addDays, localDateOf } from "@/domain/schedule";

type T = (key: string, values?: Record<string, string | number>) => string;

/** 3–4 ready-to-send questions for the assistant, built from the user's own context. */
export async function assistantSuggestions(db: AdminClient, userId: string, tz: string, t: T): Promise<string[]> {
  const today = localDateOf(new Date(), tz);
  const [{ data: profile }, { data: occ }, { count: missedY }, { data: plans }] = await Promise.all([
    db.from("profiles").select("setup_for, care_recipient_name").eq("id", userId).single(),
    db.from("action_occurrences").select("status, due_at, plan_items!inner(title)").eq("user_id", userId).eq("local_date", today).order("due_at"),
    db.from("action_occurrences").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("local_date", addDays(today, -1)).eq("status", "no_response"),
    db.from("care_plans").select("mode").eq("user_id", userId).eq("status", "active"),
  ]);
  const out: string[] = [];
  const open = (occ ?? []).find((o) => ["due", "awaiting_response", "later"].includes(o.status));
  const hasPlan = (plans ?? []).length > 0;
  const clinical = (plans ?? []).some((p) => p.mode === "clinician_instructions");
  if (open) out.push(t("suggest.markDone", { title: (open.plan_items as unknown as { title: string }).title }));
  if (hasPlan) out.push(t("suggest.whatsNext"));
  if ((missedY ?? 0) > 0) out.push(t("suggest.missed"));
  if (clinical) out.push(t("suggest.explainSchedule"));
  if (profile?.setup_for === "caregiver") out.push(t("suggest.caregiver", { name: profile.care_recipient_name || t("suggest.them") }));
  if (hasPlan) out.push(t("suggest.week"));
  if (!hasPlan) out.push(t("suggest.setup"), t("suggest.how"));
  out.push(t("suggest.notWell"));
  return [...new Set(out)].slice(0, 4);
}
