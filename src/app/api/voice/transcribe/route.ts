import { getUser } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { LIMITS } from "@/lib/config";
import { getConsents, getProfile } from "@/server/core";
import { transcribe } from "@/server/providers";
import { validateUpload } from "@/server/files";
import { errorJson, json } from "@/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const AUDIO = ["audio/webm", "audio/ogg", "audio/mp4", "audio/mpeg", "audio/wav"];

// Transcribe a push-to-record voice note. The transcript is returned for the user to
// confirm/edit before it is sent; raw audio is not stored by this endpoint.
export async function POST(req: Request) {
  const { user } = await getUser();
  if (!user) return errorJson("unauthenticated", 401);
  const admin = createAdminClient();
  const consents = await getConsents(admin, user.id);
  if (!consents.voice_processing) return errorJson("no_voice_consent", 403);
  const form = await req.formData().catch(() => null);
  const file = form?.get("audio");
  if (!(file instanceof File)) return errorJson("missing_audio", 400);
  const v = await validateUpload(file, AUDIO, LIMITS.audioMaxBytes);
  if (!v.ok) return errorJson(v.error, 400);
  const profile = await getProfile(admin, user.id);
  const mode = form?.get("language") === "auto" ? null : profile.locale;
  const r = await transcribe(new Blob([v.file.bytes as BlobPart], { type: v.file.mime }), mode);
  if (!r.ok) return errorJson(`speech_${r.error}`, r.error === "unconfigured" ? 503 : 502);
  const uncertain = !r.value.transcript || (r.value.languageProbability !== null && r.value.languageProbability < 0.7) || /\d/.test(r.value.transcript);
  return json({ transcript: r.value.transcript, language: r.value.language, needsConfirmation: true, uncertain });
}
