import "server-only";
import type { AdminClient } from "@/lib/supabase/admin";
import { hatsFrom } from "@/domain/hats";
import { addDays, localDateOf } from "@/domain/schedule";
import { switchOptions, weekPct, weekStrip, type SwitchOption } from "@/domain/care-for";
import { streakFor } from "@/server/wa/data";

const firstName = (n: string | null | undefined) => (n ?? "").trim().split(/\s+/)[0] || null;

/** People this account follows as family (active only), oldest first. */
export async function getFollows(admin: AdminClient, userId: string): Promise<{ id: string; patientId: string; name: string | null }[]> {
  const { data } = await admin.from("family_access").select("id, patient_id, accepted_at").eq("member_user_id", userId).eq("status", "active").order("accepted_at", { ascending: true });
  if (!data?.length) return [];
  const { data: profs } = await admin.from("profiles").select("id, display_name").in("id", data.map((a) => a.patient_id));
  const names = new Map((profs ?? []).map((p) => [p.id, firstName(p.display_name)]));
  return data.map((a) => ({ id: a.id, patientId: a.patient_id, name: names.get(a.patient_id) ?? null }));
}

/** The views this account can switch between (shown only when there are two or more). */
export async function getSwitchOptions(admin: AdminClient, userId: string, fallbackName: string): Promise<SwitchOption[]> {
  const [follows, plan, doctor, profile] = await Promise.all([
    getFollows(admin, userId),
    admin.from("plan_items").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("status", "confirmed"),
    admin.from("doctors").select("user_id").eq("user_id", userId).maybeSingle(),
    admin.from("profiles").select("primary_role, onboarded_at").eq("id", userId).maybeSingle(),
  ]);
  // Until onboarding is done, the default role says nothing (sign-up defaults it to patient).
  const role = profile.data?.onboarded_at ? profile.data.primary_role : null;
  const hats = hatsFrom({ hasPlan: (plan.count ?? 0) > 0, isDoctor: !!doctor.data, follows: follows.length, primaryRole: role });
  return switchOptions(hats, follows.map((f) => ({ id: f.id, name: f.name ?? fallbackName })));
}

export type CaringFor = {
  today: { done: number; total: number };
  days: { date: string; done: number; total: number }[];
  pct: number | null;
  streak: number;
};

/**
 * Counts for the person a family member follows. Callers must have checked the access first
 * (family_summary() does, as the member). Counts only: never task names or health details.
 */
export async function caringFor(admin: AdminClient, patientId: string): Promise<CaringFor> {
  const { data: p } = await admin.from("profiles").select("timezone").eq("id", patientId).maybeSingle();
  const tz = p?.timezone ?? "Asia/Kolkata";
  const today = localDateOf(new Date(), tz);
  const [{ data: rows }, streak] = await Promise.all([
    admin.from("action_occurrences").select("local_date, status").eq("user_id", patientId).eq("target_count", 1).gte("local_date", addDays(today, -6)).lte("local_date", today),
    streakFor(admin, patientId, tz),
  ]);
  const days = weekStrip(rows ?? [], today);
  const last = days[days.length - 1];
  return { today: { done: last.done, total: last.total }, days, pct: weekPct(days), streak };
}
