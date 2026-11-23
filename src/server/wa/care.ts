import "server-only";
// Patient and doctor links, from either side.
//   Doctor invites patient: the patient sends DR-123456 and taps "Yes, share" (patient.ts).
//   Patient invites doctor: the patient makes a CARE-XXXXXX link (consent given by making it)
//   and forwards it. A doctor taps it, signs up if needed, and the link is made.
import type { AdminClient } from "@/lib/supabase/admin";
import { localDateOf } from "@/domain/schedule";
import { newFamilyCode, waLink } from "@/domain/wa-ui";
import { d, w } from "@/domain/wa-copy";
import { sha256Hex } from "@/domain/router";
import { notify } from "./send";
import { businessNumber } from "./data";

const CARE_DAYS = 14;

export async function careCodeHash(code: string) {
  return sha256Hex(`${process.env.LINK_CODE_PEPPER ?? ""}:care:${code.toUpperCase()}`);
}

/** Make (or share) the link between a doctor and a patient. Returns the link id and doctor name. */
export async function createDoctorLink(admin: AdminClient, doctorId: string, patientId: string, via: "doctor_code" | "care_invite"): Promise<{ linkId: string; doctorName: string } | null> {
  if (doctorId === patientId) return null;
  const { data: doc } = await admin.from("doctors").select("user_id, name").eq("user_id", doctorId).maybeSingle();
  if (!doc) return null;
  const today = localDateOf(new Date(), "Asia/Kolkata");
  const { data: link } = await admin
    .from("doctor_patients")
    .upsert({ doctor_id: doctorId, patient_id: patientId, status: "active", consented_at: new Date().toISOString(), revoked_at: null, period_start: today }, { onConflict: "doctor_id,patient_id" })
    .select("id")
    .single();
  if (!link) return null;
  await admin.from("audit_events").insert({ user_id: patientId, actor: via === "doctor_code" ? "user" : "system", action: "doctor_sharing_granted", entity: "doctor_patient", entity_id: link.id, details: { via } });
  // A doctor's own plans now name them.
  await admin.from("care_plans").update({ clinician_name: doc.name }).eq("user_id", patientId).eq("mode", "clinician_instructions").is("clinician_name", null);
  return { linkId: link.id, doctorName: doc.name };
}

/** Tell the doctor about a new patient. */
export async function notifyDoctorNewPatient(admin: AdminClient, doctorId: string, patientId: string, linkId: string, via: "doctor_code" | "care_invite") {
  const { data: me } = await admin.from("profiles").select("display_name").eq("id", patientId).single();
  const name = me?.display_name ?? "A patient";
  await notify(admin, doctorId, { type: "buttons", body: d(via === "care_invite" ? "care_new_patient" : "new_patient", { name }), buttons: [{ id: `dr:p:${linkId}`, title: "See patient" }, { id: "dr:m:patients", title: "All patients" }] }, `dr-new:${linkId}`, { hold: true, respectQuiet: false });
}

/** Patient: a new invite for their doctor. Replaces any earlier open one. Returns the code. */
export async function createCareInvite(admin: AdminClient, patientId: string): Promise<string> {
  await admin.from("care_invites").update({ status: "revoked" }).eq("patient_id", patientId).in("status", ["open", "claimed"]);
  for (let i = 0; i < 5; i++) {
    const code = newFamilyCode();
    const { error } = await admin.from("care_invites").insert({ patient_id: patientId, code_hash: await careCodeHash(code), expires_at: new Date(Date.now() + CARE_DAYS * 86_400_000).toISOString() });
    if (!error) {
      await admin.from("audit_events").insert({ user_id: patientId, actor: "user", action: "care_invite_created", entity: "care_invite", entity_id: null });
      return code;
    }
  }
  throw new Error("care_invite_failed");
}

/** wa.me link a doctor taps to open the invite on WhatsApp. */
export async function careWaLink(code: string) {
  const num = await businessNumber();
  return num ? waLink(num, `CARE-${code}`) : `CARE-${code}`;
}

/** An invite that can still be used, with the patient's first name. */
export async function findCareInvite(admin: AdminClient, code: string) {
  const { data } = await admin.from("care_invites").select("id, patient_id, status, doctor_user_id, expires_at").eq("code_hash", await careCodeHash(code)).maybeSingle();
  if (!data || data.status !== "open" || new Date(data.expires_at) < new Date()) return null;
  const { data: p } = await admin.from("profiles").select("display_name").eq("id", data.patient_id).single();
  return { ...data, name: p?.display_name?.split(" ")[0] ?? "" };
}

type AcceptResult = { ok: true; patientName: string; linkId: string } | { ok: false; reason: "invalid" | "self" | "not_doctor" };

/** A doctor (with a doctor profile) accepts. Makes the link and tells both sides. */
export async function acceptCareInvite(admin: AdminClient, doctorUserId: string, code: string): Promise<AcceptResult> {
  const inv = await findCareInvite(admin, code);
  if (!inv) return { ok: false, reason: "invalid" };
  return finishInvite(admin, inv.id, inv.patient_id, doctorUserId, "open", false);
}

/** A new number tapped Start on an invite: hold it for them until their doctor profile exists. */
export async function claimCareInvite(admin: AdminClient, newUserId: string, code: string): Promise<boolean> {
  const inv = await findCareInvite(admin, code);
  if (!inv || inv.patient_id === newUserId) return false;
  const { data } = await admin.from("care_invites").update({ status: "claimed", doctor_user_id: newUserId }).eq("id", inv.id).eq("status", "open").select("id").maybeSingle();
  return !!data;
}

/** After doctor signup: complete any invites they claimed. Returns how many patients were linked. */
export async function finishClaimedInvites(admin: AdminClient, doctorUserId: string): Promise<number> {
  const { data } = await admin.from("care_invites").select("id, patient_id").eq("doctor_user_id", doctorUserId).eq("status", "claimed");
  let n = 0;
  for (const inv of data ?? []) if ((await finishInvite(admin, inv.id, inv.patient_id, doctorUserId, "claimed", true)).ok) n++;
  return n;
}

// tellDoctor: false when the caller replies to the doctor itself.
async function finishInvite(admin: AdminClient, inviteId: string, patientId: string, doctorUserId: string, from: "open" | "claimed", tellDoctor: boolean): Promise<AcceptResult> {
  if (patientId === doctorUserId) return { ok: false, reason: "self" };
  const { data: doc } = await admin.from("doctors").select("user_id").eq("user_id", doctorUserId).maybeSingle();
  if (!doc) return { ok: false, reason: "not_doctor" };
  // Mark used first so a double tap links once.
  const { data: used } = await admin.from("care_invites").update({ status: "accepted", doctor_user_id: doctorUserId, accepted_at: new Date().toISOString() }).eq("id", inviteId).eq("status", from).select("id").maybeSingle();
  if (!used) return { ok: false, reason: "invalid" };
  const link = await createDoctorLink(admin, doctorUserId, patientId, "care_invite");
  if (!link) return { ok: false, reason: "invalid" };
  const { data: p } = await admin.from("profiles").select("display_name, locale").eq("id", patientId).single();
  await notify(admin, patientId, { type: "text", body: w(p?.locale, "care_accepted", { doctor: link.doctorName }) }, `care-ok:${inviteId}`, { hold: true });
  if (tellDoctor) await notifyDoctorNewPatient(admin, doctorUserId, patientId, link.linkId, "care_invite");
  return { ok: true, patientName: p?.display_name?.split(" ")[0] ?? "", linkId: link.linkId };
}
