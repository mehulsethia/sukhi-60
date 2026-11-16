import "server-only";
// Durable worker. Invoked by Supabase Cron (pg_cron + pg_net -> /api/worker/tick, bearer
// secret) every minute, by the authenticated manual trigger, and right after a webhook via
// after(). All work is claimed with leases from the jobs table; handlers are idempotent.
import type { AdminClient } from "@/lib/supabase/admin";
import type { Database, Json } from "@/lib/database.types";
import { LIMITS, settings } from "@/lib/config";
import { audit, getConsents, getProfile, getToday, materializeOccurrences, pickRelevantOccurrence } from "./core";
import { runAssistant } from "./agent";
import { evaluateEvidence } from "./ai-tasks";
import { fetchWhatsAppMedia, sendWhatsAppTemplate, sendWhatsAppText, transcribe, type SendResult } from "./providers";
import { decideSend, parseWebhook, type InboundMessage } from "@/domain/whatsapp";
import { hashLinkCode, routeMessage, sha256Hex } from "@/domain/router";
import { reply } from "@/domain/replies";
import { inQuietHours, localTimeOf, reminderSendTime } from "@/domain/schedule";
import { runCheckins } from "./checkins";
import { cleanupOrphanVideos } from "./cleanup";
import { sendPush } from "./push";
import { reminderCopy } from "@/domain/tone";
import { resumePausedPlans, runInactivityAlerts } from "./companion";

type Job = Database["public"]["Tables"]["jobs"]["Row"];
type Outcome = "done" | "retry" | "dead" | "cancelled";

class PermanentError extends Error {}
class CancelJob extends Error {}

export async function runWorkerTick(admin: AdminClient, workerId: string) {
  const summary = { silence: 0, generation_enqueued: 0, claimed: 0, done: 0, retried: 0, dead: 0, cancelled: 0, checkins: 0, videos_removed: 0, plans_resumed: 0, family_alerts: 0 };
  const { data: silenced } = await admin.rpc("apply_silence_rule", { p_limit: 500 });
  summary.silence = Number(silenced ?? 0);
  // Proactive assistant check-ins due in this minute (bounded batch; next tick picks up the rest).
  summary.checkins = await runCheckins(admin).catch(() => 0);
  // Housekeeping once an hour: remove video uploads that never became evidence.
  if (new Date().getUTCMinutes() === 17) summary.videos_removed = await cleanupOrphanVideos(admin).catch(() => 0);
  // Plans paused "until a date" come back on that date (user's timezone), before occurrences are generated.
  summary.plans_resumed = await resumePausedPlans(admin).catch(() => 0);
  // Once an hour: consented family "no activity" alerts.
  if (new Date().getUTCMinutes() === 23) summary.family_alerts = await runInactivityAlerts(admin).catch(() => 0);

  // Daily occurrence generation per user with confirmed items (dedupe per UTC day).
  const { data: users } = await admin.from("plan_items").select("user_id").eq("status", "confirmed").limit(1000);
  const day = new Date().toISOString().slice(0, 10);
  const genJobs = Array.from(new Set((users ?? []).map((u) => u.user_id))).map((uid) => ({ user_id: uid, kind: "generate_occurrences" as const, dedupe_key: `gen:${uid}:${day}`, payload: {} }));
  if (genJobs.length) {
    const { data } = await admin.from("jobs").upsert(genJobs, { onConflict: "dedupe_key", ignoreDuplicates: true }).select("id");
    summary.generation_enqueued = data?.length ?? 0;
  }

  const { data: jobs, error } = await admin.rpc("claim_jobs", { p_worker: workerId, p_limit: LIMITS.workerBatch, p_lease_seconds: LIMITS.workerLeaseSeconds });
  if (error) throw new Error(`claim_failed:${error.message}`);
  summary.claimed = jobs?.length ?? 0;
  for (const job of jobs ?? []) {
    const o = await executeJob(admin, job, workerId);
    if (o === "done") summary.done++;
    else if (o === "retry") summary.retried++;
    else if (o === "dead") summary.dead++;
    else summary.cancelled++;
  }
  return summary;
}

/** Process one specific job now if it is still queued (used after webhook acknowledgement). */
export async function runJobNow(admin: AdminClient, jobId: string, workerId: string): Promise<Outcome | "not_claimed"> {
  const { data } = await admin.rpc("claim_job", { p_job: jobId, p_worker: workerId, p_lease_seconds: LIMITS.workerLeaseSeconds });
  const job = data?.[0];
  if (!job) return "not_claimed";
  return executeJob(admin, job, workerId);
}

async function executeJob(admin: AdminClient, job: Job, workerId: string): Promise<Outcome> {
  try {
    switch (job.kind) {
      case "reminder":
        await handleReminder(admin, job);
        break;
      case "process_inbound":
        await handleInbound(admin, job);
        break;
      case "evaluate_evidence":
        await evaluateEvidence(admin, job.user_id!, String((job.payload as { evidence_id: string }).evidence_id));
        break;
      case "generate_occurrences":
        if (job.user_id) await materializeOccurrences(admin, job.user_id, 7);
        break;
      case "send_outbound":
        await handleOutbound(admin, job);
        break;
      case "apply_silence_rule":
        await admin.rpc("apply_silence_rule", { p_limit: 2000 });
        break;
    }
    await admin.rpc("complete_job", { p_job: job.id, p_worker: workerId });
    return "done";
  } catch (e) {
    if (e instanceof CancelJob) {
      await admin.rpc("cancel_job", { p_job: job.id, p_worker: workerId, p_reason: e.message });
      return "cancelled";
    }
    const msg = (e instanceof Error ? e.message : "error").replace(/\d{8,}/g, "[n]").slice(0, 300); // redact long numbers (phone ids)
    const { data: status } = await admin.rpc("fail_job", { p_job: job.id, p_worker: workerId, p_error: msg, p_permanent: e instanceof PermanentError });
    return status === "dead" ? "dead" : "retry";
  }
}

// ---------------------------------------------------------------------------
// Reminders
// ---------------------------------------------------------------------------
async function handleReminder(admin: AdminClient, job: Job) {
  const p = job.payload as { occurrence_id: string; item_id: string; plan_id: string };
  const userId = job.user_id!;
  const { data: occ } = await admin.from("action_occurrences").select("*, plan_items!inner(id, title, category, status, version, care_plans!inner(status, mode))").eq("id", p.occurrence_id).eq("user_id", userId).maybeSingle();
  if (!occ) throw new CancelJob("occurrence_gone");
  const item = occ.plan_items as unknown as { title: string; category: string; status: string; version: number; care_plans: { status: string; mode: string } };
  if (!["pending", "due", "awaiting_response", "later"].includes(occ.status)) throw new CancelJob("already_answered");
  if (item.status !== "confirmed" || item.care_plans.status !== "active") throw new CancelJob("plan_paused_or_changed");
  if (job.plan_item_version !== null && job.plan_item_version !== item.version) throw new CancelJob("plan_version_changed");
  if (new Date(occ.window_end_at) < new Date()) throw new CancelJob("window_elapsed");

  const profile = await getProfile(admin, userId);
  const consents = await getConsents(admin, userId);
  if (!consents.reminders || profile.reminder_frequency === "off") throw new CancelJob("reminders_disabled");

  const quiet = inQuietHours(localTimeOf(new Date(), profile.timezone), profile.quiet_start, profile.quiet_end);
  if (quiet) {
    // Preferences changed since scheduling: move the reminder (not the action) to quiet end.
    const { sendAt } = reminderSendTime(new Date(), profile.timezone, profile.quiet_start, profile.quiet_end);
    if (sendAt < new Date(occ.window_end_at)) {
      await admin.from("jobs").upsert({ user_id: userId, kind: "reminder", run_at: sendAt.toISOString(), plan_item_version: job.plan_item_version, dedupe_key: `${job.dedupe_key}:quiet`, payload: job.payload }, { onConflict: "dedupe_key", ignoreDuplicates: true });
    }
    throw new CancelJob("quiet_hours_deferred");
  }

  if (occ.status !== "later" || (occ.snooze_until && new Date(occ.snooze_until) <= new Date())) {
    await admin.from("action_occurrences").update({ status: "awaiting_response", status_changed_at: new Date().toISOString() }).eq("id", occ.id).in("status", ["pending", "due", "later"]);
  }

  // Outcome-led copy in the person's tone: why it matters, not just what is due.
  // Lines from the last few reminders are skipped so back-to-back notifications don't repeat.
  const { data: recentNotices } = await admin.from("messages").select("content").eq("user_id", userId).eq("role", "notice").order("created_at", { ascending: false }).limit(6);
  const copy = reminderCopy({ locale: profile.locale, styles: profile.communication_styles, task: item.title, category: item.category, planMode: item.care_plans.mode, motivation: profile.personal_motivation, seed: occ.id, recent: (recentNotices ?? []).map((m) => m.content as string) });
  // In-app record (kept for history and the bell; the chat no longer shows reminder notices).
  await admin.from("messages").insert({ user_id: userId, role: "notice", channel: "system", content: `${copy.title} · ${copy.body}`.slice(0, 400), source_refs: [{ type: "occurrence", id: occ.id, label: item.title }] });
  // Phone notification on any device the user turned them on for (same quiet-hours check as above).
  await sendPush(admin, userId, { title: copy.title, body: copy.body, url: "/today", tag: `occ-${occ.id}` }).catch(() => 0);

  const { data: binding } = await admin.from("channel_bindings").select("id, external_id, status, last_inbound_at").eq("user_id", userId).neq("status", "revoked").maybeSingle();
  const decision = decideSend({ binding, consentWhatsapp: !!consents.whatsapp, approvedTemplates: settings.approvedTemplates(), quiet: false });
  if (decision.kind === "blocked" || !binding) return; // web-only reminder

  const sendJob = await enqueueOutbound(admin, userId, binding.id, {
    kind: decision.kind,
    template: decision.template,
    // Lock-screen-friendly: only the item title inside an active conversation; templates are generic.
    body: decision.kind === "free_text" ? reply(profile.locale, "reminder", { title: item.title }) : `[template:${decision.template}]`,
    dedupeKey: `out:${job.dedupe_key}`,
  });
  // Send now; the queued send job remains the durable fallback.
  if (sendJob) await runJobNow(admin, sendJob, `inline-${crypto.randomUUID()}`);
}

// ---------------------------------------------------------------------------
// Outbound (outbox with uncertain-delivery handling)
// ---------------------------------------------------------------------------
export async function enqueueOutbound(admin: AdminClient, userId: string, bindingId: string, m: { kind: "free_text" | "template"; template?: string; body: string; dedupeKey: string }) {
  const { data: row } = await admin
    .from("outbound_messages")
    .upsert({ user_id: userId, binding_id: bindingId, kind: m.kind, template_name: m.template ?? null, body: m.body, dedupe_key: m.dedupeKey }, { onConflict: "dedupe_key", ignoreDuplicates: true })
    .select("id")
    .maybeSingle();
  if (!row) return null; // already enqueued earlier
  const { data: job } = await admin.from("jobs").upsert({ user_id: userId, kind: "send_outbound", payload: { outbound_id: row.id }, dedupe_key: `send:${row.id}`, max_attempts: 4 }, { onConflict: "dedupe_key", ignoreDuplicates: true }).select("id").maybeSingle();
  return job?.id ?? null;
}

async function handleOutbound(admin: AdminClient, job: Job) {
  const { outbound_id } = job.payload as { outbound_id: string };
  const { data: out } = await admin.from("outbound_messages").select("*, channel_bindings(external_id, status, last_inbound_at)").eq("id", outbound_id).single();
  if (!out) throw new CancelJob("outbound_gone");
  if (["sent", "delivered", "read", "uncertain", "cancelled"].includes(out.status)) return; // never resend
  const b = out.channel_bindings as unknown as { external_id: string; status: string; last_inbound_at: string | null } | null;
  if (!b || b.status !== "active") {
    await admin.from("outbound_messages").update({ status: "cancelled", error_code: "binding_inactive" }).eq("id", out.id);
    return;
  }
  const profile = await getProfile(admin, out.user_id);
  await admin.from("outbound_messages").update({ status: "sending", attempts: out.attempts + 1 }).eq("id", out.id);

  let r: SendResult;
  if (out.kind === "template") {
    const lang = settings.templateLanguages().includes(profile.locale) ? profile.locale : "en";
    r = await sendWhatsAppTemplate(b.external_id, out.template_name!, lang);
  } else {
    r = await sendWhatsAppText(b.external_id, out.body);
  }

  if (r.state === "sent") {
    await admin.from("outbound_messages").update({ status: "sent", provider_message_id: r.providerMessageId, error_code: null }).eq("id", out.id);
  } else if (r.state === "uncertain") {
    // Possibly accepted by Meta. Do not resend automatically; surface for reconciliation.
    await admin.from("outbound_messages").update({ status: "uncertain", error_code: r.code }).eq("id", out.id);
    await audit(admin, out.user_id, "worker", "outbound_uncertain", "outbound_message", out.id, { code: r.code });
  } else if (r.state === "unconfigured") {
    await admin.from("outbound_messages").update({ status: "failed", error_code: "whatsapp_unconfigured" }).eq("id", out.id);
    throw new PermanentError("whatsapp_unconfigured");
  } else {
    await admin.from("outbound_messages").update({ status: "failed", error_code: r.code }).eq("id", out.id);
    if (r.retryable) {
      await admin.from("outbound_messages").update({ status: "queued" }).eq("id", out.id);
      throw new Error(`send_failed_retryable:${r.code}`);
    }
    throw new PermanentError(`send_failed:${r.code}`);
  }
}

// ---------------------------------------------------------------------------
// Inbound WhatsApp processing
// ---------------------------------------------------------------------------
async function replyTo(admin: AdminClient, userId: string | null, bindingId: string | null, to: string, text: string, key: string) {
  if (userId && bindingId) {
    const jobId = await enqueueOutbound(admin, userId, bindingId, { kind: "free_text", body: text, dedupeKey: `reply:${key}` });
    await admin.from("messages").insert({ user_id: userId, role: "assistant", channel: "whatsapp", content: text.slice(0, 8000) });
    // Send now; if this fails the queued send job is retried by the scheduled worker.
    if (jobId) await runJobNow(admin, jobId, `inline-${crypto.randomUUID()}`);
    return jobId;
  }
  // Unlinked number replying within its own 24h window: send directly, no patient data involved.
  await sendWhatsAppText(to, text);
  return null;
}

async function handleInbound(admin: AdminClient, job: Job) {
  const { inbound_event_id } = job.payload as { inbound_event_id: string };
  const { data: ev } = await admin.from("inbound_events").select("*").eq("id", inbound_event_id).single();
  if (!ev) throw new CancelJob("event_gone");
  if (ev.status === "processed" || ev.status === "ignored") return;
  const msg = ev.payload as unknown as InboundMessage;
  const from = msg.from;

  const { data: binding } = await admin.from("channel_bindings").select("*").eq("channel", "whatsapp").eq("external_id", from).neq("status", "revoked").maybeSingle();
  if (binding) {
    await admin.from("channel_bindings").update({ last_inbound_at: new Date(Math.max(msg.timestamp * 1000, Date.now() - 60_000)).toISOString() }).eq("id", binding.id);
  }

  const text = msg.text ?? msg.caption ?? "";
  const routed = text ? routeMessage(text, { channel: "whatsapp" }) : null;

  if (!binding) {
    if (routed?.route === "link_code") {
      const hash = await hashLinkCode(routed.code, process.env.LINK_CODE_PEPPER!);
      const { data: r } = await admin.rpc("consume_link_code", { p_code_hash: hash, p_external_id: from });
      const res = r as { ok: boolean; reason: string; user_id?: string; binding_id?: string };
      if (res.ok && res.user_id) {
        const profile = await getProfile(admin, res.user_id);
        await admin.from("consents").upsert({ user_id: res.user_id, kind: "whatsapp", granted: true, granted_at: new Date().toISOString(), revoked_at: null }, { onConflict: "user_id,kind" });
        await replyTo(admin, res.user_id, res.binding_id!, from, reply(profile.locale, res.reason === "already_linked" ? "link_already" : "link_ok"), msg.id);
      } else {
        const key = { invalid_or_expired: "link_invalid", number_bound_to_other_account: "link_other", rebind_confirmation_required: "link_rebind", rate_limited: "link_rate" }[res.reason] ?? "link_invalid";
        await sendWhatsAppText(from, reply("en", key as "link_invalid"));
      }
    } else {
      await sendWhatsAppText(from, reply("en", "not_linked"));
    }
    await admin.from("inbound_events").update({ status: "processed", processed_at: new Date().toISOString() }).eq("id", ev.id);
    return;
  }

  const userId = binding.user_id;
  const profile = await getProfile(admin, userId);
  const locale = profile.locale;

  if (routed?.route === "channel_command") {
    if (routed.command === "stop") {
      await admin.from("channel_bindings").update({ status: "paused", opted_out_at: new Date().toISOString() }).eq("id", binding.id);
      await admin.from("consents").upsert({ user_id: userId, kind: "whatsapp", granted: false, revoked_at: new Date().toISOString() }, { onConflict: "user_id,kind" });
      await audit(admin, userId, "user", "whatsapp_opt_out", "channel_binding", binding.id);
      await sendWhatsAppText(from, reply(locale, "stopped")); // single confirmation of opt-out
    } else if (routed.command === "pause") {
      await admin.from("channel_bindings").update({ status: "paused" }).eq("id", binding.id);
      await sendWhatsAppText(from, reply(locale, "paused"));
    } else {
      await admin.from("channel_bindings").update({ status: "active", opted_out_at: null }).eq("id", binding.id);
      await admin.from("consents").upsert({ user_id: userId, kind: "whatsapp", granted: true, granted_at: new Date().toISOString(), revoked_at: null }, { onConflict: "user_id,kind" });
      await audit(admin, userId, "user", "whatsapp_opt_in", "channel_binding", binding.id);
      await sendWhatsAppText(from, reply(locale, "started"));
    }
    await admin.from("inbound_events").update({ status: "processed", processed_at: new Date().toISOString() }).eq("id", ev.id);
    return;
  }

  if (binding.status !== "active") {
    // Paused/opted-out: record the message for the web app, do not reply proactively.
    await admin.from("messages").upsert({ user_id: userId, role: "user", channel: "whatsapp", content: text || `[${msg.kind}]`, provider_message_id: msg.id }, { onConflict: "provider_message_id", ignoreDuplicates: true });
    await admin.from("inbound_events").update({ status: "processed", processed_at: new Date().toISOString() }).eq("id", ev.id);
    return;
  }

  let userText = text;
  const prefix: string[] = [];

  if (msg.kind === "audio" && msg.mediaId) {
    const consents = await getConsents(admin, userId);
    if (!consents.voice_processing) {
      await replyTo(admin, userId, binding.id, from, reply(locale, "voice_unconfigured"), msg.id);
      await admin.from("inbound_events").update({ status: "processed", processed_at: new Date().toISOString() }).eq("id", ev.id);
      return;
    }
    const media = await fetchWhatsAppMedia(msg.mediaId, "audio");
    if (!media.ok) throw new Error(media.error);
    const t = await transcribe(new Blob([media.bytes as BlobPart], { type: media.mime }), null);
    if (!t.ok) {
      await replyTo(admin, userId, binding.id, from, reply(locale, "voice_unconfigured"), msg.id);
      await admin.from("inbound_events").update({ status: "processed", processed_at: new Date().toISOString() }).eq("id", ev.id);
      return;
    }
    userText = t.value.transcript;
    prefix.push(reply(locale, "voice_heard", { text: userText.slice(0, 200) }));
    // Raw audio is not retained; only the transcript is stored as the message.
  }

  if ((msg.kind === "image" || msg.kind === "document") && msg.mediaId) {
    const media = await fetchWhatsAppMedia(msg.mediaId, msg.kind === "image" ? "image" : "document");
    if (!media.ok) {
      if (["unsupported_media_type", "media_too_large", "untrusted_media_host"].includes(media.error)) {
        await replyTo(admin, userId, binding.id, from, reply(locale, "media_unsupported"), msg.id);
        await admin.from("inbound_events").update({ status: "processed", processed_at: new Date().toISOString() }).eq("id", ev.id);
        return;
      }
      throw new Error(media.error);
    }
    await materializeOccurrences(admin, userId, 2).catch(() => undefined);
    const today = await getToday(admin, userId, profile.timezone);
    const target = pickRelevantOccurrence(today, true);
    if (!target) {
      await replyTo(admin, userId, binding.id, from, reply(locale, "no_open_action"), msg.id);
    } else {
      const hash = await sha256Hex(media.bytes);
      const ext = media.mime === "application/pdf" ? "pdf" : media.mime.split("/")[1];
      const path = `${userId}/${target.id}/${hash.slice(0, 16)}.${ext}`;
      await admin.storage.from("evidence").upload(path, media.bytes, { contentType: media.mime, upsert: true });
      const { data: doc } = await admin.from("documents").upsert({ user_id: userId, bucket: "evidence", storage_path: path, mime_type: media.mime, size_bytes: media.bytes.byteLength, sha256: hash }, { onConflict: "user_id,bucket,storage_path" }).select("id").single();
      const { data: evRow } = await admin.from("evidence").upsert({ user_id: userId, occurrence_id: target.id, kind: msg.kind === "image" ? "photo" : "document", document_id: doc!.id, text_content: msg.caption ?? null, content_hash: hash, channel: "whatsapp" }, { onConflict: "occurrence_id,content_hash", ignoreDuplicates: true }).select("id").maybeSingle();
      const lines = [reply(locale, "evidence_saved", { title: target.item.title })];
      if (evRow) {
        const evaluation = await evaluateEvidence(admin, userId, evRow.id);
        lines.push(evaluation.explanation);
        if (evaluation.cannot_confirm.length) lines.push(`• ${evaluation.cannot_confirm.slice(0, 2).join("\n• ")}`);
      }
      await admin.from("messages").upsert({ user_id: userId, role: "user", channel: "whatsapp", content: `[photo] ${msg.caption ?? ""}`.trim(), provider_message_id: msg.id }, { onConflict: "provider_message_id", ignoreDuplicates: true });
      await replyTo(admin, userId, binding.id, from, lines.join("\n"), msg.id);
    }
    await admin.from("inbound_events").update({ status: "processed", processed_at: new Date().toISOString() }).eq("id", ev.id);
    return;
  }

  if (!userText) {
    await replyTo(admin, userId, binding.id, from, reply(locale, "media_unsupported"), msg.id);
    await admin.from("inbound_events").update({ status: "processed", processed_at: new Date().toISOString() }).eq("id", ev.id);
    return;
  }

  // Same agent, tools and memory as the web chat.
  const { data: inserted } = await admin.from("messages").upsert({ user_id: userId, role: "user", channel: "whatsapp", content: userText.slice(0, 8000), provider_message_id: msg.id }, { onConflict: "provider_message_id", ignoreDuplicates: true }).select("id").maybeSingle();
  if (!inserted) {
    // Already handled (duplicate delivery of the same provider message).
    await admin.from("inbound_events").update({ status: "processed", processed_at: new Date().toISOString() }).eq("id", ev.id);
    return;
  }
  const answer = await runAssistant({ admin, userId, channel: "whatsapp", text: userText, messageKey: msg.id });
  if (answer.safety) await admin.from("messages").update({ safety_flag: answer.safety }).eq("id", inserted.id);
  await replyTo(admin, userId, binding.id, from, [...prefix, answer.text].join("\n\n"), msg.id);
  await admin.from("inbound_events").update({ status: "processed", processed_at: new Date().toISOString() }).eq("id", ev.id);
}

/** Webhook side: persist events (deduplicated) and enqueue processing. Returns job ids for prompt processing. */
export async function ingestWebhook(admin: AdminClient, payload: unknown): Promise<string[]> {
  const { messages, statuses } = parseWebhook(payload);
  const jobIds: string[] = [];
  for (const m of messages) {
    const { data: ev } = await admin
      .from("inbound_events")
      .upsert({ provider: "whatsapp", provider_event_id: m.id, event_type: "message", from_external_id: m.from, payload: m as unknown as Json }, { onConflict: "provider,provider_event_id,event_type", ignoreDuplicates: true })
      .select("id")
      .maybeSingle();
    if (!ev) continue; // duplicate delivery
    const { data: job } = await admin.from("jobs").upsert({ kind: "process_inbound", payload: { inbound_event_id: ev.id }, dedupe_key: `inbound:${m.id}`, max_attempts: 5 }, { onConflict: "dedupe_key", ignoreDuplicates: true }).select("id").maybeSingle();
    if (job) jobIds.push(job.id);
  }
  for (const s of statuses) {
    const { data: ev } = await admin
      .from("inbound_events")
      .upsert({ provider: "whatsapp", provider_event_id: `${s.id}:${s.status}`, event_type: "status", payload: s as unknown as Json, status: "processed", processed_at: new Date().toISOString() }, { onConflict: "provider,provider_event_id,event_type", ignoreDuplicates: true })
      .select("id")
      .maybeSingle();
    if (!ev) continue;
    const order = ["queued", "sending", "uncertain", "sent", "delivered", "read"];
    const { data: out } = await admin.from("outbound_messages").select("id, status").eq("provider_message_id", s.id).maybeSingle();
    if (!out) continue;
    if (s.status === "failed") {
      await admin.from("outbound_messages").update({ status: "failed", error_code: s.errorCode ?? "failed" }).eq("id", out.id);
    } else if (order.indexOf(s.status) > order.indexOf(out.status)) {
      await admin.from("outbound_messages").update({ status: s.status }).eq("id", out.id);
    }
  }
  return jobIds;
}
