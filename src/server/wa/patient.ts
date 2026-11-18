import "server-only";
// Patient side of the WhatsApp interface: menu, Today (with Done / Later / Skip buttons),
// plan, proof photos, progress, circle, "my doctor", settings, and making a plan
// (ready-made goal, own words, or a prescription photo that the person checks).
import type { AdminClient } from "@/lib/supabase/admin";
import { addDays, localDateOf, weekStart } from "@/domain/schedule";
import { applyCheckIn, getProfile, getToday, materializeOccurrences, pickRelevantOccurrence, type TodayAction } from "../core";
import { reply, rewardLine } from "@/domain/replies";
import { scheduleText, time12, waLink, type WaRow } from "@/domain/wa-ui";
import { w } from "@/domain/wa-copy";
import { FEATURED_PACKS, PACK_KEYS, isPackKey, packFor, packMotivation, type PackKey } from "@/domain/templates";
import { pointsTotal } from "../points";
import { getCircleView, joinCircle, type JoinResult } from "../circle";
import { draftQuickPlan } from "../quick-plan";
import { markReading, readIntoPlan } from "../plan-reading";
import { evaluateEvidence } from "../ai-tasks";
import { sha256Hex } from "@/domain/router";
import { send, notify, type WaCtx } from "./send";
import { clearState, setState } from "./state";
import { adherenceFor, businessNumber, linkedDoctor, pctText, streakFor } from "./data";

const DONE = new Set(["self_reported", "evidence_supported"]);
const OPEN = new Set(["due", "awaiting_response", "later"]);

const menuBtn = (l: string) => ({ id: "m:menu", title: w(l, "btn_menu") });

// ---------------------------------------------------------------------------
// Menu
// ---------------------------------------------------------------------------
export async function showMenu(ctx: WaCtx) {
  const l = ctx.locale;
  const { data: follows } = await ctx.admin.from("family_access").select("id, patient_id").eq("member_user_id", ctx.userId).eq("status", "active").limit(3);
  const names = await namesOf(ctx.admin, (follows ?? []).map((f) => f.patient_id));
  const { data: prof } = await ctx.admin.from("profiles").select("primary_role").eq("id", ctx.userId).single();
  const followRows: WaRow[] = (follows ?? []).map((f) => ({ id: `fm:see:${f.id}`, title: w(l, "row_follow", { name: names.get(f.patient_id) ?? "" }), description: w(l, "row_follow_d") }));
  if (prof?.primary_role === "family") {
    await send(ctx, { type: "list", body: w(l, "menu_body"), button: w(l, "btn_menu"), sections: [{ rows: [...followRows, { id: "fm:own", title: w(l, "row_own_plan"), description: w(l, "row_own_plan_d") }, { id: "m:settings", title: w(l, "row_settings"), description: w(l, "row_settings_d") }, { id: "m:help", title: w(l, "row_help") }] }] });
    return;
  }
  const rows: WaRow[] = [
    { id: "m:today", title: w(l, "row_today"), description: w(l, "row_today_d") },
    { id: "m:plan", title: w(l, "row_plan"), description: w(l, "row_plan_d") },
    { id: "m:proof", title: w(l, "row_proof"), description: w(l, "row_proof_d") },
    { id: "m:progress", title: w(l, "row_progress"), description: w(l, "row_progress_d") },
    { id: "m:circle", title: w(l, "row_circle"), description: w(l, "row_circle_d") },
    { id: "m:doctor", title: w(l, "row_doctor"), description: w(l, "row_doctor_d") },
    { id: "m:family", title: w(l, "row_family"), description: w(l, "row_family_d") },
    ...followRows.slice(0, 1),
    { id: "m:settings", title: w(l, "row_settings"), description: w(l, "row_settings_d") },
    { id: "m:help", title: w(l, "row_help") },
  ];
  await send(ctx, { type: "list", body: w(l, "menu_body"), button: w(l, "btn_menu"), sections: [{ rows: rows.slice(0, 10) }] });
}

async function namesOf(admin: AdminClient, ids: string[]) {
  if (!ids.length) return new Map<string, string>();
  const { data } = await admin.from("profiles").select("id, display_name").in("id", ids);
  return new Map((data ?? []).map((p) => [p.id, p.display_name?.split(" ")[0] ?? ""]));
}

// ---------------------------------------------------------------------------
// Today
// ---------------------------------------------------------------------------
function line(l: string, a: TodayAction): string {
  const icon = DONE.has(a.display) ? "✓" : OPEN.has(a.display) || a.display === "pending" ? "○" : "·";
  const when = a.target_count > 1 ? w(l, "week_target", { done: a.completed_count, target: a.target_count }) : time12(a.local_time);
  return `${icon} ${a.item.title}${when ? ` · ${when}` : ""}`;
}

export async function showToday(ctx: WaCtx, prefix?: string) {
  const l = ctx.locale;
  const profile = await getProfile(ctx.admin, ctx.userId);
  await materializeOccurrences(ctx.admin, ctx.userId, 2).catch(() => undefined);
  const today = (await getToday(ctx.admin, ctx.userId, profile.timezone)).filter((a) => a.display !== "paused");
  if (!today.length) {
    const hasPlan = await planCount(ctx.admin, ctx.userId);
    if (!hasPlan) return askPath(ctx, prefix ? `${prefix}\n\n${w(l, "no_plan")}` : w(l, "no_plan"));
    await send(ctx, { type: "buttons", body: [prefix, `*${w(l, "today_title")}*`, w(l, "today_empty")].filter(Boolean).join("\n\n"), buttons: [{ id: "m:plan", title: w(l, "row_plan") }, menuBtn(l)] });
    return;
  }
  const single = today.filter((a) => a.target_count === 1);
  const done = single.filter((a) => DONE.has(a.display)).length;
  const lines = today.map((a) => line(l, a)).join("\n");
  const next = pickRelevantOccurrence(today);
  const upcoming = today.find((a) => a.display === "pending" && a.target_count === 1);
  const parts = [prefix, `*${w(l, "today_title")}* · ${w(l, "today_count", { done, total: single.length })}`, lines].filter(Boolean) as string[];
  if (next) {
    parts.push(w(l, "today_next", { title: next.item.title }));
    const open = today.filter((a) => OPEN.has(a.display) || (a.target_count > 1 && !DONE.has(a.display)));
    await send(ctx, {
      type: "buttons",
      body: parts.join("\n\n"),
      buttons: [{ id: `ci:done:${next.id}`, title: w(l, "btn_done") }, { id: `ci:later:${next.id}`, title: w(l, "btn_later") }, open.length > 1 ? { id: "ci:pick:done", title: w(l, "btn_other") } : { id: `pf:${next.id}`, title: w(l, "btn_proof") }],
      footer: w(l, "footer_menu"),
    });
    return;
  }
  if (done === single.length && single.length) parts.push(w(l, "today_all_done"));
  else if (upcoming) parts.push(w(l, "today_next", { title: `${upcoming.item.title}, ${time12(upcoming.local_time)}` }));
  await send(ctx, { type: "buttons", body: parts.join("\n\n"), buttons: [{ id: "m:proof", title: w(l, "btn_proof") }, { id: "m:progress", title: w(l, "row_progress") }, menuBtn(l)] });
}

/** List of open tasks to mark (Done / Later / Skip) or attach proof to. */
export async function pickTask(ctx: WaCtx, kind: "done" | "later" | "skipped" | "proof") {
  const l = ctx.locale;
  const profile = await getProfile(ctx.admin, ctx.userId);
  const today = (await getToday(ctx.admin, ctx.userId, profile.timezone)).filter((a) => a.display !== "paused");
  const candidates = kind === "proof"
    ? today.filter((a) => OPEN.has(a.display) || a.display === "self_reported" || (a.target_count > 1 && a.display !== "evidence_supported"))
    : today.filter((a) => OPEN.has(a.display) || (a.target_count > 1 && !DONE.has(a.display)));
  if (!candidates.length) {
    await send(ctx, { type: "buttons", body: kind === "proof" ? w(l, "proof_none") : w(l, "today_all_done"), buttons: [{ id: "m:today", title: w(l, "row_today") }, menuBtn(l)] });
    return;
  }
  const rows = candidates.slice(0, 10).map((a) => ({ id: kind === "proof" ? `pf:${a.id}` : `ci:${kind}:${a.id}`, title: a.item.title, description: a.target_count > 1 ? w(l, "week_target", { done: a.completed_count, target: a.target_count }) : time12(a.local_time) || undefined }));
  await send(ctx, { type: "list", body: kind === "proof" ? w(l, "proof_pick") : w(l, "pick_task"), button: w(l, "btn_tasks"), sections: [{ rows }] });
}

/** A Done / Later / Skip tap (from a reminder or Today). */
export async function checkInTap(ctx: WaCtx, kind: "done" | "later" | "skipped" | "unable", occId: string) {
  const l = ctx.locale;
  const { data: occ } = await ctx.admin.from("action_occurrences").select("id, item_id, plan_items!inner(title, evidence_hint)").eq("id", occId).eq("user_id", ctx.userId).maybeSingle();
  if (!occ) return showToday(ctx, w(l, "expired_button"));
  const title = (occ.plan_items as unknown as { title: string; evidence_hint: string }).title;
  let text: string;
  try {
    const r = await applyCheckIn(ctx.admin, ctx.userId, occId, kind, { channel: "whatsapp", idempotencyKey: `wa:${ctx.key}:${occId}` });
    const key = r.result === "already_recorded" || r.result === "duplicate" ? "already_recorded" : r.result === "already_counted" ? "already_counted" : (`recorded_${kind}` as const);
    text = [reply(l, key, { title }), rewardLine(l, r.rewards)].filter(Boolean).join(" ");
  } catch {
    return showToday(ctx, w(l, "expired_button"));
  }
  if (kind !== "done") {
    await send(ctx, { type: "buttons", body: text, buttons: [{ id: "m:today", title: w(l, "row_today") }, menuBtn(l)] });
    return;
  }
  // Done: offer proof for the bonus and say what's next.
  const profile = await getProfile(ctx.admin, ctx.userId);
  const today = (await getToday(ctx.admin, ctx.userId, profile.timezone)).filter((a) => a.display !== "paused" && a.id !== occId);
  const next = pickRelevantOccurrence(today) ?? today.find((a) => a.display === "pending" && a.target_count === 1) ?? null;
  const nextLine = next ? w(l, "after_done_next", { title: next.item.title, time: next.local_time ? `, ${time12(next.local_time)}` : "" }) : "";
  await send(ctx, {
    type: "buttons",
    body: [text, w(l, "proof_hint"), nextLine].filter(Boolean).join("\n\n"),
    buttons: [{ id: `pf:${occId}`, title: w(l, "btn_proof") }, next && OPEN.has(next.display) ? { id: `ci:done:${next.id}`, title: `${w(l, "btn_done")}` } : { id: "m:today", title: w(l, "row_today") }, menuBtn(l)],
  });
}

// ---------------------------------------------------------------------------
// Plan
// ---------------------------------------------------------------------------
async function planCount(admin: AdminClient, userId: string) {
  const { count } = await admin.from("plan_items").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("status", "confirmed");
  return count ?? 0;
}

export async function showPlan(ctx: WaCtx) {
  const l = ctx.locale;
  const { data: plans } = await ctx.admin
    .from("care_plans")
    .select("id, title, mode, clinician_name, clinician_verification, plan_items(title, schedule_kind, times, weekdays, weekly_target, status)")
    .eq("user_id", ctx.userId)
    .eq("status", "active")
    .order("created_at");
  const blocks = (plans ?? [])
    .map((p) => {
      const items = (p.plan_items ?? []).filter((i) => i.status === "confirmed");
      if (!items.length) return null;
      const note = p.mode === "clinician_instructions" && p.clinician_name ? ` (${w(l, p.clinician_verification === "clinician_verified" ? "plan_checked" : "plan_waiting_doctor", { doctor: p.clinician_name })})` : "";
      return `*${p.title}*${note}\n${items.map((i) => `• ${i.title} · ${scheduleText(i, w(l, "per_week"))}`).join("\n")}`;
    })
    .filter(Boolean);
  if (!blocks.length) return askPath(ctx, w(l, "no_plan"));
  await send(ctx, { type: "buttons", body: `${blocks.join("\n\n")}`, buttons: [{ id: "ob:path:pack", title: w(l, "btn_add_goal") }, { id: "ob:path:rx", title: w(l, "btn_path_rx") }, menuBtn(l)] });
}

/** How to make a plan: doctor's note, a ready-made goal, or own words. */
export async function askPath(ctx: WaCtx, prefix?: string) {
  const l = ctx.locale;
  await setState(ctx.admin, ctx.bindingId, "ob_path");
  await send(ctx, { type: "buttons", body: [prefix, w(l, "ask_path")].filter(Boolean).join("\n\n"), buttons: [{ id: "ob:path:rx", title: w(l, "btn_path_rx") }, { id: "ob:path:pack", title: w(l, "btn_path_pack") }, { id: "ob:path:words", title: w(l, "btn_path_words") }] });
}

export async function choosePath(ctx: WaCtx, path: "rx" | "pack" | "words") {
  const l = ctx.locale;
  if (path === "rx") {
    const doc = await linkedDoctor(ctx.admin, ctx.userId);
    await setState(ctx.admin, ctx.bindingId, "rx_wait");
    await send(ctx, { type: "text", body: doc ? w(l, "ask_rx_photo_dr", { doctor: doc.name }) : w(l, "ask_rx_photo") });
    return;
  }
  if (path === "words") {
    await setState(ctx.admin, ctx.bindingId, "ob_words");
    await send(ctx, { type: "text", body: w(l, "ask_words") });
    return;
  }
  await clearState(ctx.admin, ctx.bindingId);
  const keys = [...FEATURED_PACKS, ...PACK_KEYS.filter((k) => !FEATURED_PACKS.includes(k))];
  await send(ctx, { type: "list", body: w(l, "ask_pack"), button: w(l, "btn_goals"), sections: [{ rows: keys.slice(0, 10).map((k) => { const p = packFor(k, l); return { id: `ob:pack:${k}`, title: p.plan, description: p.motivation }; }) }] });
}

async function finishPlan(ctx: WaCtx, planId: string) {
  const l = ctx.locale;
  await materializeOccurrences(ctx.admin, ctx.userId, 7).catch(() => undefined);
  await ctx.admin.from("profiles").update({ onboarded_at: new Date().toISOString(), primary_role: "patient" }).eq("id", ctx.userId).is("onboarded_at", null);
  await ctx.admin.from("profiles").update({ primary_role: "patient" }).eq("id", ctx.userId).eq("primary_role", "family");
  const { data: plan } = await ctx.admin.from("care_plans").select("title, plan_items(title, schedule_kind, times, weekdays, weekly_target, status)").eq("id", planId).single();
  const items = (plan?.plan_items ?? []).filter((i) => i.status === "confirmed").map((i) => `• ${i.title} · ${scheduleText(i, w(l, "per_week"))}`).join("\n");
  await clearState(ctx.admin, ctx.bindingId);
  await send(ctx, { type: "buttons", body: w(l, "plan_ready", { title: plan?.title ?? "", items }), buttons: [{ id: "m:today", title: w(l, "row_today") }, { id: "ob:path:pack", title: w(l, "btn_add_goal") }, menuBtn(l)] });
}

export async function addPack(ctx: WaCtx, key: string) {
  if (!isPackKey(key)) return showMenu(ctx);
  const tpl = packFor(key as PackKey, ctx.locale);
  const { data: plan, error } = await ctx.admin.from("care_plans").insert({ user_id: ctx.userId, title: tpl.plan, mode: "personal_goal", status: "active", source_description: "Sukhi example routine (personal goal)" }).select("id").single();
  if (error || !plan) throw new Error("plan_create_failed");
  await ctx.admin.from("plan_items").insert(tpl.items.map((i) => ({ ...i, plan_id: plan.id, user_id: ctx.userId, status: "confirmed" as const, provenance: "template" as const })));
  const { data: prof } = await ctx.admin.from("profiles").select("personal_motivation").eq("id", ctx.userId).single();
  if (!prof?.personal_motivation) await ctx.admin.from("profiles").update({ personal_motivation: packMotivation([key as PackKey], ctx.locale) }).eq("id", ctx.userId);
  await finishPlan(ctx, plan.id);
}

export async function planFromWords(ctx: WaCtx, text: string) {
  const l = ctx.locale;
  await send(ctx, { type: "text", body: w(l, "words_working") });
  const r = await draftQuickPlan(text);
  if (!r.ok) {
    await send(ctx, { type: "buttons", body: r.error === "medical" ? w(l, "words_medical") : w(l, "words_failed"), buttons: r.error === "medical" ? [{ id: "ob:path:rx", title: w(l, "btn_path_rx") }, { id: "ob:path:pack", title: w(l, "btn_path_pack") }] : [{ id: "ob:path:words", title: w(l, "btn_path_words") }, { id: "ob:path:pack", title: w(l, "btn_path_pack") }] });
    return;
  }
  const { data: plan, error } = await ctx.admin.from("care_plans").insert({ user_id: ctx.userId, title: r.plan.title, mode: "personal_goal", status: "active", source_description: "Made by Sukhi from your words (personal goal)" }).select("id").single();
  if (error || !plan) throw new Error("plan_create_failed");
  await ctx.admin.from("plan_items").insert(r.plan.items.map((i) => ({ ...i, instructions: null, weekdays: [], plan_id: plan.id, user_id: ctx.userId, status: "confirmed" as const, provenance: "manual" as const })));
  if (r.plan.motivation) await ctx.admin.from("profiles").update({ personal_motivation: r.plan.motivation.slice(0, 280) }).eq("id", ctx.userId).is("personal_motivation", null);
  await finishPlan(ctx, plan.id);
}

// ---------------------------------------------------------------------------
// Prescription photo: read it, show what was read, the person confirms or corrects.
// ---------------------------------------------------------------------------
export async function readPrescription(ctx: WaCtx, media: { bytes: Uint8Array; mime: string }) {
  const l = ctx.locale;
  const sha = await sha256Hex(media.bytes);
  const ext = media.mime === "application/pdf" ? "pdf" : media.mime.split("/")[1];
  const path = `${ctx.userId}/${sha.slice(0, 24)}.${ext}`;
  const up = await ctx.admin.storage.from("plan-sources").upload(path, media.bytes, { contentType: media.mime, upsert: false });
  if (up.error && !/exists|duplicate/i.test(up.error.message)) throw new Error("rx_upload_failed");
  const { data: existing } = await ctx.admin.from("documents").select("id").eq("bucket", "plan-sources").eq("storage_path", path).maybeSingle();
  const docId = existing?.id ?? (await ctx.admin.from("documents").insert({ user_id: ctx.userId, bucket: "plan-sources", storage_path: path, mime_type: media.mime, size_bytes: media.bytes.byteLength, sha256: sha, original_name: "whatsapp" }).select("id").single()).data?.id;
  if (!docId) throw new Error("rx_document_failed");
  const doc = await linkedDoctor(ctx.admin, ctx.userId);
  // Same photo again (or a retry after a timeout): reuse its plan instead of making another.
  const { data: again } = await ctx.admin.from("care_plans").select("id").eq("user_id", ctx.userId).eq("source_document_id", docId).eq("status", "active").limit(1).maybeSingle();
  if (again) {
    const { count } = await ctx.admin.from("plan_items").select("id", { count: "exact", head: true }).eq("plan_id", again.id).eq("status", "draft");
    if (count) return showDrafts(ctx, again.id);
    const { count: live } = await ctx.admin.from("plan_items").select("id", { count: "exact", head: true }).eq("plan_id", again.id).eq("status", "confirmed");
    if (live) return showPlan(ctx); // already read and confirmed
  }
  const { data: plan, error } = again ? { data: again, error: null } : await ctx.admin
    .from("care_plans")
    .insert({ user_id: ctx.userId, title: doc ? `${doc.name}'s plan`.slice(0, 120) : "My doctor's plan", mode: "clinician_instructions", status: "active", clinician_name: doc?.name ?? null, source_document_id: docId, source_description: "Photo sent on WhatsApp" })
    .select("id")
    .single();
  if (error || !plan) throw new Error("rx_plan_failed");
  await send(ctx, { type: "text", body: w(l, "rx_reading") });
  await markReading(ctx.admin, ctx.userId, docId);
  const r = await readIntoPlan(ctx.admin, ctx.userId, plan.id, docId);
  await showDrafts(ctx, plan.id, r.ok);
}

export async function showDrafts(ctx: WaCtx, planId: string, readOk = true) {
  const l = ctx.locale;
  const { data: drafts } = await ctx.admin.from("plan_items").select("title, instructions, schedule_kind, times, weekdays, weekly_target, unresolved_fields").eq("plan_id", planId).eq("user_id", ctx.userId).eq("status", "draft").order("created_at");
  if (!drafts?.length) {
    await setState(ctx.admin, ctx.bindingId, "rx_wait");
    await send(ctx, { type: "buttons", body: readOk ? w(l, "rx_none") : w(l, "rx_failed"), buttons: [{ id: "ob:path:pack", title: w(l, "btn_path_pack") }, menuBtn(l)] });
    return;
  }
  const items = drafts
    .map((dr, i) => {
      const unclear = (dr.unresolved_fields ?? []).length ? ` (${w(l, "rx_unclear")})` : "";
      return `${i + 1}. ${dr.title} · ${scheduleText(dr, w(l, "per_week"))}${unclear}${dr.instructions ? `\n   ${dr.instructions.slice(0, 90)}` : ""}`;
    })
    .join("\n");
  await setState(ctx.admin, ctx.bindingId, "rx_fix", { planId });
  await send(ctx, { type: "buttons", body: w(l, "rx_result", { n: drafts.length, items }), buttons: [{ id: `rx:ok:${planId}`, title: w(l, "btn_all_correct") }, { id: `rx:fix:${planId}`, title: w(l, "btn_fix") }] });
}

export async function confirmDrafts(ctx: WaCtx, planId: string) {
  const l = ctx.locale;
  const { data: plan } = await ctx.admin.from("care_plans").select("id, title, clinician_name").eq("id", planId).eq("user_id", ctx.userId).maybeSingle();
  if (!plan) return showMenu(ctx);
  const { data: confirmed } = await ctx.admin.from("plan_items").update({ status: "confirmed" }).eq("plan_id", planId).eq("user_id", ctx.userId).eq("status", "draft").select("title, schedule_kind, times, weekdays, weekly_target");
  if (!confirmed?.length) {
    await send(ctx, { type: "buttons", body: w(l, "rx_nothing_pending"), buttons: [{ id: "m:plan", title: w(l, "row_plan") }, menuBtn(l)] });
    return;
  }
  await clearState(ctx.admin, ctx.bindingId);
  await materializeOccurrences(ctx.admin, ctx.userId, 7).catch(() => undefined);
  await ctx.admin.from("profiles").update({ onboarded_at: new Date().toISOString() }).eq("id", ctx.userId).is("onboarded_at", null);
  const doc = await linkedDoctor(ctx.admin, ctx.userId);
  if (doc) {
    const { notifyDoctorPlan } = await import("./doctor");
    await notifyDoctorPlan(ctx.admin, doc.doctorId, ctx.userId, doc.linkId, planId, confirmed).catch(() => undefined);
  }
  await showToday(ctx, doc ? w(l, "rx_confirmed_dr", { doctor: doc.name }) : w(l, "rx_confirmed"));
}

export async function askFix(ctx: WaCtx, planId: string) {
  await setState(ctx.admin, ctx.bindingId, "rx_fix", { planId, asked: true });
  await send(ctx, { type: "text", body: w(ctx.locale, "rx_ask_fix") });
}

export async function applyFix(ctx: WaCtx, planId: string, correction: string) {
  const { data: plan } = await ctx.admin.from("care_plans").select("id, source_document_id").eq("id", planId).eq("user_id", ctx.userId).maybeSingle();
  if (!plan?.source_document_id) return showMenu(ctx);
  await send(ctx, { type: "text", body: w(ctx.locale, "rx_reading") });
  await markReading(ctx.admin, ctx.userId, plan.source_document_id);
  const r = await readIntoPlan(ctx.admin, ctx.userId, plan.id, plan.source_document_id, correction.slice(0, 600));
  await showDrafts(ctx, plan.id, r.ok);
}

// ---------------------------------------------------------------------------
// Proof photos
// ---------------------------------------------------------------------------
export async function askProof(ctx: WaCtx, occId: string) {
  const { data: occ } = await ctx.admin.from("action_occurrences").select("id, plan_items!inner(title)").eq("id", occId).eq("user_id", ctx.userId).maybeSingle();
  if (!occ) return pickTask(ctx, "proof");
  await setState(ctx.admin, ctx.bindingId, "proof", { occId });
  await send(ctx, { type: "text", body: w(ctx.locale, "proof_send", { title: (occ.plan_items as unknown as { title: string }).title }) });
}

/** Save a photo as evidence for a task (the chosen one, or the most relevant) and assess it. */
export async function saveProof(ctx: WaCtx, media: { bytes: Uint8Array; mime: string }, kind: "image" | "document", caption: string | undefined, msgId: string, occId?: string | null) {
  const l = ctx.locale;
  const profile = await getProfile(ctx.admin, ctx.userId);
  await materializeOccurrences(ctx.admin, ctx.userId, 2).catch(() => undefined);
  const today = await getToday(ctx.admin, ctx.userId, profile.timezone);
  const target = (occId ? today.find((a) => a.id === occId) : null) ?? pickRelevantOccurrence(today, true);
  if (!target) {
    await send(ctx, { type: "buttons", body: reply(l, "no_open_action").replace(/You can open Today to see your plan\.?/, "").trim() || w(l, "proof_none"), buttons: [{ id: "m:today", title: w(l, "row_today") }, menuBtn(l)] });
    return;
  }
  const hash = await sha256Hex(media.bytes);
  const ext = media.mime === "application/pdf" ? "pdf" : media.mime.split("/")[1];
  const path = `${ctx.userId}/${target.id}/${hash.slice(0, 16)}.${ext}`;
  await ctx.admin.storage.from("evidence").upload(path, media.bytes, { contentType: media.mime, upsert: true });
  const { data: doc } = await ctx.admin.from("documents").upsert({ user_id: ctx.userId, bucket: "evidence", storage_path: path, mime_type: media.mime, size_bytes: media.bytes.byteLength, sha256: hash }, { onConflict: "user_id,bucket,storage_path" }).select("id").single();
  const { data: evRow } = await ctx.admin.from("evidence").upsert({ user_id: ctx.userId, occurrence_id: target.id, kind: kind === "image" ? "photo" : "document", document_id: doc!.id, text_content: caption ?? null, content_hash: hash, channel: "whatsapp" }, { onConflict: "occurrence_id,content_hash", ignoreDuplicates: true }).select("id").maybeSingle();
  await ctx.admin.from("messages").upsert({ user_id: ctx.userId, role: "user", channel: "whatsapp", content: `[photo] ${caption ?? ""}`.trim(), provider_message_id: msgId }, { onConflict: "provider_message_id", ignoreDuplicates: true });
  const lines = [reply(l, "evidence_saved", { title: target.item.title })];
  if (evRow) {
    const evaluation = await evaluateEvidence(ctx.admin, ctx.userId, evRow.id);
    lines.push(evaluation.explanation);
    if (evaluation.cannot_confirm.length) lines.push(`• ${evaluation.cannot_confirm.slice(0, 2).join("\n• ")}`);
  }
  await clearState(ctx.admin, ctx.bindingId);
  await send(ctx, { type: "buttons", body: lines.join("\n\n"), buttons: [{ id: "m:today", title: w(l, "row_today") }, menuBtn(l)] });
}

// ---------------------------------------------------------------------------
// Progress
// ---------------------------------------------------------------------------
export async function showProgress(ctx: WaCtx) {
  const l = ctx.locale;
  const profile = await getProfile(ctx.admin, ctx.userId);
  const today = localDateOf(new Date(), profile.timezone);
  const ws = weekStart(today);
  const [a, streak, points, { data: occ }] = await Promise.all([
    adherenceFor(ctx.admin, ctx.userId, addDays(today, -6), today),
    streakFor(ctx.admin, ctx.userId, profile.timezone),
    pointsTotal(ctx.admin, ctx.userId),
    ctx.admin.from("action_occurrences").select("local_date, status, target_count").eq("user_id", ctx.userId).gte("local_date", ws).lte("local_date", today).eq("target_count", 1).neq("status", "paused"),
  ]);
  const days = Array.from({ length: 7 }, (_, i) => addDays(ws, i)).filter((d) => d <= today);
  const names = l === "hi" ? ["सोम", "मंगल", "बुध", "गुरु", "शुक्र", "शनि", "रवि"] : l === "mr" ? ["सोम", "मंगळ", "बुध", "गुरु", "शुक्र", "शनि", "रवि"] : ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const week = days
    .map((d, i) => {
      const rows = (occ ?? []).filter((o) => o.local_date === d);
      const done = rows.filter((o) => DONE.has(o.status)).length;
      return `${names[i]}  ${rows.length ? "●".repeat(done) + "○".repeat(Math.max(0, rows.length - done)) : "·"}`;
    })
    .join("\n");
  const body = `${w(l, "progress_body", { pct: pctText(a.pct), done: a.done, due: a.due, streak, points })}\n\n${week}`;
  await send(ctx, { type: "buttons", body, buttons: [{ id: "m:circle", title: w(l, "row_circle") }, { id: "m:today", title: w(l, "row_today") }, menuBtn(l)] });
}

// ---------------------------------------------------------------------------
// Circle (leaderboard)
// ---------------------------------------------------------------------------
export async function showCircle(ctx: WaCtx, circleId?: string) {
  const l = ctx.locale;
  const profile = await getProfile(ctx.admin, ctx.userId);
  const v = await getCircleView(ctx.admin, ctx.userId, profile.timezone, circleId ?? null);
  const board = v.members.slice(0, 8).map((m, i) => w(l, "circle_row", { rank: i + 1, name: m.me ? w(l, "circle_you") : m.name ?? "?", points: m.points }) + (m.streak >= 2 ? ` · 🔥${m.streak}` : "")).join("\n");
  const head = w(l, "circle_title", { name: v.circle.name, code: v.circle.code });
  const challenge = v.challenge ? `\n${v.challenge.prize ? `🏆 ${v.challenge.prize}\n` : ""}${v.challenge.startsOn} → ${v.challenge.endsOn}` : "";
  const body = `*${head}*${challenge}\n\n${board}${v.members.length <= 1 ? `\n\n${w(l, "circle_alone")}` : ""}`;
  const buttons = [{ id: `cl:invite:${v.circle.id}`, title: w(l, "btn_invite") }, v.circles.length > 1 ? { id: "cl:list", title: w(l, "btn_other_circle") } : { id: "cl:join", title: w(l, "btn_join") }, menuBtn(l)];
  await send(ctx, { type: "buttons", body, buttons });
}

export async function listCircles(ctx: WaCtx) {
  const l = ctx.locale;
  const profile = await getProfile(ctx.admin, ctx.userId);
  const v = await getCircleView(ctx.admin, ctx.userId, profile.timezone);
  await send(ctx, { type: "list", body: w(l, "row_circle"), button: w(l, "row_circle"), sections: [{ rows: [...v.circles.slice(0, 9).map((c) => ({ id: `cl:v:${c.id}`, title: c.name })), { id: "cl:join", title: w(l, "btn_join") }] }] });
}

export async function inviteCircle(ctx: WaCtx, circleId: string) {
  const l = ctx.locale;
  const { data: c } = await ctx.admin.from("circles").select("invite_code").eq("id", circleId).maybeSingle();
  const { data: member } = await ctx.admin.from("circle_members").select("circle_id").eq("circle_id", circleId).eq("user_id", ctx.userId).maybeSingle();
  if (!c || !member) return showCircle(ctx);
  const num = await businessNumber();
  const link = num ? waLink(num, `JOIN ${c.invite_code}`) : `JOIN ${c.invite_code}`;
  await send(ctx, { type: "text", body: w(l, "circle_forward") });
  await send(ctx, { type: "text", body: w(l, "circle_invite_msg", { link }) });
}

export async function joinCircleCode(ctx: WaCtx, code: string, quiet = false) {
  const l = ctx.locale;
  const r: JoinResult = await joinCircle(ctx.admin, ctx.userId, code).catch(() => "invalid" as const);
  await clearState(ctx.admin, ctx.bindingId);
  if (quiet && (r === "joined" || r === "already")) return;
  if (r === "joined" || r === "already") return showCircle(ctx);
  const key = ({ invalid: "circle_invalid", full: "circle_full", too_many: "circle_too_many", rate_limited: "circle_rate", ended: "circle_ended" } as const)[r];
  await send(ctx, { type: "buttons", body: w(l, key), buttons: [{ id: "m:circle", title: w(l, "row_circle") }, menuBtn(l)] });
}

// ---------------------------------------------------------------------------
// My doctor (patient view) and doctor consent
// ---------------------------------------------------------------------------
export async function showMyDoctor(ctx: WaCtx) {
  const l = ctx.locale;
  const doc = await linkedDoctor(ctx.admin, ctx.userId);
  if (!doc) {
    await send(ctx, { type: "buttons", body: w(l, "doctor_none"), buttons: [menuBtn(l)] });
    return;
  }
  const profile = await getProfile(ctx.admin, ctx.userId);
  const today = localDateOf(new Date(), profile.timezone);
  const week = await adherenceFor(ctx.admin, ctx.userId, addDays(today, -6), today);
  const parts = [w(l, "doctor_view", { doctor: doc.name, clinic: doc.clinic ? `, ${doc.clinic}` : "", pct: pctText(week.pct) })];
  if (doc.reward_text) {
    const day = Math.min(doc.reward_days, Math.max(1, Math.round((Date.parse(today) - Date.parse(doc.periodStart)) / 86_400_000) + 1));
    const period = await adherenceFor(ctx.admin, ctx.userId, doc.periodStart, today);
    parts.push(w(l, "reward_progress", { reward: doc.reward_text, target: doc.reward_target_pct, days: doc.reward_days, day, pct: pctText(period.pct) }));
  }
  const { data: rewards } = await ctx.admin.from("doctor_rewards").select("code, reward_text").eq("link_id", doc.linkId).eq("status", "earned").order("created_at", { ascending: false }).limit(2);
  for (const r of rewards ?? []) parts.push(w(l, "reward_earned", { reward: r.reward_text, code: r.code }));
  await send(ctx, { type: "buttons", body: parts.join("\n\n"), buttons: [{ id: `ds:stop:${doc.linkId}`, title: w(l, "btn_stop_sharing") }, menuBtn(l)] });
}

export async function stopSharing(ctx: WaCtx, linkId: string) {
  const { data: link } = await ctx.admin.from("doctor_patients").update({ status: "revoked", revoked_at: new Date().toISOString() }).eq("id", linkId).eq("patient_id", ctx.userId).eq("status", "active").select("doctors!inner(name)").maybeSingle();
  if (!link) return showMyDoctor(ctx);
  await ctx.admin.from("audit_events").insert({ user_id: ctx.userId, actor: "user", action: "doctor_sharing_revoked", entity: "doctor_patient", entity_id: linkId });
  await send(ctx, { type: "buttons", body: w(ctx.locale, "doctor_unlinked", { doctor: (link.doctors as unknown as { name: string }).name }), buttons: [menuBtn(ctx.locale)] });
}

/** Ask the patient whether to share with the doctor whose code they used. */
export async function askDoctorConsent(ctx: WaCtx, doctorId: string) {
  const { data: doc } = await ctx.admin.from("doctors").select("name").eq("user_id", doctorId).maybeSingle();
  if (!doc || doctorId === ctx.userId) return;
  await send(ctx, { type: "buttons", body: w(ctx.locale, "ask_doctor_consent", { doctor: doc.name }), buttons: [{ id: `dc:yes:${doctorId}`, title: w(ctx.locale, "btn_yes_share") }, { id: "dc:no", title: w(ctx.locale, "btn_no") }] });
}

export async function linkDoctor(ctx: WaCtx, doctorId: string): Promise<string | null> {
  const { data: doc } = await ctx.admin.from("doctors").select("user_id, name").eq("user_id", doctorId).maybeSingle();
  if (!doc || doctorId === ctx.userId) return null;
  const today = localDateOf(new Date(), "Asia/Kolkata");
  const { data: link } = await ctx.admin
    .from("doctor_patients")
    .upsert({ doctor_id: doctorId, patient_id: ctx.userId, status: "active", consented_at: new Date().toISOString(), revoked_at: null, period_start: today }, { onConflict: "doctor_id,patient_id" })
    .select("id")
    .single();
  await ctx.admin.from("audit_events").insert({ user_id: ctx.userId, actor: "user", action: "doctor_sharing_granted", entity: "doctor_patient", entity_id: link?.id ?? null });
  // A doctor's own plans now name them.
  await ctx.admin.from("care_plans").update({ clinician_name: doc.name }).eq("user_id", ctx.userId).eq("mode", "clinician_instructions").is("clinician_name", null);
  const { data: me } = await ctx.admin.from("profiles").select("display_name").eq("id", ctx.userId).single();
  const { d } = await import("@/domain/wa-copy");
  await notify(ctx.admin, doctorId, { type: "buttons", body: d("new_patient", { name: me?.display_name ?? "A patient" }), buttons: [{ id: `dr:p:${link?.id}`, title: "See patient" }, { id: "dr:m:patients", title: "All patients" }] }, `dr-new:${link?.id}`, { hold: true, respectQuiet: false });
  return doc.name;
}

// ---------------------------------------------------------------------------
// Settings and help
// ---------------------------------------------------------------------------
export async function showSettings(ctx: WaCtx) {
  const l = ctx.locale;
  const { data: prof } = await ctx.admin.from("profiles").select("signup_channel").eq("id", ctx.userId).single();
  await send(ctx, {
    type: "list",
    body: w(l, "settings_body"),
    button: w(l, "settings_body"),
    sections: [{ rows: [
      { id: "st:lang:en", title: "English", description: w(l, "row_language") },
      { id: "st:lang:hi", title: "हिंदी", description: w(l, "row_language") },
      { id: "st:lang:mr", title: "मराठी", description: w(l, "row_language") },
      { id: "st:pause", title: w(l, "row_pause"), description: w(l, "row_pause_d") },
      { id: "st:stop", title: w(l, "row_stop") },
      { id: "st:web", title: w(l, "row_web"), description: w(l, "row_web_d") },
      ...(prof?.signup_channel === "whatsapp" ? [{ id: "st:link", title: w(l, "row_link_web"), description: w(l, "row_link_web_d") }] : []),
    ] }],
  });
}

export async function showHelp(ctx: WaCtx) {
  await send(ctx, { type: "buttons", body: w(ctx.locale, "help"), buttons: [menuBtn(ctx.locale)] });
}
