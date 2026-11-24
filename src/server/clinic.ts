import "server-only";
// Doctor operations shared by the WhatsApp doctor menu and the web clinic (/clinic).
// Every function checks that the patient link belongs to this doctor and is active.
// Doctors see adherence and proof results only: never chats or documents.
import type { AdminClient } from "@/lib/supabase/admin";
import { addDays, localDateOf } from "@/domain/schedule";
import { w } from "@/domain/wa-copy";
import { notify } from "@/server/wa/send";
import { adherenceFor, todayCounts } from "@/server/wa/data";
import { recentReadings } from "@/server/readings";

const TZ = "Asia/Kolkata";
export type Via = "whatsapp" | "web";

export async function getDoctor(admin: AdminClient, userId: string) {
  const { data } = await admin.from("doctors").select("*").eq("user_id", userId).maybeSingle();
  return data;
}

export async function ownLink(admin: AdminClient, doctorId: string, linkId: string) {
  if (!/^[0-9a-f-]{36}$/.test(linkId)) return null;
  const { data } = await admin.from("doctor_patients").select("id, patient_id, period_start").eq("id", linkId).eq("doctor_id", doctorId).eq("status", "active").maybeSingle();
  return data;
}

/** The doctor's prescription plan waiting for their check, if any. */
async function planToCheck(admin: AdminClient, patientId: string) {
  const { data: plan } = await admin.from("care_plans").select("id, clinician_verification, plan_items(status)").eq("user_id", patientId).eq("mode", "clinician_instructions").eq("status", "active").order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!plan || plan.clinician_verification === "clinician_verified") return null;
  return (plan.plan_items ?? []).some((i) => i.status === "confirmed") ? plan.id : null;
}

/** Patients (of these) whose prescription plan is waiting for the doctor's check. */
async function plansToCheck(admin: AdminClient, ids: string[]): Promise<Set<string>> {
  const { data } = await admin.from("care_plans").select("user_id, created_at, clinician_verification, plan_items(status)").in("user_id", ids).eq("mode", "clinician_instructions").eq("status", "active").order("created_at", { ascending: false });
  const seen = new Set<string>(), out = new Set<string>();
  for (const p of data ?? []) {
    if (seen.has(p.user_id)) continue; // only each patient's latest plan counts
    seen.add(p.user_id);
    if (p.clinician_verification !== "clinician_verified" && (p.plan_items ?? []).some((i) => i.status === "confirmed")) out.add(p.user_id);
  }
  return out;
}

export type PatientRow = {
  linkId: string; patientId: string; name: string;
  pct: number | null; done: number; due: number;
  today: { done: number; total: number };
  photoPct: number | null;
  lastCheckIn: string | null;
  toCheck: boolean;
};

/** Active patients, those who need attention first (lowest 7-day adherence; no data last). */
export async function clinicPatients(admin: AdminClient, doctorId: string, opts: { extras?: boolean } = {}): Promise<PatientRow[]> {
  const { data: links } = await admin.from("doctor_patients").select("id, patient_id").eq("doctor_id", doctorId).eq("status", "active").order("created_at", { ascending: false }).limit(200);
  const ids = (links ?? []).map((l) => l.patient_id);
  if (!ids.length) return [];
  // Names and plans to check in one query each across all patients.
  const [{ data: profs }, toCheck] = await Promise.all([
    admin.from("profiles").select("id, display_name, timezone").in("id", ids),
    opts.extras ? plansToCheck(admin, ids) : Promise.resolve(new Set<string>()),
  ]);
  const byId = new Map((profs ?? []).map((p) => [p.id, p]));
  const rows = await Promise.all(
    (links ?? []).map(async (l) => {
      const p = byId.get(l.patient_id);
      const tz = p?.timezone ?? TZ;
      const today = localDateOf(new Date(), tz);
      const [a, t, ci] = await Promise.all([
        adherenceFor(admin, l.patient_id, addDays(today, -6), today),
        todayCounts(admin, l.patient_id, tz),
        opts.extras ? admin.from("check_ins").select("created_at").eq("user_id", l.patient_id).order("created_at", { ascending: false }).limit(1).maybeSingle().then((r) => r.data?.created_at ?? null) : Promise.resolve(null),
      ]);
      return { linkId: l.id, patientId: l.patient_id, name: p?.display_name ?? "Patient", pct: a.pct, done: a.done, due: a.due, today: t, photoPct: a.proof.done ? Math.round((100 * a.proof.photo) / a.proof.done) : null, lastCheckIn: ci, toCheck: toCheck.has(l.patient_id) };
    }),
  );
  return rows.sort((a, b) => (a.pct ?? 101) - (b.pct ?? 101));
}

/** Everything the patient page shows. Null if this isn't the doctor's active patient. */
export async function patientDetail(admin: AdminClient, doctorId: string, linkId: string) {
  const link = await ownLink(admin, doctorId, linkId);
  if (!link) return null;
  const [doc, { data: p }] = await Promise.all([getDoctor(admin, doctorId), admin.from("profiles").select("display_name, timezone").eq("id", link.patient_id).single()]);
  const tz = p?.timezone ?? TZ;
  const today = localDateOf(new Date(), tz);
  const [week, month, { data: lastCi }, checkPlanId, readings, items] = await Promise.all([
    adherenceFor(admin, link.patient_id, addDays(today, -6), today),
    adherenceFor(admin, link.patient_id, addDays(today, -29), today),
    admin.from("check_ins").select("created_at").eq("user_id", link.patient_id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    planToCheck(admin, link.patient_id),
    recentReadings(admin, link.patient_id, new Date(Date.now() - 7 * 86_400_000), 6),
    planItems(admin, link.patient_id),
  ]);
  const checkItems = checkPlanId
    ? (await admin.from("plan_items").select("title, schedule_kind, times, weekdays, weekly_target").eq("plan_id", checkPlanId).eq("user_id", link.patient_id).eq("status", "confirmed")).data ?? []
    : [];
  let reward: { day: number; days: number; pct: number | null; target: number; text: string } | null = null;
  if (doc?.reward_text) {
    const period = await adherenceFor(admin, link.patient_id, link.period_start, today);
    const day = Math.min(doc.reward_days, Math.max(1, Math.round((Date.parse(today) - Date.parse(link.period_start)) / 86_400_000) + 1));
    reward = { day, days: doc.reward_days, pct: period.pct, target: doc.reward_target_pct, text: doc.reward_text };
  }
  return { linkId, patientId: link.patient_id, name: p?.display_name ?? "Patient", tz, week, month, lastCheckIn: lastCi?.created_at ?? null, checkPlanId, checkItems, readings, items, reward };
}

/** Confirmed items on active plans, the doctor's prescription first. */
export async function planItems(admin: AdminClient, patientId: string) {
  const { data } = await admin
    .from("plan_items")
    .select("id, title, proof_required, care_plans!inner(status, mode)")
    .eq("user_id", patientId)
    .eq("status", "confirmed")
    .eq("care_plans.status", "active")
    .order("created_at");
  const rx = (i: { care_plans: unknown }) => Number((i.care_plans as { mode: string }).mode === "clinician_instructions");
  return (data ?? []).sort((a, b) => rx(b) - rx(a)).map((i) => ({ id: i.id, title: i.title, proofRequired: i.proof_required, clinician: rx(i) === 1 }));
}

/** Turn "needs a photo" on or off for one task, and tell the patient. */
export async function setProofRequired(admin: AdminClient, doctorId: string, linkId: string, itemId: string, on: boolean, dedupe: string, via: Via) {
  const link = await ownLink(admin, doctorId, linkId);
  if (!link) return null;
  const { data: item } = await admin.from("plan_items").select("id, title, proof_required").eq("id", itemId).eq("user_id", link.patient_id).eq("status", "confirmed").maybeSingle();
  if (!item) return null;
  if (item.proof_required === on) return { title: item.title, changed: false };
  await admin.from("plan_items").update({ proof_required: on, proof_required_by: on ? doctorId : null, proof_required_at: on ? new Date().toISOString() : null }).eq("id", item.id).eq("user_id", link.patient_id);
  await admin.from("audit_events").insert({ user_id: link.patient_id, actor: "user", action: on ? "proof_required_on" : "proof_required_off", entity: "plan_item", entity_id: item.id, details: { doctor_id: doctorId, via } });
  const [doc, { data: p }] = await Promise.all([getDoctor(admin, doctorId), admin.from("profiles").select("locale").eq("id", link.patient_id).single()]);
  const l = p?.locale ?? "en";
  const body = on ? w(l, "proof_required_on", { doctor: doc?.name || w(l, "proof_doctor"), title: item.title }) : w(l, "proof_required_off", { title: item.title });
  await notify(admin, link.patient_id, { type: "text", body }, `dr-proof:${item.id}:${on ? "on" : "off"}:${dedupe}`, { hold: true });
  return { title: item.title, changed: true };
}

/** A note to the patient (or a request to change the plan). Returns how it went out. */
export async function sendDoctorNote(admin: AdminClient, doctorId: string, linkId: string, text: string, review: boolean, dedupe: string) {
  const link = await ownLink(admin, doctorId, linkId);
  if (!link) return null;
  const note = text.trim().slice(0, 1500);
  if (!note) return null;
  const [doc, { data: p }] = await Promise.all([getDoctor(admin, doctorId), admin.from("profiles").select("display_name, locale").eq("id", link.patient_id).single()]);
  // Kept in the patient's own history too (shown on the web as a message from the doctor).
  await admin.from("memory_facts").insert({ user_id: link.patient_id, kind: "context", content: `Note from ${doc?.name ?? "their doctor"}: ${note}`.slice(0, 480), source_type: "user_message", status: "proposed" }).then(undefined, () => undefined);
  if (review) await admin.from("review_requests").insert({ user_id: link.patient_id, reason: `Doctor asked for a plan change: ${note}`.slice(0, 500), source: "assistant" });
  const r = await notify(admin, link.patient_id, { type: "text", body: w(p?.locale, "doctor_note", { doctor: doc?.name ?? "", text: note }) }, `dr-note:${dedupe}`, { hold: true, respectQuiet: false });
  return { name: p?.display_name ?? "", sent: r === "sent" };
}

/** The doctor checked the plan read from their prescription. */
export async function approveDoctorPlan(admin: AdminClient, doctorId: string, linkId: string, planId: string, via: Via) {
  const link = await ownLink(admin, doctorId, linkId);
  if (!link) return null;
  const doc = await getDoctor(admin, doctorId);
  const { data: plan } = await admin.from("care_plans").update({ clinician_verification: "clinician_verified", clinician_name: doc?.name ?? null }).eq("id", planId).eq("user_id", link.patient_id).eq("mode", "clinician_instructions").select("id").maybeSingle();
  if (!plan) return null;
  await admin.from("audit_events").insert({ user_id: link.patient_id, actor: "user", action: "plan_clinician_verified", entity: "care_plan", entity_id: planId, details: { doctor_id: doctorId, via } });
  const { data: p } = await admin.from("profiles").select("display_name, locale").eq("id", link.patient_id).single();
  await notify(admin, link.patient_id, { type: "text", body: w(p?.locale, "doctor_note", { doctor: doc?.name ?? "", text: w(p?.locale, "plan_checked", { doctor: doc?.name ?? "" }) + " ✓" }) }, `dr-ok:${planId}`, { hold: true });
  return { name: p?.display_name ?? "" };
}

export async function saveReward(admin: AdminClient, doctorId: string, text: string | null) {
  const reward = text?.replace(/\s+/g, " ").trim().slice(0, 160) || null;
  const { data } = await admin.from("doctors").update({ reward_text: reward }).eq("user_id", doctorId).select("*").single();
  return data;
}

export type RedeemResult =
  | { kind: "bad" }
  | { kind: "used"; redeemedAt: string | null }
  | { kind: "ok"; name: string; reward: string; pct: number; start: string; end: string };

/** A patient shows their reward code at the clinic. */
export async function redeemReward(admin: AdminClient, doctorId: string, raw: string): Promise<RedeemResult> {
  const code = raw.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(-6);
  if (code.length < 6) return { kind: "bad" };
  const { data: r } = await admin.from("doctor_rewards").select("id, patient_id, reward_text, adherence_pct, period_start, period_end, status, redeemed_at").eq("doctor_id", doctorId).eq("code", code).maybeSingle();
  if (!r) return { kind: "bad" };
  if (r.status === "redeemed") return { kind: "used", redeemedAt: r.redeemed_at };
  const { data: upd } = await admin.from("doctor_rewards").update({ status: "redeemed", redeemed_at: new Date().toISOString() }).eq("id", r.id).eq("status", "earned").select("id").maybeSingle();
  if (!upd) return { kind: "used", redeemedAt: new Date().toISOString() };
  const { data: p } = await admin.from("profiles").select("display_name").eq("id", r.patient_id).single();
  return { kind: "ok", name: p?.display_name ?? "Patient", reward: r.reward_text, pct: r.adherence_pct, start: r.period_start, end: r.period_end };
}
