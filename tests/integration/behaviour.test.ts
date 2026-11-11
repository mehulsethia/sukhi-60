import { describe, expect, it } from "vitest";
import { admin, makeUser, planWithDueItem, type TestUser } from "./helpers";
import { materializeOccurrences } from "@/server/core";
import { decideSuggestion, getBehaviourProfile, getLearnedSummary, reportBarrier, runRestartFollowup } from "@/server/support";
import { addDays, localDateOf } from "@/domain/schedule";

const TZ = "Asia/Kolkata";
const key = () => `k-${crypto.randomUUID()}`;
const noLlm = { generate: null };

async function todaysOccurrence(u: TestUser, itemId: string) {
  await materializeOccurrences(admin(), u.id, 1);
  const { data } = await admin().from("action_occurrences").select("*").eq("user_id", u.id).eq("item_id", itemId).eq("local_date", localDateOf(new Date(), TZ)).limit(1).single();
  return data!;
}

/** A closed occurrence for yesterday with the given status. */
async function yesterdayOccurrence(u: TestUser, item: { id: string; plan_id: string; version: number; times: string[] }, status: "no_response" | "missed" | "skipped") {
  const y = addDays(localDateOf(new Date(), TZ), -1);
  const due = new Date(Date.now() - 26 * 3600_000);
  const { data, error } = await admin()
    .from("action_occurrences")
    .insert({ user_id: u.id, item_id: item.id, plan_id: item.plan_id, item_version: item.version, due_at: due.toISOString(), window_end_at: new Date(due.getTime() + 3 * 3600_000).toISOString(), local_date: y, local_time: item.times[0] ?? null, timezone: TZ, status })
    .select("*")
    .single();
  if (error) throw error;
  return data!;
}

describe("behaviour profile", () => {
  it("existing users get defaults without new required fields; the DB enforces the 0–2 style limit", async () => {
    const u = await makeUser("bp-defaults");
    const p = await getBehaviourProfile(admin(), u.id);
    expect(p.styles).toEqual([]);
    expect(p.restart).toBeNull();
    const three = await u.client.from("profiles").update({ communication_styles: ["warm_gentle", "fun_playful", "motivating"] }).eq("id", u.id);
    expect(three.error).not.toBeNull();
    const invalid = await u.client.from("profiles").update({ communication_styles: ["sarcastic"] }).eq("id", u.id);
    expect(invalid.error).not.toBeNull();
    const ok = await u.client.from("profiles").update({ communication_styles: ["warm_gentle", "simple_practical"], restart_preference: "give_space" }).eq("id", u.id);
    expect(ok.error).toBeNull();
    const badRestart = await u.client.from("profiles").update({ restart_preference: "nag" }).eq("id", u.id);
    expect(badRestart.error).not.toBeNull();
  });

  it("confidence is 1–10, owner-scoped, and optional", async () => {
    const u = await makeUser("bp-conf");
    const other = await makeUser("bp-conf-other");
    const { planId, item } = await planWithDueItem(u);
    expect((await u.client.from("habit_confidence").insert({ user_id: u.id, plan_id: planId, item_id: item.id, confidence: 7 })).error).toBeNull();
    expect((await u.client.from("habit_confidence").insert({ user_id: u.id, plan_id: planId, confidence: 11 })).error).not.toBeNull();
    expect((await u.client.from("habit_confidence").insert({ user_id: u.id, plan_id: planId, confidence: null })).error).toBeNull();
    // Another user can't attach confidence to someone else's plan, or read it.
    expect((await other.client.from("habit_confidence").insert({ user_id: other.id, plan_id: planId, confidence: 5 })).error).not.toBeNull();
    expect((await other.client.from("habit_confidence").select("id").eq("user_id", u.id)).data).toEqual([]);
  });
});

describe("barrier capture", () => {
  it("is idempotent, never changes the occurrence or plan, and is private to the user", async () => {
    const u = await makeUser("bar-idem");
    const other = await makeUser("bar-other");
    const { item } = await planWithDueItem(u);
    const occ = await yesterdayOccurrence(u, item, "no_response");
    const k = key();
    const a = await reportBarrier(admin(), u.id, { occurrenceId: occ.id, code: "busy", idempotencyKey: k }, noLlm);
    const b = await reportBarrier(admin(), u.id, { occurrenceId: occ.id, code: "busy", idempotencyKey: k }, noLlm);
    expect(a.duplicate).toBe(false);
    expect(b.duplicate).toBe(true);
    expect(b.text).toBe(a.text);
    expect(b.suggestion?.id).toBe(a.suggestion?.id);
    expect((await admin().from("barrier_reports").select("id").eq("user_id", u.id)).data).toHaveLength(1);
    expect((await admin().from("nudge_events").select("id").eq("user_id", u.id)).data).toHaveLength(1);
    // Silence stays unknown; the plan is untouched.
    expect((await admin().from("action_occurrences").select("status").eq("id", occ.id).single()).data!.status).toBe("no_response");
    const { data: after } = await admin().from("plan_items").select("times, version, status").eq("id", item.id).single();
    expect(after).toEqual({ times: item.times, version: item.version, status: "confirmed" });
    // Default style for a user who never answered.
    expect((await admin().from("nudge_events").select("style_used").eq("user_id", u.id).single()).data!.style_used).toBe("warm_gentle");

    // Isolation: other users can't read, write, or report against these rows.
    for (const t of ["barrier_reports", "nudge_events", "support_suggestions"] as const) {
      expect((await other.client.from(t).select("id").eq("user_id", u.id)).data).toEqual([]);
      expect((await u.client.from(t).select("id")).data!.length).toBeGreaterThan(0);
    }
    expect((await u.client.from("barrier_reports").insert({ user_id: u.id, item_id: item.id, barrier_code: "busy", idempotency_key: key() })).error).not.toBeNull();
    await expect(reportBarrier(admin(), other.id, { occurrenceId: occ.id, code: "busy", idempotencyKey: key() }, noLlm)).rejects.toThrow("not_found");
    expect((await decideSuggestion(admin(), other.client, other.id, { suggestionId: a.suggestion!.id, decision: "accept", time: "06:15" })).result).toBe("not_found");
  });

  it("clinical items and discomfort never get change offers", async () => {
    const u = await makeUser("bar-clinical");
    const clinical = await planWithDueItem(u, { mode: "clinician_instructions" });
    const occ = await todaysOccurrence(u, clinical.item.id);
    const r = await reportBarrier(admin(), u.id, { occurrenceId: occ.id, code: "busy", idempotencyKey: key() }, noLlm);
    expect(r.strategy).toBe("care_team_checkin");
    expect(r.suggestion).toBeNull();

    const med = await planWithDueItem(u, { category: "medication" });
    const occMed = await todaysOccurrence(u, med.item.id);
    for (const code of ["forgot", "too_difficult", "routine_disrupted"] as const) {
      const m = await reportBarrier(admin(), u.id, { occurrenceId: occMed.id, code, idempotencyKey: key() }, noLlm);
      expect(m.suggestion).toBeNull();
      expect(m.text).not.toMatch(/dose|tablet|double|extra/i);
    }

    const walk = await planWithDueItem(u);
    const occWalk = await todaysOccurrence(u, walk.item.id);
    const pain = await reportBarrier(admin(), u.id, { occurrenceId: occWalk.id, code: "physical_discomfort", idempotencyKey: key() }, noLlm);
    expect(pain.strategy).toBe("safety_first");
    expect(pain.suggestion).toBeNull();
    expect(pain.text).not.toMatch(/stretch|exercise|instead/i);
    expect((await admin().from("support_suggestions").select("id").eq("user_id", u.id)).data).toEqual([]);
  });
});

describe("confirmation-gated changes", () => {
  it("a time change happens only after explicit acceptance; history and points are kept", async () => {
    const u = await makeUser("sug-accept");
    const { item } = await planWithDueItem(u);
    const occ = await todaysOccurrence(u, item.id);
    // Some history first.
    const ci = await u.client.rpc("record_check_in", { p_occurrence: occ.id, p_kind: "skipped", p_idempotency_key: key() });
    expect(ci.error).toBeNull();
    const pointsBefore = (await admin().from("reward_events").select("points").eq("user_id", u.id)).data!.length;

    const r = await reportBarrier(admin(), u.id, { occurrenceId: occ.id, code: "busy", idempotencyKey: key() }, noLlm);
    expect(r.strategy).toBe("suggest_reschedule");
    expect(r.suggestion).toMatchObject({ kind: "time_change", fromTime: item.times[0] });
    // Shown, not applied.
    expect((await admin().from("plan_items").select("times").eq("id", item.id).single()).data!.times).toEqual(item.times);

    // Decline: nothing changes.
    const declined = await decideSuggestion(admin(), u.client, u.id, { suggestionId: r.suggestion!.id, decision: "decline" });
    expect(declined).toMatchObject({ ok: true, result: "declined" });
    expect((await admin().from("plan_items").select("times").eq("id", item.id).single()).data!.times).toEqual(item.times);
    // A decided suggestion can't be accepted later.
    expect((await decideSuggestion(admin(), u.client, u.id, { suggestionId: r.suggestion!.id, decision: "accept", time: "06:15" })).result).toBe("declined");

    // Accept a new one.
    const r2 = await reportBarrier(admin(), u.id, { occurrenceId: occ.id, code: "forgot", idempotencyKey: key() }, noLlm);
    const newTime = item.times[0] === "06:15" ? "06:30" : "06:15";
    const accepted = await decideSuggestion(admin(), u.client, u.id, { suggestionId: r2.suggestion!.id, decision: "accept", time: newTime });
    expect(accepted).toMatchObject({ ok: true, result: "accepted", newTime });
    const { data: changed } = await admin().from("plan_items").select("times, status, version").eq("id", item.id).single();
    expect(changed!.times).toEqual([newTime]);
    expect(changed!.status).toBe("confirmed");
    expect(changed!.version).toBeGreaterThan(item.version);
    // Earlier check-in and points are preserved (no streak resets).
    expect((await admin().from("check_ins").select("id").eq("user_id", u.id)).data).toHaveLength(1);
    expect((await admin().from("reward_events").select("points").eq("user_id", u.id)).data!.length).toBe(pointsBefore);
    expect((await admin().from("action_occurrences").select("status").eq("id", occ.id).single()).data!.status).toBe("skipped");
  });

  it("stale or expired suggestions change nothing", async () => {
    const u = await makeUser("sug-stale");
    const { item } = await planWithDueItem(u);
    const occ = await todaysOccurrence(u, item.id);
    const r = await reportBarrier(admin(), u.id, { occurrenceId: occ.id, code: "busy", idempotencyKey: key() }, noLlm);
    // The user edits the item meanwhile (version changes).
    await u.client.from("plan_items").update({ status: "draft" }).eq("id", item.id);
    await u.client.from("plan_items").update({ status: "confirmed" }).eq("id", item.id);
    expect((await decideSuggestion(admin(), u.client, u.id, { suggestionId: r.suggestion!.id, decision: "accept", time: "06:15" })).result).toBe("stale");
    expect((await admin().from("plan_items").select("times").eq("id", item.id).single()).data!.times).toEqual(item.times);

    const r2 = await reportBarrier(admin(), u.id, { occurrenceId: occ.id, code: "busy", idempotencyKey: key() }, noLlm);
    await admin().from("support_suggestions").update({ expires_at: new Date(Date.now() - 1000).toISOString() }).eq("id", r2.suggestion!.id);
    expect((await decideSuggestion(admin(), u.client, u.id, { suggestionId: r2.suggestion!.id, decision: "accept", time: "06:15" })).result).toBe("expired");
    expect((await admin().from("plan_items").select("times").eq("id", item.id).single()).data!.times).toEqual(item.times);
  });
});

describe("proactive restart follow-ups", () => {
  it("one gentle message per lapse; unknown stays unknown; respects the daily cap and give_space", async () => {
    const u = await makeUser("fu-basic");
    const { item } = await planWithDueItem(u);
    const occ = await yesterdayOccurrence(u, item, "no_response");
    const today = localDateOf(new Date(), TZ);
    const profile = { id: u.id, locale: "en", timezone: TZ, communication_styles: ["simple_practical"], restart_preference: null };

    expect(await runRestartFollowup(admin(), profile, today, new Date(), noLlm)).toBe(true);
    expect(await runRestartFollowup(admin(), profile, today, new Date(), noLlm)).toBe(false); // no duplicate
    const { data: msgs } = await admin().from("messages").select("content, source_refs").eq("user_id", u.id).like("provider_message_id", "restart:%");
    expect(msgs).toHaveLength(1);
    expect(msgs![0].content).toContain(item.title);
    const { data: nudge } = await admin().from("nudge_events").select("kind, strategy_id, style_used, user_initiated").eq("user_id", u.id).single();
    expect(nudge).toEqual({ kind: "gentle_reminder", strategy_id: "gentle_checkin", style_used: "simple_practical", user_initiated: false });
    expect((await admin().from("action_occurrences").select("status").eq("id", occ.id).single()).data!.status).toBe("no_response");

    // Daily cap: a second lapse on another item gets no extra message today.
    const second = await planWithDueItem(u);
    await yesterdayOccurrence(u, second.item, "missed");
    expect(await runRestartFollowup(admin(), profile, today, new Date(), noLlm)).toBe(false);
  });

  it("give_space waits several days between follow-ups; explained lapses aren't chased", async () => {
    const u = await makeUser("fu-space");
    const { item } = await planWithDueItem(u);
    const today = localDateOf(new Date(), TZ);
    const profile = { id: u.id, locale: "hi", timezone: TZ, communication_styles: [], restart_preference: "give_space" };
    // A proactive follow-up two days ago.
    await admin().from("nudge_events").insert({ user_id: u.id, kind: "gentle_reminder", strategy_id: "gentle_checkin", style_used: "warm_gentle", template_or_variant_id: "gentle_checkin.warm_gentle.1", user_initiated: false, created_at: new Date(Date.now() - 2 * 86_400_000).toISOString() });
    await yesterdayOccurrence(u, item, "missed");
    expect(await runRestartFollowup(admin(), profile, today, new Date(), noLlm)).toBe(false);
    // Four days later it is allowed again, worded for "space".
    await admin().from("nudge_events").update({ created_at: new Date(Date.now() - 4 * 86_400_000).toISOString() }).eq("user_id", u.id);
    expect(await runRestartFollowup(admin(), profile, today, new Date(), noLlm)).toBe(true);
    const { data: m } = await admin().from("messages").select("content").eq("user_id", u.id).like("provider_message_id", "restart:%").single();
    expect(m!.content).toContain("जब आप तैयार हों");

    // A lapse the user already explained gets no follow-up.
    const v = await makeUser("fu-explained");
    const p2 = await planWithDueItem(v);
    const o2 = await yesterdayOccurrence(v, p2.item, "skipped");
    await reportBarrier(admin(), v.id, { occurrenceId: o2.id, code: "busy", idempotencyKey: key() }, noLlm);
    await admin().from("nudge_events").delete().eq("user_id", v.id); // isolate the "explained" rule from the cap
    expect(await runRestartFollowup(admin(), { id: v.id, locale: "en", timezone: TZ, communication_styles: [], restart_preference: null }, localDateOf(new Date(), TZ), new Date(), noLlm)).toBe(false);
  });
});

describe("learned signals", () => {
  it("need repeated signals and reset without touching stated preferences", async () => {
    const u = await makeUser("learn");
    const { item } = await planWithDueItem(u);
    const occ = await todaysOccurrence(u, item.id);
    await u.client.from("profiles").update({ communication_styles: ["motivating"] }).eq("id", u.id);
    await reportBarrier(admin(), u.id, { occurrenceId: occ.id, code: "busy", idempotencyKey: key() }, noLlm);
    let s = await getLearnedSummary(u.client, u.id, null, TZ);
    expect(s.topBarrier).toBeNull(); // one event is not a pattern
    await reportBarrier(admin(), u.id, { occurrenceId: occ.id, code: "busy", idempotencyKey: key() }, noLlm);
    s = await getLearnedSummary(u.client, u.id, null, TZ);
    expect(s.topBarrier).toEqual({ code: "busy", n: 2 });
    await u.client.from("profiles").update({ learning_reset_at: new Date(Date.now() + 1000).toISOString() }).eq("id", u.id);
    const { data: p } = await admin().from("profiles").select("learning_reset_at, communication_styles").eq("id", u.id).single();
    s = await getLearnedSummary(u.client, u.id, p!.learning_reset_at, TZ);
    expect(s.hasData).toBe(false);
    expect(p!.communication_styles).toEqual(["motivating"]);
  });
});

describe("pilot metrics", () => {
  it("exclude unknown statuses from completion and report them separately", async () => {
    const u = await makeUser("metrics");
    const { item } = await planWithDueItem(u);
    const second = await planWithDueItem(u);
    await yesterdayOccurrence(u, item, "no_response");
    await yesterdayOccurrence(u, second.item, "missed");
    const occ = await todaysOccurrence(u, item.id);
    await u.client.rpc("record_check_in", { p_occurrence: occ.id, p_kind: "done", p_idempotency_key: key() });
    const before = await admin().rpc("admin_behaviour_metrics", { p_days: 3, p_include_internal: true, p_exclude_emails: [] });
    expect(before.error).toBeNull();
    // Only this user's rows: compare with all other users excluded via the internal flag.
    await admin().from("profiles").update({ is_internal: true }).neq("id", u.id).eq("is_internal", false);
    const { data } = await admin().rpc("admin_behaviour_metrics", { p_days: 3, p_include_internal: false, p_exclude_emails: [] });
    await admin().from("profiles").update({ is_internal: false }).neq("id", u.id);
    const m = data as unknown as { completion: { done: number; known: number; unknown: number; rate: number }; recovery: { users_with_lapse: number; users_recovered: number } };
    expect(m.completion).toEqual({ done: 1, known: 2, unknown: 1, rate: 50 });
    expect(m.recovery.users_with_lapse).toBe(1);
    expect(m.recovery.users_recovered).toBe(1); // completed the same item the day after the unknown lapse
    // Authenticated users cannot call it.
    expect((await u.client.rpc("admin_behaviour_metrics", { p_days: 3 })).error).not.toBeNull();
  });
});
