import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { synthesize, transcribe } from "@/server/providers";

const env = { ...process.env };
let calls: { url: string; init?: RequestInit }[] = [];
beforeEach(() => {
  calls = [];
  vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    if (url.includes("speech-to-text")) return new Response(JSON.stringify({ text: " मैंने दवा ले ली ", language_code: "hin", language_probability: 0.93 }), { status: 200 });
    return new Response(new Uint8Array([0x49, 0x44, 0x33, 1, 2, 3]), { status: 200, headers: { "Content-Type": "audio/mpeg" } });
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  process.env = { ...env };
});

describe("speech provider selection", () => {
  it("is unconfigured without any key (text keeps working)", async () => {
    delete process.env.ELEVENLABS_API_KEY;
    delete process.env.SARVAM_API_KEY;
    expect(await transcribe(new Blob([new Uint8Array(10)], { type: "audio/webm" }), "hi")).toEqual({ ok: false, error: "unconfigured" });
    expect(calls).toEqual([]);
  });

  it("uses ElevenLabs Scribe for transcription when its key is set", async () => {
    process.env.ELEVENLABS_API_KEY = "test-eleven-key-123";
    const r = await transcribe(new Blob([new Uint8Array(10)], { type: "audio/webm" }), "hi");
    expect(r).toEqual({ ok: true, value: { transcript: "मैंने दवा ले ली", language: "hin", languageProbability: 0.93 } });
    expect(calls[0].url).toBe("https://api.elevenlabs.io/v1/speech-to-text");
    expect((calls[0].init?.headers as Record<string, string>)["xi-api-key"]).toBe("test-eleven-key-123");
    expect((calls[0].init?.body as FormData).get("model_id")).toBe("scribe_v2");
  });

  it("uses the per-language voice for Marathi, eleven_v4 by default, and returns mp3", async () => {
    process.env.ELEVENLABS_API_KEY = "test-eleven-key-123";
    process.env.ELEVENLABS_VOICE_ID = "DefaultVoice1234";
    process.env.ELEVENLABS_VOICE_ID_MR = "MarathiVoice5678";
    const r = await synthesize("नमस्कार", "mr");
    expect(r.ok && r.value.mime).toBe("audio/mpeg");
    expect(calls[0].url).toContain("/v1/text-to-speech/MarathiVoice5678");
    const body = JSON.parse(String(calls[0].init?.body));
    expect(body).toMatchObject({ model_id: "eleven_v4", language_code: "mr" });
  });

  it("text-to-speech is unconfigured without a voice id, but never throws", async () => {
    process.env.ELEVENLABS_API_KEY = "test-eleven-key-123";
    delete process.env.ELEVENLABS_VOICE_ID;
    expect(await synthesize("hello", "en")).toEqual({ ok: false, error: "unconfigured" });
  });
});
