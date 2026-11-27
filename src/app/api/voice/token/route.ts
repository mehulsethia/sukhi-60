import { getUser } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { settings } from "@/lib/config";
import { getConsents, getProfile, getToday } from "@/server/core";
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
  const admin = createAdminClient();
  const consents = await getConsents(admin, user.id);
  if (!consents.voice_processing) return errorJson("no_voice_consent", 403);
  const [token, profile] = await Promise.all([realtimeSttToken(), getProfile(admin, user.id)]);
  if (!token) return errorJson("speech_unconfigured", 503);
  // Hint the person's own task names (medicine names especially) so they're heard correctly.
  const today = await getToday(admin, user.id, profile.timezone).catch(() => []);
  const words = today.flatMap((a) => a.item.title.split(/[^\p{L}\p{N}]+/u)).filter((w) => w.length >= 4 && !/^\d+$/.test(w));
  const keyterms = [...new Set(words.map((w) => w.toLowerCase()))].slice(0, 15);
  return json({ token, model: settings.elevenRealtimeModel(), keyterms });
}
