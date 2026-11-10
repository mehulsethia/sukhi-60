// Official Meta WhatsApp Cloud API helpers (pure; Web Crypto only so they also run in
// edge/worker runtimes). No unofficial transports, no QR sessions, no scraping.

export const WINDOW_MS = 24 * 60 * 60 * 1000; // customer service window after last inbound message

/** Constant-time compare of two hex strings. */
function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function hmacSha256Hex(secret: string, body: string | Uint8Array): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const data = typeof body === "string" ? new TextEncoder().encode(body) : body;
  const sig = await crypto.subtle.sign("HMAC", key, data as BufferSource);
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Verify X-Hub-Signature-256 against the RAW request body using the Meta app secret. */
export async function verifyMetaSignature(rawBody: string, header: string | null, appSecret: string): Promise<boolean> {
  if (!header || !appSecret || !header.startsWith("sha256=")) return false;
  const provided = header.slice(7).toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(provided)) return false;
  const expected = await hmacSha256Hex(appSecret, rawBody);
  return timingSafeEqualHex(provided, expected);
}

export async function signMetaBody(rawBody: string, appSecret: string): Promise<string> {
  return `sha256=${await hmacSha256Hex(appSecret, rawBody)}`;
}

export type InboundKind = "text" | "image" | "audio" | "document" | "interactive" | "button" | "unsupported";

export interface InboundMessage {
  id: string;
  from: string; // wa_id digits
  timestamp: number; // unix seconds
  kind: InboundKind;
  text?: string;
  mediaId?: string;
  mimeType?: string;
  caption?: string;
}

export interface StatusUpdate {
  id: string; // provider message id (wamid)
  status: "sent" | "delivered" | "read" | "failed";
  recipient: string;
  timestamp: number;
  errorCode?: string;
}

type Json = Record<string, unknown>;
const isObj = (v: unknown): v is Json => typeof v === "object" && v !== null;

/** Parse a Cloud API webhook payload into messages and status updates. Unknown shapes are ignored. */
export function parseWebhook(payload: unknown): { messages: InboundMessage[]; statuses: StatusUpdate[] } {
  const messages: InboundMessage[] = [];
  const statuses: StatusUpdate[] = [];
  if (!isObj(payload) || payload.object !== "whatsapp_business_account" || !Array.isArray(payload.entry)) {
    return { messages, statuses };
  }
  for (const entry of payload.entry) {
    if (!isObj(entry) || !Array.isArray(entry.changes)) continue;
    for (const change of entry.changes) {
      if (!isObj(change) || change.field !== "messages" || !isObj(change.value)) continue;
      const value = change.value;
      for (const m of Array.isArray(value.messages) ? value.messages : []) {
        if (!isObj(m) || typeof m.id !== "string" || typeof m.from !== "string") continue;
        const base = { id: m.id, from: m.from.replace(/\D/g, ""), timestamp: Number(m.timestamp) || 0 };
        const t = m.type;
        if (t === "text" && isObj(m.text)) messages.push({ ...base, kind: "text", text: String(m.text.body ?? "").slice(0, 4000) });
        else if ((t === "image" || t === "audio" || t === "document") && isObj(m[t])) {
          const media = m[t] as Json;
          messages.push({
            ...base,
            kind: t,
            mediaId: typeof media.id === "string" ? media.id : undefined,
            mimeType: typeof media.mime_type === "string" ? media.mime_type.split(";")[0].trim() : undefined,
            caption: typeof media.caption === "string" ? media.caption.slice(0, 1000) : undefined,
          });
        } else if (t === "button" && isObj(m.button)) messages.push({ ...base, kind: "button", text: String(m.button.text ?? "").slice(0, 200) });
        else if (t === "interactive" && isObj(m.interactive)) {
          const i = m.interactive;
          const reply = (isObj(i.button_reply) ? i.button_reply : isObj(i.list_reply) ? i.list_reply : null) as Json | null;
          messages.push({ ...base, kind: "interactive", text: reply ? String(reply.title ?? reply.id ?? "") : "" });
        } else messages.push({ ...base, kind: "unsupported" });
      }
      for (const s of Array.isArray(value.statuses) ? value.statuses : []) {
        if (!isObj(s) || typeof s.id !== "string") continue;
        const st = s.status;
        if (st !== "sent" && st !== "delivered" && st !== "read" && st !== "failed") continue;
        const errs = Array.isArray(s.errors) ? s.errors : [];
        statuses.push({
          id: s.id,
          status: st,
          recipient: String(s.recipient_id ?? ""),
          timestamp: Number(s.timestamp) || 0,
          errorCode: errs.length && isObj(errs[0]) ? String(errs[0].code ?? "") : undefined,
        });
      }
    }
  }
  return { messages, statuses };
}

export function withinServiceWindow(lastInboundAt: string | Date | null | undefined, now = new Date()): boolean {
  if (!lastInboundAt) return false;
  return now.getTime() - new Date(lastInboundAt).getTime() < WINDOW_MS;
}

// Proposed templates (NOT approved until Meta approves them). Bodies avoid diagnoses,
// drug names and health details so lock-screen previews stay discreet.
export const PROPOSED_TEMPLATES = {
  sukhi_checkin_ready: {
    category: "UTILITY",
    languages: ["en", "hi", "mr"],
    bodies: {
      en: "Your Sukhi check-in is ready. Reply to continue.",
      hi: "आपका सुखी चेक-इन तैयार है। जारी रखने के लिए जवाब दें।",
      mr: "तुमचे सुखी चेक-इन तयार आहे. पुढे जाण्यासाठी उत्तर द्या.",
    },
    variables: 0,
  },
  sukhi_link_confirmed: {
    category: "UTILITY",
    languages: ["en", "hi", "mr"],
    bodies: {
      en: "Your WhatsApp is now connected to Sukhi. Reply STOP at any time to stop messages.",
      hi: "आपका व्हाट्सऐप अब सुखी से जुड़ गया है। संदेश रोकने के लिए कभी भी STOP लिखें।",
      mr: "तुमचे व्हॉट्सॲप आता सुखीशी जोडले गेले आहे. संदेश थांबवण्यासाठी कधीही STOP लिहा.",
    },
    variables: 0,
  },
} as const;

export type TemplateName = keyof typeof PROPOSED_TEMPLATES;

export interface SendDecision {
  kind: "free_text" | "template" | "blocked";
  template?: TemplateName;
  reason?: "opted_out" | "no_binding" | "paused" | "quiet_hours" | "no_consent" | "template_not_approved";
}

/**
 * Decide how (or whether) a proactive message may be sent.
 * Outside the 24h window only an APPROVED template may be used; never arbitrary text/audio.
 */
export function decideSend(opts: {
  binding: { status: string; last_inbound_at: string | null } | null;
  consentWhatsapp: boolean;
  approvedTemplates: string[];
  quiet: boolean;
  now?: Date;
}): SendDecision {
  if (!opts.binding) return { kind: "blocked", reason: "no_binding" };
  if (opts.binding.status === "revoked") return { kind: "blocked", reason: "opted_out" };
  if (opts.binding.status === "paused") return { kind: "blocked", reason: "paused" };
  if (!opts.consentWhatsapp) return { kind: "blocked", reason: "no_consent" };
  if (opts.quiet) return { kind: "blocked", reason: "quiet_hours" };
  if (withinServiceWindow(opts.binding.last_inbound_at, opts.now)) return { kind: "free_text" };
  if (opts.approvedTemplates.includes("sukhi_checkin_ready")) return { kind: "template", template: "sukhi_checkin_ready" };
  return { kind: "blocked", reason: "template_not_approved" };
}

export const MEDIA_LIMITS = {
  image: { maxBytes: 5 * 1024 * 1024, mimes: ["image/jpeg", "image/png", "image/webp"] },
  audio: { maxBytes: 8 * 1024 * 1024, mimes: ["audio/ogg", "audio/mpeg", "audio/mp4", "audio/aac", "audio/amr", "audio/webm"] },
  document: { maxBytes: 10 * 1024 * 1024, mimes: ["application/pdf"] },
} as const;

/** Media may only be downloaded from Meta's CDN/graph hosts. */
export function isTrustedMediaUrl(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:") return false;
    return u.hostname === "graph.facebook.com" || u.hostname.endsWith(".fbcdn.net") || u.hostname === "lookaside.fbsbx.com" || u.hostname.endsWith(".whatsapp.net");
  } catch {
    return false;
  }
}
