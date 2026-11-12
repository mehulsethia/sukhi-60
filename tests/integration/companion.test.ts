import { describe, expect, it } from "vitest";
import { admin, makeUser, planWithDueItem, type TestUser } from "./helpers";
import { materializeOccurrences } from "@/server/core";
import { notifyFamily, resumePausedPlans, runInactivityAlerts, runRefillChecks } from "@/server/companion";
import { saveSubscription, sendPush } from "@/server/push";
import { addDays, localDateOf } from "@/domain/schedule";

const TZ = "Asia/Kolkata";
const key = () => `k-${crypto.randomUUID()}`;
const today = () => localDateOf(new Date(), TZ);

async function occurrence(u: TestUser, itemId: string) {
  await materializeOccurrences(admin(), u.id, 1);
  return (await admin().from("action_occurrences").select("id").eq("user_id", u.id).eq("item_id", itemId).eq("local_date", today()).limit(1).single()).data!;
}

async function familyWithAlerts(patient: TestUser, member: TestUser, scopes = ["weekly_summary", "alerts"]) {
  const { data, error } = await admin().from("family_access").insert({ patient_id: patient.id, member_user_id: member.id, invitee_label: "Mohita", invite_token_hash: crypto.randomUUID().replace(/-/g, "").padEnd(64, "0"), scopes, status: "active", accepted_at: new Date().toISOString() }).select("id").single();
  if (error) throw error;
  return data!.id;
}

describe("medicine stock", () => {
  it("one dose per done, no double count on repeats, never changes the schedule or forces re-confirmation", async () => {
    const u = await makeUser("stock");
    const { item } = await planWithDueItem(u, { category: "medication" });
    expect((await u.client.from("plan_items").update({ stock_count: 10, units_per_dose: 2 }).eq("id", item.id)).error).toBeNull();
    const occ = await occurrence(u, item.id);
    await u.client.rpc("record_check_in", { p_occurrence: occ.id, p_kind: "done", p_idempotency_key: key() });
    await u.client.rpc("record_check_in", { p_occurrence: occ.id, p_kind: "done", p_idempotency_key: key() }); // "already recorded"
    const { data: after } = await admin().from("plan_items").select("stock_count, status, version, times").eq("id", item.id).single();
    expect(after).toEqual({ stock_count: 8, status: "confirmed", version: item.version, times: item.times });
  });

  it("reminds once when running low, without naming the medicine to family", async () => {
    const u = await makeUser("refill");
    const m = await makeUser("refill-member");
    const { item } = await planWithDueItem(u, { category: "medication" });
    await admin().from("plan_items").update({ stock_count: 2 }).eq("id", item.id);
    const access = await familyWithAlerts(u, m);
    const p = { id: u.id, locale: "en", timezone: TZ };
    expect(await runRefillChecks(admin(), p, today())).toBe(1);
    expect(await runRefillChecks(admin(), p, today())).toBe(0); // not repeated within the window
    const { data: msg } = await admin().from("messages").select("content").eq("user_id", u.id).like("provider_message_id", "refill:%").single();
    expect(msg!.content).toContain(item.title);
    const { data: alert } = await m.client.from("family_alerts").select("kind, access_id").single();
    expect(alert).toEqual({ kind: "low_stock", access_id: access });
  });
});

describe("pause until a date", () => {
  it("resumes automatically on the date and rebuilds occurrences", async () => {
    const u = await makeUser("pause");
    const { planId } = await planWithDueItem(u);
    expect((await u.client.from("care_plans").update({ status: "paused", paused_until: addDays(today(), 2), pause_reason: "travel" }).eq("id", planId)).error).toBeNull();
    await resumePausedPlans(admin());
    expect((await admin().from("care_plans").select("status").eq("id", planId).single()).data!.status).toBe("paused");
    await admin().from("care_plans").update({ paused_until: today() }).eq("id", planId);
    expect(await resumePausedPlans(admin())).toBeGreaterThanOrEqual(1);
    const { data: plan } = await admin().from("care_plans").select("status, paused_until, pause_reason").eq("id", planId).single();
    expect(plan).toEqual({ status: "active", paused_until: null, pause_reason: null });
    expect((await u.client.from("care_plans").update({ pause_reason: "holiday" }).eq("id", planId)).error).not.toBeNull();
  });
});

describe("mood check-ins", () => {
  it("one per day, private to the user, bounded values", async () => {
    const u = await makeUser("mood");
    const other = await makeUser("mood-other");
    const d = today();
    expect((await u.client.from("mood_checkins").insert({ user_id: u.id, local_date: d, mood: 4, stress: 2, sleep_quality: 3, sleep_hours: 7.5 })).error).toBeNull();
    expect((await u.client.from("mood_checkins").insert({ user_id: u.id, local_date: d, mood: 3 })).error).not.toBeNull();
    expect((await u.client.from("mood_checkins").insert({ user_id: u.id, local_date: addDays(d, -1), mood: 6 })).error).not.toBeNull();
    expect((await other.client.from("mood_checkins").select("id").eq("user_id", u.id)).data).toEqual([]);
    expect((await other.client.from("mood_checkins").insert({ user_id: u.id, local_date: addDays(d, -2), mood: 3 })).error).not.toBeNull();
  });
});

describe("family alerts", () => {
  it("only reach members with the alerts scope, are deduplicated, and stop on revocation", async () => {
    const p = await makeUser("fam-patient");
    const withAlerts = await makeUser("fam-alerts");
    const summaryOnly = await makeUser("fam-summary");
    const access = await familyWithAlerts(p, withAlerts);
    await familyWithAlerts(p, summaryOnly, ["weekly_summary"]);
    expect(await notifyFamily(admin(), p.id, "not_well", today())).toBe(1);
    expect(await notifyFamily(admin(), p.id, "not_well", today())).toBe(0);
    expect((await withAlerts.client.from("family_alerts").select("kind")).data).toEqual([{ kind: "not_well" }]);
    expect((await summaryOnly.client.from("family_alerts").select("id")).data).toEqual([]);
    expect((await p.client.from("family_alerts").select("id")).data).toHaveLength(1); // the patient can see what was sent
    // Members cannot write alerts; the patient revokes and the member loses access at once.
    expect((await withAlerts.client.from("family_alerts").insert({ access_id: access, patient_id: p.id, member_user_id: withAlerts.id, kind: "inactive", dedupe_key: key() })).error).not.toBeNull();
    await p.client.from("family_access").update({ status: "revoked" }).eq("id", access);
    expect((await withAlerts.client.from("family_alerts").select("id")).data).toEqual([]);
    expect(await notifyFamily(admin(), p.id, "not_well", addDays(today(), 1))).toBe(0);
  });

  it("inactivity alert needs planned actions and no check-ins or app use on both days", async () => {
    const p = await makeUser("fam-idle");
    const m = await makeUser("fam-idle-member");
    const { item } = await planWithDueItem(p);
    await familyWithAlerts(p, m);
    for (const n of [1, 2]) {
      const due = new Date(Date.now() - n * 86_400_000);
      await admin().from("action_occurrences").insert({ user_id: p.id, item_id: item.id, plan_id: item.plan_id, item_version: item.version, due_at: due.toISOString(), window_end_at: new Date(due.getTime() + 3 * 3600_000).toISOString(), local_date: addDays(today(), -n), local_time: item.times[0], timezone: TZ, status: "no_response" });
    }
    await admin().from("app_activity").insert({ user_id: p.id, day: addDays(today(), -1) });
    await runInactivityAlerts(admin());
    expect((await m.client.from("family_alerts").select("id")).data).toEqual([]); // opened the app yesterday
    await admin().from("app_activity").delete().eq("user_id", p.id);
    await runInactivityAlerts(admin());
    expect((await m.client.from("family_alerts").select("kind")).data).toEqual([{ kind: "inactive" }]);
  });
});

describe("web push", () => {
  it("subscriptions are private; sending is a no-op when push isn't configured", async () => {
    const u = await makeUser("push");
    const other = await makeUser("push-other");
    expect(await saveSubscription(admin(), u.id, { endpoint: `https://fcm.googleapis.com/fcm/send/${crypto.randomUUID()}`, p256dh: "B".repeat(87), auth: "a".repeat(22) })).toBe(true);
    expect((await u.client.from("push_subscriptions").select("id")).data).toHaveLength(1);
    expect((await other.client.from("push_subscriptions").select("id").eq("user_id", u.id)).data).toEqual([]);
    const saved = { pub: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY, priv: process.env.VAPID_PRIVATE_KEY };
    delete process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    delete process.env.VAPID_PRIVATE_KEY;
    expect(await sendPush(admin(), u.id, { title: "t", body: "b", url: "/today" })).toBe(0);
    if (saved.pub) process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = saved.pub;
    if (saved.priv) process.env.VAPID_PRIVATE_KEY = saved.priv;
  });
});
