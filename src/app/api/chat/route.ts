import { getUser } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { LIMITS } from "@/lib/config";
import { runAssistant } from "@/server/agent";
import { errorJson, json } from "@/server/http";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const Body = z.object({ text: z.string().trim().min(1).max(LIMITS.chatMaxChars) });

export async function POST(req: Request) {
  const { user } = await getUser();
  if (!user) return errorJson("unauthenticated", 401);
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return errorJson("invalid_input", 400);

  const admin = createAdminClient();
  const since = new Date(Date.now() - 60_000).toISOString();
  const { count } = await admin.from("messages").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("role", "user").gte("created_at", since);
  if ((count ?? 0) >= LIMITS.chatPerMinute) return errorJson("rate_limited", 429);

  const { data: msg, error } = await admin.from("messages").insert({ user_id: user.id, role: "user", channel: "web", content: parsed.data.text }).select("id").single();
  if (error || !msg) return errorJson("store_failed", 500);

  const answer = await runAssistant({ admin, userId: user.id, channel: "web", text: parsed.data.text, messageKey: msg.id });
  if (answer.safety) await admin.from("messages").update({ safety_flag: answer.safety }).eq("id", msg.id);
  const { data: saved } = await admin
    .from("messages")
    .insert({ user_id: user.id, role: "assistant", channel: "web", content: answer.text, source_refs: answer.sources as never, safety_flag: answer.safety === "escalation" ? "escalation" : null })
    .select("id, created_at")
    .single();
  return json({ id: saved?.id, text: answer.text, sources: answer.sources, route: answer.route, safety: answer.safety ?? null });
}
