import { createAdminClient } from "@/lib/supabase/admin";
import { runWorkerTick } from "@/server/worker";
import { bearerMatches, errorJson, json } from "@/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Secured worker trigger (Supabase Cron via pg_net, or an operator with the secret).
// Never anonymous: requires Authorization: Bearer <WORKER_SECRET>.
export async function POST(req: Request) {
  if (!bearerMatches(req.headers.get("authorization"), process.env.WORKER_SECRET)) return errorJson("unauthorized", 401);
  const started = Date.now();
  const summary = await runWorkerTick(createAdminClient(), `tick-${crypto.randomUUID()}`);
  return json({ ok: true, ms: Date.now() - started, ...summary });
}
