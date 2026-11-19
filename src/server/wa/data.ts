import "server-only";
// Read helpers shared by the patient, family and doctor views.
import type { AdminClient } from "@/lib/supabase/admin";
import { addDays, localDateOf } from "@/domain/schedule";
import { adherence } from "@/domain/wa-ui";
import { proofBreakdown } from "@/domain/proof";
import { settings } from "@/lib/config";

const DONE = ["self_reported", "evidence_supported"] as ("self_reported" | "evidence_supported")[];

export interface ItemAdherence { itemId: string; title: string; done: number; due: number; pct: number | null; clinician: boolean }

/** Adherence over [from, to] (local dates), overall and per item. */
export async function adherenceFor(admin: AdminClient, userId: string, from: string, to: string, now = new Date()) {
  const { data } = await admin
    .from("action_occurrences")
    .select("item_id, status, proof_level, window_end_at, target_count, completed_count, local_date, plan_items!inner(title, care_plans!inner(mode))")
    .eq("user_id", userId)
    .gte("local_date", from)
    .lte("local_date", to)
    .limit(2000);
  const rows = data ?? [];
  const overall = adherence(rows, now);
  const byItem = new Map<string, typeof rows>();
  rows.forEach((r) => byItem.set(r.item_id, [...(byItem.get(r.item_id) ?? []), r]));
  const items: ItemAdherence[] = [...byItem].map(([itemId, rs]) => {
    const a = adherence(rs, now);
    const pi = rs[0].plan_items as unknown as { title: string; care_plans: { mode: string } };
    return { itemId, title: pi.title, done: a.done, due: a.due, pct: a.pct, clinician: pi.care_plans.mode === "clinician_instructions" };
  });
  items.sort((a, b) => Number(b.clinician) - Number(a.clinician) || a.title.localeCompare(b.title));
  const proof = proofBreakdown(rows);
  return { ...overall, items, proofs: proof.photo, proof };
}

/** Days in a row (ending today, or yesterday if nothing is done yet today) with something done. */
export async function streakFor(admin: AdminClient, userId: string, tz: string): Promise<number> {
  const today = localDateOf(new Date(), tz);
  const { data } = await admin.from("action_occurrences").select("local_date").eq("user_id", userId).gte("local_date", addDays(today, -90)).in("status", DONE);
  const days = new Set((data ?? []).map((r) => r.local_date));
  let d = days.has(today) ? today : addDays(today, -1);
  let n = 0;
  while (days.has(d)) { n++; d = addDays(d, -1); }
  return n;
}

/** Today's done / total for single-slot tasks. */
export async function todayCounts(admin: AdminClient, userId: string, tz: string) {
  const today = localDateOf(new Date(), tz);
  const { data } = await admin.from("action_occurrences").select("status").eq("user_id", userId).eq("local_date", today).eq("target_count", 1).neq("status", "paused");
  return { done: (data ?? []).filter((o) => (DONE as string[]).includes(o.status)).length, total: data?.length ?? 0 };
}

export async function hasActivePlan(admin: AdminClient, userId: string): Promise<boolean> {
  const { count } = await admin.from("plan_items").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("status", "confirmed");
  return (count ?? 0) > 0;
}

export async function linkedDoctor(admin: AdminClient, patientId: string) {
  const { data } = await admin.from("doctor_patients").select("id, doctor_id, period_start, consented_at, doctors!inner(name, clinic, reward_text, reward_target_pct, reward_days)").eq("patient_id", patientId).eq("status", "active").order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!data) return null;
  const doc = data.doctors as unknown as { name: string; clinic: string | null; reward_text: string | null; reward_target_pct: number; reward_days: number };
  return { linkId: data.id, doctorId: data.doctor_id, periodStart: data.period_start, ...doc };
}

// The business number for wa.me links: WHATSAPP_DISPLAY_NUMBER, or read once from the Graph API.
let cachedNumber: string | null = null;
export async function businessNumber(): Promise<string | null> {
  const fromEnv = process.env.WHATSAPP_DISPLAY_NUMBER?.replace(/\D/g, "");
  if (fromEnv) return fromEnv;
  if (cachedNumber) return cachedNumber;
  const id = process.env.WHATSAPP_PHONE_NUMBER_ID, token = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!id || !token) return null;
  try {
    const r = await fetch(`https://graph.facebook.com/${settings.graphVersion()}/${id}?fields=display_phone_number`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(8000) });
    if (!r.ok) return null;
    const j = (await r.json()) as { display_phone_number?: string };
    cachedNumber = j.display_phone_number?.replace(/\D/g, "") || null;
    return cachedNumber;
  } catch {
    return null;
  }
}

export const pctText = (p: number | null) => (p === null ? "-" : `${p}%`);
