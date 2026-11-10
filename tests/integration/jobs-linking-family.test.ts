import { beforeAll, describe, expect, it } from "vitest";
import { admin, makeUser, planWithDueItem, type TestUser } from "./helpers";
import { materializeOccurrences } from "@/server/core";
import { runWorkerTick } from "@/server/worker";
import { generateLinkCode, hashLinkCode } from "@/domain/router";

const PEPPER = () => process.env.LINK_CODE_PEPPER!;
const rnd = () => `91${Math.floor(1e9 + Math.random() * 8.99e9)}`;
const N1 = rnd(), N2 = rnd(), N3 = rnd(), N4 = rnd(), N5 = rnd();

describe("durable job queue", () => {
  it("concurrent workers never claim the same job", async () => {
    const a = admin();
    const rows = Array.from({ length: 30 }, (_, i) => ({ kind: "apply_silence_rule" as const, dedupe_key: `conc-claim-${crypto.randomUUID()}-${i}` }));
    await a.from("jobs").insert(rows);
    const [w1, w2, w3] = await Promise.all([a.rpc("claim_jobs", { p_worker: "w1", p_limit: 20 }), a.rpc("claim_jobs", { p_worker: "w2", p_limit: 20 }), a.rpc("claim_jobs", { p_worker: "w3", p_limit: 20 })]);
    const ids = [...(w1.data ?? []), ...(w2.data ?? []), ...(w3.data ?? [])].map((j) => j.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const w of ["w1", "w2", "w3"]) {
      const { data } = await a.from("jobs").select("id").eq("locked_by", w).eq("status", "running");
      for (const j of data ?? []) await a.rpc("complete_job", { p_job: j.id, p_worker: w });
    }
  });

  it("expired leases are recovered; repeated failure ends in dead letter with backoff", async () => {
    const a = admin();
    const { data: job } = await a.from("jobs").insert({ kind: "apply_silence_rule", dedupe_key: `lease-${crypto.randomUUID()}`, max_attempts: 2 }).select("id").single();
    await a.rpc("claim_job", { p_job: job!.id, p_worker: "dead-worker", p_lease_seconds: 15 });
    await a.from("jobs").update({ locked_until: new Date(Date.now() - 1000).toISOString() }).eq("id", job!.id);
    await a.rpc("claim_jobs", { p_worker: "recoverer", p_limit: 1 }); // recovery runs first
    const { data: rec } = await a.from("jobs").select("status, attempts, locked_by").eq("id", job!.id).single();
    expect(["queued", "running"]).toContain(rec!.status);
    // Force it to be ours and fail it twice.
    await a.from("jobs").update({ status: "running", locked_by: "w", attempts: 1 }).eq("id", job!.id);
    const s1 = await a.rpc("fail_job", { p_job: job!.id, p_worker: "w", p_error: "boom" });
    expect(s1.data).toBe("queued");
    const { data: q } = await a.from("jobs").select("run_at").eq("id", job!.id).single();
    expect(new Date(q!.run_at).getTime()).toBeGreaterThan(Date.now()); // backoff
    await a.from("jobs").update({ status: "running", locked_by: "w", attempts: 2 }).eq("id", job!.id);
    const s2 = await a.rpc("fail_job", { p_job: job!.id, p_worker: "w", p_error: "boom" });
    expect(s2.data).toBe("dead");
  });

  it("reminders for changed plan versions are cancelled, not sent", async () => {
    const u = await makeUser("job-ver");
    const { item } = await planWithDueItem(u);
    await materializeOccurrences(admin(), u.id, 1);
    const { data: jobs } = await admin().from("jobs").select("id").eq("user_id", u.id).eq("kind", "reminder");
    await admin().from("jobs").update({ run_at: new Date(Date.now() - 1000).toISOString(), plan_item_version: item.version - 1 }).in("id", jobs!.map((j) => j.id));
    await runWorkerTick(admin(), "test-worker");
    const { data: after } = await admin().from("jobs").select("status, last_error").in("id", jobs!.map((j) => j.id));
    expect(after!.every((j) => j.status === "cancelled" && j.last_error === "plan_version_changed")).toBe(true);
  });

  it("a due reminder marks the occurrence awaiting_response and writes an in-app notice (WhatsApp unconfigured)", async () => {
    const u = await makeUser("job-remind");
    const { item } = await planWithDueItem(u);
    await materializeOccurrences(admin(), u.id, 1);
    const { data: jobs } = await admin().from("jobs").select("id").eq("user_id", u.id).eq("kind", "reminder");
    await admin().from("jobs").update({ run_at: new Date(Date.now() - 1000).toISOString() }).in("id", jobs!.map((j) => j.id));
    await runWorkerTick(admin(), "test-worker-2");
    const { data: occ } = await admin().from("action_occurrences").select("status").eq("item_id", item.id).lte("due_at", new Date().toISOString());
    expect(occ!.some((o) => o.status === "awaiting_response")).toBe(true);
    const { data: notes } = await admin().from("messages").select("role").eq("user_id", u.id).eq("role", "notice");
    expect(notes!.length).toBeGreaterThan(0);
    const { data: out } = await admin().from("outbound_messages").select("id").eq("user_id", u.id);
    expect(out).toEqual([]); // no binding -> no WhatsApp send attempted
  });
});

describe("WhatsApp linking codes", () => {
  let U: TestUser;
  beforeAll(async () => {
    U = await makeUser("link");
  });
  const newCode = async (u: TestUser, purpose: "link" | "rebind" = "link", expires = 15 * 60_000) => {
    const code = generateLinkCode();
    await admin().from("link_codes").insert({ user_id: u.id, code_hash: await hashLinkCode(code, PEPPER()), purpose, expires_at: new Date(Date.now() + expires).toISOString() });
    return code;
  };

  it("links once; replay of the same code fails", async () => {
    const code = await newCode(U);
    const ok = await admin().rpc("consume_link_code", { p_code_hash: await hashLinkCode(code, PEPPER()), p_external_id: N1 });
    expect(ok.data).toMatchObject({ ok: true, reason: "linked" });
    const replay = await admin().rpc("consume_link_code", { p_code_hash: await hashLinkCode(code, PEPPER()), p_external_id: N1 });
    expect(replay.data).toMatchObject({ ok: false, reason: "invalid_or_expired" });
  });

  it("expired codes fail", async () => {
    const u = await makeUser("link-exp");
    const code = await newCode(u, "link", -1000);
    const r = await admin().rpc("consume_link_code", { p_code_hash: await hashLinkCode(code, PEPPER()), p_external_id: N2 });
    expect(r.data).toMatchObject({ ok: false, reason: "invalid_or_expired" });
  });

  it("a number bound to one account cannot be taken over by another account's code", async () => {
    const attacker = await makeUser("link-attacker");
    const code = await newCode(attacker);
    const r = await admin().rpc("consume_link_code", { p_code_hash: await hashLinkCode(code, PEPPER()), p_external_id: N1 });
    expect(r.data).toMatchObject({ ok: false, reason: "number_bound_to_other_account" });
    const { data } = await admin().from("channel_bindings").select("user_id").eq("external_id", N1).neq("status", "revoked").single();
    expect(data!.user_id).toBe(U.id);
  });

  it("switching numbers requires an explicit rebind code", async () => {
    const plain = await newCode(U, "link");
    const r = await admin().rpc("consume_link_code", { p_code_hash: await hashLinkCode(plain, PEPPER()), p_external_id: N3 });
    expect(r.data).toMatchObject({ ok: false, reason: "rebind_confirmation_required" });
    const rebind = await newCode(U, "rebind");
    const r2 = await admin().rpc("consume_link_code", { p_code_hash: await hashLinkCode(rebind, PEPPER()), p_external_id: N3 });
    expect(r2.data).toMatchObject({ ok: true });
  });

  it("rate-limits repeated failures per number", async () => {
    for (let i = 0; i < 5; i++) await admin().rpc("consume_link_code", { p_code_hash: "f".repeat(64), p_external_id: N4 });
    const r = await admin().rpc("consume_link_code", { p_code_hash: "f".repeat(64), p_external_id: N4 });
    expect(r.data).toMatchObject({ ok: false, reason: "rate_limited" });
  });

  it("users cannot read link code hashes or create bindings directly", async () => {
    const { data } = await U.client.from("link_codes").select("*");
    expect(data ?? []).toEqual([]);
    const ins = await U.client.from("channel_bindings").insert({ user_id: U.id, external_id: N5 } as never);
    expect(ins.error).not.toBeNull();
  });
});

describe("family support: consented summaries with immediate revocation", () => {
  it("member sees only aggregated counts and loses access the moment the patient revokes", async () => {
    const P = await makeUser("fam-patient");
    const M = await makeUser("fam-member");
    await planWithDueItem(P);
    await materializeOccurrences(admin(), P.id, 1);
    const token = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
    const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token)))).map((b) => b.toString(16).padStart(2, "0")).join("");
    const { data: fa, error } = await P.client.from("family_access").insert({ patient_id: P.id, invitee_label: "Daughter", invite_token_hash: hash, scopes: ["weekly_summary"] }).select("id").single();
    expect(error).toBeNull();
    const own = await P.client.rpc("accept_family_invite", { p_token: token });
    expect(own.data).toMatchObject({ ok: false, reason: "cannot_accept_own_invite" });
    const acc = await M.client.rpc("accept_family_invite", { p_token: token });
    expect(acc.data).toMatchObject({ ok: true });
    const s = await M.client.rpc("family_summary", { p_access: fa!.id });
    expect(s.error).toBeNull();
    expect(Object.keys(s.data as object).sort()).toEqual(["days", "first_name", "garden_points", "scopes", "week_start"]);
    expect((s.data as { garden_points: unknown }).garden_points).toBeNull(); // garden scope not granted
    // Member still cannot read raw patient tables.
    const { data: raw } = await M.client.from("plan_items").select("*").eq("user_id", P.id);
    expect(raw).toEqual([]);
    const { data: msgs } = await M.client.from("messages").select("*").eq("user_id", P.id);
    expect(msgs).toEqual([]);
    // Revoke -> next call fails immediately (no re-login needed).
    await P.client.from("family_access").update({ status: "revoked" }).eq("id", fa!.id);
    const after = await M.client.rpc("family_summary", { p_access: fa!.id });
    expect(after.error?.message).toContain("access_not_active");
    // Member cannot un-revoke; patient cannot restore a revoked grant.
    const restore = await P.client.from("family_access").update({ status: "active" }).eq("id", fa!.id);
    expect(restore.error).not.toBeNull();
    const reuse = await M.client.rpc("accept_family_invite", { p_token: token });
    expect(reuse.data).toMatchObject({ ok: false });
  });
});
