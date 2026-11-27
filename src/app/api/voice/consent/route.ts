import { getUser } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { audit } from "@/server/core";
import { errorJson, json } from "@/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The person tapped "Allow" in the Talk to Sukhi panel: record consent to send voice to
// ElevenLabs for transcription (same consent as the Settings toggle; revocable there).
export async function POST() {
  const { user } = await getUser();
  if (!user) return errorJson("unauthenticated", 401);
  const admin = createAdminClient();
  const now = new Date().toISOString();
  const { data: row } = await admin.from("consents").select("kind").eq("user_id", user.id).eq("kind", "voice_processing").maybeSingle();
  const { error } = row
    ? await admin.from("consents").update({ granted: true, granted_at: now, revoked_at: null }).eq("user_id", user.id).eq("kind", "voice_processing")
    : await admin.from("consents").insert({ user_id: user.id, kind: "voice_processing", granted: true, granted_at: now });
  if (error) return errorJson("save_failed", 500);
  await audit(admin, user.id, "user", "consent_granted", "consent", undefined, { kind: "voice_processing", via: "talk_to_sukhi" }).catch(() => undefined);
  return json({ ok: true });
}
