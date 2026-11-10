import { getUser } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getConsents, getProfile } from "@/server/core";
import { synthesize } from "@/server/providers";
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
