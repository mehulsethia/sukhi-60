import "server-only";
import type { AdminClient } from "@/lib/supabase/admin";
import { addDays, localDateOf } from "@/domain/schedule";

type T = (key: string, values?: Record<string, string | number>) => string;

/** 3–4 ready-to-send questions for the assistant, built from the user's own context. */
export async function assistantSuggestions(db: AdminClient, userId: string, tz: string, t: T): Promise<string[]> {
  const today = localDateOf(new Date(), tz);
  const [{ data: profile }, { count: missedY }, { data: plans }] = await Promise.all([
    db.from("profiles").select("setup_for, care_recipient_name").eq("id", userId).single(),
    db.from("action_occurrences").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("local_date", addDays(today, -1)).eq("status", "no_response"),
    db.from("care_plans").select("mode").eq("user_id", userId).eq("status", "active"),
  ]);
  // Conversation starters, not task commands: ticking things off lives on Today.
  const out: string[] = [];
  const hasPlan = (plans ?? []).length > 0;
  const clinical = (plans ?? []).some((p) => p.mode === "clinician_instructions");
  if ((missedY ?? 0) > 0) out.push(t("suggest.missed"));
  out.push(t("suggest.motivate"));
  if (profile?.setup_for === "caregiver") out.push(t("suggest.caregiver", { name: profile.care_recipient_name || t("suggest.them") }));
  if (hasPlan) out.push(t("suggest.week"));
  out.push(t("suggest.tip"));
  if (clinical) out.push(t("suggest.explainSchedule"));
  if (!hasPlan) out.push(t("suggest.setup"));
  out.push(t("suggest.vent"));
  return [...new Set(out)].slice(0, 4);
}
