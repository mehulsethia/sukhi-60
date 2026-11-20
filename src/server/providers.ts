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

/** Vision model for reading plan documents (handwritten prescriptions). */
export function getExtractModel() {
  if (!features.ai()) return null;
  const anthropic = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const id = settings.extractModel();
  return { model: anthropic(id), id };
}

// ---------------------------------------------------------------------------
// Speech (ElevenLabs or Sarvam) — server-side only, behind one interface
// ---------------------------------------------------------------------------
const SARVAM_LANG: Record<string, string> = { en: "en-IN", hi: "hi-IN", mr: "mr-IN" };

export type SpeechResult<T> = { ok: true; value: T } | { ok: false; error: "unconfigured" | "provider_error" | "invalid_input" | "timeout" };
type Transcript = { transcript: string; language: string | null; languageProbability: number | null };

const fail = (e: unknown): SpeechResult<never> => ({ ok: false, error: e instanceof Error && e.name === "TimeoutError" ? "timeout" : "provider_error" });
const extFor = (type: string) => (type.includes("ogg") ? "ogg" : type.includes("mpeg") ? "mp3" : type.includes("mp4") ? "m4a" : type.includes("wav") ? "wav" : "webm");

export async function transcribe(audio: Blob, locale: string | null): Promise<SpeechResult<Transcript>> {
  const provider = settings.speechProvider();
  if (!provider) return { ok: false, error: "unconfigured" };
  if (audio.size === 0 || audio.size > MEDIA_LIMITS.audio.maxBytes) return { ok: false, error: "invalid_input" };
  const form = new FormData();
  form.append("file", audio, `voice.${extFor(audio.type || "audio/webm")}`);
  try {
    if (provider === "elevenlabs") {
      form.append("model_id", settings.elevenSttModel());
      // No language_code: Scribe auto-detects, which handles Hindi/Marathi/English code-switching.
      const res = await fetch("https://api.elevenlabs.io/v1/speech-to-text", { method: "POST", headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY! }, body: form, signal: AbortSignal.timeout(25_000) });
      if (!res.ok) return { ok: false, error: "provider_error" };
      const j = (await res.json()) as { text?: string; language_code?: string; language_probability?: number };
      return { ok: true, value: { transcript: (j.text ?? "").trim(), language: j.language_code ?? null, languageProbability: j.language_probability ?? null } };
    }
    form.append("model", settings.sarvamAsrModel());
    form.append("language_code", locale && SARVAM_LANG[locale] ? SARVAM_LANG[locale] : "unknown");
    const res = await fetch("https://api.sarvam.ai/speech-to-text", { method: "POST", headers: { "api-subscription-key": process.env.SARVAM_API_KEY! }, body: form, signal: AbortSignal.timeout(20_000) });
    if (!res.ok) return { ok: false, error: "provider_error" };
    const j = (await res.json()) as { transcript?: string; language_code?: string | null; language_probability?: number };
    return { ok: true, value: { transcript: (j.transcript ?? "").trim(), language: j.language_code ?? null, languageProbability: j.language_probability ?? null } };
  } catch (e) {
    return fail(e);
  }
}

/** `format`: default (mp3 from ElevenLabs, wav from Sarvam), "ogg" (Opus, for WhatsApp voice notes) or "mp3". */
export async function synthesize(text: string, locale: string, format?: "ogg" | "mp3"): Promise<SpeechResult<{ audioBase64: string; mime: string }>> {
  const provider = settings.speechProvider();
  if (!provider) return { ok: false, error: "unconfigured" };
  const clipped = text.slice(0, 2400);
  if (!clipped.trim()) return { ok: false, error: "invalid_input" };
  try {
    if (provider === "elevenlabs") {
      const voice = settings.elevenVoice(locale);
      if (!voice) return { ok: false, error: "unconfigured" };
      const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voice)}?output_format=${format === "ogg" ? "opus_48000_64" : "mp3_44100_128"}`, {
        method: "POST",
        headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY!, "Content-Type": "application/json", Accept: format === "ogg" ? "audio/ogg" : "audio/mpeg" },
        body: JSON.stringify({ text: clipped, model_id: settings.elevenTtsModel(), language_code: ["en", "hi", "mr"].includes(locale) ? locale : "en" }),
        signal: AbortSignal.timeout(25_000),
      });
      if (!res.ok) return { ok: false, error: "provider_error" };
      const buf = Buffer.from(await res.arrayBuffer());
      if (!buf.byteLength) return { ok: false, error: "provider_error" };
      return { ok: true, value: { audioBase64: buf.toString("base64"), mime: format === "ogg" ? "audio/ogg" : "audio/mpeg" } };
    }
    const res = await fetch("https://api.sarvam.ai/text-to-speech", {
      method: "POST",
      headers: { "api-subscription-key": process.env.SARVAM_API_KEY!, "Content-Type": "application/json" },
      body: JSON.stringify({ text: clipped, language_code: SARVAM_LANG[locale] ?? "en-IN", model: settings.sarvamTtsModel(), speaker: settings.sarvamSpeaker(), output_audio_codec: format === "ogg" ? "opus" : format === "mp3" ? "mp3" : "wav", speech_sample_rate: format === "ogg" ? 48000 : 22050 }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) return { ok: false, error: "provider_error" };
    const j = (await res.json()) as { audios?: string[] };
    if (!j.audios?.[0]) return { ok: false, error: "provider_error" };
    return { ok: true, value: { audioBase64: j.audios[0], mime: format === "ogg" ? "audio/ogg" : format === "mp3" ? "audio/mpeg" : "audio/wav" } };
  } catch (e) {
    return fail(e);
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

/** Any prepared Graph message body (interactive buttons / list, image). See domain/wa-ui toGraph(). */
export function sendWhatsAppPayload(to: string, body: Record<string, unknown>) {
  return postMessage({ to, ...body });
}

export function sendWhatsAppTemplate(to: string, name: string, languageCode: string) {
  return postMessage({ to, type: "template", template: { name, language: { code: languageCode } } });
}

/** Upload media we made (a voice reply) and get an id to send it with. */
export async function uploadWhatsAppMedia(bytes: Uint8Array, mime: string): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  if (!features.whatsapp()) return { ok: false, error: "unconfigured" };
  const form = new FormData();
  form.append("messaging_product", "whatsapp");
  form.append("type", mime);
  form.append("file", new Blob([bytes as BlobPart], { type: mime }), mime === "audio/ogg" ? "sukhi.ogg" : "sukhi.mp3");
  try {
    const res = await fetch(graph(`${process.env.WHATSAPP_PHONE_NUMBER_ID}/media`), { method: "POST", headers: { Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}` }, body: form, signal: AbortSignal.timeout(15_000) });
    const j = (await res.json().catch(() => ({}))) as { id?: string };
    return res.ok && j.id ? { ok: true, id: j.id } : { ok: false, error: `media_upload_${res.status}` };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.name : "network_error" };
  }
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
