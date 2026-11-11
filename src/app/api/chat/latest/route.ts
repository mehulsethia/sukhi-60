import { getUser } from "@/lib/supabase/server";
import { errorJson, json } from "@/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// One cheap query the open chat polls; the page only re-renders when something is new.
export async function GET() {
  const { supabase, user } = await getUser();
  if (!user) return errorJson("unauthenticated", 401);
  const { data } = await supabase.from("messages").select("id").eq("user_id", user.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
  return json({ id: data?.id ?? null });
}
