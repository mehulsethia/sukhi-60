import "server-only";
import type { AdminClient } from "@/lib/supabase/admin";

/**
 * Delete video proof files that never got an evidence record (the upload went through but
 * the follow-up request failed). Runs from the worker once an hour; bounded per run.
 */
export async function cleanupOrphanVideos(admin: AdminClient, limit = 200): Promise<number> {
  const { data, error } = await admin.rpc("orphan_evidence_videos", { p_older_than: "6 hours", p_limit: limit });
  if (error || !data?.length) return 0; // also covers the migration not being applied yet
  const names = data.map((r) => r.name);
  let removed = 0;
  for (let i = 0; i < names.length; i += 100) {
    const { data: gone } = await admin.storage.from("evidence").remove(names.slice(i, i + 100));
    removed += gone?.length ?? 0;
  }
  if (removed) await admin.from("audit_events").insert({ actor: "worker", action: "orphan_videos_removed", entity: "storage", details: { removed } as never });
  return removed;
}
