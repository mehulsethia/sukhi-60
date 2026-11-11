import "server-only";
import { cookies } from "next/headers";
import type { AdminClient } from "@/lib/supabase/admin";
import { addDays, localDateOf } from "@/domain/schedule";

export const NOTIF_COOKIE = "sukhi_notif_seen";

export type NotifKind = "due" | "reminder" | "drafts" | "assessment" | "milestone" | "proposal" | "missed" | "whatsapp" | "family";
export interface Notif {
  id: string;
  kind: NotifKind;
  /** Translation key under notif.* and its values. */
  key: string;
  values: Record<string, string | number>;
  href: string;
  at: string;
  unread: boolean;
}

/**
 * In-app notifications, derived from the user's own data (RLS client), newest first.
 * Read state is a per-device "seen until" timestamp cookie: no extra table needed.
 */
export async function getNotifications(db: AdminClient, userId: string, tz: string): Promise<Notif[]> {
  const now = new Date();
  const today = localDateOf(now, tz);
  const yesterday = addDays(today, -1);
  const since3d = new Date(now.getTime() - 3 * 86_400_000).toISOString();
  const since7d = new Date(now.getTime() - 7 * 86_400_000).toISOString();
  const seen = (await cookies()).get(NOTIF_COOKIE)?.value ?? "1970-01-01T00:00:00Z";

  const [due, missedY, drafts, evals, rewards, proposals, family, binding, consent] = await Promise.all([
    // Due now: inside its window and still unanswered (DB status may lag the scheduler).
    db.from("action_occurrences").select("id, due_at, status, plan_items!inner(title)").eq("user_id", userId).eq("local_date", today).in("status", ["pending", "due", "awaiting_response", "later"]).lte("due_at", now.toISOString()).gt("window_end_at", now.toISOString()).order("due_at"),
    db.from("action_occurrences").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("local_date", yesterday).eq("status", "no_response"),
    db.from("plan_items").select("id, plan_id, created_at").eq("user_id", userId).eq("status", "draft").order("created_at", { ascending: false }),
    db.from("evaluations").select("id, occurrence_id, outcome, created_at, action_occurrences!inner(plan_items!inner(title))").eq("user_id", userId).gte("created_at", since3d).order("created_at", { ascending: false }).limit(5),
    db.from("reward_events").select("id, kind, label, created_at").eq("user_id", userId).in("kind", ["milestone", "return"]).gte("created_at", since7d).order("created_at", { ascending: false }).limit(5),
    db.from("change_proposals").select("id, summary, created_at").eq("user_id", userId).eq("status", "pending").gt("expires_at", now.toISOString()),
    db.from("family_access").select("id, invitee_label, accepted_at").eq("patient_id", userId).eq("status", "active").gte("accepted_at", since7d),
    db.from("channel_bindings").select("id").eq("user_id", userId).neq("status", "revoked").maybeSingle(),
    db.from("consents").select("granted").eq("user_id", userId).eq("kind", "whatsapp").maybeSingle(),
  ]);

  const out: Omit<Notif, "unread">[] = [];
  for (const o of due.data ?? []) {
    out.push({ id: `due-${o.id}`, kind: "due", key: "due", values: { title: (o.plan_items as unknown as { title: string }).title }, href: "/today", at: o.due_at });
  }
  if ((missedY.count ?? 0) > 0) {
    out.push({ id: `missed-${yesterday}`, kind: "missed", key: "missedYesterday", values: { n: missedY.count ?? 0 }, href: "/progress", at: `${today}T03:00:00Z` });
  }
  if ((drafts.data ?? []).length) {
    const first = drafts.data![0];
    out.push({ id: `drafts-${first.id}`, kind: "drafts", key: "drafts", values: { n: drafts.data!.length }, href: `/plan/${first.plan_id}`, at: first.created_at });
  }
  for (const e of evals.data ?? []) {
    const title = (e.action_occurrences as unknown as { plan_items: { title: string } }).plan_items.title;
    out.push({ id: `eval-${e.id}`, kind: "assessment", key: e.outcome === "supports" ? "assessmentSupports" : "assessment", values: { title }, href: `/actions/${e.occurrence_id}`, at: e.created_at });
  }
  for (const r of rewards.data ?? []) {
    out.push({ id: `rw-${r.id}`, kind: "milestone", key: r.kind === "return" ? "welcomeBack" : "milestone", values: { label: r.label }, href: "/progress", at: r.created_at });
  }
  for (const p of proposals.data ?? []) {
    out.push({ id: `cp-${p.id}`, kind: "proposal", key: "proposal", values: { summary: p.summary }, href: "/chat", at: p.created_at });
  }
  for (const f of family.data ?? []) {
    out.push({ id: `fam-${f.id}`, kind: "family", key: "familyJoined", values: { name: f.invitee_label }, href: "/settings#family", at: f.accepted_at ?? now.toISOString() });
  }
  if (!binding.data && consent.data?.granted) {
    out.push({ id: "wa-setup", kind: "whatsapp", key: "whatsappSetup", values: {}, href: "/settings#wa", at: "2000-01-01T00:00:00Z" });
  }
  return out
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 20)
    .map((n) => ({ ...n, unread: n.kind === "due" || n.at > seen }));
}
