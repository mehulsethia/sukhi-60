import "server-only";
// Companion features run by the worker: medicine refill reminders, family alerts and
// auto-resuming paused plans. None of these change a schedule, dose or care plan.
import type { AdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/database.types";
import { addDays, localDateOf } from "@/domain/schedule";
import { materializeOccurrences } from "./core";
import { sendPush } from "./push";
import en from "../../messages/en.json";
import hi from "../../messages/hi.json";
import mr from "../../messages/mr.json";

/** Pilot defaults, in one place. */
export const COMPANION_POLICY = {
  /** Warn when medicine stock covers this many days or fewer. */
  refillWarnDays: 5,
  /** Repeat a refill reminder for the same item at most this often. */
  refillRepeatDays: 3,
  /** Family "inactive" alert after this many full local days with no check-ins and no app use. */
  inactiveDays: 2,
} as const;

const DICT = { en: en.companion, hi: hi.companion, mr: mr.companion } as const;
export function ctext(locale: string, key: keyof typeof en.companion, vars: Record<string, string | number> = {}) {
  const d = (DICT[locale as keyof typeof DICT] ?? DICT.en) as Record<string, string>;
  return (d[key] ?? en.companion[key]).replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ""));
}

// ---------------------------------------------------------------------------
// Medicine stock
// ---------------------------------------------------------------------------
export interface StockItem { stock_count: number | null; units_per_dose: number; schedule_kind: string; times: string[]; weekdays: number[]; weekly_target: number | null }

/** Doses per day implied by the schedule as written (never changed here). */
export function dosesPerDay(i: Pick<StockItem, "schedule_kind" | "times" | "weekdays" | "weekly_target">): number {
  if (i.schedule_kind === "daily") return Math.max(1, i.times.length);
  if (i.schedule_kind === "weekdays") return (Math.max(1, i.times.length) * Math.max(1, i.weekdays.length)) / 7;
  if (i.schedule_kind === "weekly_target") return (i.weekly_target ?? 1) / 7;
  return 0;
}

/** Whole days the current stock lasts, or null when not tracked / not applicable. */
export function daysLeft(i: StockItem): number | null {
  if (i.stock_count === null || i.stock_count === undefined) return null;
  const perDay = dosesPerDay(i) * Math.max(1, i.units_per_dose);
  if (perDay <= 0) return null;
  return Math.floor(i.stock_count / perDay);
}

type Prof = { id: string; locale: string; timezone: string; display_name?: string | null };

/** Once a day (first check-in slot): remind about medicines that are running low. */
export async function runRefillChecks(admin: AdminClient, p: Prof, today: string, now = new Date()): Promise<number> {
  const { data: items } = await admin
    .from("plan_items")
    .select("id, title, stock_count, units_per_dose, schedule_kind, times, weekdays, weekly_target, care_plans!inner(status)")
    .eq("user_id", p.id)
    .eq("status", "confirmed")
    .not("stock_count", "is", null)
    .eq("care_plans.status", "active");
  let n = 0;
  for (const it of items ?? []) {
    const left = daysLeft(it);
    if (left === null || left > COMPANION_POLICY.refillWarnDays) continue;
    const since = new Date(now.getTime() - COMPANION_POLICY.refillRepeatDays * 86_400_000).toISOString();
    const { count } = await admin.from("messages").select("id", { count: "exact", head: true }).eq("user_id", p.id).like("provider_message_id", `refill:${it.id}:%`).gte("created_at", since);
    if (count) continue;
    const text = left <= 0 ? ctext(p.locale, "refillOut", { title: it.title }) : ctext(p.locale, "refillLow", { title: it.title, days: left });
    const { error } = await admin.from("messages").upsert(
      { user_id: p.id, role: "assistant", channel: "system", content: text, source_refs: [{ type: "checkin", id: "refill", label: "refill" }] as unknown as Json, provider_message_id: `refill:${it.id}:${today}` },
      { onConflict: "provider_message_id", ignoreDuplicates: true },
    );
    if (error) continue;
    n++;
    await sendPush(admin, p.id, { title: ctext(p.locale, "pushRefillTitle"), body: text, url: "/plan", tag: `refill-${it.id}` }).catch(() => 0);
    await notifyFamily(admin, p.id, "low_stock", `${it.id}:${today}`).catch(() => 0);
  }
  return n;
}

// ---------------------------------------------------------------------------
// Family alerts (only to members the patient gave the separate "alerts" scope)
// ---------------------------------------------------------------------------
export type FamilyAlertKind = "inactive" | "low_stock" | "not_well";

export async function notifyFamily(admin: AdminClient, patientId: string, kind: FamilyAlertKind, dedupe: string): Promise<number> {
  const { data: access } = await admin.from("family_access").select("id, member_user_id, scopes").eq("patient_id", patientId).eq("status", "active").contains("scopes", ["alerts"]);
  if (!access?.length) return 0;
  const { data: patient } = await admin.from("profiles").select("display_name").eq("id", patientId).single();
  const first = patient?.display_name?.split(" ")[0] || null;
  let n = 0;
  for (const a of access) {
    if (!a.member_user_id) continue;
    const { data: row } = await admin
      .from("family_alerts")
      .upsert({ access_id: a.id, patient_id: patientId, member_user_id: a.member_user_id, kind, dedupe_key: `${kind}:${a.id}:${dedupe}` }, { onConflict: "dedupe_key", ignoreDuplicates: true })
      .select("id")
      .maybeSingle();
    if (!row) continue;
    n++;
    const { data: member } = await admin.from("profiles").select("locale").eq("id", a.member_user_id).maybeSingle();
    const l = member?.locale ?? "en";
    const name = first ?? ctext(l, "someone");
    await sendPush(admin, a.member_user_id, { title: ctext(l, "pushFamilyTitle"), body: ctext(l, `family_${kind}`, { name }), url: `/family/${a.id}`, tag: `fam-${a.id}-${kind}` }).catch(() => 0);
    // Family members on WhatsApp get the same alert there.
    await import("./wa/family").then((m) => m.familyAlertWhatsApp(admin, a.member_user_id!, ctext(l, `family_${kind}`, { name }), `${kind}:${a.id}:${dedupe}`)).catch(() => undefined);
  }
  if (n) await admin.from("audit_events").insert({ user_id: patientId, actor: "system", action: "family_alert", entity: "family_alert", details: { kind, recipients: n } as Json });
  return n;
}

/**
 * Hourly: a patient with "alerts" members who had planned actions but no check-ins and no
 * app use on each of the last N full local days. Silence is reported as "no activity",
 * never as a missed dose.
 */
export async function runInactivityAlerts(admin: AdminClient, now = new Date()): Promise<number> {
  const { data: access } = await admin.from("family_access").select("patient_id").eq("status", "active").contains("scopes", ["alerts"]).limit(500);
  const patients = [...new Set((access ?? []).map((a) => a.patient_id))];
  let n = 0;
  for (const pid of patients) {
    const { data: prof } = await admin.from("profiles").select("timezone").eq("id", pid).single();
    const today = localDateOf(now, prof?.timezone ?? "Asia/Kolkata");
    const days = Array.from({ length: COMPANION_POLICY.inactiveDays }, (_, i) => addDays(today, -(i + 1)));
    const [{ data: occ }, { count: checks }, { count: opens }] = await Promise.all([
      admin.from("action_occurrences").select("local_date").eq("user_id", pid).eq("target_count", 1).in("local_date", days).neq("status", "paused"),
      admin.from("check_ins").select("id", { count: "exact", head: true }).eq("user_id", pid).in("local_date", days),
      admin.from("app_activity").select("day", { count: "exact", head: true }).eq("user_id", pid).in("day", days),
    ]);
    const plannedEveryDay = days.every((d) => (occ ?? []).some((o) => o.local_date === d));
    if (!plannedEveryDay || (checks ?? 0) > 0 || (opens ?? 0) > 0) continue;
    n += await notifyFamily(admin, pid, "inactive", today);
  }
  return n;
}

// ---------------------------------------------------------------------------
// Pause until a date
// ---------------------------------------------------------------------------
/** Every tick: resume plans whose pause date has arrived in the user's own timezone. */
export async function resumePausedPlans(admin: AdminClient, now = new Date()): Promise<number> {
  const { data: plans } = await admin.from("care_plans").select("id, user_id, paused_until").eq("status", "paused").not("paused_until", "is", null).lte("paused_until", addDays(now.toISOString().slice(0, 10), 1)).limit(200);
  let n = 0;
  for (const pl of plans ?? []) {
    const { data: prof } = await admin.from("profiles").select("timezone").eq("id", pl.user_id).single();
    if (localDateOf(now, prof?.timezone ?? "Asia/Kolkata") < pl.paused_until!) continue;
    const { error } = await admin.from("care_plans").update({ status: "active", paused_until: null, pause_reason: null }).eq("id", pl.id).eq("status", "paused");
    if (error) continue;
    n++;
    await materializeOccurrences(admin, pl.user_id, 7).catch(() => undefined);
    await admin.from("audit_events").insert({ user_id: pl.user_id, actor: "system", action: "plan_auto_resumed", entity: "care_plan", entity_id: pl.id });
  }
  return n;
}
