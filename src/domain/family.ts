// Family sharing rules: up to 2 family members per patient, each sees everything family can
// see (weekly summary, points, alerts), and family is always read-only.
export const FAMILY_LIMIT = 2;
export const FAMILY_SCOPES = ["weekly_summary", "garden", "alerts"] as const;

/** Seats in use: active members plus invites that can still be accepted. */
export function familySeats(rows: readonly { status: string; expires_at: string }[], now = new Date()): number {
  return rows.filter((r) => r.status === "active" || (r.status === "invited" && new Date(r.expires_at) > now)).length;
}
