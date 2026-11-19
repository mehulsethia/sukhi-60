import "server-only";
// Device readings: the person fixing what the AI read, and recent readings for their doctor.
import type { AdminClient } from "@/lib/supabase/admin";
import { formatReading, parseReadingText, type Reading, type ReadingKind } from "@/domain/readings";

export type ReadingRow = Reading & { id: string; measured_at: string; source: string };

const toReading = (r: { id: string; kind: string; value: number; value2: number | null; pulse: number | null; unit: string; measured_at: string; source: string }): ReadingRow => ({
  id: r.id,
  kind: r.kind as ReadingKind,
  value: Number(r.value),
  value2: r.value2 === null ? null : Number(r.value2),
  pulse: r.pulse,
  unit: r.unit,
  measured_at: r.measured_at,
  source: r.source,
});

export async function getReading(admin: AdminClient, userId: string, id: string): Promise<ReadingRow | null> {
  const { data } = await admin.from("readings").select("id, kind, value, value2, pulse, unit, measured_at, source").eq("id", id).eq("user_id", userId).maybeSingle();
  return data ? toReading(data) : null;
}

/** Replace a reading with the numbers the person typed; the AI's version is kept in read_as. */
export async function correctReading(admin: AdminClient, userId: string, id: string, text: string): Promise<{ ok: true; reading: ReadingRow } | { ok: false; error: "not_found" | "invalid" }> {
  const { data: row } = await admin.from("readings").select("*").eq("id", id).eq("user_id", userId).maybeSingle();
  if (!row) return { ok: false, error: "not_found" };
  const fixed = parseReadingText({ kind: row.kind as ReadingKind, unit: row.unit }, text);
  if (!fixed) return { ok: false, error: "invalid" };
  const readAs = row.read_as ?? { value: row.value, value2: row.value2, pulse: row.pulse, unit: row.unit };
  const { data } = await admin
    .from("readings")
    .update({ value: fixed.value, value2: fixed.value2, pulse: fixed.pulse ?? (row.kind === "blood_pressure" ? null : row.pulse), source: "corrected", read_as: readAs, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("id, kind, value, value2, pulse, unit, measured_at, source")
    .single();
  await admin.from("audit_events").insert({ user_id: userId, actor: "user", action: "reading_corrected", entity: "reading", entity_id: id, details: { from: readAs, to: fixed } as never });
  return data ? { ok: true, reading: toReading(data) } : { ok: false, error: "not_found" };
}

export async function recentReadings(admin: AdminClient, userId: string, since: Date, limit = 6): Promise<ReadingRow[]> {
  const { data } = await admin.from("readings").select("id, kind, value, value2, pulse, unit, measured_at, source").eq("user_id", userId).gte("measured_at", since.toISOString()).order("measured_at", { ascending: false }).limit(limit);
  return (data ?? []).map(toReading);
}

export { formatReading };
