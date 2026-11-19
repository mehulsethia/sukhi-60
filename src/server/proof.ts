import "server-only";
// Proof checks around each photo: fingerprint, reuse search, fresh-photo challenge, the date
// the photo was taken (when the file still has it), and the random human audit sample.
import sharp from "sharp";
import type { AdminClient } from "@/lib/supabase/admin";
import { auditRate, dhashFromPixels, hamming, newChallenge, REUSE_DISTANCE, SIMILAR_DISTANCE, type Challenge } from "@/domain/proof";

const CHALLENGE_HOURS = 24;

/** Perceptual hash and capture time of an image. Never throws: a failure just means no fingerprint. */
export async function fingerprint(bytes: Uint8Array): Promise<{ phash: string | null; takenAt: Date | null }> {
  try {
    const img = sharp(bytes, { failOn: "none" });
    const meta = await img.metadata();
    const px = await sharp(bytes, { failOn: "none" }).rotate().greyscale().resize(9, 8, { fit: "fill" }).raw().toBuffer();
    return { phash: dhashFromPixels(px), takenAt: exifDate(meta.exif) };
  } catch {
    return { phash: null, takenAt: null };
  }
}

/** DateTimeOriginal from raw EXIF ("2026:11:18 08:14:03"). WhatsApp strips it; web uploads often keep it. */
function exifDate(exif: Buffer | undefined): Date | null {
  if (!exif) return null;
  const m = exif.toString("latin1").match(/(20\d{2}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/);
  if (!m) return null;
  // No time zone in EXIF: read as UTC; the 36-hour threshold absorbs the offset.
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]));
  return Number.isNaN(d.getTime()) || d.getTime() > Date.now() + 86_400_000 ? null : d;
}

export interface ReuseMatch { evidenceId: string; occurrenceId: string; createdAt: string; distance: number; otherUser: boolean }

/** The same (or nearly the same) picture sent before for a different task, by this person or anyone. */
export async function findReuse(admin: AdminClient, userId: string, evidenceId: string, occurrenceId: string, sha: string, phash: string | null): Promise<{ own: ReuseMatch | null; similar: ReuseMatch | null; other: ReuseMatch | null }> {
  const since = new Date(Date.now() - 180 * 86_400_000).toISOString();
  const [{ data: exact }, { data: mine }] = await Promise.all([
    admin.from("evidence").select("id, user_id, occurrence_id, created_at").eq("content_hash", sha).neq("id", evidenceId).limit(10),
    phash ? admin.from("evidence").select("id, occurrence_id, created_at, phash").eq("user_id", userId).neq("id", evidenceId).neq("occurrence_id", occurrenceId).not("phash", "is", null).gte("created_at", since).order("created_at", { ascending: false }).limit(1000) : Promise.resolve({ data: [] as { id: string; occurrence_id: string; created_at: string; phash: string | null }[] }),
  ]);
  const ownExact = (exact ?? []).find((e) => e.user_id === userId && e.occurrence_id !== occurrenceId);
  const otherExact = (exact ?? []).find((e) => e.user_id !== userId);
  let own: ReuseMatch | null = ownExact ? { evidenceId: ownExact.id, occurrenceId: ownExact.occurrence_id, createdAt: ownExact.created_at, distance: 0, otherUser: false } : null;
  let best: ReuseMatch | null = null;
  if (!own && phash) {
    for (const e of mine ?? []) {
      const dist = hamming(phash, e.phash!);
      if (dist <= SIMILAR_DISTANCE && (!best || dist < best.distance)) best = { evidenceId: e.id, occurrenceId: e.occurrence_id, createdAt: e.created_at, distance: dist, otherUser: false };
    }
    if (best && best.distance <= REUSE_DISTANCE) own = best;
  }
  const other = otherExact ? { evidenceId: otherExact.id, occurrenceId: otherExact.occurrence_id, createdAt: otherExact.created_at, distance: 0, otherUser: true } : null;
  return { own, similar: own ? null : best, other };
}

/** Today's fresh-photo instruction for a task (made once, reused for 24 hours). */
export async function challengeFor(admin: AdminClient, userId: string, occurrenceId: string, create = true): Promise<(Challenge & { id: string }) | null> {
  const { data: existing } = await admin.from("proof_challenges").select("id, kind, value").eq("occurrence_id", occurrenceId).eq("user_id", userId).gt("expires_at", new Date().toISOString()).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (existing) return { id: existing.id, kind: existing.kind as Challenge["kind"], value: existing.value } as Challenge & { id: string };
  if (!create) return null;
  const c = newChallenge();
  const { data } = await admin.from("proof_challenges").insert({ user_id: userId, occurrence_id: occurrenceId, kind: c.kind, value: c.value, expires_at: new Date(Date.now() + CHALLENGE_HOURS * 3600_000).toISOString() }).select("id").single();
  return data ? { ...c, id: data.id } : null;
}

/** Empty blister slots seen in this item's most recent earlier photo (last 10 days). */
export async function previousBlisterCount(admin: AdminClient, userId: string, itemId: string, occurrenceId: string): Promise<number | null> {
  const since = new Date(Date.now() - 10 * 86_400_000).toISOString();
  const { data } = await admin
    .from("evaluations")
    .select("blister_empty, action_occurrences!inner(item_id)")
    .eq("user_id", userId)
    .eq("action_occurrences.item_id", itemId)
    .neq("occurrence_id", occurrenceId)
    .not("blister_empty", "is", null)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.blister_empty ?? null;
}

/** A random share of photos the AI accepted goes to a human, to measure how often the AI is right. */
export async function maybeAudit(admin: AdminClient, e: { userId: string; occurrenceId: string; itemId: string | null; evaluationId: string; evidenceId: string; similar?: boolean }) {
  if (!e.similar && Math.random() >= auditRate(process.env.PROOF_AUDIT_RATE)) return false;
  await admin.from("review_requests").insert({ user_id: e.userId, occurrence_id: e.occurrenceId, evaluation_id: e.evaluationId, evidence_id: e.evidenceId, item_id: e.itemId, reason: e.similar ? "Looks similar to an earlier photo (counted, please check)" : "Random quality check of an AI-accepted photo", source: "audit" });
  return true;
}
