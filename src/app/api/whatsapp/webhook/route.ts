import { after } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { features } from "@/lib/config";
import { verifyMetaSignature } from "@/domain/whatsapp";
import { ingestWebhook, runJobNow } from "@/server/worker";
import { timingSafeEqual } from "node:crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 130; // WhatsApp prescription reads can take ~1 min

// GET: Meta webhook verification handshake.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token") ?? "";
  const challenge = url.searchParams.get("hub.challenge") ?? "";
  const expected = process.env.WHATSAPP_VERIFY_TOKEN ?? "";
  const ok = mode === "subscribe" && expected.length >= 16 && token.length === expected.length && timingSafeEqual(Buffer.from(token), Buffer.from(expected));
  if (!ok) return new Response("forbidden", { status: 403 });
  return new Response(challenge.slice(0, 200), { status: 200, headers: { "Content-Type": "text/plain" } });
}

// POST: validate signature on the RAW body, persist + enqueue, acknowledge, then process.
export async function POST(req: Request) {
  if (!features.whatsapp()) return new Response("not configured", { status: 503 });
  const raw = await req.text();
  if (raw.length > 1_000_000) return new Response("too large", { status: 413 });
  const valid = await verifyMetaSignature(raw, req.headers.get("x-hub-signature-256"), process.env.WHATSAPP_APP_SECRET!);
  if (!valid) return new Response("invalid signature", { status: 401 });
  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return new Response("bad json", { status: 400 });
  }
  const admin = createAdminClient();
  const jobIds = await ingestWebhook(admin, payload); // durable before acknowledging
  if (jobIds.length) {
    // Prompt best-effort processing after the response; the scheduled worker is the fallback.
    after(async () => {
      for (const id of jobIds) await runJobNow(admin, id, `webhook-${crypto.randomUUID()}`).catch(() => undefined);
    });
  }
  return new Response("ok", { status: 200 });
}
