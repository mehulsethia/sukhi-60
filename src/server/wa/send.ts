import "server-only";
// Sending on WhatsApp: replies inside a conversation, proactive notices (doctor notes, family
// updates) that respect the 24h window, and direct sends to numbers without an account.
// Every send to an account goes through the outbox (outbound_messages + a send job) so
// retries never double-send and delivery status is tracked.
import type { AdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/database.types";
import { settings } from "@/lib/config";
import { clampOut, outText, toGraph, type WaOut } from "@/domain/wa-ui";
import { decideSend, withinServiceWindow } from "@/domain/whatsapp";
import { inQuietHours, localTimeOf } from "@/domain/schedule";
import { sendWhatsAppPayload } from "../providers";

export interface WaCtx {
  admin: AdminClient;
  userId: string;
  bindingId: string;
  to: string;
  locale: string;
  /** Stable per inbound message: makes every reply idempotent across retries. */
  key: string;
  n: number;
}

export async function enqueueOutbound(
  admin: AdminClient,
  userId: string,
  bindingId: string,
  m: { kind: "free_text" | "template" | "interactive"; template?: string; body: string; payload?: Record<string, unknown> | null; dedupeKey: string; hold?: boolean },
) {
  const { data: row } = await admin
    .from("outbound_messages")
    .upsert(
      { user_id: userId, binding_id: bindingId, kind: m.kind, template_name: m.template ?? null, body: m.body.slice(0, 4000), payload: (m.payload ?? null) as Json, dedupe_key: m.dedupeKey, error_code: m.hold ? "held_window" : null },
      { onConflict: "dedupe_key", ignoreDuplicates: true },
    )
    .select("id")
    .maybeSingle();
  if (!row || m.hold) return null; // already enqueued earlier, or held until the person writes
  const { data: job } = await admin.from("jobs").upsert({ user_id: userId, kind: "send_outbound", payload: { outbound_id: row.id }, dedupe_key: `send:${row.id}`, max_attempts: 4 }, { onConflict: "dedupe_key", ignoreDuplicates: true }).select("id").maybeSingle();
  return job?.id ?? null;
}

async function runNow(admin: AdminClient, jobId: string | null) {
  if (!jobId) return;
  // Imported lazily: the worker imports this module too.
  const { runJobNow } = await import("../worker");
  await runJobNow(admin, jobId, `inline-${crypto.randomUUID()}`).catch(() => undefined);
}

function prepare(out: WaOut) {
  const o = clampOut(out);
  return { kind: o.type === "text" ? ("free_text" as const) : ("interactive" as const), body: outText(o), payload: o.type === "text" ? null : toGraph(o) };
}

/** Reply inside the conversation (the person just wrote, so the window is open). */
export async function send(ctx: WaCtx, out: WaOut) {
  const p = prepare(out);
  const jobId = await enqueueOutbound(ctx.admin, ctx.userId, ctx.bindingId, { ...p, dedupeKey: `reply:${ctx.key}:${ctx.n++}` });
  await ctx.admin.from("messages").insert({ user_id: ctx.userId, role: "assistant", channel: "whatsapp", content: p.body.slice(0, 8000) });
  await runNow(ctx.admin, jobId);
}

/** Send to a number that has no account yet (welcome, consent). No patient data involved. */
export async function sendDirect(to: string, out: WaOut) {
  return sendWhatsAppPayload(to, toGraph(out));
}

export type NotifyResult = "sent" | "template" | "held" | "blocked";

/**
 * Proactive message to a person (doctor note, family update, reward). Inside their 24h window
 * it is sent now. Outside it, an approved generic template nudges them to reply, and with
 * `hold` the message itself waits and goes out the next time they write.
 */
export async function notify(admin: AdminClient, userId: string, out: WaOut, dedupeKey: string, opts: { hold?: boolean; respectQuiet?: boolean } = {}): Promise<NotifyResult> {
  const [{ data: binding }, { data: consent }, { data: profile }] = await Promise.all([
    admin.from("channel_bindings").select("id, status, last_inbound_at").eq("user_id", userId).eq("channel", "whatsapp").neq("status", "revoked").maybeSingle(),
    admin.from("consents").select("granted").eq("user_id", userId).eq("kind", "whatsapp").maybeSingle(),
    admin.from("profiles").select("timezone, quiet_start, quiet_end").eq("id", userId).maybeSingle(),
  ]);
  if (!binding) return "blocked";
  const quiet = opts.respectQuiet !== false && !!profile && inQuietHours(localTimeOf(new Date(), profile.timezone), profile.quiet_start, profile.quiet_end);
  const decision = decideSend({ binding, consentWhatsapp: !!consent?.granted, approvedTemplates: settings.approvedTemplates(), quiet, template: "sukhi_update_ready" });
  const p = prepare(out);
  if (decision.kind === "free_text") {
    const jobId = await enqueueOutbound(admin, userId, binding.id, { ...p, dedupeKey: dedupeKey });
    if (jobId) await admin.from("messages").insert({ user_id: userId, role: "assistant", channel: "whatsapp", content: p.body.slice(0, 8000) });
    await runNow(admin, jobId);
    return "sent";
  }
  const windowClosed = binding.status === "active" && !!consent?.granted && !withinServiceWindow(binding.last_inbound_at);
  if (opts.hold && (windowClosed || decision.reason === "quiet_hours")) {
    await enqueueOutbound(admin, userId, binding.id, { ...p, dedupeKey, hold: true });
  }
  if (decision.kind === "template") {
    const jobId = await enqueueOutbound(admin, userId, binding.id, { kind: "template", template: decision.template, body: `[template:${decision.template}]`, dedupeKey: `tpl:${binding.id}:${new Date().toISOString().slice(0, 13)}` });
    await runNow(admin, jobId);
    return opts.hold ? "held" : "template";
  }
  return opts.hold && (windowClosed || decision.reason === "quiet_hours") ? "held" : "blocked";
}

/** The person just wrote: send anything that was waiting for their window to open. */
export async function releaseHeld(admin: AdminClient, userId: string, bindingId: string) {
  const since = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const { data: held } = await admin.from("outbound_messages").select("id, body").eq("binding_id", bindingId).eq("status", "queued").eq("error_code", "held_window").gte("created_at", since).order("created_at").limit(5);
  for (const h of held ?? []) {
    const { data: upd } = await admin.from("outbound_messages").update({ error_code: null }).eq("id", h.id).eq("error_code", "held_window").select("id").maybeSingle();
    if (!upd) continue; // released by a concurrent message
    const { data: job } = await admin.from("jobs").upsert({ user_id: userId, kind: "send_outbound", payload: { outbound_id: h.id }, dedupe_key: `send:${h.id}`, max_attempts: 4 }, { onConflict: "dedupe_key", ignoreDuplicates: true }).select("id").maybeSingle();
    await admin.from("messages").insert({ user_id: userId, role: "assistant", channel: "whatsapp", content: h.body.slice(0, 8000) });
    await runNow(admin, job?.id ?? null);
  }
}
