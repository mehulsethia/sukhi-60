import { beforeAll, describe, expect, it } from "vitest";
import { admin, anonClient, makeUser, planWithDueItem, type TestUser } from "./helpers";
import { materializeOccurrences } from "@/server/core";
import { writeConsentChoices } from "@/server/consents";

let A: TestUser, B: TestUser;
let planA: string, itemA: string, occA: string;

beforeAll(async () => {
  A = await makeUser("rls-a");
  B = await makeUser("rls-b");
  const p = await planWithDueItem(A);
  planA = p.planId;
  itemA = p.item.id;
  await materializeOccurrences(admin(), A.id, 1);
  const { data } = await A.client.from("action_occurrences").select("id").eq("item_id", itemA).limit(1).single();
  occA = data!.id;
  await admin().from("messages").insert({ user_id: A.id, role: "user", channel: "web", content: "private note from A" });
  await admin().from("memory_facts").insert({ user_id: A.id, kind: "barrier", content: "A's private barrier", source_type: "user_message" });
});

describe("cross-user isolation (real local identities)", () => {
  it("B cannot read A's plan, items, occurrences, messages, memory, profile", async () => {
    for (const table of ["care_plans", "plan_items", "action_occurrences", "messages", "memory_facts", "consents", "reward_events", "plan_item_versions"] as const) {
      const { data } = await B.client.from(table).select("*").eq("user_id", A.id);
      expect(data, table).toEqual([]);
    }
    const { data: prof } = await B.client.from("profiles").select("*").eq("id", A.id);
    expect(prof).toEqual([]);
  });

  it("anonymous clients read nothing", async () => {
    const anon = anonClient();
    for (const table of ["care_plans", "plan_items", "messages", "profiles", "jobs", "inbound_events"] as const) {
      const { data } = await anon.from(table).select("*").limit(5);
      expect(data ?? [], table).toEqual([]);
    }
  });

  it("B cannot insert an item into A's plan or modify A's item", async () => {
    const ins = await B.client.from("plan_items").insert({ plan_id: planA, user_id: B.id, title: "hijack", status: "draft" });
    expect(ins.error).not.toBeNull();
    const ins2 = await B.client.from("plan_items").insert({ plan_id: planA, user_id: A.id, title: "hijack", status: "draft" });
    expect(ins2.error).not.toBeNull();
    await B.client.from("plan_items").update({ title: "changed by B" }).eq("id", itemA);
    const { data } = await admin().from("plan_items").select("title").eq("id", itemA).single();
    expect(data!.title).toBe("Evening walk");
  });

  it("B cannot check in on A's occurrence (identity comes from the session)", async () => {
    const r = await B.client.rpc("record_check_in", { p_occurrence: occA, p_kind: "done", p_idempotency_key: "b-attack-0001" });
    expect(r.error?.message).toContain("occurrence_not_found");
    const { data } = await admin().from("action_occurrences").select("status").eq("id", occA).single();
    expect(data!.status).not.toBe("self_reported");
  });

  it("B cannot attach evidence to A's occurrence", async () => {
    const r = await B.client.from("evidence").insert({ user_id: B.id, occurrence_id: occA, kind: "text", text_content: "x", content_hash: "a".repeat(64) });
    expect(r.error).not.toBeNull();
  });

  it("clients cannot call service-only functions or write state tables directly", async () => {
    const claim = await A.client.rpc("claim_jobs", { p_worker: "evil" });
    expect(claim.error).not.toBeNull();
    const internal = await A.client.rpc("apply_check_in_internal", { p_user: A.id, p_occurrence: occA, p_kind: "done", p_channel: "web", p_idempotency_key: "direct-0001" });
    expect(internal.error).not.toBeNull();
    const reward = await A.client.from("reward_events").insert({ user_id: A.id, kind: "completion", points: 10, local_date: "2026-11-10", week_start: "2026-11-09", label: "farm", dedupe_key: "farm-1" });
    expect(reward.error).not.toBeNull();
    const ci = await A.client.from("check_ins").insert({ user_id: A.id, occurrence_id: occA, kind: "done", idempotency_key: "direct-insert-1", local_date: "2026-11-10" });
    expect(ci.error).not.toBeNull();
    const occ = await A.client.from("action_occurrences").update({ status: "evidence_supported" }).eq("id", occA).select();
    expect(occ.data ?? []).toEqual([]);
    const job = await A.client.from("jobs").insert({ kind: "reminder", payload: {} });
    expect(job.error).not.toBeNull();
  });

  it("a user cannot self-assert clinician verification", async () => {
    const r = await A.client.from("care_plans").insert({ user_id: A.id, title: "x", mode: "clinician_instructions", clinician_verification: "clinician_verified" } as never);
    expect(r.error).not.toBeNull();
  });

  it("private storage: B cannot read or write in A's folder; signed URLs need ownership", async () => {
    const path = `${A.id}/test/${crypto.randomUUID()}.png`;
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const up = await A.client.storage.from("evidence").upload(path, png, { contentType: "image/png" });
    expect(up.error).toBeNull();
    const read = await B.client.storage.from("evidence").download(path);
    expect(read.error).not.toBeNull();
    const signed = await B.client.storage.from("evidence").createSignedUrl(path, 60);
    expect(signed.error).not.toBeNull();
    const write = await B.client.storage.from("evidence").upload(`${A.id}/test/evil.png`, png, { contentType: "image/png" });
    expect(write.error).not.toBeNull();
    const anonRead = await anonClient().storage.from("evidence").download(path);
    expect(anonRead.error).not.toBeNull();
  });

  it("confirmed items cannot be silently rescheduled; edits are versioned", async () => {
    const r = await A.client.from("plan_items").update({ times: ["05:00"] }).eq("id", itemA);
    expect(r.error?.message).toContain("confirmed_item_change_requires_reconfirmation");
    await A.client.from("plan_items").update({ status: "draft" }).eq("id", itemA);
    await A.client.from("plan_items").update({ times: ["05:00"] }).eq("id", itemA);
    await A.client.from("plan_items").update({ status: "confirmed" }).eq("id", itemA);
    const { data: versions } = await A.client.from("plan_item_versions").select("version, change_kind").eq("item_id", itemA).order("version");
    expect(versions!.map((v) => v.change_kind)).toEqual(["created", "edited", "edited", "confirmed"]);
  });

  it("users can record and change their own consents through the RLS client (and not others')", async () => {
    const C = await makeUser("rls-consent", { consents: {} });
    await admin().from("consents").delete().eq("user_id", C.id);
    await writeConsentChoices(C.client, C.id, { ai_processing: true, reminders: true, whatsapp: false, family_sharing: false, voice_processing: true });
    await writeConsentChoices(C.client, C.id, { ai_processing: false, reminders: true, whatsapp: true, family_sharing: false, voice_processing: true });
    const { data } = await C.client.from("consents").select("kind, granted, revoked_at").order("kind");
    expect(Object.fromEntries(data!.map((d) => [d.kind, d.granted]))).toEqual({ ai_processing: false, family_sharing: false, reminders: true, voice_processing: true, whatsapp: true });
    expect(data!.find((d) => d.kind === "ai_processing")!.revoked_at).not.toBeNull();
    await expect(writeConsentChoices(B.client, C.id, { ai_processing: true, reminders: true, whatsapp: true, family_sharing: true, voice_processing: true })).rejects.toThrow();
  });
});
