import { beforeAll, describe, expect, it } from "vitest";
import { admin, makeUser, planWithDueItem, type TestUser } from "./helpers";
import { applyCheckIn, materializeOccurrences } from "@/server/core";
import { evaluateEvidence } from "@/server/ai-tasks";

let U: TestUser;
beforeAll(async () => {
  U = await makeUser("life");
});

async function dueOccurrence(u: TestUser, itemId: string) {
  await materializeOccurrences(admin(), u.id, 1);
  const { data } = await admin().from("action_occurrences").select("*").eq("item_id", itemId).order("due_at").limit(1).single();
  return data!;
}

describe("plan -> occurrence -> check-in -> rewards", () => {
  it("materialization is idempotent and creates versioned reminder jobs", async () => {
    const { item } = await planWithDueItem(U);
    const first = await materializeOccurrences(admin(), U.id, 3);
    const again = await materializeOccurrences(admin(), U.id, 3);
    expect(first.created).toBeGreaterThan(0);
    expect(again.created).toBe(0);
    const { data: jobs } = await admin().from("jobs").select("dedupe_key, plan_item_version").eq("user_id", U.id).eq("kind", "reminder");
    expect(jobs!.length).toBe(first.reminders);
    expect(jobs!.every((j) => j.plan_item_version === item.version)).toBe(true);
  });

  it("done -> self_reported with participation, completion and first-step rewards, once", async () => {
    const u = await makeUser("life-done");
    const { item } = await planWithDueItem(u);
    const occ = await dueOccurrence(u, item.id);
    const r1 = await applyCheckIn(admin(), u.id, occ.id, "done", { channel: "web", idempotencyKey: "k-done-0001" });
    expect(r1.status).toBe("self_reported");
    expect(r1.rewards.map((r) => r.kind).sort()).toEqual(["completion", "milestone", "participation"]);
    const dup = await applyCheckIn(admin(), u.id, occ.id, "done", { channel: "whatsapp", idempotencyKey: "k-done-0001" });
    expect(dup.duplicate).toBe(true);
    const again = await applyCheckIn(admin(), u.id, occ.id, "done", { channel: "web", idempotencyKey: "k-done-0002" });
    expect(again.result).toBe("already_recorded"); // no extra credit for an extra dose
    expect(again.rewards).toEqual([]);
    const { data: ev } = await admin().from("reward_events").select("points").eq("user_id", u.id);
    expect(ev!.reduce((s, e) => s + e.points, 0)).toBe(5);
  });

  it("concurrent duplicate submissions issue rewards once", async () => {
    const u = await makeUser("life-conc");
    const { item } = await planWithDueItem(u);
    const occ = await dueOccurrence(u, item.id);
    const results = await Promise.allSettled(Array.from({ length: 6 }, (_, i) => applyCheckIn(admin(), u.id, occ.id, "done", { channel: "web", idempotencyKey: `conc-${i % 2}-xxxxxx` })));
    expect(results.every((r) => r.status === "fulfilled")).toBe(true);
    const { data: ev } = await admin().from("reward_events").select("kind").eq("user_id", u.id).eq("kind", "completion");
    expect(ev!.length).toBe(1);
  });

  it("skipped is an honest answer: participation credit only, never completion", async () => {
    const u = await makeUser("life-skip");
    const { item } = await planWithDueItem(u);
    const occ = await dueOccurrence(u, item.id);
    const r = await applyCheckIn(admin(), u.id, occ.id, "skipped", { channel: "web", idempotencyKey: "k-skip-0001", reason: "rain" });
    expect(r.status).toBe("skipped");
    expect(r.rewards.map((x) => x.kind)).toEqual(["participation"]);
  });

  it("weekly targets count distinct days and stop at the target", async () => {
    const u = await makeUser("life-weekly");
    const { item } = await planWithDueItem(u, { schedule: "weekly_target", target: 2 });
    const occ = await dueOccurrence(u, item.id);
    const r1 = await applyCheckIn(admin(), u.id, occ.id, "done", { channel: "web", idempotencyKey: "wk-0001-aaaa" });
    expect(r1.result).toBe("recorded");
    const r2 = await applyCheckIn(admin(), u.id, occ.id, "done", { channel: "web", idempotencyKey: "wk-0002-aaaa" });
    expect(r2.result).toBe("already_counted"); // same local day
    const { data } = await admin().from("action_occurrences").select("completed_count, status").eq("id", occ.id).single();
    expect(data!.completed_count).toBe(1);
    expect(data!.status).not.toBe("self_reported");
  });

  it("returning after a non-completed day earns a welcome-back bonus; missed days never subtract", async () => {
    const u = await makeUser("life-return");
    const { item, planId } = await planWithDueItem(u);
    // Simulate yesterday's occurrence with no response.
    const yesterday = new Date(Date.now() - 86400_000);
    const ld = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(yesterday);
    await admin().from("action_occurrences").insert({ user_id: u.id, item_id: item.id, plan_id: planId, item_version: 1, due_at: yesterday.toISOString(), window_end_at: new Date(yesterday.getTime() + 3600_000).toISOString(), local_date: ld, timezone: "Asia/Kolkata", status: "no_response" });
    const occ = await dueOccurrence(u, item.id);
    const target = occ.local_date === ld ? (await admin().from("action_occurrences").select("*").eq("item_id", item.id).neq("local_date", ld).limit(1).single()).data! : occ;
    const r = await applyCheckIn(admin(), u.id, target.id, "done", { channel: "web", idempotencyKey: "ret-0001-aaaa" });
    expect(r.rewards.map((x) => x.kind)).toContain("return");
    expect(r.rewards.every((x) => x.points >= 0)).toBe(true);
  });

  it("daily cap bounds participation/completion points", async () => {
    const u = await makeUser("life-cap");
    const { item } = await planWithDueItem(u);
    await materializeOccurrences(admin(), u.id, 1);
    // Create many due occurrences today for the same item at different minutes.
    const base = Date.now() - 30 * 60_000;
    const ld = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
    const rows = Array.from({ length: 8 }, (_, i) => ({ user_id: u.id, item_id: item.id, plan_id: item.plan_id, item_version: item.version, due_at: new Date(base + i * 1000).toISOString(), window_end_at: new Date(base + 3 * 3600_000).toISOString(), local_date: ld, timezone: "Asia/Kolkata", status: "due" as const }));
    const { data: occs } = await admin().from("action_occurrences").insert(rows).select("id");
    for (const [i, o] of occs!.entries()) await applyCheckIn(admin(), u.id, o.id, "done", { channel: "web", idempotencyKey: `cap-${i}-aaaaaa` });
    const { data: ev } = await admin().from("reward_events").select("points, kind").eq("user_id", u.id).eq("local_date", ld).in("kind", ["participation", "completion", "evidence_bonus"]);
    expect(ev!.reduce((s, e) => s + e.points, 0)).toBeLessThanOrEqual(12);
  });

  it("silence becomes no_response (not missed) only after the window", async () => {
    const u = await makeUser("life-silence");
    const { item, planId } = await planWithDueItem(u);
    const past = new Date(Date.now() - 5 * 3600_000);
    const { data: occ } = await admin().from("action_occurrences").insert({ user_id: u.id, item_id: item.id, plan_id: planId, item_version: 1, due_at: past.toISOString(), window_end_at: new Date(past.getTime() + 3600_000).toISOString(), local_date: "2026-01-01", timezone: "Asia/Kolkata", status: "awaiting_response" }).select("id").single();
    await admin().rpc("apply_silence_rule", { p_limit: 100 });
    const { data } = await admin().from("action_occurrences").select("status").eq("id", occ!.id).single();
    expect(data!.status).toBe("no_response");
  });

  it("pausing an item pauses open occurrences and cancels queued reminders", async () => {
    const u = await makeUser("life-pause");
    const { item } = await planWithDueItem(u);
    await materializeOccurrences(admin(), u.id, 2);
    await u.client.from("plan_items").update({ status: "paused" }).eq("id", item.id);
    const { data: jobs } = await admin().from("jobs").select("status").eq("user_id", u.id).eq("kind", "reminder");
    expect(jobs!.every((j) => j.status === "cancelled")).toBe(true);
    const { data: occ } = await admin().from("action_occurrences").select("status").eq("item_id", item.id);
    expect(occ!.every((o) => o.status === "paused")).toBe(true);
  });

  it("evidence: text is self-report; unconfigured AI never invents support; resubmission is blocked", async () => {
    const u = await makeUser("life-ev");
    const { item } = await planWithDueItem(u);
    const occ = await dueOccurrence(u, item.id);
    const { data: ev } = await u.client.from("evidence").insert({ user_id: u.id, occurrence_id: occ.id, kind: "text", text_content: "walked to the temple", content_hash: "b".repeat(64) }).select("id").single();
    const e1 = await evaluateEvidence(admin(), u.id, ev!.id);
    expect(e1.outcome).toBe("not_applicable");
    const again = await evaluateEvidence(admin(), u.id, ev!.id);
    expect(again.id).toBe(e1.id); // idempotent
    const dup = await u.client.from("evidence").insert({ user_id: u.id, occurrence_id: occ.id, kind: "text", text_content: "walked to the temple", content_hash: "b".repeat(64) });
    expect(dup.error?.code).toBe("23505");
    // Photo with no AI configured: stored, unclear, status unchanged (not evidence_supported).
    const path = `${u.id}/${occ.id}/p.png`;
    await u.client.storage.from("evidence").upload(path, new Uint8Array([0x89, 0x50, 0x4e, 0x47]), { contentType: "image/png" });
    const { data: doc } = await u.client.from("documents").insert({ user_id: u.id, bucket: "evidence", storage_path: path, mime_type: "image/png", size_bytes: 4, sha256: "c".repeat(64) }).select("id").single();
    const { data: ev2 } = await u.client.from("evidence").insert({ user_id: u.id, occurrence_id: occ.id, kind: "photo", document_id: doc!.id, content_hash: "c".repeat(64) }).select("id").single();
    const e2 = await evaluateEvidence(admin(), u.id, ev2!.id);
    expect(e2.outcome).toBe("unclear");
    const { data: o } = await admin().from("action_occurrences").select("status").eq("id", occ.id).single();
    expect(o!.status).not.toBe("evidence_supported");
  });

  it("evaluation outcomes map to statuses deterministically (supports -> evidence_supported, unclear+review -> needs_review)", async () => {
    const u = await makeUser("life-evalmap");
    const { item } = await planWithDueItem(u, { category: "measurement" });
    const occ = await dueOccurrence(u, item.id);
    const { data: e } = await admin().from("evaluations").insert({ user_id: u.id, occurrence_id: occ.id, method: "model", outcome: "supports", explanation: "meter reading visible" }).select("id").single();
    const r = await admin().rpc("apply_evaluation_internal", { p_evaluation: e!.id });
    expect((r.data as { status: string }).status).toBe("evidence_supported");
    const occ2 = (await admin().from("action_occurrences").select("*").eq("item_id", item.id).neq("id", occ.id).limit(1).maybeSingle()).data;
    if (occ2) {
      const { data: e2 } = await admin().from("evaluations").insert({ user_id: u.id, occurrence_id: occ2.id, method: "model", outcome: "unclear", needs_review: true, explanation: "blurry" }).select("id").single();
      const r2 = await admin().rpc("apply_evaluation_internal", { p_evaluation: e2!.id });
      expect((r2.data as { status: string }).status).toBe("needs_review");
      const { data: rr } = await admin().from("review_requests").select("source").eq("user_id", u.id);
      expect(rr!.some((x) => x.source === "evaluator")).toBe(true);
    }
  });
});
