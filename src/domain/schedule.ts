// Pure scheduling utilities. Canonical instants are UTC Date objects; local wall-clock
// values are always interpreted in an explicit IANA timezone. No Next.js imports here.
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";

export type ScheduleKind = "daily" | "weekdays" | "weekly_target" | "once";

export interface SchedulableItem {
  id: string;
  plan_id: string;
  version: number;
  schedule_kind: ScheduleKind;
  times: string[];
  weekdays: number[]; // ISO 1 (Mon) .. 7 (Sun)
  weekly_target: number | null;
  once_date: string | null;
  window_minutes: number;
}

export interface PlannedOccurrence {
  item_id: string;
  plan_id: string;
  item_version: number;
  due_at: string; // ISO UTC
  window_end_at: string; // ISO UTC
  local_date: string; // YYYY-MM-DD in user's zone
  local_time: string | null; // HH:MM
  timezone: string;
  target_count: number;
}

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidTime(t: string): boolean {
  return TIME_RE.test(t);
}

export function isValidTimeZone(tz: string): boolean {
  if (!tz || tz.length > 64) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Convert a local wall-clock date+time in `tz` to a UTC Date. */
export function localToUtc(date: string, time: string, tz: string): Date {
  if (!DATE_RE.test(date) || !TIME_RE.test(time)) throw new Error("invalid_local_datetime");
  return fromZonedTime(`${date}T${time}:00`, tz);
}

export function localDateOf(instant: Date, tz: string): string {
  return formatInTimeZone(instant, tz, "yyyy-MM-dd");
}

export function localTimeOf(instant: Date, tz: string): string {
  return formatInTimeZone(instant, tz, "HH:mm");
}

export function addDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** ISO weekday (1=Mon..7=Sun) of a calendar date string (zone-independent). */
export function isoWeekday(date: string): number {
  const d = new Date(`${date}T00:00:00Z`).getUTCDay();
  return d === 0 ? 7 : d;
}

/** Monday of the ISO week containing `date`. */
export function weekStart(date: string): string {
  return addDays(date, 1 - isoWeekday(date));
}

/**
 * Expand an item's schedule into concrete occurrences for local dates
 * [fromDate, fromDate + days). Deterministic and idempotent: the database enforces
 * unique (item_id, due_at), so re-running never duplicates.
 */
export function planOccurrences(item: SchedulableItem, tz: string, fromDate: string, days: number): PlannedOccurrence[] {
  if (!isValidTimeZone(tz)) throw new Error("invalid_timezone");
  if (days < 1 || days > 60) throw new Error("invalid_range");
  const out: PlannedOccurrence[] = [];
  const base = { item_id: item.id, plan_id: item.plan_id, item_version: item.version, timezone: tz };
  const windowMs = item.window_minutes * 60_000;

  if (item.schedule_kind === "weekly_target") {
    const target = Math.max(1, Math.min(7, item.weekly_target ?? 1));
    const seen = new Set<string>();
    for (let i = 0; i < days; i++) {
      const ws = weekStart(addDays(fromDate, i));
      if (seen.has(ws)) continue;
      seen.add(ws);
      const start = localToUtc(ws, "00:00", tz);
      const end = localToUtc(addDays(ws, 7), "00:00", tz);
      out.push({ ...base, due_at: start.toISOString(), window_end_at: end.toISOString(), local_date: ws, local_time: null, target_count: target });
    }
    return out;
  }

  const times = (item.times.length ? item.times : ["09:00"]).filter(isValidTime);
  for (let i = 0; i < days; i++) {
    const date = addDays(fromDate, i);
    if (item.schedule_kind === "weekdays" && !item.weekdays.includes(isoWeekday(date))) continue;
    if (item.schedule_kind === "once" && item.once_date !== date) continue;
    for (const t of item.schedule_kind === "once" ? times.slice(0, 1) : times) {
      const due = localToUtc(date, t, tz);
      out.push({
        ...base,
        due_at: due.toISOString(),
        window_end_at: new Date(due.getTime() + windowMs).toISOString(),
        local_date: date,
        local_time: t,
        target_count: 1,
      });
    }
  }
  return out;
}

function minutesOf(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

/** Is a local HH:MM inside the quiet window (which may wrap past midnight)? */
export function inQuietHours(localTime: string, quietStart: string, quietEnd: string): boolean {
  const t = minutesOf(localTime);
  const s = minutesOf(quietStart);
  const e = minutesOf(quietEnd);
  if (s === e) return false;
  return s < e ? t >= s && t < e : t >= s || t < e;
}

/**
 * Notification time respecting quiet hours. Only the REMINDER moves; the action's
 * due time and prescribed timing are never changed by this.
 */
export function reminderSendTime(dueUtc: Date, tz: string, quietStart: string, quietEnd: string): { sendAt: Date; shifted: boolean } {
  const lt = localTimeOf(dueUtc, tz);
  if (!inQuietHours(lt, quietStart, quietEnd)) return { sendAt: dueUtc, shifted: false };
  const ld = localDateOf(dueUtc, tz);
  // quiet end later today (if window hasn't wrapped yet) or tomorrow
  let endDate = ld;
  if (minutesOf(lt) >= minutesOf(quietEnd)) endDate = addDays(ld, 1);
  return { sendAt: localToUtc(endDate, quietEnd, tz), shifted: true };
}

export type OccurrenceStatus =
  | "pending" | "due" | "awaiting_response" | "later" | "self_reported" | "evidence_supported"
  | "needs_review" | "skipped" | "unable" | "missed" | "paused" | "no_response";

export const OPEN_STATUSES: OccurrenceStatus[] = ["pending", "due", "awaiting_response", "later"];
export const COMPLETED_STATUSES: OccurrenceStatus[] = ["self_reported", "evidence_supported"];

/** What the user should see right now, before the worker has caught up. */
export function displayStatus(
  occ: { status: OccurrenceStatus; due_at: string; window_end_at: string; snooze_until?: string | null },
  now: Date = new Date(),
): OccurrenceStatus {
  const due = new Date(occ.due_at).getTime();
  const end = new Date(occ.window_end_at).getTime();
  const t = now.getTime();
  if (OPEN_STATUSES.includes(occ.status)) {
    if (t >= end) return "no_response"; // silence rule: unknown, not "missed"
    if (occ.status === "later") {
      return occ.snooze_until && new Date(occ.snooze_until).getTime() > t ? "later" : "due";
    }
    if (occ.status === "pending" && t >= due) return "due";
  }
  return occ.status;
}
