import { afterEach, describe, expect, it, vi } from "vitest";
import { isOgg, reminderText, speakable } from "@/domain/wa-ui";
import { reminderCopy } from "@/domain/tone";
import { synthesize } from "@/server/providers";

describe("WhatsApp reminder text", () => {
  it("uses the push notification words: bold title, then the line", () => {
    const copy = reminderCopy({ locale: "en", styles: ["fun_playful"], task: "Evening walk", category: "movement", seed: "occ-1" });
    expect(reminderText(copy)).toBe(`*${copy.title}*\n${copy.body}`);
    expect(reminderText(copy)).not.toMatch(/Time for/);
  });
  it("strips markdown from the task so bold never breaks", () => {
    expect(reminderText({ title: "Walk *fast*", body: "Every step counts." })).toBe("*Walk fast*\nEvery step counts.");
  });
});

describe("speakable", () => {
  it("drops emoji, markdown, links and line breaks", () => {
    expect(speakable("Nice work 💪\n*Next:* walk at 6pm.\nhttps://sukhi.app/x")).toBe("Nice work. Next: walk at 6pm.");
  });
  it("cuts long text at a sentence", () => {
    const s = speakable("One two three. ".repeat(60), 100);
    expect(s.length).toBeLessThanOrEqual(100);
    expect(s.endsWith(".")).toBe(true);
  });
  it("keeps Hindi danda sentences", () => {
    expect(speakable("बहुत बढ़िया।\nकल फिर मिलेंगे।")).toBe("बहुत बढ़िया। कल फिर मिलेंगे।");
  });
});

describe("voice note audio", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("detects Ogg", () => {
    expect(isOgg(new Uint8Array([0x4f, 0x67, 0x67, 0x53, 0]))).toBe(true);
    expect(isOgg(new Uint8Array([0x49, 0x44, 0x33, 1, 2]))).toBe(false);
  });
  it("asks ElevenLabs for Opus when format is ogg", async () => {
    const calls: string[] = [];
    vi.stubGlobal("fetch", async (url: string) => { calls.push(url); return new Response(new Uint8Array([0x4f, 0x67, 0x67, 0x53, 1]), { status: 200 }); });
    const env = { ...process.env };
    process.env.ELEVENLABS_API_KEY = "test-eleven-key-123";
    process.env.ELEVENLABS_VOICE_ID = "DefaultVoice1234";
    const r = await synthesize("hello", "en", "ogg");
    process.env = env;
    expect(r.ok && r.value.mime).toBe("audio/ogg");
    expect(calls[0]).toContain("output_format=opus_48000_64");
  });
});
