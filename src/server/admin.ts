import "server-only";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { getUser } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { settings } from "@/lib/config";

// ---------------------------------------------------------------------------
// Operator sessions. Admins sign in at /admin with an allow-listed email (ADMIN_EMAILS)
// and the operator password (ADMIN_PASSWORD, or the pilot default). The session is an
// HMAC-signed, httpOnly cookie that is independent of patient accounts.
// ---------------------------------------------------------------------------
export const ADMIN_COOKIE = "sukhi_admin";
const SESSION_HOURS = 12;
// SHA-256 of the pilot default password; override with ADMIN_PASSWORD in production.
const DEFAULT_PASSWORD_SHA256 = "105d5c2c30bb1236e55f3354f069d064e084166bff0dd3aa234489acb97d6a74";

function sessionKey() {
  const secret = process.env.ADMIN_SESSION_SECRET || process.env.WORKER_SECRET;
  if (!secret) throw new Error("config_missing:WORKER_SECRET");
  return createHmac("sha256", secret).update("sukhi-admin-session-v1").digest();
}
const sha256 = (s: string) => createHash("sha256").update(s).digest();
const sign = (payload: string) => createHmac("sha256", sessionKey()).update(payload).digest("base64url");

function safeEqual(a: Buffer, b: Buffer) {
  return a.length === b.length && timingSafeEqual(a, b);
}

export function checkAdminPassword(password: string) {
  const expected = process.env.ADMIN_PASSWORD ? sha256(process.env.ADMIN_PASSWORD) : Buffer.from(DEFAULT_PASSWORD_SHA256, "hex");
  return safeEqual(sha256(password), expected);
}

export function createAdminSession(email: string) {
  const exp = Date.now() + SESSION_HOURS * 3_600_000;
  const payload = `${Buffer.from(email.toLowerCase()).toString("base64url")}.${exp}`;
  return { value: `${payload}.${sign(payload)}`, maxAge: SESSION_HOURS * 3600 };
}

function readAdminSession(value: string | undefined): string | null {
  if (!value) return null;
  const parts = value.split(".");
  if (parts.length !== 3) return null;
  const [e, exp, sig] = parts;
  if (!safeEqual(Buffer.from(sig), Buffer.from(sign(`${e}.${exp}`)))) return null;
  if (!(Number(exp) > Date.now())) return null;
  const email = Buffer.from(e, "base64url").toString();
  return settings.adminEmails().includes(email) ? email : null;
}

/** The current operator's email, from the admin cookie or an allow-listed patient login. */
export async function currentAdmin(): Promise<string | null> {
  const fromCookie = readAdminSession((await cookies()).get(ADMIN_COOKIE)?.value);
  if (fromCookie) return fromCookie;
  const { user } = await getUser();
  const email = user?.email?.toLowerCase();
  return email && settings.adminEmails().includes(email) ? email : null;
}

/** Operator-only handlers: everyone else gets a 404. */
export async function requireAdmin() {
  const email = await currentAdmin();
  if (!email) notFound();
  return { email };
}

export function isAdminEmail(email: string | null | undefined) {
  return !!email && settings.adminEmails().includes(email.toLowerCase());
}

type KeyN = { key: string; n: number };
type Seg = { key: string; users?: number; due: number; done: number; rate: number | null };
export interface AdminUserRow {
  id: string; name: string | null; email: string; joined: string; onboarded: boolean; locale: string;
  setup_for: string | null; health_context: string | null; internal: boolean; active_days: number;
  last_active: string | null; streak: number; items: number; checkins: number; adherence: number | null; whatsapp: boolean;
}
export interface AdminMetrics {
  generated_at: string;
  range: { from: string; to: string; days: number };
  overview: {
    users: number; onboarded: number; activated: number; dau_today: number; wau: number; avg_dau_7d: number | null;
    checkins_total: number; checkins_7d: number; adherence_all: number | null; adherence_7d: number | null;
    response_rate_7d: number | null; silence_rate_7d: number | null; median_min_to_done: number | null;
    actions_completed: number; avg_active_days: number | null;
  };
  funnel: { step: string; n: number }[];
  daily: { day: string; dau: number; new_users: number; checkins: number; due: number; done: number; adherence: number | null; response_rate: number | null }[];
  retention: { cohort: string; size: number; d1: number | null; d3: number | null; d7: number | null }[];
  segments: { plan_mode: Seg[]; setup_for: Seg[]; health_context: Seg[]; locale: Seg[]; conditions: { key: string; users: number }[]; checkin_channel: KeyN[]; checkin_kind: KeyN[]; checkin_hour: { hour: number; n: number }[] };
  ai: {
    documents: number; extract_done: number; extract_failed: number; extract_avg_ms: number | null; items_extracted: number;
    items_extracted_confirmed: number; items_extracted_edited: number; items_manual: number; items_template: number;
    assistant_runs: number; assistant_users: number; assistant_p50_ms: number | null; assistant_p95_ms: number | null;
    assistant_error_rate: number | null; assistant_routes: KeyN[]; user_messages: number; evidence: KeyN[]; evaluation_outcomes: KeyN[];
  };
  reminders: { whatsapp_linked: number; outbound: KeyN[]; reminder_jobs_done: number; done_within_window: number | null; returns_after_gap: number };
  safety: { escalations: number; injection_blocked: number; review_requests: number; blocked_runs: number };
  users: AdminUserRow[];
  feed: { at: string; who: string; kind: string; channel: string; category: string }[];
}

export async function getAdminMetrics(days: number, includeInternal: boolean): Promise<AdminMetrics> {
  const { data, error } = await createAdminClient().rpc("admin_metrics", {
    p_days: days,
    p_include_internal: includeInternal,
    p_exclude_emails: includeInternal ? [] : settings.adminEmails(),
  });
  if (error || !data) throw new Error(`admin_metrics:${error?.message ?? "empty"}`);
  return data as unknown as AdminMetrics;
}
