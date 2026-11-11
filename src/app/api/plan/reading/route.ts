import { getUser } from "@/lib/supabase/server";
import { errorJson, json } from "@/server/http";
import { readingState } from "@/server/plan-reading";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Polled by the plan page while a document is being read in the background.
export async function GET(req: Request) {
  const { supabase, user } = await getUser();
  if (!user) return errorJson("unauthenticated", 401);
  const doc = new URL(req.url).searchParams.get("doc") ?? "";
  if (!/^[0-9a-f-]{36}$/.test(doc)) return errorJson("invalid_input", 400);
  const { data } = await supabase.from("documents").select("extraction_status, extraction").eq("id", doc).maybeSingle();
  if (!data) return errorJson("not_found", 404);
  return json({ state: readingState(data.extraction_status, data.extraction) });
}
