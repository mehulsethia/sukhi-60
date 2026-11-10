import "server-only";
// Provider adapters: Anthropic (via Vercel AI SDK), Sarvam speech, Meta WhatsApp Cloud API.
// Each adapter reports "unconfigured" instead of failing silently, so the product keeps
// working in text-only / web-only mode.
import { createAnthropic } from "@ai-sdk/anthropic";
import { features, settings } from "@/lib/config";
import { isTrustedMediaUrl, MEDIA_LIMITS } from "@/domain/whatsapp";

// ---------------------------------------------------------------------------
// AI model
// ---------------------------------------------------------------------------
export function getModel() {
  if (!features.ai()) return null;
  const anthropic = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return { model: anthropic(settings.anthropicModel()), id: settings.anthropicModel() };
}

// ---------------------------------------------------------------------------
// Sarvam speech (https://docs.sarvam.ai) — server-side only
// ---------------------------------------------------------------------------
const SARVAM_LANG: Record<string, string> = { en: "en-IN", hi: "hi-IN", mr: "mr-IN" };

export type SpeechResult<T> = { ok: true; value: T } | { ok: false; error: "unconfigured" | "provider_error" | "invalid_input" | "timeout" };

export async function transcribe(audio: Blob, locale: string | null): Promise<SpeechResult<{ transcript: string; language: string | null; languageProbability: number | null }>> {
  if (!features.speech()) return { ok: false, error: "unconfigured" };
  if (audio.size === 0 || audio.size > MEDIA_LIMITS.audio.maxBytes) return { ok: false, error: "invalid_input" };
  const form = new FormData();
  const type = audio.type || "audio/webm";
  const ext = type.includes("ogg") ? "ogg" : type.includes("mpeg") ? "mp3" : type.includes("mp4") ? "m4a" : type.includes("wav") ? "wav" : "webm";
  form.append("file", audio, `voice.${ext}`);
  form.append("model", settings.sarvamAsrModel());
  // "unknown" lets the provider auto-detect (supports natural code-switching).
  form.append("language_code", locale && SARVAM_LANG[locale] ? SARVAM_LANG[locale] : "unknown");
  try {
    const res = await fetch("https://api.sarvam.ai/speech-to-text", {
      method: "POST",
      headers: { "api-subscription-key": process.env.SARVAM_API_KEY! },
      body: form,
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) return { ok: false, error: "provider_error" };
    const j = (await res.json()) as { transcript?: string; language_code?: string | null; language_probability?: number };
    return { ok: true, value: { transcript: (j.transcript ?? "").trim(), language: j.language_code ?? null, languageProbability: j.language_probability ?? null } };
  } catch (e) {
    return { ok: false, error: e instanceof Error && e.name === "TimeoutError" ? "timeout" : "provider_error" };
  }
}

export async function synthesize(text: string, locale: string): Promise<SpeechResult<{ audioBase64: string; mime: "audio/wav" }>> {
  if (!features.speech()) return { ok: false, error: "unconfigured" };
  const clipped = text.slice(0, 2400);
  if (!clipped.trim()) return { ok: false, error: "invalid_input" };
  try {
    const res = await fetch("https://api.sarvam.ai/text-to-speech", {
      method: "POST",
      headers: { "api-subscription-key": process.env.SARVAM_API_KEY!, "Content-Type": "application/json" },
      body: JSON.stringify({
        text: clipped,
        language_code: SARVAM_LANG[locale] ?? "en-IN",
        model: settings.sarvamTtsModel(),
        speaker: settings.sarvamSpeaker(),
        output_audio_codec: "wav",
        speech_sample_rate: 22050,
      }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) return { ok: false, error: "provider_error" };
    const j = (await res.json()) as { audios?: string[] };
    if (!j.audios?.[0]) return { ok: false, error: "provider_error" };
    return { ok: true, value: { audioBase64: j.audios[0], mime: "audio/wav" } };
  } catch (e) {
    return { ok: false, error: e instanceof Error && e.name === "TimeoutError" ? "timeout" : "provider_error" };
  }
}

// ---------------------------------------------------------------------------
// WhatsApp Cloud API
// ---------------------------------------------------------------------------
export type SendResult =
  | { state: "sent"; providerMessageId: string }
  | { state: "failed"; retryable: boolean; code: string }
  | { state: "uncertain"; code: string } // provider may have accepted it: never blindly resend
  | { state: "unconfigured" };

// Test-only override: honoured ONLY for a loopback URL (used by the local E2E mock of the Graph API).
function graphBase() {
  const o = process.env.WHATSAPP_GRAPH_BASE_URL;
  return o && /^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(o) ? o : "https://graph.facebook.com";
}
const graph = (path: string) => `${graphBase()}/${settings.graphVersion()}/${path}`;

async function postMessage(body: Record<string, unknown>): Promise<SendResult> {
  if (!features.whatsapp()) return { state: "unconfigured" };
  let res: Response;
  try {
    res = await fetch(graph(`${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`), {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", ...body }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch (e) {
    // Request may or may not have reached Meta.
    return { state: "uncertain", code: e instanceof Error ? e.name : "network_error" };
  }
  let j: { messages?: { id: string }[]; error?: { code?: number; error_subcode?: number } } = {};
  try {
    j = await res.json();
  } catch {
    if (res.ok) return { state: "uncertain", code: "unparseable_success" };
  }
  if (res.ok && j.messages?.[0]?.id) return { state: "sent", providerMessageId: j.messages[0].id };
  const code = String(j.error?.code ?? res.status);
  const retryable = res.status === 429 || res.status >= 500 || code === "130429" || code === "131016";
  return { state: "failed", retryable, code };
}

export function sendWhatsAppText(to: string, text: string) {
  return postMessage({ to, type: "text", text: { preview_url: false, body: text.slice(0, 4000) } });
}

export function sendWhatsAppTemplate(to: string, name: string, languageCode: string) {
  return postMessage({ to, type: "template", template: { name, language: { code: languageCode } } });
}

/** Fetch inbound media via the Graph API, only from trusted hosts, with size/type limits. */
export async function fetchWhatsAppMedia(mediaId: string, kind: keyof typeof MEDIA_LIMITS): Promise<{ ok: true; bytes: Uint8Array; mime: string } | { ok: false; error: string }> {
  if (!features.whatsapp()) return { ok: false, error: "unconfigured" };
  if (!/^[A-Za-z0-9_.-]{1,128}$/.test(mediaId)) return { ok: false, error: "invalid_media_id" };
  const auth = { Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}` };
  const meta = await fetch(graph(mediaId), { headers: auth, signal: AbortSignal.timeout(10_000) });
  if (!meta.ok) return { ok: false, error: `media_meta_${meta.status}` };
  const m = (await meta.json()) as { url?: string; mime_type?: string; file_size?: number };
  const limits = MEDIA_LIMITS[kind];
  const mime = (m.mime_type ?? "").split(";")[0].trim();
  if (!m.url || !isTrustedMediaUrl(m.url)) return { ok: false, error: "untrusted_media_host" };
  if (!(limits.mimes as readonly string[]).includes(mime)) return { ok: false, error: "unsupported_media_type" };
  if (m.file_size && m.file_size > limits.maxBytes) return { ok: false, error: "media_too_large" };
  const res = await fetch(m.url, { headers: auth, redirect: "error", signal: AbortSignal.timeout(15_000) });
  if (!res.ok) return { ok: false, error: `media_download_${res.status}` };
  const buf = new Uint8Array(await res.arrayBuffer());
  if (buf.byteLength > limits.maxBytes) return { ok: false, error: "media_too_large" };
  return { ok: true, bytes: buf, mime };
}
