import { describe, expect, it } from "vitest";
import { decideSend, isTrustedMediaUrl, parseWebhook, signMetaBody, verifyMetaSignature } from "@/domain/whatsapp";
import { activeDays, goalProgress, progressFromEvents, summarizeWeek } from "@/domain/rewards";
import inbound from "../fixtures/whatsapp-inbound.json";

describe("Meta signature", () => {
  it("accepts a correct signature over the raw body and rejects tampering", async () => {
    const body = JSON.stringify(inbound);
    const sig = await signMetaBody(body, "app-secret");
    expect(await verifyMetaSignature(body, sig, "app-secret")).toBe(true);
    expect(await verifyMetaSignature(body + " ", sig, "app-secret")).toBe(false);
    expect(await verifyMetaSignature(body, sig, "other-secret")).toBe(false);
    expect(await verifyMetaSignature(body, null, "app-secret")).toBe(false);
    expect(await verifyMetaSignature(body, "sha256=zz", "app-secret")).toBe(false);
  });
});

describe("parseWebhook", () => {
  it("extracts text, image, audio and statuses", () => {
    const { messages, statuses } = parseWebhook(inbound);
    expect(messages.map((m) => m.kind)).toEqual(["text", "image", "audio"]);
    expect(messages[1].mediaId).toBe("MEDIA_IMG_1");
    expect(messages[2].mimeType).toBe("audio/ogg");
    expect(statuses[0]).toMatchObject({ id: "wamid.OUT1", status: "failed", errorCode: "131047" });
  });
  it("ignores foreign payloads", () => expect(parseWebhook({ object: "page" }).messages).toEqual([]));
});

describe("decideSend", () => {
  const binding = { status: "active", last_inbound_at: new Date(Date.now() - 3600_000).toISOString() };
  it("free text inside the 24h window", () => expect(decideSend({ binding, consentWhatsapp: true, approvedTemplates: [], quiet: false }).kind).toBe("free_text"));
  it("approved template outside the window", () =>
    expect(decideSend({ binding: { ...binding, last_inbound_at: "2026-01-01T00:00:00Z" }, consentWhatsapp: true, approvedTemplates: ["sukhi_checkin_ready"], quiet: false })).toEqual({ kind: "template", template: "sukhi_checkin_ready" }));
  it("blocked outside the window without an approved template", () =>
    expect(decideSend({ binding: { ...binding, last_inbound_at: null }, consentWhatsapp: true, approvedTemplates: [], quiet: false }).reason).toBe("template_not_approved"));
  it("opt-out, consent and quiet hours block", () => {
    expect(decideSend({ binding: { ...binding, status: "revoked" }, consentWhatsapp: true, approvedTemplates: [], quiet: false }).reason).toBe("opted_out");
    expect(decideSend({ binding, consentWhatsapp: false, approvedTemplates: [], quiet: false }).reason).toBe("no_consent");
    expect(decideSend({ binding, consentWhatsapp: true, approvedTemplates: [], quiet: true }).reason).toBe("quiet_hours");
  });
  it("media only from Meta hosts", () => {
    expect(isTrustedMediaUrl("https://lookaside.fbsbx.com/whatsapp_business/attachments/?mid=1")).toBe(true);
    expect(isTrustedMediaUrl("https://evil.example.com/x")).toBe(false);
    expect(isTrustedMediaUrl("http://graph.facebook.com/x")).toBe(false);
  });
});

describe("progress", () => {
  it("points only grow; missed days never subtract", () => {
    const g = progressFromEvents([{ kind: "participation", points: 1 }, { kind: "completion", points: 2 }, { kind: "return", points: 3 }, { kind: "milestone", points: 2 }, { kind: "completion", points: -5 }]);
    expect(g).toEqual({ points: 8, milestones: 1, returns: 1 });
  });
  it("active days count honest answers, not only completions", () => {
    const w = summarizeWeek(["2026-11-09", "2026-11-10", "2026-11-11"], [{ local_date: "2026-11-09", status: "skipped" }, { local_date: "2026-11-10", status: "no_response" }, { local_date: "2026-11-11", status: "self_reported" }]);
    expect(activeDays(w)).toBe(2);
  });
  it("week summary separates completion, evidence and silence", () => {
    const [d] = summarizeWeek(["2026-11-10"], [{ local_date: "2026-11-10", status: "self_reported" }, { local_date: "2026-11-10", status: "evidence_supported" }, { local_date: "2026-11-10", status: "no_response" }, { local_date: "2026-11-10", status: "skipped" }]);
    expect(d).toMatchObject({ scheduled: 4, completed: 2, evidenceSupported: 1, responded: 3, noResponse: 1 });
  });
  it("goal progress uses points since the goal was set", () => expect(goalProgress(30, { target_points: 20, baseline_points: 20 })).toMatchObject({ earned: 10, done: false }));
});
