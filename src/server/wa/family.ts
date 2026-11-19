import "server-only";
// Family on WhatsApp. The patient sends a forwardable link (FAMILY-XXXXXX); the family
// member taps it, agrees, and from then on gets a short evening update and alerts. They see
// counts, streak and alerts only: never task names, chats or health details.
import type { AdminClient } from "@/lib/supabase/admin";
import { addDays, localDateOf } from "@/domain/schedule";
import { newFamilyCode, waLink } from "@/domain/wa-ui";
import { w } from "@/domain/wa-copy";
import { sha256Hex } from "@/domain/router";
import { send, notify, type WaCtx } from "./send";
import { adherenceFor, businessNumber, pctText, streakFor, todayCounts } from "./data";

const menuBtn = (l: string) => ({ id: "m:menu", title: w(l, "btn_menu") });

export async function familyCodeHash(code: string) {
  return sha256Hex(`${process.env.LINK_CODE_PEPPER ?? ""}:family:${code.toUpperCase()}`);
}

/** A pending invite for a code, with the patient's first name (for the welcome message). */
export async function findFamilyInvite(admin: AdminClient, code: string) {
  const { data } = await admin.from("family_access").select("id, patient_id, status, expires_at").eq("invite_token_hash", await familyCodeHash(code)).maybeSingle();
  if (!data || data.status !== "invited" || new Date(data.expires_at) < new Date()) return null;
  const { data: p } = await admin.from("profiles").select("display_name").eq("id", data.patient_id).single();
  return { ...data, name: p?.display_name?.split(" ")[0] ?? "" };
}

/** Patient: who gets my updates, and add someone. */
export async function showFamily(ctx: WaCtx) {
  const l = ctx.locale;
  const { data: rows } = await ctx.admin.from("family_access").select("id, member_user_id, invitee_label").eq("patient_id", ctx.userId).eq("status", "active");
  const ids = (rows ?? []).map((r) => r.member_user_id).filter((x): x is string => !!x);
  const { data: profs } = ids.length ? await ctx.admin.from("profiles").select("id, display_name").in("id", ids) : { data: [] };
  const names = (rows ?? []).map((r) => (profs ?? []).find((p) => p.id === r.member_user_id)?.display_name ?? r.invitee_label);
  const body = names.length ? w(l, "family_list", { list: names.map((n) => `• ${n}`).join("\n") }) : w(l, "family_none");
  await send(ctx, { type: "buttons", body, buttons: [{ id: "fm:add", title: w(l, "btn_add_family") }, menuBtn(l)] });
}

export async function addFamily(ctx: WaCtx) {
  const l = ctx.locale;
  let code = "";
  for (let i = 0; i < 5; i++) {
    code = newFamilyCode();
    const { error } = await ctx.admin.from("family_access").insert({ patient_id: ctx.userId, invitee_label: "Family (WhatsApp)", invite_token_hash: await familyCodeHash(code), scopes: ["weekly_summary", "alerts"], expires_at: new Date(Date.now() + 7 * 86_400_000).toISOString() });
    if (!error) break;
    code = "";
  }
  if (!code) throw new Error("family_invite_failed");
  const num = await businessNumber();
  const link = num ? waLink(num, `FAMILY-${code}`) : `FAMILY-${code}`;
  await send(ctx, { type: "text", body: w(l, "family_forward") });
  await send(ctx, { type: "text", body: w(l, "family_invite_msg", { link }) });
}

/** Family member accepted (their account exists). Returns the patient's first name, or null. */
export async function acceptFamily(admin: AdminClient, memberId: string, code: string): Promise<{ ok: true; name: string; accessId: string } | { ok: false; reason: "invalid" | "self" }> {
  const inv = await findFamilyInvite(admin, code);
  if (!inv) return { ok: false, reason: "invalid" };
  if (inv.patient_id === memberId) return { ok: false, reason: "self" };
  const { data: upd } = await admin.from("family_access").update({ status: "active", member_user_id: memberId, accepted_at: new Date().toISOString() }).eq("id", inv.id).eq("status", "invited").select("id").maybeSingle();
  if (!upd) return { ok: false, reason: "invalid" };
  await admin.from("audit_events").insert({ user_id: inv.patient_id, actor: "system", action: "family_invite_accepted", entity: "family_access", entity_id: inv.id, details: { via: "whatsapp" } });
  const { data: member } = await admin.from("profiles").select("display_name, locale").eq("id", memberId).single();
  const { data: patient } = await admin.from("profiles").select("locale").eq("id", inv.patient_id).single();
  await notify(admin, inv.patient_id, { type: "text", body: w(patient?.locale, "family_joined_patient", { name: member?.display_name ?? "" }) }, `fam-joined:${inv.id}`, { hold: true });
  return { ok: true, name: inv.name, accessId: inv.id };
}

async function summaryText(admin: AdminClient, patientId: string, locale: string) {
  const { data: p } = await admin.from("profiles").select("display_name, timezone").eq("id", patientId).single();
  const name = p?.display_name?.split(" ")[0] ?? "";
  const tz = p?.timezone ?? "Asia/Kolkata";
  const today = localDateOf(new Date(), tz);
  const [counts, week, streak] = await Promise.all([todayCounts(admin, patientId, tz), adherenceFor(admin, patientId, addDays(today, -6), today), streakFor(admin, patientId, tz)]);
  if (!counts.total) return w(locale, "family_no_plan", { name });
  const proof = week.proof.done ? `\n${w(locale, "family_proof", { photo: week.proof.photo, done: week.proof.done })}` : "";
  return w(locale, "family_summary", { name, done: counts.done, total: counts.total, pct: pctText(week.pct), streak }) + proof;
}

/** Member: how is my person doing. */
export async function showFollow(ctx: WaCtx, accessId: string) {
  const l = ctx.locale;
  const { data: a } = await ctx.admin.from("family_access").select("id, patient_id").eq("id", accessId).eq("member_user_id", ctx.userId).eq("status", "active").maybeSingle();
  if (!a) {
    await send(ctx, { type: "buttons", body: w(l, "family_invalid"), buttons: [menuBtn(l)] });
    return;
  }
  await send(ctx, { type: "buttons", body: await summaryText(ctx.admin, a.patient_id, l), buttons: [{ id: `fm:cheer:${a.id}`, title: w(l, "btn_cheer") }, menuBtn(l)] });
}

export async function cheer(ctx: WaCtx, accessId: string) {
  const l = ctx.locale;
  const { data: a } = await ctx.admin.from("family_access").select("id, patient_id").eq("id", accessId).eq("member_user_id", ctx.userId).eq("status", "active").maybeSingle();
  if (!a) return;
  const [{ data: me }, { data: patient }] = await Promise.all([ctx.admin.from("profiles").select("display_name").eq("id", ctx.userId).single(), ctx.admin.from("profiles").select("locale").eq("id", a.patient_id).single()]);
  // One cheer per member per hour reaches the patient (dedupe key).
  await notify(ctx.admin, a.patient_id, { type: "text", body: w(patient?.locale, "cheer_received", { name: me?.display_name?.split(" ")[0] ?? "" }) }, `cheer:${a.id}:${new Date().toISOString().slice(0, 13)}`, { hold: true });
  await send(ctx, { type: "buttons", body: w(l, "cheer_sent"), buttons: [menuBtn(l)] });
}

/** Evening update to every family member with WhatsApp, around 8 pm in the patient's timezone. */
export async function runFamilyEvening(admin: AdminClient, now = new Date()): Promise<number> {
  const { data: access } = await admin.from("family_access").select("id, patient_id, member_user_id").eq("status", "active").not("member_user_id", "is", null).limit(500);
  let n = 0;
  for (const a of access ?? []) {
    const { data: p } = await admin.from("profiles").select("timezone").eq("id", a.patient_id).single();
    const tz = p?.timezone ?? "Asia/Kolkata";
    const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", hourCycle: "h23" }).format(now));
    if (hour !== 20) continue;
    const { data: binding } = await admin.from("channel_bindings").select("id").eq("user_id", a.member_user_id!).eq("status", "active").maybeSingle();
    if (!binding) continue;
    const { data: m } = await admin.from("profiles").select("locale").eq("id", a.member_user_id!).single();
    const text = await summaryText(admin, a.patient_id, m?.locale ?? "en");
    const r = await notify(admin, a.member_user_id!, { type: "buttons", body: text, buttons: [{ id: `fm:cheer:${a.id}`, title: w(m?.locale, "btn_cheer") }] }, `fam-eve:${a.id}:${localDateOf(now, tz)}`, { respectQuiet: false });
    if (r === "sent") n++;
  }
  return n;
}

/** Family alert (inactive / low stock / not well) on WhatsApp too. */
export async function familyAlertWhatsApp(admin: AdminClient, memberId: string, text: string, dedupe: string) {
  await notify(admin, memberId, { type: "text", body: text }, `fam-alert:${dedupe}`, { hold: true, respectQuiet: true }).catch(() => undefined);
}
