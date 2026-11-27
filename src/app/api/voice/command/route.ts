import { z } from "zod";
import { getUser } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { errorJson, json } from "@/server/http";
import { voiceTurn } from "@/server/voice";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TaskId = z.string().regex(/^(item:)?[0-9a-f-]{36}$/i);
const Task = z.object({ id: TaskId, title: z.string().max(200) });
const Pending = z.union([
  z.object({ kind: z.literal("checkin"), taskId: TaskId, title: z.string().max(200), status: z.enum(["done", "skipped"]), reason: z.string().max(40).optional(), note: z.string().max(200).optional() }),
  z.object({ kind: z.literal("add_task"), title: z.string().min(1).max(80), time: z.string().regex(/^\d{2}:\d{2}$/), category: z.enum(["activity", "nutrition", "rest", "measurement", "other"]) }),
  z.object({ kind: z.literal("choose"), action: z.enum(["done", "skipped", "later", "photo", "retime", "pause", "resume"]), candidates: z.array(Task).max(6), reason: z.string().max(40).optional(), note: z.string().max(200).optional(), time: z.string().regex(/^\d{2}:\d{2}$/).optional() }),
  z.object({ kind: z.literal("batch"), items: z.array(z.object({ taskId: TaskId, title: z.string().max(200), status: z.enum(["done", "skipped"]), reason: z.string().max(40).optional() })).min(1).max(6) }),
  z.object({ kind: z.literal("change"), action: z.enum(["retime", "pause", "resume"]), taskId: TaskId, title: z.string().max(200), time: z.string().regex(/^\d{2}:\d{2}$/).optional() }),
]);
const Body = z.object({ text: z.string().trim().min(1).max(500), pending: Pending.nullable().optional(), key: z.string().min(8).max(80) });

// One turn of "Talk to Sukhi". The client sends what was said (and what Sukhi last asked);
// the reply says what to speak, show and do. Every task id is re-checked against the user's own
// rows by applyCheckIn, so a tampered `pending` can only ever touch the caller's own plan.
export async function POST(req: Request) {
  const { user } = await getUser();
  if (!user) return errorJson("unauthenticated", 401);
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return errorJson("invalid_input", 400);
  const { text, pending, key } = parsed.data;
  const reply = await voiceTurn(createAdminClient(), user.id, { text, pending: (pending ?? null) as never, key });
  return json(reply);
}
