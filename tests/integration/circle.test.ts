import { describe, expect, it } from "vitest";
import { admin, makeUser, planWithDueItem } from "./helpers";
import { materializeOccurrences, applyCheckIn } from "@/server/core";
import { afterDone, createCircle, ensureCircle, getCircleView, joinCircle, leaveCircle, newInviteCode, postDaily, react } from "@/server/circle";
import { addDays, localDateOf } from "@/domain/schedule";

const TZ = "Asia/Kolkata";
const codeOf = async (circleId: string) => (await admin().from("circles").select("invite_code").eq("id", circleId).single()).data!.invite_code;

describe("circles", () => {
  it("everyone gets a circle; friends join by code; max 6 people", async () => {
    const owner = await makeUser("circle-owner");
    const cid = await ensureCircle(admin(), owner.id);
    expect(await ensureCircle(admin(), owner.id)).toBe(cid); // idempotent
    const code = await codeOf(cid);
    const friends = await Promise.all([1, 2, 3, 4, 5, 6].map((i) => makeUser(`circle-f${i}`)));
    const results = [];
    for (const f of friends) results.push(await joinCircle(admin(), f.id, code));
    expect(results.slice(0, 5)).toEqual(["joined", "joined", "joined", "joined", "joined"]);
    expect(results[5]).toBe("full");
    expect(await joinCircle(admin(), friends[0].id, code)).toBe("already");
    expect(await joinCircle(admin(), friends[0].id, "NOPE1234")).toBe("invalid");
    const view = await getCircleView(admin(), owner.id, TZ);
    expect(view.members).toHaveLength(6);
    expect(view.slotsLeft).toBe(0);
    expect(view.feed.filter((p) => p.kind === "joined")).toHaveLength(5);
  });

  it("a person can be in several circles, joined by a 5-digit code", async () => {
    const a = await makeUser("circle-a");
    const b = await makeUser("circle-b");
    const c = await makeUser("circle-c");
    const ca = await ensureCircle(admin(), a.id);
    expect(await codeOf(ca)).toMatch(/^\d{5}$/);
    const bStarter = await ensureCircle(admin(), b.id);
    expect(await joinCircle(admin(), b.id, await codeOf(ca))).toBe("joined");
    // b's untouched starter circle made way for the real one.
    expect((await admin().from("circles").select("id").eq("id", bStarter)).data).toEqual([]);
    const cc = await createCircle(admin(), c.id, "Office");
    expect(typeof cc === "string" && cc !== "too_many").toBe(true);
    expect(await joinCircle(admin(), b.id, ` ${await codeOf(cc as string)} `)).toBe("joined");
    const view = await getCircleView(admin(), b.id, TZ, cc as string);
    expect(view.circles.map((x) => x.id)).toEqual([ca, cc]);
    expect(view.circle.name).toBe("Office");
    // Only the creator can replace the code; the old one stops working.
    const old = await codeOf(cc as string);
    expect(await newInviteCode(admin(), b.id, cc as string)).toBeNull();
    const fresh = await newInviteCode(admin(), c.id, cc as string);
    expect(fresh).toMatch(/^\d{5}$/);
    if (fresh !== old) expect(await joinCircle(admin(), a.id, old)).toBe("invalid");
    // Posts go to each circle once.
    await afterDone(admin(), b.id, [{ kind: "milestone", label: "First week" }]);
    await afterDone(admin(), b.id, [{ kind: "milestone", label: "First week" }]);
    const ms = (await admin().from("circle_posts").select("circle_id").eq("user_id", b.id).eq("kind", "milestone")).data!;
    expect(ms.map((m) => m.circle_id).sort()).toEqual([ca, cc].sort());
    // Leaving one circle keeps the other; the owner leaving hands the circle on.
    await leaveCircle(admin(), c.id, cc as string);
    expect((await admin().from("circles").select("owner_id").eq("id", cc).single()).data!.owner_id).toBe(b.id);
  });

  it("caps circles per person and slows down code guessing", async () => {
    const u = await makeUser("circle-cap");
    for (let i = 0; i < 5; i++) expect(await createCircle(admin(), u.id, `C${i}`)).not.toBe("too_many");
    expect(await createCircle(admin(), u.id, "C6")).toBe("too_many");
    const g = await makeUser("circle-guess");
    const results = [];
    for (let i = 0; i < 9; i++) results.push(await joinCircle(admin(), g.id, "00000"));
    expect(results.slice(0, 8).every((r) => r === "invalid")).toBe(true);
    expect(results[8]).toBe("rate_limited");
  });

  it("circle-mates see each other's posts; outsiders see nothing (RLS)", async () => {
    const a = await makeUser("circle-rls-a");
    const b = await makeUser("circle-rls-b");
    const outsider = await makeUser("circle-rls-x");
    const cid = await ensureCircle(admin(), a.id);
    await joinCircle(admin(), b.id, await codeOf(cid));
    await ensureCircle(admin(), outsider.id);
    expect((await b.client.from("circle_posts").select("id").eq("circle_id", cid)).data!.length).toBeGreaterThan(0);
    expect((await outsider.client.from("circle_posts").select("id").eq("circle_id", cid)).data).toEqual([]);
    expect((await outsider.client.from("circle_members").select("user_id").eq("circle_id", cid)).data).toEqual([]);
    // No direct writes from the browser.
    expect((await b.client.from("circle_posts").insert({ circle_id: cid, user_id: b.id, kind: "note" })).error).not.toBeNull();
  });

  it("finishing the day posts once; missed days can be nudged by friends only", async () => {
    const a = await makeUser("circle-done-a");
    const b = await makeUser("circle-done-b");
    const cid = await ensureCircle(admin(), a.id);
    await joinCircle(admin(), b.id, await codeOf(cid));
    const { item } = await planWithDueItem(a);
    await materializeOccurrences(admin(), a.id, 1);
    const today = localDateOf(new Date(), TZ);
    const occ = (await admin().from("action_occurrences").select("id").eq("item_id", item.id).eq("local_date", today).single()).data!;
    await applyCheckIn(admin(), a.id, occ.id, "done", { channel: "web", idempotencyKey: `k-${crypto.randomUUID()}` });
    await afterDone(admin(), a.id); // again: still one post
    const done = (await admin().from("circle_posts").select("id").eq("user_id", a.id).eq("kind", "day_done")).data!;
    expect(done).toHaveLength(1);
    expect(await react(admin(), b.id, done[0].id, "cheer")).toBe("added");
    expect(await react(admin(), b.id, done[0].id, "cheer")).toBe("removed");
    expect(await react(admin(), b.id, done[0].id, "nudge")).toBe("not_allowed"); // nudges only on missed days

    // A silent yesterday becomes a "missed" post that b can nudge, a cannot nudge themself.
    const y = addDays(today, -1);
    const bPlan = await planWithDueItem(b);
    await materializeOccurrences(admin(), b.id, 1);
    const bOcc = (await admin().from("action_occurrences").select("id").eq("item_id", bPlan.item.id).eq("local_date", today).single()).data!;
    const moved = await admin().from("action_occurrences").update({ local_date: y, status: "no_response" }).eq("id", bOcc.id);
    expect(moved.error).toBeNull();
    await postDaily(admin(), b.id, today);
    const missed = (await admin().from("circle_posts").select("id").eq("user_id", b.id).eq("kind", "missed")).data!;
    expect(missed).toHaveLength(1);
    expect(await react(admin(), b.id, missed[0].id, "nudge")).toBe("not_allowed");
    expect(await react(admin(), a.id, missed[0].id, "nudge")).toBe("added");
    expect(await react(admin(), a.id, missed[0].id, "nudge")).toBe("added"); // can't be un-sent
  });
});

describe("challenges", () => {
  const noonIST = (date: string) => new Date(`${date}T06:30:00Z`); // 12:00 in India

  it("anyone can join with the code; it doesn't count as a circle; points count only inside the dates", async () => {
    const { createChallenge, runChallenges, CHALLENGE_TZ } = await import("@/server/circle");
    const today = localDateOf(new Date(), CHALLENGE_TZ);
    const ch = await createChallenge(admin(), { name: "Pilot challenge", startsOn: addDays(today, -1), endsOn: addDays(today, 1), prize: "₹500 voucher" });
    expect(ch.code).toMatch(/^\d{5}$/);
    const a = await makeUser("ch-a");
    const b = await makeUser("ch-b");
    await admin().from("profiles").update({ display_name: "Asha" }).eq("id", a.id);
    await admin().from("profiles").update({ display_name: "Bina" }).eq("id", b.id);
    for (let i = 0; i < 5; i++) await createCircle(admin(), a.id, `Group ${i}`);
    // a is in 5 real circles already; the challenge still lets them in.
    expect(await joinCircle(admin(), a.id, ch.code)).toBe("joined");
    // b's starter circle stays: a challenge isn't a replacement for their own circle.
    const starter = await ensureCircle(admin(), b.id);
    expect(await joinCircle(admin(), b.id, ch.code)).toBe("joined");
    expect((await admin().from("circles").select("id").eq("id", starter)).data).toHaveLength(1);
    // Points: one inside the window for b, one before the start for a.
    await admin().from("reward_events").insert([
      { user_id: b.id, kind: "completion", points: 6, local_date: today, week_start: today, label: "x", dedupe_key: `t-${crypto.randomUUID()}` },
      { user_id: a.id, kind: "completion", points: 9, local_date: addDays(today, -3), week_start: today, label: "x", dedupe_key: `t-${crypto.randomUUID()}` },
    ] as never);
    const view = await getCircleView(admin(), a.id, TZ, ch.id);
    expect(view.challenge?.state).toBe("live");
    expect(view.challenge?.prize).toBe("₹500 voucher");
    expect(view.slotsLeft).toBeNull();
    expect(view.members.map((m) => [m.name, m.points])).toEqual([["Bina", 6], ["Asha", 0]]);
    // Leaving doesn't delete the challenge, even when empty.
    await leaveCircle(admin(), a.id, ch.id);
    await leaveCircle(admin(), b.id, ch.id);
    expect((await admin().from("circles").select("id").eq("id", ch.id)).data).toHaveLength(1);
    expect(await runChallenges(admin(), noonIST(today), ch.id)).toBe(0); // live, not its first or last day: nothing to announce
  });

  it("announces start, last day and the winner once each; ended challenges can't be joined", async () => {
    const { createChallenge, runChallenges, CHALLENGE_TZ } = await import("@/server/circle");
    const today = localDateOf(new Date(), CHALLENGE_TZ);
    const ch = await createChallenge(admin(), { name: "Sprint", startsOn: addDays(today, -2), endsOn: addDays(today, -1), prize: null });
    const w = await makeUser("ch-winner");
    await admin().from("profiles").update({ display_name: "Wasim" }).eq("id", w.id);
    await admin().from("circle_members").insert({ circle_id: ch.id, user_id: w.id });
    await admin().from("reward_events").insert({ user_id: w.id, kind: "completion", points: 7, local_date: addDays(today, -1), week_start: today, label: "x", dedupe_key: `t-${crypto.randomUUID()}` } as never);
    expect(await runChallenges(admin(), noonIST(addDays(today, -2)), ch.id)).toBe(1); // start
    expect(await runChallenges(admin(), noonIST(addDays(today, -1)), ch.id)).toBe(1); // last day
    expect(await runChallenges(admin(), noonIST(today), ch.id)).toBe(1); // winner
    expect(await runChallenges(admin(), noonIST(today), ch.id)).toBe(0); // only once
    expect(await runChallenges(admin(), new Date(`${today}T20:00:00Z`), ch.id)).toBe(0); // 01:30 IST: quiet
    const posts = (await admin().from("circle_posts").select("kind, meta").eq("circle_id", ch.id)).data!;
    expect(posts.map((p) => p.kind).sort()).toEqual(["challenge_end", "challenge_last_day", "challenge_start"]);
    expect(posts.find((p) => p.kind === "challenge_end")!.meta).toMatchObject({ label: "Wasim", n: 7 });
    const late = await makeUser("ch-late");
    expect(await joinCircle(admin(), late.id, ch.code)).toBe("ended");
  });
});
