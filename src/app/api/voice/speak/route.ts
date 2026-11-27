import { getUser } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getConsents, getProfile } from "@/server/core";
import { synthesize, synthesizeStream } from "@/server/providers";
import { errorJson, json } from "@/server/http";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({ text: z.string().trim().min(1).max(2400) });

export async function POST(req: Request) {
  const { user } = await getUser();
  if (!user) return errorJson("unauthenticated", 401);
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return errorJson("invalid_input", 400);
  const admin = createAdminClient();
  const consents = await getConsents(admin, user.id);
  if (!consents.voice_processing) return errorJson("no_voice_consent", 403);
  const profile = await getProfile(admin, user.id);
  const r = await synthesize(parsed.data.text, profile.locale);
  if (!r.ok) return errorJson(`speech_${r.error}`, r.error === "unconfigured" ? 503 : 502);
  return json({ audio: `data:${r.value.mime};base64,${r.value.audioBase64}` });
}

// Streamed playback for "Talk to Sukhi": <audio src="/api/voice/speak?t=..."> starts playing as
// the first bytes arrive instead of waiting for the whole clip.
export async function GET(req: Request) {
  const { user } = await getUser();
  if (!user) return errorJson("unauthenticated", 401);
  const text = (new URL(req.url).searchParams.get("t") ?? "").trim().slice(0, 1200);
  if (!text) return errorJson("invalid_input", 400);
  const admin = createAdminClient();
  const consents = await getConsents(admin, user.id);
  if (!consents.voice_processing) return errorJson("no_voice_consent", 403);
  const profile = await getProfile(admin, user.id);
  const upstream = await synthesizeStream(text, profile.locale);
  if (upstream) return new Response(upstream.body, { headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" } });
  // Sarvam (or a failed stream): one whole clip.
  const r = await synthesize(text, profile.locale);
  if (!r.ok) return errorJson(`speech_${r.error}`, r.error === "unconfigured" ? 503 : 502);
  return new Response(Buffer.from(r.value.audioBase64, "base64"), { headers: { "Content-Type": r.value.mime, "Cache-Control": "no-store" } });
}
