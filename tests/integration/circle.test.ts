import { describe, expect, it } from "vitest";
import { admin, makeUser, planWithDueItem } from "./helpers";
import { materializeOccurrences, applyCheckIn } from "@/server/core";
import { afterDone, ensureCircle, getCircleView, joinCircle, leaveCircle, postDaily, react } from "@/server/circle";
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

  it("someone already in a circle with friends must confirm before switching", async () => {
    const a = await makeUser("circle-a");
    const b = await makeUser("circle-b");
    const c = await makeUser("circle-c");
    const ca = await ensureCircle(admin(), a.id);
    await joinCircle(admin(), b.id, await codeOf(ca));
    const cc = await ensureCircle(admin(), c.id);
    expect(await joinCircle(admin(), b.id, await codeOf(cc))).toBe("in_other");
    expect(await joinCircle(admin(), b.id, await codeOf(cc), { leaveCurrent: true })).toBe("joined");
    // Owner leaves: the circle goes on with the remaining member as owner.
    await leaveCircle(admin(), c.id);
    expect((await admin().from("circles").select("owner_id").eq("id", cc).single()).data!.owner_id).toBe(b.id);
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
