import "server-only";
import type { AdminClient } from "@/lib/supabase/admin";

/**
 * The user's points total, kept on the profile by a trigger. Falls back to adding up reward
 * rows if the column isn't there yet (migration 20261113000900 not applied).
 */
export async function pointsTotal(db: AdminClient, userId: string): Promise<number> {
  const { data, error } = await db.from("profiles").select("points_total").eq("id", userId).maybeSingle();
  if (!error && typeof data?.points_total === "number") return data.points_total;
  const { data: ev } = await db.from("reward_events").select("points").eq("user_id", userId);
  return (ev ?? []).reduce((a, e) => a + Math.max(0, e.points), 0);
}
