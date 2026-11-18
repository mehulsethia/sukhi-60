import "server-only";
// Circles: you + up to 5 friends, and a person can be in up to 5 circles (family, office...). Points finally mean something because someone else sees
// them: a weekly leaderboard, a small feed of finished days / streaks / comebacks / missed
// days, cheers, and nudges that land as a push on a friend's phone.
// Privacy: circle-mates only see first names, weekly points, streaks, today's done/total
// counts and these posts. Never plan items, titles, messages or health details.
// Every function takes a userId established from a verified session (or the worker).
import type { AdminClient } from "@/lib/supabase/admin";
import { addDays, inQuietHours, localDateOf, localTimeOf, weekStart, type OccurrenceStatus } from "@/domain/schedule";
import { sendPush } from "./push";
import { audit } from "./core";
import { challengeScore } from "@/domain/points";
import en from "../../messages/en.json";
import hi from "../../messages/hi.json";
import mr from "../../messages/mr.json";

export const CIRCLE_MAX = 6; // owner + 5 friends
export const CIRCLES_PER_PERSON = 5;
export const REACTIONS = ["cheer", "fire", "hug", "nudge"] as const;
export type Reaction = (typeof REACTIONS)[number];
export type PostKind = "joined" | "day_done" | "streak" | "milestone" | "missed" | "comeback" | "note" | "challenge_start" | "challenge_last_day" | "challenge_end";
/** Challenge dates are Indian dates (the pilot runs in India). */
export const CHALLENGE_TZ = "Asia/Kolkata";
const STREAK_POSTS = [3, 7, 14, 21, 30, 50, 100];
const DONE: OccurrenceStatus[] = ["self_reported", "evidence_supported"];
const ANSWERED: OccurrenceStatus[] = ["self_reported", "evidence_supported", "skipped", "unable", "missed", "needs_review"];

const DICT = { en, hi, mr } as const;
function ct(locale: string, key: keyof typeof en.circle, vars: Record<string, string | number> = {}) {
  const d = (DICT[locale as keyof typeof DICT] ?? en).circle as Record<string, string>;
  return (d[key] ?? en.circle[key]).replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ""));
}
const firstName = (n: string | null | undefined) => n?.trim().split(/\s+/)[0]?.slice(0, 30) || null;

/** 5-digit join code: easy to read out or type. Guessing is rate-limited in joinCircle. */
function newCode(): string {
  const b = crypto.getRandomValues(new Uint32Array(1));
  return String(10000 + (b[0] % 90000));
}

/** Normalise what someone typed or tapped: a 5-digit code, or a legacy 8-character one. */
export function cleanCode(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (/^\d{5}$/.test(digits) && raw.replace(/[\s-]/g, "").length === 5) return digits;
  const legacy = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return legacy.length === 8 ? legacy : null;
}

export async function myCircleIds(admin: AdminClient, userId: string): Promise<string[]> {
  const { data } = await admin.from("circle_members").select("circle_id").eq("user_id", userId).order("joined_at");
  return (data ?? []).map((m) => m.circle_id);
}

async function isMember(admin: AdminClient, userId: string, circleId: string) {
  const { data } = await admin.from("circle_members").select("circle_id").eq("circle_id", circleId).eq("user_id", userId).maybeSingle();
  return !!data;
}

/** A new circle owned by this person, with a fresh code. */
export async function createCircle(admin: AdminClient, userId: string, name?: string): Promise<string | "too_many"> {
  const title = name?.replace(/\s+/g, " ").trim().slice(0, 40) || "My circle";
  if (title !== "My circle") await dropStarter(admin, userId);
  if ((await myCircleIds(admin, userId)).length >= CIRCLES_PER_PERSON) return "too_many";
  for (let i = 0; i < 6; i++) {
    const { data: c, error } = await admin.from("circles").insert({ owner_id: userId, invite_code: newCode(), name: title }).select("id").single();
    if (error || !c) continue; // code collision: try another
    const { error: mErr } = await admin.from("circle_members").insert({ circle_id: c.id, user_id: userId });
    if (!mErr) return c.id;
    await admin.from("circles").delete().eq("id", c.id);
    if (mErr.message.includes("too_many_circles")) return "too_many";
  }
  throw new Error("circle_create_failed");
}

/** Everyone has at least one circle (at first just themselves), so a code always exists. */
export async function ensureCircle(admin: AdminClient, userId: string): Promise<string> {
  const existing = await myCircleIds(admin, userId);
  if (existing.length) return existing[0];
  const id = await createCircle(admin, userId);
  if (id === "too_many") return (await myCircleIds(admin, userId))[0];
  return id;
}

/** The circle's creator can replace its code (the old code stops working). */
export async function newInviteCode(admin: AdminClient, userId: string, circleId: string): Promise<string | null> {
  const { data: c } = await admin.from("circles").select("owner_id").eq("id", circleId).maybeSingle();
  if (!c || c.owner_id !== userId) return null;
  for (let i = 0; i < 6; i++) {
    const code = newCode();
    const { error } = await admin.from("circles").update({ invite_code: code }).eq("id", circleId);
    if (!error) return code;
  }
  return null;
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

export interface CircleMember { userId: string; name: string | null; points: number; streak: number; doneToday: number; totalToday: number; me: boolean; done: number }
export interface CirclePost { id: string; userId: string | null; name: string | null; kind: PostKind; meta: Record<string, unknown>; createdAt: string; counts: Record<Reaction, number>; mine: Reaction[]; me: boolean }

/**
 * Leaderboard rows. Weekly board: everyday points (12-a-day task cap) since `from`, ties to the
 * longer streak. Challenge board (`to` given): every task at full value between the dates,
 * ties to more tasks done, then the longer streak.
 */
async function boardFor(admin: AdminClient, userId: string | null, ids: string[], today: string, from: string, to?: string): Promise<CircleMember[]> {
  if (!ids.length) return [];
  let ptsQ = admin.from("reward_events").select("user_id, kind, points").in("user_id", ids).gte("local_date", from);
  if (to) ptsQ = ptsQ.lte("local_date", to);
  const [{ data: profiles }, { data: pts }, { data: occ }, { data: ans }] = await Promise.all([
    admin.from("profiles").select("id, display_name").in("id", ids),
    ptsQ,
    admin.from("action_occurrences").select("user_id, status").in("user_id", ids).eq("local_date", today).neq("status", "paused"),
    admin.from("action_occurrences").select("user_id, local_date").in("user_id", ids).gte("local_date", addDays(today, -60)).in("status", ANSWERED),
  ]);
  const names = new Map((profiles ?? []).map((p) => [p.id, firstName(p.display_name)]));
  return ids.map((id) => {
    const days = new Set((ans ?? []).filter((a) => a.user_id === id).map((a) => a.local_date));
    const mine = (occ ?? []).filter((o) => o.user_id === id);
    const rows = (pts ?? []).filter((p) => p.user_id === id);
    const score = to ? challengeScore(rows) : { points: rows.reduce((s, p) => s + Math.max(0, p.points), 0), done: rows.filter((r) => r.kind === "completion").length };
    return {
      userId: id,
      name: names.get(id) ?? null,
      points: score.points,
      done: score.done,
      streak: streakFrom(days, today),
      doneToday: mine.filter((o) => DONE.includes(o.status)).length,
      totalToday: mine.length,
      me: id === userId,
    };
  }).sort((a, b) => b.points - a.points || (to ? b.done - a.done : 0) || b.streak - a.streak);
}

export type ChallengeState = "upcoming" | "live" | "ended";
export interface ChallengeInfo { startsOn: string; endsOn: string; prize: string | null; state: ChallengeState; daysLeft: number }
function challengeInfo(c: { starts_on: string | null; ends_on: string | null; prize: string | null }): ChallengeInfo {
  const today = localDateOf(new Date(), CHALLENGE_TZ);
  const startsOn = c.starts_on!, endsOn = c.ends_on!;
  const state: ChallengeState = today < startsOn ? "upcoming" : today > endsOn ? "ended" : "live";
  const daysLeft = Math.round((Date.parse(endsOn) - Date.parse(today)) / 86_400_000);
  return { startsOn, endsOn, prize: c.prize, state, daysLeft };
}

/** One circle's leaderboard and feed (the asked-for one if the person is in it, else their first). */
export async function getCircleView(admin: AdminClient, userId: string, tz: string, wantedId?: string | null) {
  await ensureCircle(admin, userId);
  const mineIds = await myCircleIds(admin, userId);
  const circleId = wantedId && mineIds.includes(wantedId) ? wantedId : mineIds[0];
  const today = localDateOf(new Date(), tz);
  const [{ data: circles }, ids] = await Promise.all([admin.from("circles").select("id, name, invite_code, owner_id, kind, starts_on, ends_on, prize").in("id", mineIds), memberIds(admin, circleId)]);
  const circle = (circles ?? []).find((c) => c.id === circleId);
  const challenge = circle?.kind === "challenge" ? challengeInfo(circle) : null;
  const [members, { data: posts }, { data: profiles }] = await Promise.all([
    challenge ? boardFor(admin, userId, ids, today, challenge.startsOn, challenge.endsOn) : boardFor(admin, userId, ids, today, weekStart(today)),
    admin.from("circle_posts").select("id, user_id, kind, meta, created_at").eq("circle_id", circleId).order("created_at", { ascending: false }).limit(40),
    admin.from("profiles").select("id, display_name").in("id", ids),
  ]);
  const names = new Map((profiles ?? []).map((p) => [p.id, firstName(p.display_name)]));
  const postIds = (posts ?? []).map((p) => p.id);
  const { data: reacts } = postIds.length ? await admin.from("circle_reactions").select("post_id, user_id, kind").in("post_id", postIds) : { data: [] };
  const feed: CirclePost[] = (posts ?? []).map((p) => {
    const rs = (reacts ?? []).filter((r) => r.post_id === p.id);
    const counts = Object.fromEntries(REACTIONS.map((k) => [k, rs.filter((r) => r.kind === k).length])) as Record<Reaction, number>;
    return { id: p.id, userId: p.user_id, name: p.user_id ? names.get(p.user_id) ?? null : null, kind: p.kind as PostKind, meta: (p.meta ?? {}) as Record<string, unknown>, createdAt: p.created_at, counts, mine: rs.filter((r) => r.user_id === userId).map((r) => r.kind as Reaction), me: p.user_id === userId };
  });
  const regular = (circles ?? []).filter((c) => c.kind !== "challenge").length;
  const list = mineIds.map((id) => { const c = (circles ?? []).find((x) => x.id === id); return { id, name: c?.name ?? "My circle", challenge: c?.kind === "challenge" }; });
  return {
    circle: { id: circleId, name: circle?.name ?? "My circle", code: circle?.invite_code ?? "", isOwner: !!circle?.owner_id && circle.owner_id === userId },
    challenge,
    circles: list,
    canCreate: regular < CIRCLES_PER_PERSON,
    members, feed, slotsLeft: challenge ? null : Math.max(0, CIRCLE_MAX - ids.length),
  };
}

// ---------------------------------------------------------------------------
// Challenges (created by an operator from /admin)
// ---------------------------------------------------------------------------
export async function createChallenge(admin: AdminClient, v: { name: string; startsOn: string; endsOn: string; prize: string | null }): Promise<{ id: string; code: string }> {
  for (let i = 0; i < 6; i++) {
    const code = newCode();
    const { data, error } = await admin.from("circles").insert({ owner_id: null, kind: "challenge", name: v.name.slice(0, 60), starts_on: v.startsOn, ends_on: v.endsOn, prize: v.prize?.slice(0, 120) || null, invite_code: code }).select("id").single();
    if (!error && data) return { id: data.id, code };
  }
  throw new Error("challenge_create_failed");
}

export async function listChallenges(admin: AdminClient) {
  const { data } = await admin.from("circles").select("id, name, invite_code, starts_on, ends_on, prize, created_at").eq("kind", "challenge").order("created_at", { ascending: false }).limit(20);
  const today = localDateOf(new Date(), CHALLENGE_TZ);
  return Promise.all((data ?? []).map(async (c) => {
    const ids = await memberIds(admin, c.id);
    const info = challengeInfo(c);
    const board = await boardFor(admin, null, ids, today, info.startsOn, info.endsOn);
    return { id: c.id, name: c.name, code: c.invite_code, ...info, members: ids.length, board };
  }));
}

export async function newChallengeCode(admin: AdminClient, circleId: string) {
  for (let i = 0; i < 6; i++) {
    const { error } = await admin.from("circles").update({ invite_code: newCode() }).eq("id", circleId).eq("kind", "challenge");
    if (!error) return true;
  }
  return false;
}

/**
 * Worker: announce a challenge's start and last day, and the winner once it's over.
 * Runs from 9:00 IST so nobody is pushed at midnight; each step happens once (post dedupe key).
 */
export async function runChallenges(admin: AdminClient, now = new Date(), onlyId?: string): Promise<number> {
  const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: CHALLENGE_TZ, hour: "2-digit", hourCycle: "h23" }).format(now));
  if (hour < 9 || hour >= 21) return 0;
  const today = localDateOf(now, CHALLENGE_TZ);
  let q = admin.from("circles").select("id, name, starts_on, ends_on, prize").eq("kind", "challenge").gte("ends_on", addDays(today, -7)).lte("starts_on", today);
  if (onlyId) q = q.eq("id", onlyId);
  const { data: list } = await q;
  let n = 0;
  for (const c of list ?? []) {
    const ids = await memberIds(admin, c.id);
    const announce = async (kind: PostKind, meta: Record<string, string | number>, build: (l: string) => { title: string; body: string }) => {
      const { data } = await admin.from("circle_posts").upsert({ circle_id: c.id, user_id: null, kind, meta, dedupe_key: `${kind}:${c.id}` }, { onConflict: "dedupe_key", ignoreDuplicates: true }).select("id");
      if (!data?.length) return;
      n++;
      await notifyUsers(admin, ids, `challenge-${c.id}`, build);
    };
    if (c.starts_on === today) await announce("challenge_start", { label: c.prize ?? "" }, (l) => ({ title: c.name, body: ct(l, "pushChallengeStart") }));
    if (c.ends_on === today && c.ends_on !== c.starts_on) await announce("challenge_last_day", {}, (l) => ({ title: c.name, body: ct(l, "pushChallengeLastDay") }));
    if (c.ends_on! < today) {
      const board = await boardFor(admin, null, ids, today, c.starts_on!, c.ends_on!);
      const top = board[0];
      const winner = top && top.points > 0 ? top.name ?? "" : "";
      await announce("challenge_end", { label: winner, n: top?.points ?? 0 }, (l) => ({ title: c.name, body: winner ? ct(l, "pushChallengeWinner", { name: winner }) : ct(l, "pushChallengeOver") }));
    }
  }
  return n;
}

/** Push to these people (once each), outside each person's quiet hours. */
async function notifyUsers(admin: AdminClient, ids: string[], tag: string, build: (locale: string) => { title: string; body: string } | null) {
  if (!ids.length) return;
  const { data: profs } = await admin.from("profiles").select("id, locale, timezone, quiet_start, quiet_end").in("id", [...new Set(ids)]);
  await Promise.all((profs ?? []).map(async (p) => {
    try { if (inQuietHours(localTimeOf(new Date(), p.timezone), p.quiet_start, p.quiet_end)) return; } catch { return; }
    const m = build(p.locale);
    if (m) await sendPush(admin, p.id, { ...m, url: "/circle", tag }).catch(() => 0);
  }));
}

async function pushOne(admin: AdminClient, userId: string, build: (locale: string) => { title: string; body: string }, url = "/circle") {
  const { data: p } = await admin.from("profiles").select("locale, timezone, quiet_start, quiet_end").eq("id", userId).maybeSingle();
  if (!p) return;
  try { if (inQuietHours(localTimeOf(new Date(), p.timezone), p.quiet_start, p.quiet_end)) return; } catch { return; }
  await sendPush(admin, userId, { ...build(p.locale), url, tag: "circle" }).catch(() => 0);
}

async function nameOf(admin: AdminClient, userId: string) {
  const { data } = await admin.from("profiles").select("display_name").eq("id", userId).maybeSingle();
  return firstName(data?.display_name);
}

/** Add a feed post to each of the user's circles. Idempotent per circle by dedupe key. */
export async function postToCircle(admin: AdminClient, userId: string, kind: PostKind, meta: Record<string, string | number> = {}, dedupeKey?: string, onlyCircle?: string): Promise<{ circleId: string; created: boolean }[]> {
  const ids = onlyCircle ? [onlyCircle] : await myCircleIds(admin, userId);
  return Promise.all(ids.map(async (circleId) => {
    const { data } = await admin.from("circle_posts").upsert({ circle_id: circleId, user_id: userId, kind, meta, dedupe_key: dedupeKey ? `${dedupeKey}:${circleId}`.slice(0, 160) : null }, { onConflict: "dedupe_key", ignoreDuplicates: true }).select("id");
    return { circleId, created: !!data?.length };
  }));
}

export type JoinResult = "joined" | "already" | "invalid" | "full" | "too_many" | "rate_limited" | "ended";

export async function joinCircle(admin: AdminClient, userId: string, rawCode: string): Promise<JoinResult> {
  // Short codes can be guessed: a few wrong tries an hour, then a pause.
  const since = new Date(Date.now() - 3600_000).toISOString();
  const { count } = await admin.from("audit_events").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("action", "circle_code_failed").gte("created_at", since);
  if ((count ?? 0) >= 8) return "rate_limited";
  const code = cleanCode(rawCode);
  const { data: target } = code ? await admin.from("circles").select("id, kind, ends_on").eq("invite_code", code).maybeSingle() : { data: null };
  if (!target) {
    await audit(admin, userId, "user", "circle_code_failed", "circle");
    return "invalid";
  }
  const mine = await myCircleIds(admin, userId);
  if (mine.includes(target.id)) return "already";
  if (target.kind === "challenge" && target.ends_on && target.ends_on < localDateOf(new Date(), CHALLENGE_TZ)) return "ended";
  if (target.kind !== "challenge") await dropStarter(admin, userId);
  const { error } = await admin.from("circle_members").insert({ circle_id: target.id, user_id: userId });
  if (error) {
    await ensureCircle(admin, userId);
    if (error.message.includes("circle_full")) return "full";
    if (error.message.includes("too_many_circles")) return "too_many";
    if (await isMember(admin, userId, target.id)) return "already";
    throw new Error("join_failed");
  }
  await postToCircle(admin, userId, "joined", {}, `joined:${userId}`, target.id);
  const name = (await nameOf(admin, userId)) ?? "";
  await notifyUsers(admin, (await memberIds(admin, target.id)).filter((id) => id !== userId), `circle-${target.id}`, (l) => ({ title: ct(l, "pushTitle"), body: ct(l, "pushJoined", { name: name || ct(l, "someone") }) }));
  return "joined";
}

/** Their untouched starter circle (just them, default name) makes way for a real one. */
async function dropStarter(admin: AdminClient, userId: string) {
  for (const id of await myCircleIds(admin, userId)) {
    const { data: c } = await admin.from("circles").select("name, owner_id").eq("id", id).maybeSingle();
    if (c?.owner_id === userId && c.name === "My circle" && (await memberIds(admin, id)).length === 1) await leaveCircle(admin, userId, id);
  }
}

export async function leaveCircle(admin: AdminClient, userId: string, circleId: string) {
  if (!(await isMember(admin, userId, circleId))) return;
  await admin.from("circle_members").delete().eq("user_id", userId).eq("circle_id", circleId);
  const rest = await memberIds(admin, circleId);
  const { data: c } = await admin.from("circles").select("kind").eq("id", circleId).maybeSingle();
  if (c?.kind === "challenge") return; // run from /admin: stays even when empty
  if (!rest.length) await admin.from("circles").delete().eq("id", circleId);
  else await admin.from("circles").update({ owner_id: rest[0] }).eq("id", circleId).eq("owner_id", userId);
}

/** Toggle a reaction. A nudge can't be taken back and only goes on a friend's post. */
export async function react(admin: AdminClient, userId: string, postId: string, kind: Reaction): Promise<"added" | "removed" | "not_allowed"> {
  const { data: post } = await admin.from("circle_posts").select("id, circle_id, user_id, kind").eq("id", postId).maybeSingle();
  if (!post || !(await isMember(admin, userId, post.circle_id))) return "not_allowed";
  if (kind === "nudge" && (post.user_id === userId || post.kind !== "missed")) return "not_allowed";
  if (!post.user_id) return "not_allowed"; // announcements take no reactions
  const { data: existing } = await admin.from("circle_reactions").select("post_id").eq("post_id", postId).eq("user_id", userId).eq("kind", kind).maybeSingle();
  if (existing) {
    if (kind === "nudge") return "added";
    await admin.from("circle_reactions").delete().eq("post_id", postId).eq("user_id", userId).eq("kind", kind);
    return "removed";
  }
  const { error } = await admin.from("circle_reactions").insert({ post_id: postId, user_id: userId, kind });
  if (error) return "added"; // a double tap raced; same end state
  if (post.user_id && post.user_id !== userId) {
    const name = (await nameOf(admin, userId)) ?? "";
    const key = ({ cheer: "pushCheer", fire: "pushFire", hug: "pushHug", nudge: "pushNudge" } as const)[kind];
    await pushOne(admin, post.user_id, (l) => ({ title: ct(l, key, { name: name || ct(l, "someone") }), body: kind === "nudge" ? ct(l, "pushNudgeBody") : ct(l, "pushReactBody") }), `/circle?c=${post.circle_id}`);
  }
  return "added";
}

/**
 * After a "done": finished the whole day → post + a FOMO push to friends who haven't yet;
 * done after a missed day → comeback post; new milestones → milestone post.
 */
export async function afterDone(admin: AdminClient, userId: string, rewards: { kind: string; label: string }[] = []) {
  const circleIds = await myCircleIds(admin, userId);
  if (!circleIds.length) return;
  const { data: prof } = await admin.from("profiles").select("timezone, display_name").eq("id", userId).single();
  if (!prof) return;
  const today = localDateOf(new Date(), prof.timezone);
  for (const r of rewards.filter((x) => x.kind === "milestone")) await postToCircle(admin, userId, "milestone", { label: r.label.slice(0, 60) }, `milestone:${userId}:${today}:${r.label.slice(0, 40)}`);
  const { data: missed } = await admin.from("circle_posts").select("id").eq("user_id", userId).eq("kind", "missed").like("dedupe_key", `missed:${userId}:${addDays(today, -1)}%`).limit(1);
  if (missed?.length) await postToCircle(admin, userId, "comeback", {}, `comeback:${userId}:${today}`);
  const { data: occ } = await admin.from("action_occurrences").select("status").eq("user_id", userId).eq("local_date", today).neq("status", "paused");
  const total = (occ ?? []).length;
  const done = (occ ?? []).filter((o) => DONE.includes(o.status)).length;
  if (!total || done < total) return;
  const posted = (await postToCircle(admin, userId, "day_done", { n: total }, `day_done:${userId}:${today}`)).filter((p) => p.created);
  if (!posted.length) return;
  // Friends (across every circle with a new post) who still have things open get one "your turn?".
  const friends = new Set<string>();
  for (const p of posted) for (const id of await memberIds(admin, p.circleId)) if (id !== userId) friends.add(id);
  if (!friends.size) return;
  const { data: theirs } = await admin.from("action_occurrences").select("user_id, status").in("user_id", [...friends]).eq("local_date", today).neq("status", "paused");
  const open = [...new Set((theirs ?? []).filter((o) => !ANSWERED.includes(o.status)).map((o) => o.user_id))];
  const name = firstName(prof.display_name) ?? "";
  await notifyUsers(admin, open, "circle-day", (l) => ({ title: ct(l, "pushDayDone", { name: name || ct(l, "someone") }), body: ct(l, "pushYourTurn") }));
}

/** Once a day (first check-in slot): yesterday's miss, or a streak worth celebrating. */
export async function postDaily(admin: AdminClient, userId: string, date: string) {
  if (!(await myCircleIds(admin, userId)).length) return;
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
