import "server-only";
// Deterministic service layer. Callers pass a userId that was established from a verified
// session or a verified WhatsApp binding — never from model output.
import type { AdminClient } from "@/lib/supabase/admin";
import type { Database, Json } from "@/lib/database.types";
import { addDays, displayStatus, localDateOf, planOccurrences, reminderSendTime, type OccurrenceStatus } from "@/domain/schedule";

type Tables = Database["public"]["Tables"];
export type Profile = Tables["profiles"]["Row"];
export type PlanItem = Tables["plan_items"]["Row"];
export type Occurrence = Tables["action_occurrences"]["Row"];
export type CheckInKind = Database["public"]["Enums"]["check_in_kind"];
export type Channel = Database["public"]["Enums"]["channel_kind"];

export async function getProfile(admin: AdminClient, userId: string): Promise<Profile> {
  const { data, error } = await admin.from("profiles").select("*").eq("id", userId).single();
  if (error || !data) throw new Error("profile_not_found");
  return data;
}

export async function getConsents(admin: AdminClient, userId: string): Promise<Record<string, boolean>> {
  const { data } = await admin.from("consents").select("kind, granted").eq("user_id", userId);
  return Object.fromEntries((data ?? []).map((c) => [c.kind, c.granted]));
}

/**
 * Create occurrences for the next `days` local days for every confirmed item in an
 * active plan, plus a reminder job per new timed occurrence. Idempotent.
 */
export async function materializeOccurrences(admin: AdminClient, userId: string, days = 7, now = new Date()) {
  const profile = await getProfile(admin, userId);
  const consents = await getConsents(admin, userId);
  const { data: items, error } = await admin
    .from("plan_items")
    .select("*, care_plans!inner(status)")
    .eq("user_id", userId)
    .eq("status", "confirmed")
    .eq("care_plans.status", "active");
  if (error) throw new Error(`load_items:${error.message}`);
  const tz = profile.timezone;
  const today = localDateOf(now, tz);
  const rows = (items ?? []).flatMap((it) =>
    planOccurrences(
      { id: it.id, plan_id: it.plan_id, version: it.version, schedule_kind: it.schedule_kind, times: it.times, weekdays: it.weekdays, weekly_target: it.weekly_target, once_date: it.once_date, window_minutes: it.window_minutes },
      tz,
      today,
      days,
    )
      .filter((o) => new Date(o.window_end_at).getTime() > now.getTime())
      .map((o) => ({ ...o, user_id: userId, status: "pending" as const })),
  );
  if (rows.length === 0) return { created: 0, reminders: 0 };
  const { data: inserted, error: insErr } = await admin
    .from("action_occurrences")
    .upsert(rows, { onConflict: "item_id,due_at", ignoreDuplicates: true })
    .select("id, item_id, plan_id, item_version, due_at, target_count");
  if (insErr) throw new Error(`insert_occurrences:${insErr.message}`);

  // Re-activated items/plans: future slots paused earlier come back at the current version.
  const resumed: NonNullable<typeof inserted> = [];
  const byItem = new Map<string, { version: number; dues: string[] }>();
  rows.forEach((r) => {
    const e = byItem.get(r.item_id) ?? { version: r.item_version, dues: [] };
    e.dues.push(r.due_at);
    byItem.set(r.item_id, e);
  });
  // One update per item, in parallel (was sequential: N round trips on every call).
  const updates = await Promise.all(
    [...byItem].map(([itemId, { version, dues }]) =>
      admin
        .from("action_occurrences")
        .update({ status: "pending", item_version: version, status_changed_at: new Date().toISOString() })
        .eq("user_id", userId)
        .eq("item_id", itemId)
        .eq("status", "paused")
        .in("due_at", dues)
        .select("id, item_id, plan_id, item_version, due_at, target_count"),
    ),
  );
  for (const { data } of updates) resumed.push(...(data ?? []));

  let reminders = 0;
  if (consents.reminders && profile.reminder_frequency !== "off") {
    const jobs = [...(inserted ?? []), ...resumed]
      .filter((o) => o.target_count === 1)
      .map((o) => {
        const { sendAt, shifted } = reminderSendTime(new Date(o.due_at), tz, profile.quiet_start, profile.quiet_end);
        return {
          user_id: userId,
          kind: "reminder" as const,
          run_at: sendAt.toISOString(),
          plan_item_version: o.item_version,
          dedupe_key: `reminder:${o.id}:v${o.item_version}`,
          payload: { occurrence_id: o.id, item_id: o.item_id, plan_id: o.plan_id, quiet_shifted: shifted } as Json,
        };
      });
    if (jobs.length) {
      const { data: j } = await admin.from("jobs").upsert(jobs, { onConflict: "dedupe_key", ignoreDuplicates: true }).select("id");
      reminders = j?.length ?? 0;
    }
  }
  return { created: inserted?.length ?? 0, resumed: resumed.length, reminders };
}

export interface CheckInResult {
  duplicate: boolean;
  status: OccurrenceStatus;
  result: string;
  rewards: { kind: string; points: number; label: string }[];
  check_in_id?: string;
}

/** Service-side check-in (WhatsApp / assistant). Web uses the RLS-scoped record_check_in RPC. */
export async function applyCheckIn(
  admin: AdminClient,
  userId: string,
  occurrenceId: string,
  kind: CheckInKind,
  opts: { reason?: string | null; note?: string | null; channel: Channel; idempotencyKey: string; snoozeMinutes?: number },
): Promise<CheckInResult> {
  const { data, error } = await admin.rpc("apply_check_in_internal", {
    p_user: userId,
    p_occurrence: occurrenceId,
    p_kind: kind,
    p_reason: opts.reason ?? undefined,
    p_note: opts.note ?? undefined,
    p_channel: opts.channel,
    p_idempotency_key: opts.idempotencyKey,
    p_snooze_minutes: opts.snoozeMinutes ?? 60,
  });
  if (error) throw new Error(error.message);
  const r = data as unknown as CheckInResult;
  if (kind === "later" && !r.duplicate) await scheduleSnoozeReminder(admin, userId, occurrenceId);
  return r;
}

export async function scheduleSnoozeReminder(admin: AdminClient, userId: string, occurrenceId: string) {
  const { data: occ } = await admin.from("action_occurrences").select("id, item_id, plan_id, item_version, snooze_until").eq("id", occurrenceId).eq("user_id", userId).single();
  if (!occ?.snooze_until) return;
  await admin.from("jobs").upsert(
    {
      user_id: userId,
      kind: "reminder",
      run_at: occ.snooze_until,
      plan_item_version: occ.item_version,
      dedupe_key: `reminder:${occ.id}:snooze:${occ.snooze_until}`,
      payload: { occurrence_id: occ.id, item_id: occ.item_id, plan_id: occ.plan_id, snooze: true },
    },
    { onConflict: "dedupe_key", ignoreDuplicates: true },
  );
}

export type TodayAction = Occurrence & { display: OccurrenceStatus; item: Pick<PlanItem, "id" | "title" | "category" | "instructions" | "evidence_hint" | "schedule_kind"> & { plan_mode: string; plan_title: string } };

/** Today's actions (plus this week's weekly-target occurrences), ordered by due time. */
export async function getToday(db: AdminClient, userId: string, tz: string, now = new Date()): Promise<TodayAction[]> {
  const today = localDateOf(now, tz);
  const { data } = await db
    .from("action_occurrences")
    .select("*, plan_items!inner(id, title, category, instructions, evidence_hint, schedule_kind, care_plans!inner(mode, title))")
    .eq("user_id", userId)
    .gte("local_date", addDays(today, -6))
    .lte("local_date", today)
    .order("due_at");
  return (data ?? [])
    .filter((o) => o.local_date === today || (o.target_count > 1 && new Date(o.window_end_at) > now))
    .map((o) => {
      const { plan_items, ...occ } = o as typeof o & { plan_items: PlanItem & { care_plans: { mode: string; title: string } } };
      return {
        ...(occ as Occurrence),
        display: displayStatus(occ as Occurrence, now),
        item: { id: plan_items.id, title: plan_items.title, category: plan_items.category, instructions: plan_items.instructions, evidence_hint: plan_items.evidence_hint, schedule_kind: plan_items.schedule_kind, plan_mode: plan_items.care_plans.mode, plan_title: plan_items.care_plans.title },
      };
    });
}

/** The occurrence a short reply ("done", a photo) most plausibly refers to. */
export function pickRelevantOccurrence(actions: TodayAction[], forEvidence = false, now = new Date()): TodayAction | null {
  const open = actions.filter((a) => ["due", "awaiting_response", "later"].includes(a.display));
  if (open.length) {
    return open.sort((a, b) => Math.abs(new Date(a.due_at).getTime() - now.getTime()) - Math.abs(new Date(b.due_at).getTime() - now.getTime()))[0];
  }
  if (forEvidence) {
    const done = actions.filter((a) => a.display === "self_reported").sort((a, b) => b.status_changed_at.localeCompare(a.status_changed_at));
    if (done.length) return done[0];
  }
  const weekly = actions.find((a) => a.target_count > 1 && a.display !== "self_reported");
  return weekly ?? null;
}

export async function audit(admin: AdminClient, userId: string | null, actor: "user" | "assistant" | "system" | "worker", action: string, entity: string, entityId?: string, details: Json = {}) {
  await admin.from("audit_events").insert({ user_id: userId, actor, action, entity, entity_id: entityId ?? null, details });
}
