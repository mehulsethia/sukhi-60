import { describe, expect, it } from "vitest";
import { adherence, cleanName, clampOut, dots, parseCommand, parseInviteCode, scheduleText, time12, toGraph, waLink } from "@/domain/wa-ui";
import { decideSend, parseWebhook } from "@/domain/whatsapp";
import { d, w } from "@/domain/wa-copy";

describe("clampOut / toGraph", () => {
  it("caps buttons at 3 and titles at 20 chars", () => {
    const o = clampOut({ type: "buttons", body: "x", buttons: [1, 2, 3, 4].map((i) => ({ id: `b${i}`, title: "A very long button title here" })) });
    expect(o.type).toBe("buttons");
    if (o.type !== "buttons") return;
    expect(o.buttons).toHaveLength(3);
    expect(o.buttons.every((b) => b.title.length <= 20)).toBe(true);
  });
  it("caps list rows at 10 across sections and titles sections when several", () => {
    const rows = Array.from({ length: 8 }, (_, i) => ({ id: `r${i}`, title: `Row number ${i} with a long title`, description: "d".repeat(100) }));
    const o = clampOut({ type: "list", body: "b", button: "Menu", sections: [{ rows }, { rows }] });
    if (o.type !== "list") throw new Error("expected list");
    expect(o.sections.flatMap((s) => s.rows)).toHaveLength(10);
    expect(o.sections.every((s) => !!s.title)).toBe(true);
    expect(o.sections[0].rows.every((r) => r.title.length <= 24 && (r.description?.length ?? 0) <= 72)).toBe(true);
  });
  it("falls back to text with no buttons", () => expect(clampOut({ type: "buttons", body: "hi", buttons: [] }).type).toBe("text"));
  it("builds Graph interactive payloads", () => {
    const g = toGraph({ type: "buttons", body: "Time for: Walk", buttons: [{ id: "ci:done:x", title: "Done ✓" }] }) as { type: string; interactive: { type: string; action: { buttons: { reply: { id: string } }[] } } };
    expect(g.type).toBe("interactive");
    expect(g.interactive.type).toBe("button");
    expect(g.interactive.action.buttons[0].reply.id).toBe("ci:done:x");
    const l = toGraph({ type: "list", body: "b", button: "Menu", sections: [{ rows: [{ id: "m:today", title: "Today" }] }] }) as { interactive: { type: string } };
    expect(l.interactive.type).toBe("list");
    expect(toGraph({ type: "image", link: "https://x/y.png", caption: "c" })).toEqual({ type: "image", image: { link: "https://x/y.png", caption: "c" } });
  });
});

describe("invite codes and commands", () => {
  it("reads doctor, family and circle codes from pre-filled texts", () => {
    expect(parseInviteCode("DR-123456")).toEqual({ kind: "doctor", code: "123456" });
    expect(parseInviteCode("dr 654321 please")).toEqual({ kind: "doctor", code: "654321" });
    expect(parseInviteCode("FAMILY-K7P2QX")).toEqual({ kind: "family", code: "K7P2QX" });
    expect(parseInviteCode("JOIN 12345")).toEqual({ kind: "circle", code: "12345" });
    expect(parseInviteCode("I walked 12345 steps")).toBeNull();
    expect(parseInviteCode("hello")).toBeNull();
  });
  it("maps command words in three languages", () => {
    expect(parseCommand("Hi")).toBe("menu");
    expect(parseCommand("मेनू")).toBe("menu");
    expect(parseCommand("today")).toBe("today");
    expect(parseCommand("आज")).toBe("today");
    expect(parseCommand("doctor")).toBe("register_doctor");
    expect(parseCommand("I took my tablet")).toBeNull();
  });
  it("builds wa.me links", () => expect(waLink("+91 98200 00000", "DR-123456")).toBe("https://wa.me/919820000000?text=DR-123456"));
});

describe("adherence", () => {
  const now = new Date("2026-11-18T12:00:00Z");
  const past = "2026-11-18T08:00:00Z", future = "2026-11-18T20:00:00Z";
  it("counts done over slots whose time has passed; future and paused are left out", () => {
    const a = adherence([
      { status: "self_reported", window_end_at: past },
      { status: "evidence_supported", window_end_at: past },
      { status: "no_response", window_end_at: past },
      { status: "skipped", window_end_at: past },
      { status: "pending", window_end_at: future },
      { status: "paused", window_end_at: past },
    ], now);
    expect(a).toEqual({ done: 2, due: 4, pct: 50 });
  });
  it("counts weekly targets by completed days; a running week only counts what's done", () => {
    expect(adherence([{ status: "due", window_end_at: past, target_count: 5, completed_count: 3 }], now)).toEqual({ done: 3, due: 5, pct: 60 });
    expect(adherence([{ status: "due", window_end_at: future, target_count: 5, completed_count: 2 }], now)).toEqual({ done: 2, due: 2, pct: 100 });
  });
  it("is null with nothing due", () => expect(adherence([], now).pct).toBeNull());
  it("draws dots", () => {
    expect(dots(80)).toBe("●●●●○");
    expect(dots(null)).toBe("○○○○○");
  });
});

describe("text helpers", () => {
  it("formats times and schedules", () => {
    expect(time12("08:00")).toBe("8:00 am");
    expect(time12("20:30")).toBe("8:30 pm");
    expect(time12("00:15")).toBe("12:15 am");
    expect(scheduleText({ schedule_kind: "daily", times: ["08:00", "20:00"] })).toBe("8:00 am, 8:00 pm");
    expect(scheduleText({ schedule_kind: "weekly_target", times: [], weekly_target: 5 })).toBe("5 days a week");
  });
  it("cleans typed names", () => {
    expect(cleanName("my name is Asha")).toBe("Asha");
    expect(cleanName("मेरा नाम राधा है")).toBe("राधा");
    expect(cleanName("Ravi Kumar 😊")).toBe("Ravi Kumar");
    expect(cleanName("1234")).toBeNull();
  });
  it("has copy in every language and never uses em or en dashes", () => {
    for (const l of ["en", "hi", "mr"]) {
      expect(w(l, "menu_body").length).toBeGreaterThan(3);
      expect(w(l, "today_count", { done: 2, total: 5 })).toMatch(/2/);
    }
    const all = [w("en", "help"), w("hi", "help"), w("mr", "help"), d("welcome"), d("ready", { name: "x", code: "1", link: "l" })].join(" ");
    expect(all).not.toMatch(/[—–]/);
  });
});

describe("webhook taps and templates", () => {
  it("keeps the id of a tapped button or list row", () => {
    const payload = { object: "whatsapp_business_account", entry: [{ changes: [{ field: "messages", value: { messages: [
      { id: "w1", from: "919800000000", timestamp: "1", type: "interactive", interactive: { type: "button_reply", button_reply: { id: "ci:done:abc", title: "Done ✓" } } },
      { id: "w2", from: "919800000000", timestamp: "1", type: "interactive", interactive: { type: "list_reply", list_reply: { id: "m:today", title: "Today" } } },
    ] } }] }] };
    const { messages } = parseWebhook(payload);
    expect(messages.map((m) => m.replyId)).toEqual(["ci:done:abc", "m:today"]);
  });
  it("uses the requested template outside the window", () => {
    const binding = { status: "active", last_inbound_at: null };
    expect(decideSend({ binding, consentWhatsapp: true, approvedTemplates: ["sukhi_update_ready"], quiet: false, template: "sukhi_update_ready" })).toEqual({ kind: "template", template: "sukhi_update_ready" });
    expect(decideSend({ binding, consentWhatsapp: true, approvedTemplates: ["sukhi_checkin_ready"], quiet: false, template: "sukhi_update_ready" }).kind).toBe("blocked");
  });
});
