import "server-only";
// Doctor side of the WhatsApp interface. A doctor registers by messaging DOCTOR, gets a code
// (DR-123456), a wa.me link and a QR for the clinic. Patients who join with it and agree see
// their adherence shared: how much of the plan they follow and proof results, never chats.
import type { AdminClient } from "@/lib/supabase/admin";
import { settings } from "@/lib/config";
import { addDays, localDateOf } from "@/domain/schedule";
import { dots, newDoctorCode, newRewardCode, scheduleText, waLink, type WaRow } from "@/domain/wa-ui";
import { d, w } from "@/domain/wa-copy";
import { send, notify, type WaCtx } from "./send";
import { clearState, setState } from "./state";
import { adherenceFor, businessNumber, pctText, todayCounts } from "./data";

const TZ = "Asia/Kolkata";
const menuBtn = { id: "dr:m:menu", title: "Menu" };

async function myDoctor(admin: AdminClient, userId: string) {
  const { data } = await admin.from("doctors").select("*").eq("user_id", userId).maybeSingle();
  return data;
}

async function doctorLink(code: string) {
  const num = await businessNumber();
  return num ? waLink(num, `DR-${code}`) : `DR-${code}`;
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------
export async function startDoctorSignup(ctx: WaCtx) {
  await setState(ctx.admin, ctx.bindingId, "dr_name");
  // The intro was on the Start message; now just the question.
  await send(ctx, { type: "text", body: d("welcome").split("\n\n").slice(-1)[0] });
}

export async function doctorName(ctx: WaCtx, raw: string) {
  const name = raw.replace(/\s+/g, " ").trim().slice(0, 80);
  if (name.length < 2) return send(ctx, { type: "text", body: d("welcome") });
  await ctx.admin.from("profiles").update({ display_name: name }).eq("id", ctx.userId);
  await setState(ctx.admin, ctx.bindingId, "dr_clinic", { name });
  await send(ctx, { type: "buttons", body: d("ask_clinic"), buttons: [{ id: "dr:clinic:skip", title: d("btn_skip") }] });
}

export async function doctorClinic(ctx: WaCtx, name: string, clinic: string | null) {
  let doc = await myDoctor(ctx.admin, ctx.userId);
  if (!doc) {
    for (let i = 0; i < 6 && !doc; i++) {
      const { data } = await ctx.admin.from("doctors").insert({ user_id: ctx.userId, name, clinic: clinic?.slice(0, 120) || null, code: newDoctorCode() }).select("*").maybeSingle();
      doc = data;
    }
    if (!doc) throw new Error("doctor_create_failed");
  } else {
    await ctx.admin.from("doctors").update({ name, clinic: clinic?.slice(0, 120) || null }).eq("user_id", ctx.userId);
  }
  await ctx.admin.from("profiles").update({ primary_role: "doctor", onboarded_at: new Date().toISOString(), locale: "en" }).eq("id", ctx.userId);
  await askReward(ctx, true);
}

async function askReward(ctx: WaCtx, signup: boolean) {
  const doc = await myDoctor(ctx.admin, ctx.userId);
  await setState(ctx.admin, ctx.bindingId, "dr_reward", { signup });
  await send(ctx, { type: "buttons", body: d("ask_reward", { pct: doc?.reward_target_pct ?? 80, days: doc?.reward_days ?? 30 }), buttons: [{ id: "dr:rw:10", title: d("btn_reward_10") }, { id: "dr:rw:free", title: d("btn_reward_free") }, { id: "dr:rw:none", title: d("btn_reward_none") }] });
}

export async function setReward(ctx: WaCtx, text: string | null, signup: boolean) {
  const reward = text?.replace(/\s+/g, " ").trim().slice(0, 160) || null;
  const { data: doc } = await ctx.admin.from("doctors").update({ reward_text: reward }).eq("user_id", ctx.userId).select("*").single();
  await clearState(ctx.admin, ctx.bindingId);
  if (signup && doc) return sendReady(ctx, doc.name, doc.code);
  await send(ctx, { type: "buttons", body: reward ? d("reward_saved", { reward, pct: doc?.reward_target_pct ?? 80, days: doc?.reward_days ?? 30 }) : d("reward_removed"), buttons: [menuBtn] });
}

async function sendReady(ctx: WaCtx, name: string, code: string) {
  const link = await doctorLink(code);
  await send(ctx, { type: "text", body: d("ready", { name, code, link }) });
  await sendQr(ctx, name, code);
  await showDoctorMenu(ctx);
}

async function sendQr(ctx: WaCtx, name: string, code: string) {
  const base = settings.appUrl();
  if (!/^https:\/\//.test(base)) return; // Meta fetches the image: it must be a public https URL
  await send(ctx, { type: "image", link: `${base}/api/whatsapp/qr/${code}`, caption: d("qr_caption", { name }) });
}

export async function shareLink(ctx: WaCtx) {
  const doc = await myDoctor(ctx.admin, ctx.userId);
  if (!doc) return startDoctorSignup(ctx);
  const link = await doctorLink(doc.code);
  await send(ctx, { type: "text", body: d("share_text") });
  await send(ctx, { type: "text", body: d("share_msg", { link }) });
  await sendQr(ctx, doc.name, doc.code);
}

// ---------------------------------------------------------------------------
// Menu and patients
// ---------------------------------------------------------------------------
export async function showDoctorMenu(ctx: WaCtx) {
  const rows: WaRow[] = [
    { id: "dr:m:patients", title: d("row_patients"), description: d("row_patients_d") },
    { id: "dr:m:share", title: d("row_share"), description: d("row_share_d") },
    { id: "dr:m:reward", title: d("row_reward"), description: d("row_reward_d") },
    { id: "dr:m:redeem", title: d("row_redeem"), description: d("row_redeem_d") },
    { id: "dr:m:help", title: d("row_help") },
  ];
  await send(ctx, { type: "list", body: d("menu_body"), button: "Menu", sections: [{ rows }] });
}

async function patientRows(admin: AdminClient, doctorId: string) {
  const { data: links } = await admin.from("doctor_patients").select("id, patient_id").eq("doctor_id", doctorId).eq("status", "active").order("created_at", { ascending: false }).limit(60);
  const today = localDateOf(new Date(), TZ);
  const ids = (links ?? []).map((l) => l.patient_id);
  const { data: profs } = ids.length ? await admin.from("profiles").select("id, display_name, timezone").in("id", ids) : { data: [] };
  return Promise.all(
    (links ?? []).map(async (l) => {
      const p = (profs ?? []).find((x) => x.id === l.patient_id);
      const tz = p?.timezone ?? TZ;
      const [a, t] = await Promise.all([adherenceFor(admin, l.patient_id, addDays(today, -6), today), todayCounts(admin, l.patient_id, tz)]);
      return { linkId: l.id, patientId: l.patient_id, name: p?.display_name ?? "Patient", pct: a.pct, done: a.done, due: a.due, today: t, photoPct: a.proof.done ? Math.round((100 * a.proof.photo) / a.proof.done) : null };
    }),
  );
}

export async function showPatients(ctx: WaCtx) {
  const doc = await myDoctor(ctx.admin, ctx.userId);
  if (!doc) return startDoctorSignup(ctx);
  const rows = await patientRows(ctx.admin, ctx.userId);
  if (!rows.length) {
    await send(ctx, { type: "buttons", body: d("patients_none", { link: await doctorLink(doc.code) }), buttons: [menuBtn] });
    return;
  }
  // Those who need attention first (lowest adherence; no data last).
  rows.sort((a, b) => (a.pct ?? 101) - (b.pct ?? 101));
  await send(ctx, {
    type: "list",
    body: d("patients_body") + (rows.length > 10 ? `\n(${rows.length} patients, 10 lowest shown)` : ""),
    button: "Patients",
    sections: [{ rows: rows.slice(0, 10).map((r) => ({ id: `dr:p:${r.linkId}`, title: r.name, description: d("patient_row_d", { pct: pctText(r.pct), photo: pctText(r.photoPct), today: d("patient_today", { done: r.today.done, total: r.today.total }) }) })) }],
  });
}

async function ownLink(admin: AdminClient, doctorId: string, linkId: string) {
  const { data } = await admin.from("doctor_patients").select("id, patient_id, period_start").eq("id", linkId).eq("doctor_id", doctorId).eq("status", "active").maybeSingle();
  return data;
}

export async function showPatient(ctx: WaCtx, linkId: string) {
  const link = await ownLink(ctx.admin, ctx.userId, linkId);
  if (!link) return showPatients(ctx);
  const doc = await myDoctor(ctx.admin, ctx.userId);
  const { data: p } = await ctx.admin.from("profiles").select("display_name, timezone").eq("id", link.patient_id).single();
  const tz = p?.timezone ?? TZ;
  const today = localDateOf(new Date(), tz);
  const [week, month, { data: lastCi }, { data: plan }] = await Promise.all([
    adherenceFor(ctx.admin, link.patient_id, addDays(today, -6), today),
    adherenceFor(ctx.admin, link.patient_id, addDays(today, -29), today),
    ctx.admin.from("check_ins").select("created_at").eq("user_id", link.patient_id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    ctx.admin.from("care_plans").select("id, clinician_verification, plan_items(status)").eq("user_id", link.patient_id).eq("mode", "clinician_instructions").eq("status", "active").order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const items = week.items.length
    ? week.items.map((i) => `${dots(i.pct, 7)} ${i.done}/${i.due} ${i.title}${i.clinician ? "" : " (own goal)"}`).join("\n")
    : d("patient_no_items");
  const last = lastCi?.created_at ? new Date(lastCi.created_at).toLocaleString("en-IN", { timeZone: tz, day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : d("never");
  const share = (n: number) => pctText(week.proof.done ? Math.round((100 * n) / week.proof.done) : null);
  const parts = [d("patient_detail", { name: p?.display_name ?? "Patient", pct: pctText(week.pct), done: week.done, due: week.due, pct30: pctText(month.pct), photo: share(week.proof.photo), fresh: share(week.proof.fresh), human: week.proof.human, flagged: week.proof.flagged ? d("patient_flagged", { n: week.proof.flagged }) : "", last, items })];
  if (doc?.reward_text) {
    const period = await adherenceFor(ctx.admin, link.patient_id, link.period_start, today);
    const day = Math.min(doc.reward_days, Math.max(1, Math.round((Date.parse(today) - Date.parse(link.period_start)) / 86_400_000) + 1));
    parts.push(d("patient_reward", { day, days: doc.reward_days, pct: pctText(period.pct), target: doc.reward_target_pct }));
  }
  const confirmed = (plan?.plan_items ?? []).some((i) => i.status === "confirmed");
  const buttons = [{ id: `dr:note:${linkId}`, title: d("btn_note") }];
  if (plan && confirmed && plan.clinician_verification !== "clinician_verified") buttons.push({ id: `dr:rv:${linkId}:${plan.id}`, title: d("btn_review") });
  buttons.push({ id: "dr:m:patients", title: d("btn_back") });
  await send(ctx, { type: "buttons", body: parts.join("\n\n"), buttons });
}

// ---------------------------------------------------------------------------
// Notes and plan review
// ---------------------------------------------------------------------------
export async function askNote(ctx: WaCtx, linkId: string, review = false) {
  const link = await ownLink(ctx.admin, ctx.userId, linkId);
  if (!link) return showPatients(ctx);
  const { data: p } = await ctx.admin.from("profiles").select("display_name").eq("id", link.patient_id).single();
  await setState(ctx.admin, ctx.bindingId, "dr_note", { linkId, review });
  await send(ctx, { type: "text", body: review ? d("plan_change_ask", { name: p?.display_name ?? "" }) : d("note_ask", { name: p?.display_name ?? "" }) });
}

export async function sendNote(ctx: WaCtx, linkId: string, text: string, review: boolean) {
  const link = await ownLink(ctx.admin, ctx.userId, linkId);
  await clearState(ctx.admin, ctx.bindingId);
  if (!link) return showPatients(ctx);
  const doc = await myDoctor(ctx.admin, ctx.userId);
  const { data: p } = await ctx.admin.from("profiles").select("display_name, locale").eq("id", link.patient_id).single();
  const note = text.trim().slice(0, 1500);
  // Kept in the patient's own history too (shown on the web as a message from the doctor).
  await ctx.admin.from("memory_facts").insert({ user_id: link.patient_id, kind: "context", content: `Note from ${doc?.name ?? "their doctor"}: ${note}`.slice(0, 480), source_type: "user_message", status: "proposed" }).then(undefined, () => undefined);
  if (review) await ctx.admin.from("review_requests").insert({ user_id: link.patient_id, reason: `Doctor asked for a plan change: ${note}`.slice(0, 500), source: "assistant" });
  const r = await notify(ctx.admin, link.patient_id, { type: "text", body: w(p?.locale, "doctor_note", { doctor: doc?.name ?? "", text: note }) }, `dr-note:${ctx.key}`, { hold: true, respectQuiet: false });
  await send(ctx, { type: "buttons", body: r === "sent" ? d("note_sent", { name: p?.display_name ?? "" }) : d("note_queued", { name: p?.display_name ?? "" }), buttons: [{ id: `dr:p:${linkId}`, title: "Back to patient" }, menuBtn] });
}

/** Patient confirmed a plan read from a prescription: ask their doctor to check it. */
export async function notifyDoctorPlan(admin: AdminClient, doctorId: string, patientId: string, linkId: string, planId: string, items: { title: string; schedule_kind: string; times: string[]; weekdays: number[]; weekly_target: number | null }[]) {
  const { data: p } = await admin.from("profiles").select("display_name").eq("id", patientId).single();
  const list = items.map((i, n) => `${n + 1}. ${i.title} · ${scheduleText(i)}`).join("\n");
  await notify(admin, doctorId, { type: "buttons", body: d("plan_review", { name: p?.display_name ?? "Patient", items: list }), buttons: [{ id: `dr:ok:${linkId}:${planId}`, title: d("btn_looks_right") }, { id: `dr:chg:${linkId}`, title: d("btn_needs_change") }] }, `dr-plan:${planId}`, { hold: true, respectQuiet: false });
}

export async function reviewPlan(ctx: WaCtx, linkId: string, planId: string) {
  const link = await ownLink(ctx.admin, ctx.userId, linkId);
  if (!link) return showPatients(ctx);
  const { data: items } = await ctx.admin.from("plan_items").select("title, schedule_kind, times, weekdays, weekly_target").eq("plan_id", planId).eq("user_id", link.patient_id).eq("status", "confirmed");
  const { data: p } = await ctx.admin.from("profiles").select("display_name").eq("id", link.patient_id).single();
  const list = (items ?? []).map((i, n) => `${n + 1}. ${i.title} · ${scheduleText(i)}`).join("\n");
  await send(ctx, { type: "buttons", body: d("plan_review", { name: p?.display_name ?? "Patient", items: list }), buttons: [{ id: `dr:ok:${linkId}:${planId}`, title: d("btn_looks_right") }, { id: `dr:chg:${linkId}`, title: d("btn_needs_change") }] });
}

export async function approvePlan(ctx: WaCtx, linkId: string, planId: string) {
  const link = await ownLink(ctx.admin, ctx.userId, linkId);
  if (!link) return showPatients(ctx);
  const doc = await myDoctor(ctx.admin, ctx.userId);
  const { data: plan } = await ctx.admin.from("care_plans").update({ clinician_verification: "clinician_verified", clinician_name: doc?.name ?? null }).eq("id", planId).eq("user_id", link.patient_id).eq("mode", "clinician_instructions").select("id").maybeSingle();
  if (!plan) return showPatient(ctx, linkId);
  await ctx.admin.from("audit_events").insert({ user_id: link.patient_id, actor: "user", action: "plan_clinician_verified", entity: "care_plan", entity_id: planId, details: { doctor_id: ctx.userId, via: "whatsapp" } });
  const { data: p } = await ctx.admin.from("profiles").select("display_name, locale").eq("id", link.patient_id).single();
  await notify(ctx.admin, link.patient_id, { type: "text", body: w(p?.locale, "doctor_note", { doctor: doc?.name ?? "", text: w(p?.locale, "plan_checked", { doctor: doc?.name ?? "" }) + " ✓" }) }, `dr-ok:${planId}`, { hold: true });
  await send(ctx, { type: "buttons", body: d("plan_approved", { name: p?.display_name ?? "" }), buttons: [{ id: `dr:p:${linkId}`, title: "Back to patient" }, menuBtn] });
}

// ---------------------------------------------------------------------------
// Rewards
// ---------------------------------------------------------------------------
export async function showReward(ctx: WaCtx) {
  const doc = await myDoctor(ctx.admin, ctx.userId);
  if (!doc) return startDoctorSignup(ctx);
  const body = doc.reward_text ? d("reward_current", { reward: doc.reward_text, pct: doc.reward_target_pct, days: doc.reward_days }) : d("reward_none");
  await send(ctx, { type: "buttons", body, buttons: [{ id: "dr:rw:change", title: d("btn_change") }, ...(doc.reward_text ? [{ id: "dr:rw:none", title: d("btn_remove") }] : []), menuBtn] });
}

export async function rewardTap(ctx: WaCtx, choice: string, signup: boolean) {
  if (choice === "change") return askReward(ctx, false);
  const text = choice === "10" ? "10% off your next visit" : choice === "free" ? "A free follow-up visit" : null;
  await setReward(ctx, text, signup);
}

export async function askRedeem(ctx: WaCtx) {
  await setState(ctx.admin, ctx.bindingId, "dr_redeem");
  await send(ctx, { type: "text", body: d("redeem_ask") });
}

export async function redeem(ctx: WaCtx, raw: string) {
  await clearState(ctx.admin, ctx.bindingId);
  const code = raw.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(-6);
  const { data: r } = await ctx.admin.from("doctor_rewards").select("id, patient_id, reward_text, adherence_pct, period_start, period_end, status, redeemed_at").eq("doctor_id", ctx.userId).eq("code", code).maybeSingle();
  if (!r) return send(ctx, { type: "buttons", body: d("redeem_bad"), buttons: [{ id: "dr:m:redeem", title: "Try again" }, menuBtn] });
  if (r.status === "redeemed") return send(ctx, { type: "buttons", body: d("redeem_used", { date: r.redeemed_at ? new Date(r.redeemed_at).toLocaleDateString("en-IN", { timeZone: TZ, day: "numeric", month: "short" }) : "" }), buttons: [menuBtn] });
  await ctx.admin.from("doctor_rewards").update({ status: "redeemed", redeemed_at: new Date().toISOString() }).eq("id", r.id).eq("status", "earned");
  const { data: p } = await ctx.admin.from("profiles").select("display_name").eq("id", r.patient_id).single();
  await send(ctx, { type: "buttons", body: d("redeem_ok", { name: p?.display_name ?? "Patient", reward: r.reward_text, pct: r.adherence_pct, start: r.period_start, end: r.period_end }), buttons: [menuBtn] });
}

/**
 * Daily: close reward periods that have ended. A patient who followed at least the target
 * share earns the doctor's reward (a code for the clinic); either way the next period starts.
 */
export async function runDoctorRewards(admin: AdminClient, now = new Date()): Promise<number> {
  const today = localDateOf(now, TZ);
  const { data: links } = await admin.from("doctor_patients").select("id, doctor_id, patient_id, period_start, doctors!inner(name, reward_text, reward_target_pct, reward_days)").eq("status", "active").limit(500);
  let n = 0;
  for (const l of links ?? []) {
    const doc = l.doctors as unknown as { name: string; reward_text: string | null; reward_target_pct: number; reward_days: number };
    const end = addDays(l.period_start, doc.reward_days - 1);
    if (end >= today) continue; // period still running (or ends today)
    const a = await adherenceFor(admin, l.patient_id, l.period_start, end, now);
    const { data: moved } = await admin.from("doctor_patients").update({ period_start: addDays(end, 1) }).eq("id", l.id).eq("period_start", l.period_start).select("id").maybeSingle();
    if (!moved) continue; // another run handled it
    if (!doc.reward_text || a.pct === null || a.pct < doc.reward_target_pct || a.due < doc.reward_days / 2) continue;
    let code = "";
    for (let i = 0; i < 5 && !code; i++) {
      const c = newRewardCode();
      const { error } = await admin.from("doctor_rewards").insert({ link_id: l.id, doctor_id: l.doctor_id, patient_id: l.patient_id, code: c, reward_text: doc.reward_text, adherence_pct: a.pct, period_start: l.period_start, period_end: end });
      if (!error) code = c;
      else if (error.code === "23505" && error.message.includes("link_id")) break; // already granted
    }
    if (!code) continue;
    n++;
    const { data: p } = await admin.from("profiles").select("display_name, locale").eq("id", l.patient_id).single();
    await notify(admin, l.patient_id, { type: "text", body: w(p?.locale, "doctor_reward_patient", { pct: a.pct, days: doc.reward_days, doctor: doc.name, reward: doc.reward_text, code }) }, `reward:${l.id}:${l.period_start}`, { hold: true });
    await notify(admin, l.doctor_id, { type: "text", body: d("reward_earned", { name: p?.display_name ?? "Patient", pct: a.pct, days: doc.reward_days, reward: doc.reward_text, code }) }, `reward-dr:${l.id}:${l.period_start}`, { hold: true, respectQuiet: false });
  }
  return n;
}

/** Monday morning (India time): a weekly adherence summary to each doctor with patients. */
export async function runDoctorWeekly(admin: AdminClient, now = new Date()): Promise<number> {
  const local = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, weekday: "short", hour: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const wd = local.find((p) => p.type === "weekday")?.value, hour = Number(local.find((p) => p.type === "hour")?.value);
  if (wd !== "Mon" || hour !== 9) return 0;
  const { data: doctors } = await admin.from("doctors").select("user_id").limit(200);
  let n = 0;
  for (const doc of doctors ?? []) {
    const rows = await patientRows(admin, doc.user_id);
    if (!rows.length) continue;
    rows.sort((a, b) => (a.pct ?? 101) - (b.pct ?? 101));
    const lines = rows.slice(0, 15).map((r) => `${dots(r.pct)} ${pctText(r.pct)} · ${pctText(r.photoPct)} ${r.name}`).join("\n");
    const res = await notify(admin, doc.user_id, { type: "buttons", body: d("weekly", { lines }), buttons: [{ id: "dr:m:patients", title: d("row_patients") }] }, `dr-week:${doc.user_id}:${localDateOf(now, TZ)}`, { hold: true, respectQuiet: false });
    if (res !== "blocked") n++;
  }
  return n;
}
