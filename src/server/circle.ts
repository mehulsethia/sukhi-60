import "server-only";
// Circles: you + up to 5 friends. Points finally mean something because someone else sees
// them: a weekly leaderboard, a small feed of finished days / streaks / comebacks / missed
// days, cheers, and nudges that land as a push on a friend's phone.
// Privacy: circle-mates only see first names, weekly points, streaks, today's done/total
// counts and these posts. Never plan items, titles, messages or health details.
// Every function takes a userId established from a verified session (or the worker).
import type { AdminClient } from "@/lib/supabase/admin";
import { addDays, inQuietHours, localDateOf, localTimeOf, weekStart, type OccurrenceStatus } from "@/domain/schedule";
import { sendPush } from "./push";
import en from "../../messages/en.json";
import hi from "../../messages/hi.json";
import mr from "../../messages/mr.json";

export const CIRCLE_MAX = 6; // owner + 5 friends
export const REACTIONS = ["cheer", "fire", "hug", "nudge"] as const;
export type Reaction = (typeof REACTIONS)[number];
export type PostKind = "joined" | "day_done" | "streak" | "milestone" | "missed" | "comeback" | "note";
const STREAK_POSTS = [3, 7, 14, 21, 30, 50, 100];
const DONE: OccurrenceStatus[] = ["self_reported", "evidence_supported"];
const ANSWERED: OccurrenceStatus[] = ["self_reported", "evidence_supported", "skipped", "unable", "missed", "needs_review"];

const DICT = { en, hi, mr } as const;
function ct(locale: string, key: keyof typeof en.circle, vars: Record<string, string | number> = {}) {
  const d = (DICT[locale as keyof typeof DICT] ?? en).circle as Record<string, string>;
  return (d[key] ?? en.circle[key]).replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ""));
}
const firstName = (n: string | null | undefined) => n?.trim().split(/\s+/)[0]?.slice(0, 30) || null;

function newCode(): string {
  const A = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const b = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(b, (x) => A[x % A.length]).join("");
}

export async function myCircleId(admin: AdminClient, userId: string): Promise<string | null> {
  const { data } = await admin.from("circle_members").select("circle_id").eq("user_id", userId).maybeSingle();
  return data?.circle_id ?? null;
}

/** Everyone has a circle (at first just themselves), so the invite link always exists. */
export async function ensureCircle(admin: AdminClient, userId: string): Promise<string> {
  const existing = await myCircleId(admin, userId);
  if (existing) return existing;
  for (let i = 0; i < 4; i++) {
    const { data: c, error } = await admin.from("circles").insert({ owner_id: userId, invite_code: newCode() }).select("id").single();
    if (error || !c) continue; // code collision: try another
    const { error: mErr } = await admin.from("circle_members").insert({ circle_id: c.id, user_id: userId });
    if (!mErr) return c.id;
    await admin.from("circles").delete().eq("id", c.id);
    const raced = await myCircleId(admin, userId);
    if (raced) return raced;
  }
  throw new Error("circle_create_failed");
}

async function memberIds(admin: AdminClient, circleId: string): Promise<string[]> {
  const { data } = await admin.from("circle_members").select("user_id").eq("circle_id", circleId).order("joined_at");
  return (data ?? []).map((m) => m.user_id);
}

/** Consecutive days with any answer, ending today or yesterday. */
function streakFrom(dates: Set<string>, today: string): number {
  let d = dates.has(today) ? today : addDays(today, -1);
  let n = 0;
  while (dates.has(d)) { n++; d = addDays(d, -1); }
  return n;
}

export interface CircleMember { userId: string; name: string | null; points: number; streak: number; doneToday: number; totalToday: number; me: boolean }
export interface CirclePost { id: string; userId: string; name: string | null; kind: PostKind; meta: Record<string, unknown>; createdAt: string; counts: Record<Reaction, number>; mine: Reaction[]; me: boolean }

export async function getCircleView(admin: AdminClient, userId: string, tz: string) {
  const circleId = await ensureCircle(admin, userId);
  const today = localDateOf(new Date(), tz);
  const ws = weekStart(today);
  const [{ data: circle }, ids] = await Promise.all([admin.from("circles").select("id, name, invite_code, owner_id").eq("id", circleId).single(), memberIds(admin, circleId)]);
  const [{ data: profiles }, { data: pts }, { data: occ }, { data: ans }, { data: posts }] = await Promise.all([
    admin.from("profiles").select("id, display_name").in("id", ids),
    admin.from("reward_events").select("user_id, points").in("user_id", ids).gte("local_date", ws),
    admin.from("action_occurrences").select("user_id, status").in("user_id", ids).eq("local_date", today).neq("status", "paused"),
    admin.from("action_occurrences").select("user_id, local_date").in("user_id", ids).gte("local_date", addDays(today, -60)).in("status", ANSWERED),
    admin.from("circle_posts").select("id, user_id, kind, meta, created_at").eq("circle_id", circleId).order("created_at", { ascending: false }).limit(40),
  ]);
  const names = new Map((profiles ?? []).map((p) => [p.id, firstName(p.display_name)]));
  const members: CircleMember[] = ids.map((id) => {
    const days = new Set((ans ?? []).filter((a) => a.user_id === id).map((a) => a.local_date));
    const mine = (occ ?? []).filter((o) => o.user_id === id);
    return {
      userId: id,
      name: names.get(id) ?? null,
      points: (pts ?? []).filter((p) => p.user_id === id).reduce((s, p) => s + Math.max(0, p.points), 0),
      streak: streakFrom(days, today),
      doneToday: mine.filter((o) => DONE.includes(o.status)).length,
      totalToday: mine.length,
      me: id === userId,
    };
  }).sort((a, b) => b.points - a.points || b.streak - a.streak);
  const postIds = (posts ?? []).map((p) => p.id);
  const { data: reacts } = postIds.length ? await admin.from("circle_reactions").select("post_id, user_id, kind").in("post_id", postIds) : { data: [] };
  const feed: CirclePost[] = (posts ?? []).map((p) => {
    const rs = (reacts ?? []).filter((r) => r.post_id === p.id);
    const counts = Object.fromEntries(REACTIONS.map((k) => [k, rs.filter((r) => r.kind === k).length])) as Record<Reaction, number>;
    return { id: p.id, userId: p.user_id, name: names.get(p.user_id) ?? null, kind: p.kind as PostKind, meta: (p.meta ?? {}) as Record<string, unknown>, createdAt: p.created_at, counts, mine: rs.filter((r) => r.user_id === userId).map((r) => r.kind as Reaction), me: p.user_id === userId };
  });
  return { circle: { id: circleId, name: circle?.name ?? "My circle", code: circle?.invite_code ?? "", isOwner: circle?.owner_id === userId }, members, feed, slotsLeft: Math.max(0, CIRCLE_MAX - ids.length) };
}

/** Push to circle-mates (not the actor), outside each person's quiet hours. */
async function notify(admin: AdminClient, circleId: string, exceptUserId: string, build: (locale: string) => { title: string; body: string } | null, filter?: (userId: string) => boolean) {
  const ids = (await memberIds(admin, circleId)).filter((id) => id !== exceptUserId && (!filter || filter(id)));
  if (!ids.length) return;
  const { data: profs } = await admin.from("profiles").select("id, locale, timezone, quiet_start, quiet_end").in("id", ids);
  await Promise.all((profs ?? []).map(async (p) => {
    try { if (inQuietHours(localTimeOf(new Date(), p.timezone), p.quiet_start, p.quiet_end)) return; } catch { return; }
    const m = build(p.locale);
    if (m) await sendPush(admin, p.id, { ...m, url: "/circle", tag: `circle-${circleId}` }).catch(() => 0);
  }));
}

async function pushOne(admin: AdminClient, userId: string, build: (locale: string) => { title: string; body: string }) {
  const { data: p } = await admin.from("profiles").select("locale, timezone, quiet_start, quiet_end").eq("id", userId).maybeSingle();
  if (!p) return;
  try { if (inQuietHours(localTimeOf(new Date(), p.timezone), p.quiet_start, p.quiet_end)) return; } catch { return; }
  await sendPush(admin, userId, { ...build(p.locale), url: "/circle", tag: "circle" }).catch(() => 0);
}

async function nameOf(admin: AdminClient, userId: string) {
  const { data } = await admin.from("profiles").select("display_name").eq("id", userId).maybeSingle();
  return firstName(data?.display_name);
}

/** Add a feed post for the user's circle. Idempotent by dedupe key. Returns true if new. */
export async function postToCircle(admin: AdminClient, userId: string, kind: PostKind, meta: Record<string, string | number> = {}, dedupeKey?: string): Promise<{ circleId: string; created: boolean } | null> {
  const circleId = await myCircleId(admin, userId);
  if (!circleId) return null;
  const { data } = await admin.from("circle_posts").upsert({ circle_id: circleId, user_id: userId, kind, meta, dedupe_key: dedupeKey ?? null }, { onConflict: "dedupe_key", ignoreDuplicates: true }).select("id");
  return { circleId, created: !!data?.length };
}

export type JoinResult = "joined" | "already" | "invalid" | "full" | "in_other";

export async function joinCircle(admin: AdminClient, userId: string, rawCode: string, opts: { leaveCurrent?: boolean } = {}): Promise<JoinResult> {
  const code = rawCode.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
  if (code.length !== 8) return "invalid";
  const { data: target } = await admin.from("circles").select("id").eq("invite_code", code).maybeSingle();
  if (!target) return "invalid";
  const current = await myCircleId(admin, userId);
  if (current === target.id) return "already";
  if (current) {
    const others = (await memberIds(admin, current)).filter((id) => id !== userId);
    if (others.length && !opts.leaveCurrent) return "in_other";
    await leaveCircle(admin, userId);
  }
  const { error } = await admin.from("circle_members").insert({ circle_id: target.id, user_id: userId });
  if (error) {
    if (error.message.includes("circle_full")) { await ensureCircle(admin, userId); return "full"; }
    if ((await myCircleId(admin, userId)) === target.id) return "already";
    throw new Error("join_failed");
  }
  await postToCircle(admin, userId, "joined", {}, `joined:${target.id}:${userId}`);
  const name = (await nameOf(admin, userId)) ?? "";
  await notify(admin, target.id, userId, (l) => ({ title: ct(l, "pushTitle"), body: ct(l, "pushJoined", { name: name || ct(l, "someone") }) }));
  return "joined";
}

export async function leaveCircle(admin: AdminClient, userId: string) {
  const circleId = await myCircleId(admin, userId);
  if (!circleId) return;
  await admin.from("circle_members").delete().eq("user_id", userId);
  const rest = await memberIds(admin, circleId);
  if (!rest.length) await admin.from("circles").delete().eq("id", circleId);
  else await admin.from("circles").update({ owner_id: rest[0] }).eq("id", circleId).eq("owner_id", userId);
}

/** Toggle a reaction. A nudge can't be taken back and only goes on a friend's post. */
export async function react(admin: AdminClient, userId: string, postId: string, kind: Reaction): Promise<"added" | "removed" | "not_allowed"> {
  const circleId = await myCircleId(admin, userId);
  const { data: post } = await admin.from("circle_posts").select("id, circle_id, user_id, kind").eq("id", postId).maybeSingle();
  if (!post || !circleId || post.circle_id !== circleId) return "not_allowed";
  if (kind === "nudge" && (post.user_id === userId || post.kind !== "missed")) return "not_allowed";
  const { data: existing } = await admin.from("circle_reactions").select("post_id").eq("post_id", postId).eq("user_id", userId).eq("kind", kind).maybeSingle();
  if (existing) {
    if (kind === "nudge") return "added";
    await admin.from("circle_reactions").delete().eq("post_id", postId).eq("user_id", userId).eq("kind", kind);
    return "removed";
  }
  const { error } = await admin.from("circle_reactions").insert({ post_id: postId, user_id: userId, kind });
  if (error) return "added"; // a double tap raced; same end state
  if (post.user_id !== userId) {
    const name = (await nameOf(admin, userId)) ?? "";
    const key = ({ cheer: "pushCheer", fire: "pushFire", hug: "pushHug", nudge: "pushNudge" } as const)[kind];
    await pushOne(admin, post.user_id, (l) => ({ title: ct(l, key, { name: name || ct(l, "someone") }), body: kind === "nudge" ? ct(l, "pushNudgeBody") : ct(l, "pushReactBody") }));
  }
  return "added";
}

/**
 * After a "done": finished the whole day → post + a FOMO push to friends who haven't yet;
 * done after a missed day → comeback post; new milestones → milestone post.
 */
export async function afterDone(admin: AdminClient, userId: string, rewards: { kind: string; label: string }[] = []) {
  const circleId = await myCircleId(admin, userId);
  if (!circleId) return;
  const { data: prof } = await admin.from("profiles").select("timezone, display_name").eq("id", userId).single();
  if (!prof) return;
  const today = localDateOf(new Date(), prof.timezone);
  for (const r of rewards.filter((x) => x.kind === "milestone")) await postToCircle(admin, userId, "milestone", { label: r.label.slice(0, 60) }, `milestone:${userId}:${today}:${r.label.slice(0, 40)}`);
  const { data: missed } = await admin.from("circle_posts").select("id").eq("user_id", userId).eq("kind", "missed").eq("dedupe_key", `missed:${userId}:${addDays(today, -1)}`).maybeSingle();
  if (missed) await postToCircle(admin, userId, "comeback", {}, `comeback:${userId}:${today}`);
  const { data: occ } = await admin.from("action_occurrences").select("status").eq("user_id", userId).eq("local_date", today).neq("status", "paused");
  const total = (occ ?? []).length;
  const done = (occ ?? []).filter((o) => DONE.includes(o.status)).length;
  if (!total || done < total) return;
  const posted = await postToCircle(admin, userId, "day_done", { n: total }, `day_done:${userId}:${today}`);
  if (!posted?.created) return;
  // Friends who still have things open today get a gentle "your turn?".
  const ids = (await memberIds(admin, circleId)).filter((id) => id !== userId);
  if (!ids.length) return;
  const { data: theirs } = await admin.from("action_occurrences").select("user_id, status").in("user_id", ids).eq("local_date", today).neq("status", "paused");
  const open = new Set((theirs ?? []).filter((o) => !ANSWERED.includes(o.status)).map((o) => o.user_id));
  const name = firstName(prof.display_name) ?? "";
  await notify(admin, circleId, userId, (l) => ({ title: ct(l, "pushDayDone", { name: name || ct(l, "someone") }), body: ct(l, "pushYourTurn") }), (id) => open.has(id));
}

/** Once a day (first check-in slot): yesterday's miss, or a streak worth celebrating. */
export async function postDaily(admin: AdminClient, userId: string, date: string) {
  if (!(await myCircleId(admin, userId))) return;
  const yesterday = addDays(date, -1);
  const { data: occ } = await admin.from("action_occurrences").select("local_date, status").eq("user_id", userId).gte("local_date", addDays(date, -60)).lt("local_date", date).neq("status", "paused");
  const y = (occ ?? []).filter((o) => o.local_date === yesterday);
  if (y.length && !y.some((o) => ANSWERED.includes(o.status))) {
    await postToCircle(admin, userId, "missed", {}, `missed:${userId}:${yesterday}`);
    return;
  }
  const days = new Set((occ ?? []).filter((o) => ANSWERED.includes(o.status)).map((o) => o.local_date));
  const streak = streakFrom(days, yesterday);
  if (STREAK_POSTS.includes(streak)) await postToCircle(admin, userId, "streak", { n: streak }, `streak:${userId}:${streak}:${yesterday}`);
}
