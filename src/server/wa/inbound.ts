import "server-only";
// One inbound WhatsApp message, start to finish. Order:
//   1. no account yet: welcome + consent (Start), web link codes, invite codes
//   2. STOP / PAUSE / START
//   3. button and list taps (ids we created; ownership is checked again server-side)
//   4. an open question (name, code, note, correction...)
//   5. photos (prescription, proof), voice notes
//   6. invite codes and command words
//   7. everything else: the same assistant as the web chat
import type { AdminClient } from "@/lib/supabase/admin";
import type { InboundMessage } from "@/domain/whatsapp";
import { hashLinkCode, routeMessage } from "@/domain/router";
import { reply } from "@/domain/replies";
import { cleanName, parseCommand, parseInviteCode, type InviteCode } from "@/domain/wa-ui";
import { d, w } from "@/domain/wa-copy";
import { audit, getConsents, getProfile } from "../core";
import { runAssistant } from "../agent";
import { fetchWhatsAppMedia, sendWhatsAppText, transcribe } from "../providers";
import { send, sendDirect, sendVoice, releaseHeld, type WaCtx } from "./send";
import { clearState, currentState, setState, type StateData } from "./state";
import { createWaAccount, grantPatientConsents } from "./account";
import { hasActivePlan } from "./data";
import { connectNumber, consumeCodeForBoundNumber, createConnectLink, findWebMatch, matchRecentlyAsked, webLoginLink } from "./link";
import * as P from "./patient";
import * as F from "./family";
import * as D from "./doctor";

type Binding = { id: string; user_id: string; status: string; wa_state: string | null; wa_state_data: unknown; wa_state_at: string | null };

export async function handleWhatsAppMessage(admin: AdminClient, msg: InboundMessage): Promise<void> {
  const from = msg.from;
  const { data: binding } = await admin.from("channel_bindings").select("id, user_id, status, wa_state, wa_state_data, wa_state_at").eq("channel", "whatsapp").eq("external_id", from).neq("status", "revoked").maybeSingle();
  if (!binding) return handleNewNumber(admin, msg);

  await admin.from("channel_bindings").update({ last_inbound_at: new Date(Math.max(msg.timestamp * 1000, Date.now() - 60_000)).toISOString() }).eq("id", binding.id);
  const userId = binding.user_id;
  const profile = await getProfile(admin, userId);
  const ctx: WaCtx = { admin, userId, bindingId: binding.id, to: from, locale: profile.locale, key: msg.id, n: 0 };
  const text = (msg.text ?? msg.caption ?? "").trim();

  // STOP / PAUSE / START (typed only; a tapped button is never a channel command).
  if (!msg.replyId && text) {
    const routed = routeMessage(text, { channel: "whatsapp" });
    if (routed.route === "channel_command") return channelCommand(admin, binding, userId, from, profile.locale, routed.command);
  }
  if (binding.status !== "active") {
    // Paused / opted out: keep the message for the web app, do not reply.
    await admin.from("messages").upsert({ user_id: userId, role: "user", channel: "whatsapp", content: text || `[${msg.kind}]`, provider_message_id: msg.id }, { onConflict: "provider_message_id", ignoreDuplicates: true });
    return;
  }
  await releaseHeld(admin, userId, binding.id).catch(() => undefined);

  // Record the message once. A retry of this job (after a failure part-way) runs again, and
  // the reply dedupe keys (message id + sequence) stop anything being sent twice.
  await admin.from("messages").upsert({ user_id: userId, role: "user", channel: "whatsapp", content: (text || `[${msg.kind}]`).slice(0, 8000), provider_message_id: msg.id }, { onConflict: "provider_message_id", ignoreDuplicates: true });
  const { data: inserted } = await admin.from("messages").select("id").eq("provider_message_id", msg.id).maybeSingle();

  const role = (profile as { primary_role?: string }).primary_role ?? "patient";

  // An account made on WhatsApp whose number is also saved on a web account: offer to join them.
  if (!msg.replyId && (profile as { signup_channel?: string }).signup_channel === "whatsapp") {
    const match = await findWebMatch(admin, from, userId);
    if (match && !(await matchRecentlyAsked(admin, userId, from, 24))) {
      await audit(admin, userId, "system", "wa_match_prompted", "phone", from);
      return send(ctx, { type: "buttons", body: w(ctx.locale, "merge_prompt", { email: match.email }), buttons: [{ id: `lk:merge:${match.userId}`, title: w(ctx.locale, "btn_merge") }, { id: "lk:no", title: w(ctx.locale, "btn_not_now") }] });
    }
  }

  // A web link code from a number that already has an account here (e.g. made on WhatsApp first).
  if (!msg.replyId && text) {
    const routed = routeMessage(text, { channel: "whatsapp" });
    if (routed.route === "link_code") return boundLinkCode(ctx, routed.code);
  }

  if (msg.replyId) return handleTap(ctx, msg.replyId, binding);

  const st = currentState(binding);

  // Photos and documents
  if ((msg.kind === "image" || msg.kind === "document") && msg.mediaId) {
    if (role === "doctor") return send(ctx, { type: "text", body: d("help") });
    const media = await fetchWhatsAppMedia(msg.mediaId, msg.kind === "image" ? "image" : "document");
    if (!media.ok) {
      if (["unsupported_media_type", "media_too_large", "untrusted_media_host"].includes(media.error)) return send(ctx, { type: "text", body: reply(ctx.locale, "media_unsupported") });
      throw new Error(media.error);
    }
    const captionSaysRx = /prescription|parchi|पर्ची|चिठ्ठी|प्रिस्क्रिप्शन|doctor/i.test(msg.caption ?? "");
    if (st?.state === "rx_wait" || st?.state === "rx_fix" || captionSaysRx || !(await hasActivePlan(admin, userId))) return P.readPrescription(ctx, media);
    return P.saveProof(ctx, media, msg.kind, msg.caption, msg.id, st?.state === "proof" ? String(st.data.occId) : null);
  }

  // Voice notes become text
  let userText = text;
  let heard = "";
  if (msg.kind === "audio" && msg.mediaId) {
    const consents = await getConsents(admin, userId);
    if (!consents.voice_processing) return send(ctx, { type: "text", body: reply(ctx.locale, "voice_unconfigured") });
    const media = await fetchWhatsAppMedia(msg.mediaId, "audio");
    if (!media.ok) throw new Error(media.error);
    const t = await transcribe(new Blob([media.bytes as BlobPart], { type: media.mime }), ctx.locale);
    if (!t.ok || !t.value.transcript) return send(ctx, { type: "text", body: reply(ctx.locale, "voice_unconfigured") });
    userText = t.value.transcript;
    heard = reply(ctx.locale, "voice_heard", { text: userText.slice(0, 200) });
    if (inserted) await admin.from("messages").update({ content: userText.slice(0, 8000) }).eq("id", inserted.id);
  }
  if (!userText) return send(ctx, { type: "text", body: reply(ctx.locale, "media_unsupported") });

  // An open question takes the text first (unless it's clearly a command word).
  const cmd = parseCommand(userText);
  if (st && !(cmd && cmd !== "register_doctor" && !["ob_name", "dr_name", "dr_clinic", "dr_note", "dr_reward"].includes(st.state))) {
    const handled = await handleStateText(ctx, st.state, st.data, userText);
    if (handled) return;
  }

  const code = parseInviteCode(userText);
  if (code) return inviteForExisting(ctx, code, role);

  if (role === "doctor") {
    if (cmd === "help") return send(ctx, { type: "buttons", body: d("help"), buttons: [{ id: "dr:m:menu", title: "Menu" }] });
    return D.showDoctorMenu(ctx);
  }
  if (cmd) return command(ctx, cmd, role);
  if (role === "family") return P.showMenu(ctx);
  if (!(await hasActivePlan(admin, userId))) {
    if (st?.state === "rx_fix" && st.data.planId) return P.showDrafts(ctx, String(st.data.planId));
    return P.askPath(ctx);
  }

  // Everything else: the same assistant, tools and memory as the web chat.
  const answer = await runAssistant({ admin, userId, channel: "whatsapp", text: userText, messageKey: msg.id });
  if (answer.safety && inserted) await admin.from("messages").update({ safety_flag: answer.safety }).eq("id", inserted.id);
  await send(ctx, { type: "text", body: [heard, answer.text].filter(Boolean).join("\n\n") });
  // Spoke to us? Sukhi answers out loud too.
  if (msg.kind === "audio") await sendVoice(ctx, answer.text).catch(() => undefined);
}

// ---------------------------------------------------------------------------
// New numbers
// ---------------------------------------------------------------------------
function startButtons(l: string, startId: string, extra?: { id: string; title: string }): { id: string; title: string }[] {
  return [{ id: startId, title: w(l, "btn_start") }, { id: "ob:no", title: w(l, "btn_not_now") }, ...(extra ? [extra] : [])];
}

async function handleNewNumber(admin: AdminClient, msg: InboundMessage): Promise<void> {
  const from = msg.from;
  const text = (msg.text ?? msg.caption ?? "").trim();
  const id = msg.replyId ?? "";

  if (id.startsWith("ob:start")) return startAccount(admin, msg, id);
  if (id.startsWith("lk:yes:")) return connectMatched(admin, msg, id.slice(7));
  if (id === "lk:no") return void (await sendDirect(from, { type: "buttons", body: w("en", "welcome_new"), buttons: startButtons("en", "ob:start", { id: "ob:web", title: w("en", "btn_web") }) }));
  if (id === "ob:no") return void (await sendDirect(from, { type: "text", body: w("en", "not_now") }));
  if (id === "ob:web") {
    // Already use the web app: a one-time link to log in and connect this number.
    const link = await createConnectLink(admin, from).catch(() => null);
    return void (await sendDirect(from, { type: "text", body: link ? w("en", "web_connect_link", { link }) : w("en", "web_link_help") }));
  }

  // Web users linking their existing account (code from Settings → WhatsApp).
  const routed = text ? routeMessage(text, { channel: "whatsapp" }) : null;
  if (routed?.route === "link_code") return linkExisting(admin, from, routed.code);
  if (routed?.route === "channel_command") return; // STOP from a stranger: nothing to stop, send nothing

  // The number is saved on a web account: offer to connect it (one tap on this phone proves it).
  if (!id) {
    const match = await findWebMatch(admin, from);
    if (match) {
      const { data: prof } = await admin.from("profiles").select("locale").eq("id", match.userId).single();
      const l = prof?.locale ?? "en";
      return void (await sendDirect(from, { type: "buttons", body: w(l, "match_prompt", { name: match.name, email: match.email }), buttons: [{ id: `lk:yes:${match.userId}`, title: w(l, "btn_connect") }, { id: "lk:no", title: w(l, "btn_not_me") }] }));
    }
  }

  const code = parseInviteCode(text);
  if (code?.kind === "doctor") {
    const { data: doc } = await admin.from("doctors").select("name").eq("code", code.code).maybeSingle();
    if (doc) return void (await sendDirect(from, { type: "buttons", body: w("en", "welcome_doctor", { doctor: doc.name }), buttons: startButtons("en", `ob:start:dr:${code.code}`) }));
  }
  if (code?.kind === "family") {
    const inv = await F.findFamilyInvite(admin, code.code);
    if (inv) {
      const { data: p } = await admin.from("profiles").select("locale").eq("id", inv.patient_id).single();
      const l = p?.locale ?? "en";
      return void (await sendDirect(from, { type: "buttons", body: w(l, "welcome_family", { name: inv.name }), buttons: startButtons(l, `ob:start:fam:${code.code}:${l}`) }));
    }
    return void (await sendDirect(from, { type: "text", body: w("en", "family_invalid") }));
  }
  if (code?.kind === "circle") return void (await sendDirect(from, { type: "buttons", body: w("en", "welcome_circle"), buttons: startButtons("en", `ob:start:join:${code.code}`) }));
  if (parseCommand(text) === "register_doctor") return void (await sendDirect(from, { type: "buttons", body: d("welcome").split("\n\n").slice(0, 2).join("\n\n"), buttons: [{ id: "ob:start:doc", title: "Start as doctor" }, { id: "ob:no", title: "Not now" }] }));
  await sendDirect(from, { type: "buttons", body: w("en", "welcome_new"), buttons: startButtons("en", "ob:start", { id: "ob:web", title: w("en", "btn_web") }) });
}

async function linkExisting(admin: AdminClient, from: string, code: string) {
  const hash = await hashLinkCode(code, process.env.LINK_CODE_PEPPER!);
  const { data: r } = await admin.rpc("consume_link_code", { p_code_hash: hash, p_external_id: from });
  const res = r as { ok: boolean; reason: string; user_id?: string; binding_id?: string };
  if (res.ok && res.user_id && res.binding_id) {
    const profile = await getProfile(admin, res.user_id);
    await admin.from("consents").upsert({ user_id: res.user_id, kind: "whatsapp", granted: true, granted_at: new Date().toISOString(), revoked_at: null }, { onConflict: "user_id,kind" });
    const ctx: WaCtx = { admin, userId: res.user_id, bindingId: res.binding_id, to: from, locale: profile.locale, key: `link:${hash.slice(0, 16)}`, n: 0 };
    await send(ctx, { type: "buttons", body: reply(profile.locale, res.reason === "already_linked" ? "link_already" : "link_ok"), buttons: [{ id: "m:today", title: w(profile.locale, "row_today") }, { id: "m:menu", title: w(profile.locale, "btn_menu") }] });
    return;
  }
  const key = ({ invalid_or_expired: "link_invalid", number_bound_to_other_account: "link_other", rebind_confirmation_required: "link_rebind", rate_limited: "link_rate" } as const)[res.reason as "invalid_or_expired"] ?? "link_invalid";
  await sendWhatsAppText(from, reply("en", key));
}

/** "Start" tapped: create the account, then continue with what brought them here. */
async function startAccount(admin: AdminClient, msg: InboundMessage, id: string) {
  const [, , kind, code, lang] = id.split(":");
  const role = kind === "doc" ? "doctor" : kind === "fam" ? "family" : "patient";
  const { userId, bindingId } = await createWaAccount(admin, msg.from, role);
  const locale = lang === "hi" || lang === "mr" ? lang : "en";
  if (locale !== "en") await admin.from("profiles").update({ locale }).eq("id", userId);
  const ctx: WaCtx = { admin, userId, bindingId, to: msg.from, locale, key: msg.id, n: 0 };
  await admin.from("messages").upsert({ user_id: userId, role: "user", channel: "whatsapp", content: msg.text || "Start", provider_message_id: msg.id }, { onConflict: "provider_message_id", ignoreDuplicates: true });
  if (role === "doctor") return D.startDoctorSignup(ctx);
  const data: StateData = { kind: kind ?? null, code: code ?? null };
  if (role === "family") {
    // Language comes from the patient's invite; ask the name straight away.
    await setState(admin, bindingId, "ob_name", data);
    return send(ctx, { type: "text", body: w(locale, "ask_name") });
  }
  await setState(admin, bindingId, "ob_lang", data);
  await send(ctx, { type: "buttons", body: w("en", "ask_lang"), buttons: [{ id: "ob:lang:en", title: "English" }, { id: "ob:lang:hi", title: "हिंदी" }, { id: "ob:lang:mr", title: "मराठी" }] });
}

/** After the name: family joins, doctor patients consent, circle invites join, then the plan. */
async function afterName(ctx: WaCtx, data: StateData) {
  const kind = data.kind ? String(data.kind) : null;
  const code = data.code ? String(data.code) : null;
  if (kind === "fam" && code) {
    const r = await F.acceptFamily(ctx.admin, ctx.userId, code);
    await clearState(ctx.admin, ctx.bindingId);
    await ctx.admin.from("profiles").update({ onboarded_at: new Date().toISOString(), primary_role: "family" }).eq("id", ctx.userId);
    if (!r.ok) return send(ctx, { type: "buttons", body: w(ctx.locale, r.reason === "self" ? "family_self" : "family_invalid"), buttons: [{ id: "fm:own", title: w(ctx.locale, "row_own_plan") }] });
    await send(ctx, { type: "text", body: w(ctx.locale, "family_joined_member", { name: r.name }) });
    return F.showFollow(ctx, r.accessId);
  }
  if (kind === "dr" && code) {
    const { data: doc } = await ctx.admin.from("doctors").select("user_id").eq("code", code).maybeSingle();
    if (doc) {
      await clearState(ctx.admin, ctx.bindingId);
      return P.askDoctorConsent(ctx, doc.user_id);
    }
  }
  if (kind === "join" && code) await P.joinCircleCode(ctx, code, true);
  return P.askPath(ctx);
}

// ---------------------------------------------------------------------------
// STOP / PAUSE / START
// ---------------------------------------------------------------------------
async function channelCommand(admin: AdminClient, binding: Binding, userId: string, from: string, locale: string, command: "stop" | "pause" | "start") {
  if (command === "stop") {
    await admin.from("channel_bindings").update({ status: "paused", opted_out_at: new Date().toISOString() }).eq("id", binding.id);
    await admin.from("consents").upsert({ user_id: userId, kind: "whatsapp", granted: false, revoked_at: new Date().toISOString() }, { onConflict: "user_id,kind" });
    await audit(admin, userId, "user", "whatsapp_opt_out", "channel_binding", binding.id);
    await sendWhatsAppText(from, reply(locale, "stopped"));
  } else if (command === "pause") {
    await admin.from("channel_bindings").update({ status: "paused" }).eq("id", binding.id);
    await sendWhatsAppText(from, reply(locale, "paused"));
  } else {
    await admin.from("channel_bindings").update({ status: "active", opted_out_at: null }).eq("id", binding.id);
    await admin.from("consents").upsert({ user_id: userId, kind: "whatsapp", granted: true, granted_at: new Date().toISOString(), revoked_at: null }, { onConflict: "user_id,kind" });
    await audit(admin, userId, "user", "whatsapp_opt_in", "channel_binding", binding.id);
    await sendWhatsAppText(from, reply(locale, "started"));
  }
}

// ---------------------------------------------------------------------------
// Taps
// ---------------------------------------------------------------------------
const UUID = /^[0-9a-f-]{36}$/i;

async function handleTap(ctx: WaCtx, id: string, binding: Binding): Promise<void> {
  const parts = id.split(":");
  const [ns, a, b, c] = parts;
  const st = currentState(binding);

  if (ns === "m") return a === "addplan" ? P.askPath(ctx) : view(ctx, a);
  if (ns === "lk") {
    if (a === "merge" && UUID.test(b ?? "")) return mergeMatched(ctx, b);
    if (a === "no") {
      await audit(ctx.admin, ctx.userId, "user", "wa_match_declined", "phone", ctx.to);
      return P.showMenu(ctx);
    }
  }
  if (ns === "ap" && UUID.test(a ?? "")) return P.askAppeal(ctx, a);
  if (ns === "aps" && UUID.test(a ?? "")) return P.fileAppeal(ctx, a, null);
  if (ns === "rf" && UUID.test(a ?? "")) return P.askReadingFix(ctx, a);
  if (ns === "tn") return P.saveTone(ctx, a ?? "");
  if (ns === "rm") return P.saveReminders(ctx, a ?? "");
  if (ns === "pe") return a === "list" || !UUID.test(a ?? "") ? P.pickEdit(ctx) : P.showItem(ctx, a);
  if (ns === "pt" && UUID.test(a ?? "")) return P.askTime(ctx, a);
  if (ns === "pp" && UUID.test(a ?? "")) return P.setItemStatus(ctx, a, "paused");
  if (ns === "pr" && UUID.test(a ?? "")) return P.setItemStatus(ctx, a, "confirmed");
  if (ns === "px" && UUID.test(a ?? "")) return P.setItemStatus(ctx, a, "retired");
  if (ns === "ci") {
    if (a === "pick" && (b === "done" || b === "later" || b === "skipped")) return P.pickTask(ctx, b);
    if ((a === "done" || a === "later" || a === "skipped" || a === "unable") && UUID.test(b ?? "")) return P.checkInTap(ctx, a, b);
  }
  if (ns === "pf" && UUID.test(a ?? "")) return P.askProof(ctx, a);
  if (ns === "ob") {
    if (a === "lang" && ["en", "hi", "mr"].includes(b)) {
      await ctx.admin.from("profiles").update({ locale: b as "en" | "hi" | "mr" }).eq("id", ctx.userId);
      ctx.locale = b;
      await setState(ctx.admin, ctx.bindingId, "ob_name", st?.data ?? {});
      return send(ctx, { type: "text", body: w(b, "ask_name") });
    }
    if (a === "path" && (b === "rx" || b === "pack" || b === "words")) return P.choosePath(ctx, b);
    if (a === "pack") return P.addPack(ctx, b);
    if (a === "start") return P.showMenu(ctx); // already has an account
  }
  if (ns === "rx" && UUID.test(b ?? "")) {
    if (a === "ok") return P.confirmDrafts(ctx, b);
    if (a === "fix") return P.askFix(ctx, b);
  }
  if (ns === "dc") {
    if (a === "yes" && UUID.test(b ?? "")) {
      const name = await P.linkDoctor(ctx, b);
      const prefix = name ? w(ctx.locale, "doctor_linked", { doctor: name }) : undefined;
      if (await hasActivePlan(ctx.admin, ctx.userId)) return P.showToday(ctx, prefix);
      if (prefix) await send(ctx, { type: "text", body: prefix });
      return P.choosePath(ctx, "rx");
    }
    if (a === "no") {
      await send(ctx, { type: "text", body: w(ctx.locale, "doctor_declined") });
      return (await hasActivePlan(ctx.admin, ctx.userId)) ? P.showMenu(ctx) : P.askPath(ctx);
    }
  }
  if (ns === "ds" && a === "stop" && UUID.test(b ?? "")) return P.stopSharing(ctx, b);
  if (ns === "fm") {
    if (a === "add") return F.addFamily(ctx);
    if (a === "rm" && UUID.test(b ?? "")) return F.removeFamily(ctx, b);
    if (a === "see" && UUID.test(b ?? "")) return F.showFollow(ctx, b);
    if (a === "cheer" && UUID.test(b ?? "")) return F.cheer(ctx, b);
    if (a === "own") {
      await grantPatientConsents(ctx.admin, ctx.userId);
      await ctx.admin.from("profiles").update({ primary_role: "patient" }).eq("id", ctx.userId);
      return P.askPath(ctx);
    }
  }
  if (ns === "cl") {
    if (a === "invite" && UUID.test(b ?? "")) return P.inviteCircle(ctx, b);
    if (a === "join") {
      await setState(ctx.admin, ctx.bindingId, "cl_join");
      return send(ctx, { type: "text", body: w(ctx.locale, "circle_ask_code") });
    }
    if (a === "list") return P.listCircles(ctx);
    if (a === "v" && UUID.test(b ?? "")) return P.showCircle(ctx, b);
  }
  if (ns === "st") {
    if (a === "lang" && ["en", "hi", "mr"].includes(b)) {
      await ctx.admin.from("profiles").update({ locale: b as "en" | "hi" | "mr" }).eq("id", ctx.userId);
      ctx.locale = b;
      return send(ctx, { type: "buttons", body: w(b, "lang_saved"), buttons: [{ id: "m:menu", title: w(b, "btn_menu") }] });
    }
    if (a === "pause" || a === "stop") return channelCommand(ctx.admin, binding, ctx.userId, ctx.to, ctx.locale, a);
    if (a === "langs") return P.showLanguages(ctx);
    if (a === "tone") return P.askTone(ctx);
    if (a === "rem") return P.askReminders(ctx);
    if (a === "quiet") return P.askQuiet(ctx);
    if (a === "web") return send(ctx, { type: "text", body: w(ctx.locale, "web_login_link", { link: await webLoginLink(ctx.admin, ctx.userId, ctx.to) }) });
    if (a === "link") return send(ctx, { type: "text", body: w(ctx.locale, "web_connect_link", { link: await createConnectLink(ctx.admin, ctx.to) }) });
  }
  if (ns === "dr") {
    if (a === "m") {
      if (b === "patients") return D.showPatients(ctx);
      if (b === "share") return D.shareLink(ctx);
      if (b === "reward") return D.showReward(ctx);
      if (b === "redeem") return D.askRedeem(ctx);
      if (b === "help") return send(ctx, { type: "buttons", body: d("help"), buttons: [{ id: "dr:m:menu", title: "Menu" }] });
      return D.showDoctorMenu(ctx);
    }
    if (a === "clinic" && b === "skip" && st?.state === "dr_clinic") return D.doctorClinic(ctx, String(st.data.name ?? ""), null);
    if (a === "rw" && b) return D.rewardTap(ctx, b, st?.state === "dr_reward" && !!st.data.signup);
    if (a === "p" && UUID.test(b ?? "")) return D.showPatient(ctx, b);
    if (a === "note" && UUID.test(b ?? "")) return D.askNote(ctx, b);
    if (a === "chg" && UUID.test(b ?? "")) return D.askNote(ctx, b, true);
    if (a === "rv" && UUID.test(b ?? "") && UUID.test(c ?? "")) return D.reviewPlan(ctx, b, c);
    if (a === "ok" && UUID.test(b ?? "") && UUID.test(c ?? "")) return D.approvePlan(ctx, b, c);
  }
  // Unknown or stale tap: show the right menu.
  const { data: p } = await ctx.admin.from("profiles").select("primary_role").eq("id", ctx.userId).single();
  return p?.primary_role === "doctor" ? D.showDoctorMenu(ctx) : P.showMenu(ctx);
}

async function view(ctx: WaCtx, name: string) {
  switch (name) {
    case "today": return P.showToday(ctx);
    case "plan": return P.showPlan(ctx);
    case "proof": return P.pickTask(ctx, "proof");
    case "progress": return P.showProgress(ctx);
    case "circle": return P.showCircle(ctx);
    case "doctor": return P.showMyDoctor(ctx);
    case "family": return F.showFamily(ctx);
    case "settings": return P.showSettings(ctx);
    case "help": return P.showHelp(ctx);
    default: return P.showMenu(ctx);
  }
}

async function command(ctx: WaCtx, cmd: NonNullable<ReturnType<typeof parseCommand>>, role: string) {
  if (cmd === "register_doctor") {
    // "doctor" from a patient means their own doctor; registering needs a fresh number.
    return P.showMyDoctor(ctx);
  }
  if (role === "family" && ["today", "plan", "progress", "proof"].includes(cmd)) return P.showMenu(ctx);
  return view(ctx, cmd === "menu" ? "menu" : cmd);
}

// ---------------------------------------------------------------------------
// Open questions
// ---------------------------------------------------------------------------
async function handleStateText(ctx: WaCtx, state: string, data: StateData, text: string): Promise<boolean> {
  switch (state) {
    case "ob_lang":
    case "ob_name": {
      const name = cleanName(text);
      if (!name) {
        await send(ctx, { type: "text", body: w(ctx.locale, "name_invalid") });
        return true;
      }
      await ctx.admin.from("profiles").update({ display_name: name }).eq("id", ctx.userId);
      await afterName(ctx, data);
      return true;
    }
    case "ob_path": // typed a goal instead of tapping a button
    case "ob_words":
      await clearState(ctx.admin, ctx.bindingId);
      await P.planFromWords(ctx, text);
      return true;
    case "rx_fix":
      if (data.asked && data.planId) {
        await P.applyFix(ctx, String(data.planId), text);
        return true;
      }
      return false;
    case "cl_join":
      if (/\d{5}/.test(text)) {
        await P.joinCircleCode(ctx, text.match(/\d{5}/)![0]);
        return true;
      }
      await clearState(ctx.admin, ctx.bindingId);
      return false;
    case "dr_name":
      await D.doctorName(ctx, text);
      return true;
    case "dr_clinic":
      await D.doctorClinic(ctx, String(data.name ?? ""), text);
      return true;
    case "dr_reward":
      await D.setReward(ctx, text, !!data.signup);
      return true;
    case "dr_note":
      if (data.linkId) await D.sendNote(ctx, String(data.linkId), text, !!data.review);
      return true;
    case "quiet":
      return P.saveQuiet(ctx, text);
    case "appeal":
      if (data.evaluationId) await P.fileAppeal(ctx, String(data.evaluationId), text);
      return true;
    case "reading_fix":
      if (data.readingId) await P.fixReading(ctx, String(data.readingId), text);
      return true;
    case "pe_time":
      return data.itemId ? P.saveTime(ctx, String(data.itemId), text) : false;
    case "dr_redeem":
      await D.redeem(ctx, text);
      return true;
    default:
      return false;
  }
}

// ---------------------------------------------------------------------------
// Invite codes from people who already have an account
// ---------------------------------------------------------------------------
async function inviteForExisting(ctx: WaCtx, code: InviteCode, role: string) {
  if (code.kind === "circle") return P.joinCircleCode(ctx, code.code);
  if (code.kind === "family") {
    const r = await F.acceptFamily(ctx.admin, ctx.userId, code.code);
    if (!r.ok) return send(ctx, { type: "buttons", body: w(ctx.locale, r.reason === "self" ? "family_self" : "family_invalid"), buttons: [{ id: "m:menu", title: w(ctx.locale, "btn_menu") }] });
    await send(ctx, { type: "text", body: w(ctx.locale, "family_joined_member", { name: r.name }) });
    return F.showFollow(ctx, r.accessId);
  }
  if (role === "doctor") return send(ctx, { type: "text", body: d("already_patient_side") });
  const { data: doc } = await ctx.admin.from("doctors").select("user_id").eq("code", code.code).maybeSingle();
  if (!doc) return send(ctx, { type: "text", body: w(ctx.locale, "doctor_invalid") });
  if (role === "family") await grantPatientConsents(ctx.admin, ctx.userId);
  return P.askDoctorConsent(ctx, doc.user_id);
}

// ---------------------------------------------------------------------------
// Web link code from a number that already has an account
// ---------------------------------------------------------------------------
async function boundLinkCode(ctx: WaCtx, code: string) {
  const r = await consumeCodeForBoundNumber(ctx.admin, await hashLinkCode(code, process.env.LINK_CODE_PEPPER!), ctx.to);
  if (r.result === "invalid") return send(ctx, { type: "text", body: w(ctx.locale, "web_link_invalid") });
  if (r.result === "other_account") return send(ctx, { type: "text", body: w(ctx.locale, "web_other_account") });
  // The binding now belongs to the web account: answer as that account.
  const profile = await getProfile(ctx.admin, r.userId!);
  const next: WaCtx = { ...ctx, userId: r.userId!, locale: profile.locale };
  await send(next, { type: "buttons", body: w(profile.locale, r.result === "merged" ? "web_merged" : "web_connected", { name: profile.display_name?.split(" ")[0] ?? "" }), buttons: [{ id: "m:today", title: w(profile.locale, "row_today") }, { id: "m:menu", title: w(profile.locale, "btn_menu") }] });
}

// ---------------------------------------------------------------------------
// Phone match: connect a new number, or join a WhatsApp-made account into the web one
// ---------------------------------------------------------------------------
async function connectMatched(admin: AdminClient, msg: InboundMessage, webUserId: string): Promise<void> {
  // Check again that this number is still the one saved on that account.
  const match = await findWebMatch(admin, msg.from);
  if (!match || match.userId !== webUserId) return handleNewNumber(admin, { ...msg, replyId: undefined, text: "hi" });
  await connectNumber(admin, webUserId, msg.from);
  await welcomeLinked(admin, webUserId, msg, "web_connected");
}

async function mergeMatched(ctx: WaCtx, webUserId: string) {
  const match = await findWebMatch(ctx.admin, ctx.to, ctx.userId);
  if (!match || match.userId !== webUserId) return P.showMenu(ctx);
  await connectNumber(ctx.admin, webUserId, ctx.to);
  await welcomeLinked(ctx.admin, webUserId, { id: ctx.key, from: ctx.to } as InboundMessage, "web_merged");
}

async function welcomeLinked(admin: AdminClient, userId: string, msg: Pick<InboundMessage, "id" | "from">, key: "web_connected" | "web_merged") {
  const { data: b } = await admin.from("channel_bindings").select("id").eq("user_id", userId).eq("external_id", msg.from).neq("status", "revoked").single();
  const profile = await getProfile(admin, userId);
  const ctx: WaCtx = { admin, userId, bindingId: b!.id, to: msg.from, locale: profile.locale, key: `${msg.id}:linked`, n: 0 };
  await send(ctx, { type: "buttons", body: w(profile.locale, key, { name: profile.display_name?.split(" ")[0] ?? "" }), buttons: [{ id: "m:today", title: w(profile.locale, "row_today") }, { id: "m:menu", title: w(profile.locale, "btn_menu") }] });
}
