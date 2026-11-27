import { getUser } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { settings } from "@/lib/config";
import { getConsents } from "@/server/core";
import { realtimeSttToken } from "@/server/providers";
import { errorJson, json } from "@/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// A single-use token (15 min, one session) for ElevenLabs live transcription, so the browser can
// stream the microphone straight to ElevenLabs and show words as they are spoken. Our API key
// never leaves the server.
export async function POST() {
  const { user } = await getUser();
  if (!user) return errorJson("unauthenticated", 401);
  const consents = await getConsents(createAdminClient(), user.id);
  if (!consents.voice_processing) return errorJson("no_voice_consent", 403);
  const token = await realtimeSttToken();
  if (!token) return errorJson("speech_unconfigured", 503);
  return json({ token, model: settings.elevenRealtimeModel() });
}
