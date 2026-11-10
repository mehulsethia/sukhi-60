import "server-only";
import type { AdminClient } from "@/lib/supabase/admin";

export const CONSENT_KINDS = ["ai_processing", "reminders", "whatsapp", "family_sharing", "voice_processing"] as const;
export type ConsentKind = (typeof CONSENT_KINDS)[number];

/**
 * Write consent choices with the user's RLS-scoped client. Uses explicit insert/update
 * (not upsert) because clients are intentionally not granted UPDATE on user_id/kind.
 */
export async function writeConsentChoices(db: AdminClient, userId: string, choices: Record<ConsentKind, boolean>) {
  const now = new Date().toISOString();
  const { data: existing, error: readErr } = await db.from("consents").select("kind, granted").eq("user_id", userId);
  if (readErr) throw new Error("consent_read_failed");
  const have = new Map((existing ?? []).map((c) => [c.kind, c.granted]));
  const inserts = CONSENT_KINDS.filter((k) => !have.has(k)).map((kind) => ({ user_id: userId, kind, granted: choices[kind], granted_at: choices[kind] ? now : null, revoked_at: choices[kind] ? null : now }));
  if (inserts.length) {
    const { error } = await db.from("consents").insert(inserts);
    if (error) throw new Error("consent_insert_failed");
  }
  for (const kind of CONSENT_KINDS) {
    if (!have.has(kind) || have.get(kind) === choices[kind]) continue;
    const { error } = await db.from("consents").update(choices[kind] ? { granted: true, granted_at: now, revoked_at: null } : { granted: false, revoked_at: now }).eq("user_id", userId).eq("kind", kind);
    if (error) throw new Error("consent_update_failed");
  }
}
