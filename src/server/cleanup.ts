import "server-only";
import type { AdminClient } from "@/lib/supabase/admin";
import { PROOF_MEDIA_HOLD_MAX_DAYS, PROOF_MEDIA_RETENTION_DAYS } from "@/domain/proof";

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

/**
 * Retention: proof photos, clips and voice notes are deleted 7 days after upload. The evidence
 * row, its fingerprints (hash, phash), the AI assessment and any reviewer decision stay, so the
 * history, reuse checks and audit trail survive. Files with an undecided review are held.
 */
export async function purgeExpiredProof(admin: AdminClient, limit = 500): Promise<number> {
  const { data, error } = await admin.rpc("expired_evidence_files", { p_older_than: `${PROOF_MEDIA_RETENTION_DAYS} days`, p_hold_max: `${PROOF_MEDIA_HOLD_MAX_DAYS} days`, p_limit: limit });
  if (error || !data?.length) return 0;
  let removed = 0;
  for (let i = 0; i < data.length; i += 100) {
    const batch = data.slice(i, i + 100);
    const { data: gone, error: rmErr } = await admin.storage.from("evidence").remove(batch.map((r) => r.name));
    if (rmErr) continue;
    const goneNames = new Set((gone ?? []).map((g) => g.name));
    // remove() lists what it deleted; a file already missing counts as purged too.
    const ids = batch.filter((r) => goneNames.has(r.name) || !gone).map((r) => r.document_id);
    if (ids.length) await admin.from("documents").update({ purged_at: new Date().toISOString() }).in("id", ids);
    removed += goneNames.size;
  }
  if (removed) await admin.from("audit_events").insert({ actor: "worker", action: "proof_media_purged", entity: "storage", details: { removed, retention_days: PROOF_MEDIA_RETENTION_DAYS } as never });
  return removed;
}
