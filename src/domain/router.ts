// Deterministic conversational router. It runs before any model call and handles
// safety escalation, channel commands, link codes, explicit confirmations, and very short
// quick replies. Everything else goes to the bounded model/tool loop (or the text fallback).
import { detectConcern, isClinicalAdviceRequest, parseChannelCommand } from "./safety";

export type Route =
  | { route: "escalation" }
  | { route: "channel_command"; command: "stop" | "pause" | "start" }
  | { route: "link_code"; code: string }
  | { route: "confirmation"; code: string; accept: boolean }
  | { route: "quick_action"; action: "done" | "later" | "skipped" | "unable" }
  | { route: "clinical_referral" }
  | { route: "model" };

const LINK_RE = /\b(?:SUKHI|LINK)[\s-]*([A-HJ-NP-Z2-9]{8})\b/i;
const CONFIRM_RE = /^\s*(confirm|yes|हाँ|हां|होय)\s+([A-Z0-9]{4,8})\s*$/i;
const REJECT_RE = /^\s*(reject|no|cancel|नहीं|नाही)\s+([A-Z0-9]{4,8})\s*$/i;

const QUICK: Record<"done" | "later" | "skipped" | "unable", RegExp> = {
  done: /^(done|did it|taken|completed?|finished|yes done|ho gaya|ho gya|kar liya|हो\s*गया|कर\s*लिया|ले\s*लिया|झाले|झालं|केले|घेतले|✅|👍)$/i,
  later: /^(later|remind me later|not now|baad mein|baad me|बाद\s*में|नंतर|थोड्या\s*वेळाने|⏰)$/i,
  skipped: /^(skip|skipped|skip today|chhod do|छोड़\s*दो|आज\s*नहीं|वगळा|आज\s*नाही)$/i,
  unable: /^(unwell|not well|feeling unwell|can'?t today|unable|tabiyat theek nahi|तबीयत\s*ठीक\s*नहीं|बरे\s*नाही|बरं\s*नाही|जमत\s*नाही)$/i,
};

export function routeMessage(raw: string, opts: { channel: "web" | "whatsapp" }): Route {
  const text = raw.normalize("NFC").trim();
  if (detectConcern(text)) return { route: "escalation" };
  if (opts.channel === "whatsapp") {
    const cmd = parseChannelCommand(text);
    if (cmd) return { route: "channel_command", command: cmd };
    const link = text.match(LINK_RE);
    if (link) return { route: "link_code", code: link[1].toUpperCase() };
  }
  const c = text.match(CONFIRM_RE);
  if (c) return { route: "confirmation", code: c[2].toUpperCase(), accept: true };
  const r = text.match(REJECT_RE);
  if (r) return { route: "confirmation", code: r[2].toUpperCase(), accept: false };
  const short = text.replace(/[.!?]+$/g, "").trim();
  if (short.split(/\s+/).length <= 4) {
    for (const [action, re] of Object.entries(QUICK) as [keyof typeof QUICK, RegExp][]) {
      if (re.test(short)) return { route: "quick_action", action };
    }
  }
  if (isClinicalAdviceRequest(text)) return { route: "clinical_referral" };
  return { route: "model" };
}

// ---------------------------------------------------------------------------
// Link codes: 8 chars from an unambiguous alphabet (~40 bits), 15 min expiry, one-time,
// stored only as a peppered SHA-256 hash, rate limited per WhatsApp number in SQL.
// ---------------------------------------------------------------------------
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generateLinkCode(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
}

export async function hashLinkCode(code: string, pepper: string): Promise<string> {
  const data = new TextEncoder().encode(`${pepper}:${code.toUpperCase()}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function generateConfirmCode(): string {
  const bytes = new Uint8Array(5);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
}

export async function sha256Hex(input: string | Uint8Array): Promise<string> {
  const data = typeof input === "string" ? new TextEncoder().encode(input) : input;
  const digest = await crypto.subtle.digest("SHA-256", data as BufferSource);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function randomToken(bytes = 32): string {
  const b = new Uint8Array(bytes);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}
