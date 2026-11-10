// Signed-webhook FIXTURE tests. Meta's API is replaced by a local fetch stub; this proves
// our handling, not real delivery through Meta.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { admin, makeUser, planWithDueItem, type TestUser } from "./helpers";
import { signMetaBody } from "@/domain/whatsapp";
import { generateLinkCode, hashLinkCode } from "@/domain/router";
import { materializeOccurrences } from "@/server/core";
import { runWorkerTick } from "@/server/worker";

const pendingAfter: (() => Promise<void>)[] = [];
vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), after: (fn: () => Promise<void>) => pendingAfter.push(fn) }));

type Sent = { to: string; type: string; body: string };
let sent: Sent[] = [];
let mode: "ok" | "timeout" | "500" = "ok";
const realFetch = globalThis.fetch;

beforeAll(() => {
  Object.assign(process.env, { WHATSAPP_ACCESS_TOKEN: "test-token-xxxxxxxxxxxxxxxxxxxx", WHATSAPP_PHONE_NUMBER_ID: "1234567890", WHATSAPP_APP_SECRET: "test-app-secret-123", WHATSAPP_VERIFY_TOKEN: "verify-token-123456", WHATSAPP_APPROVED_TEMPLATES: "" });
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (!url.startsWith("https://graph.facebook.com/")) return realFetch(input, init);
    if (mode === "timeout") throw Object.assign(new Error("timeout"), { name: "TimeoutError" });
    if (mode === "500") return new Response(JSON.stringify({ error: { code: 1 } }), { status: 500 });
    const b = JSON.parse(String(init?.body));
    sent.push({ to: b.to, type: b.type, body: b.type === "text" ? b.text.body : b.template.name });
    return new Response(JSON.stringify({ messages: [{ id: `wamid.OUT.${crypto.randomUUID()}` }] }), { status: 200 });
  }) as typeof fetch;
});
afterAll(() => {
  globalThis.fetch = realFetch;
  for (const k of ["WHATSAPP_ACCESS_TOKEN", "WHATSAPP_PHONE_NUMBER_ID", "WHATSAPP_APP_SECRET", "WHATSAPP_VERIFY_TOKEN", "WHATSAPP_APPROVED_TEMPLATES"]) delete process.env[k];
});
beforeEach(() => {
  sent = [];
  mode = "ok";
});

const payload = (from: string, id: string, text: string) => ({
  object: "whatsapp_business_account",
  entry: [{ id: "WABA", changes: [{ field: "messages", value: { messaging_product: "whatsapp", metadata: { phone_number_id: "1234567890" }, messages: [{ from, id, timestamp: String(Math.floor(Date.now() / 1000)), type: "text", text: { body: text } }] } }] }],
});

async function post(body: object, secret = "test-app-secret-123") {
  const { POST } = await import("@/app/api/whatsapp/webhook/route");
  const raw = JSON.stringify(body);
  const res = await POST(new Request("http://localhost/api/whatsapp/webhook", { method: "POST", body: raw, headers: { "x-hub-signature-256": await signMetaBody(raw, secret) } }));
  while (pendingAfter.length) await pendingAfter.shift()!();
  return res;
}

async function link(u: TestUser, wa: string) {
  const code = generateLinkCode();
  await admin().from("link_codes").insert({ user_id: u.id, code_hash: await hashLinkCode(code, process.env.LINK_CODE_PEPPER!), expires_at: new Date(Date.now() + 600_000).toISOString() });
  return post(payload(wa, `wamid.LINK.${crypto.randomUUID()}`, `SUKHI-${code}`));
}

describe("webhook security", () => {
  it("GET verification only with the secret verify token", async () => {
    const { GET } = await import("@/app/api/whatsapp/webhook/route");
    const ok = await GET(new Request("http://localhost/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=verify-token-123456&hub.challenge=42"));
    expect(ok.status).toBe(200);
    expect(await ok.text()).toBe("42");
    const bad = await GET(new Request("http://localhost/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=wrong-token-123456&hub.challenge=42"));
    expect(bad.status).toBe(403);
  });

  it("rejects an invalid signature before persisting anything", async () => {
    const id = `wamid.BAD.${crypto.randomUUID()}`;
    const res = await post(payload("919800000099", id, "hello"), "wrong-secret-xxxx");
    expect(res.status).toBe(401);
    const { data } = await admin().from("inbound_events").select("id").eq("provider_event_id", id);
    expect(data).toEqual([]);
  });
});

describe("linking, shared context, replay, STOP", () => {
  let U: TestUser;
  const WA = `9198${Math.floor(10000000 + Math.random() * 89999999)}`;
  beforeAll(async () => {
    U = await makeUser("wa");
  });

  it("links via code sent from WhatsApp and replies inside the window", async () => {
    const res = await link(U, WA);
    expect(res.status).toBe(200);
    const { data: b } = await admin().from("channel_bindings").select("user_id, status").eq("external_id", WA).single();
    expect(b).toMatchObject({ user_id: U.id, status: "active" });
    expect(sent.at(-1)).toMatchObject({ to: WA, type: "text" });
  });

  it("a WhatsApp 'done' uses the same tools/state as the web app; replays are ignored", async () => {
    const { item } = await planWithDueItem(U);
    await materializeOccurrences(admin(), U.id, 1);
    const id = `wamid.DONE.${crypto.randomUUID()}`;
    await post(payload(WA, id, "done"));
    const { data: occ } = await admin().from("action_occurrences").select("status").eq("item_id", item.id).lte("due_at", new Date().toISOString());
    expect(occ!.some((o) => o.status === "self_reported")).toBe(true);
    const { data: ci } = await admin().from("check_ins").select("channel").eq("user_id", U.id);
    expect(ci!.map((c) => c.channel)).toContain("whatsapp");
    const before = sent.length;
    await post(payload(WA, id, "done")); // Meta retry of the same message
    const { data: ci2 } = await admin().from("check_ins").select("id").eq("user_id", U.id);
    expect(ci2!.length).toBe(ci!.length);
    expect(sent.length).toBe(before);
    // Shared context: the web chat history contains the WhatsApp exchange.
    const { data: msgs } = await U.client.from("messages").select("channel, role").eq("channel", "whatsapp");
    expect(msgs!.some((m) => m.role === "user") && msgs!.some((m) => m.role === "assistant")).toBe(true);
  });

  it("outside the 24h window, no free text: template only if approved, else blocked", async () => {
    const u = await makeUser("wa-window");
    const wa = `9197${Math.floor(10000000 + Math.random() * 89999999)}`;
    await link(u, wa);
    await admin().from("channel_bindings").update({ last_inbound_at: new Date(Date.now() - 30 * 3600_000).toISOString() }).eq("external_id", wa);
    await planWithDueItem(u);
    await materializeOccurrences(admin(), u.id, 1);
    const due = async () => {
      const { data: jobs } = await admin().from("jobs").select("id").eq("user_id", u.id).eq("kind", "reminder").eq("status", "queued");
      await admin().from("jobs").update({ run_at: new Date(Date.now() - 1000).toISOString() }).in("id", (jobs ?? []).map((j) => j.id));
    };
    await due();
    sent = [];
    await runWorkerTick(admin(), "wa-worker-1");
    expect(sent.filter((s) => s.to === wa)).toEqual([]); // no approved template -> blocked
    // Now approve the template and add another reminder.
    process.env.WHATSAPP_APPROVED_TEMPLATES = "sukhi_checkin_ready";
    const { data: occ } = await admin().from("action_occurrences").select("id, item_id, plan_id, item_version").eq("user_id", u.id).in("status", ["pending", "due", "awaiting_response"]).limit(1).single();
    await admin().from("jobs").insert({ user_id: u.id, kind: "reminder", run_at: new Date(Date.now() - 1000).toISOString(), plan_item_version: occ!.item_version, dedupe_key: `reminder:${occ!.id}:t2`, payload: { occurrence_id: occ!.id, item_id: occ!.item_id, plan_id: occ!.plan_id } });
    await runWorkerTick(admin(), "wa-worker-2");
    expect(sent.filter((s) => s.to === wa)).toEqual([{ to: wa, type: "template", body: "sukhi_checkin_ready" }]);
    process.env.WHATSAPP_APPROVED_TEMPLATES = "";
  });

  it("uncertain delivery is recorded and never blindly resent; retryable errors back off", async () => {
    const u = await makeUser("wa-uncertain");
    const wa = `9196${Math.floor(10000000 + Math.random() * 89999999)}`;
    await link(u, wa);
    const { data: b } = await admin().from("channel_bindings").select("id").eq("external_id", wa).single();
    const { enqueueOutbound } = await import("@/server/worker");
    mode = "timeout";
    await enqueueOutbound(admin(), u.id, b!.id, { kind: "free_text", body: "hello", dedupeKey: `t-unc-${crypto.randomUUID()}` });
    await runWorkerTick(admin(), "wa-worker-3");
    const { data: out } = await admin().from("outbound_messages").select("status, attempts").eq("user_id", u.id).eq("body", "hello").single();
    expect(out!.status).toBe("uncertain");
    mode = "ok";
    sent = [];
    await runWorkerTick(admin(), "wa-worker-4");
    expect(sent.filter((s) => s.body === "hello")).toEqual([]);
    mode = "500";
    await enqueueOutbound(admin(), u.id, b!.id, { kind: "free_text", body: "retry me", dedupeKey: `t-500-${crypto.randomUUID()}` });
    await runWorkerTick(admin(), "wa-worker-5");
    const { data: job } = await admin().from("jobs").select("status, attempts, run_at").eq("user_id", u.id).eq("kind", "send_outbound").order("created_at", { ascending: false }).limit(1).single();
    expect(job!.status).toBe("queued");
    expect(new Date(job!.run_at).getTime()).toBeGreaterThan(Date.now());
  });

  it("delivery status webhooks update outbound records", async () => {
    const { data: out } = await admin().from("outbound_messages").select("id, provider_message_id").eq("user_id", U.id).not("provider_message_id", "is", null).limit(1).single();
    const statusPayload = { object: "whatsapp_business_account", entry: [{ id: "W", changes: [{ field: "messages", value: { statuses: [{ id: out!.provider_message_id, status: "delivered", timestamp: "1", recipient_id: WA }] } }] }] };
    await post(statusPayload);
    const { data } = await admin().from("outbound_messages").select("status").eq("id", out!.id).single();
    expect(data!.status).toBe("delivered");
  });

  it("STOP opts out: binding paused, consent revoked, reminders stop", async () => {
    await post(payload(WA, `wamid.STOP.${crypto.randomUUID()}`, "STOP"));
    const { data: b } = await admin().from("channel_bindings").select("status, opted_out_at").eq("external_id", WA).single();
    expect(b!.status).toBe("paused");
    const { data: c } = await admin().from("consents").select("granted").eq("user_id", U.id).eq("kind", "whatsapp").single();
    expect(c!.granted).toBe(false);
    sent = [];
    const { data: occ } = await admin().from("action_occurrences").select("id, item_id, plan_id, item_version").eq("user_id", U.id).limit(1).single();
    await admin().from("action_occurrences").update({ status: "due" }).eq("id", occ!.id);
    await admin().from("jobs").insert({ user_id: U.id, kind: "reminder", run_at: new Date(Date.now() - 1000).toISOString(), plan_item_version: occ!.item_version, dedupe_key: `reminder:${occ!.id}:stop`, payload: { occurrence_id: occ!.id, item_id: occ!.item_id, plan_id: occ!.plan_id } });
    await runWorkerTick(admin(), "wa-worker-6");
    expect(sent.filter((s) => s.to === WA)).toEqual([]);
  });
});
