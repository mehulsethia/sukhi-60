// WhatsApp interface building blocks (pure, no I/O): message shapes with Meta's limits
// enforced, invite-code parsing, adherence maths and small text helpers.
//
// Meta limits (Cloud API interactive messages): up to 3 reply buttons, button title 20 chars,
// button id 256 chars, body 1024 chars, list button label 20 chars, up to 10 rows in total,
// row title 24 chars, row description 72 chars, section title 24 chars.

export interface WaButton { id: string; title: string }
export interface WaRow { id: string; title: string; description?: string }
export interface WaSection { title?: string; rows: WaRow[] }

export type WaOut =
  | { type: "text"; body: string }
  | { type: "buttons"; body: string; buttons: WaButton[]; header?: string; footer?: string }
  | { type: "list"; body: string; button: string; sections: WaSection[]; header?: string; footer?: string }
  | { type: "image"; link: string; caption?: string };

const cut = (s: string, n: number) => {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length <= n ? t : `${t.slice(0, n - 1).trimEnd()}…`;
};
const cutBody = (s: string, n: number) => (s.length <= n ? s : `${s.slice(0, n - 1).trimEnd()}…`);

/** Make a message valid for the Cloud API (trims, caps counts). Text stays text. */
export function clampOut(out: WaOut): WaOut {
  if (out.type === "text") return { type: "text", body: cutBody(out.body, 4000) };
  if (out.type === "image") return { type: "image", link: out.link, caption: out.caption ? cutBody(out.caption, 1000) : undefined };
  if (out.type === "buttons") {
    const seen = new Set<string>();
    const buttons = out.buttons
      .filter((b) => b.id && !seen.has(b.id) && seen.add(b.id))
      .slice(0, 3)
      .map((b) => ({ id: b.id.slice(0, 256), title: cut(b.title, 20) }));
    if (!buttons.length) return { type: "text", body: cutBody(out.body, 4000) };
    return { type: "buttons", body: cutBody(out.body, 1024), buttons, header: out.header ? cut(out.header, 60) : undefined, footer: out.footer ? cut(out.footer, 60) : undefined };
  }
  let left = 10;
  const sections = out.sections
    .map((s) => {
      const rows = s.rows.slice(0, left).map((r) => ({ id: r.id.slice(0, 200), title: cut(r.title, 24), description: r.description ? cut(r.description, 72) : undefined }));
      left -= rows.length;
      return { title: s.title ? cut(s.title, 24) : undefined, rows };
    })
    .filter((s) => s.rows.length);
  if (!sections.length) return { type: "text", body: cutBody(out.body, 4000) };
  // Meta requires a section title when there is more than one section.
  if (sections.length > 1) sections.forEach((s, i) => (s.title = s.title || `${i + 1}`));
  return { type: "list", body: cutBody(out.body, 1024), button: cut(out.button, 20), sections, header: out.header ? cut(out.header, 60) : undefined, footer: out.footer ? cut(out.footer, 60) : undefined };
}

/** Graph API message body (without messaging_product / to). */
export function toGraph(out: WaOut): Record<string, unknown> {
  const o = clampOut(out);
  if (o.type === "text") return { type: "text", text: { preview_url: true, body: o.body } };
  if (o.type === "image") return { type: "image", image: { link: o.link, ...(o.caption ? { caption: o.caption } : {}) } };
  const extra = { ...(o.header ? { header: { type: "text", text: o.header } } : {}), ...(o.footer ? { footer: { text: o.footer } } : {}) };
  if (o.type === "buttons") {
    return { type: "interactive", interactive: { type: "button", body: { text: o.body }, action: { buttons: o.buttons.map((b) => ({ type: "reply", reply: b })) }, ...extra } };
  }
  return {
    type: "interactive",
    interactive: { type: "list", body: { text: o.body }, action: { button: o.button, sections: o.sections.map((s) => ({ ...(s.title ? { title: s.title } : {}), rows: s.rows.map((r) => ({ id: r.id, title: r.title, ...(r.description ? { description: r.description } : {}) })) })) }, ...extra },
  };
}

/** Plain-text rendering of any message (stored in the chat history and shown on the web). */
export function outText(out: WaOut): string {
  if (out.type === "text") return out.body;
  if (out.type === "image") return out.caption ?? "[image]";
  if (out.type === "buttons") return `${out.body}\n[${out.buttons.map((b) => b.title).join("] [")}]`;
  return `${out.body}\n${out.sections.flatMap((s) => s.rows.map((r) => `• ${r.title}`)).join("\n")}`;
}

// ---------------------------------------------------------------------------
// Invite codes typed or pre-filled from a wa.me link
// ---------------------------------------------------------------------------
export type InviteCode = { kind: "doctor"; code: string } | { kind: "family"; code: string } | { kind: "circle"; code: string };

const FAMILY_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function parseInviteCode(raw: string): InviteCode | null {
  const t = raw.normalize("NFC").trim().toUpperCase();
  const dr = t.match(/\b(?:DR|DOC|DOCTOR)[\s:#-]*(\d{6})\b/);
  if (dr) return { kind: "doctor", code: dr[1] };
  const fam = t.match(/\b(?:FAMILY|FAM)[\s:#-]*([A-HJ-NP-Z2-9]{6})\b/);
  if (fam) return { kind: "family", code: fam[1] };
  const join = t.match(/\b(?:JOIN|CIRCLE)[\s:#-]*(\d{5})\b/);
  if (join) return { kind: "circle", code: join[1] };
  return null;
}

export function newFamilyCode(): string {
  const b = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(b, (x) => FAMILY_ALPHABET[x % FAMILY_ALPHABET.length]).join("");
}

export function newDoctorCode(): string {
  const b = crypto.getRandomValues(new Uint32Array(1));
  return String(100000 + (b[0] % 900000));
}

/** Short reward code shown at the clinic. */
export function newRewardCode(): string {
  const b = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(b, (x) => FAMILY_ALPHABET[x % FAMILY_ALPHABET.length]).join("");
}

/** Plain-language command words (any of the three languages). */
export type Command = "menu" | "today" | "plan" | "progress" | "proof" | "circle" | "doctor" | "family" | "help" | "settings" | "register_doctor";

const COMMANDS: [Command, RegExp][] = [
  ["menu", /^(menu|hi|hii+|hello|hey|namaste|namaskar|नमस्ते|नमस्कार|मेनू|मेन्यू|start sukhi|sukhi)$/i],
  ["today", /^(today|aaj|आज|आजचे)$/i],
  ["plan", /^(plan|my plan|प्लान|योजना)$/i],
  ["progress", /^(progress|score|points|प्रगति|प्रगती)$/i],
  ["proof", /^(proof|photo|send proof|सबूत|पुरावा)$/i],
  ["circle", /^(circle|leaderboard|friends|सर्कल)$/i],
  ["doctor", /^(my doctor|doctor info|डॉक्टर)$/i],
  ["family", /^(family|परिवार|कुटुंब)$/i],
  ["help", /^(help|\?|मदद|मदत)$/i],
  ["settings", /^(settings|setting|language|भाषा)$/i],
  ["register_doctor", /^(doctor|i am a doctor|i'm a doctor|register doctor|doctor signup)$/i],
];

export function parseCommand(raw: string): Command | null {
  const t = raw.normalize("NFC").trim().replace(/[.!]+$/g, "");
  for (const [c, re] of COMMANDS) if (re.test(t)) return c;
  return null;
}

/** https://wa.me link that opens a chat with the business number with text pre-filled. */
export function waLink(businessNumber: string, text: string): string {
  return `https://wa.me/${businessNumber.replace(/\D/g, "")}?text=${encodeURIComponent(text)}`;
}

// ---------------------------------------------------------------------------
// Adherence
// ---------------------------------------------------------------------------
export interface AdherenceOcc {
  status: string;
  window_end_at: string;
  target_count?: number;
  completed_count?: number;
}

const DONE = new Set(["self_reported", "evidence_supported"]);
const OPEN = new Set(["pending", "due", "awaiting_response", "later"]);

/**
 * Share of the plan followed. Counts only slots whose time has passed (or that were answered):
 * future slots and paused ones are left out. Silence counts as not followed here, because the
 * doctor asks "was it followed", but it is never labelled a miss in the patient's own view.
 * Weekly targets count their completed days against the target.
 */
export function adherence(occs: readonly AdherenceOcc[], now = new Date()): { done: number; due: number; pct: number | null; proofs?: number } {
  let done = 0, due = 0;
  for (const o of occs) {
    if (o.status === "paused") continue;
    const target = o.target_count ?? 1;
    if (target > 1) {
      const c = Math.min(target, o.completed_count ?? 0);
      const ended = new Date(o.window_end_at).getTime() <= now.getTime();
      done += c;
      due += ended ? target : c; // a running week counts only what's done so far
      continue;
    }
    if (DONE.has(o.status)) { done++; due++; continue; }
    if (OPEN.has(o.status) && new Date(o.window_end_at).getTime() > now.getTime()) continue; // not over yet
    due++;
  }
  return { done, due, pct: due ? Math.round((done / due) * 100) : null };
}

/** Five dots, filled by share: ●●●○○ (calm, readable on any phone). */
export function dots(pct: number | null, n = 5): string {
  if (pct === null) return "○".repeat(n);
  const f = Math.max(0, Math.min(n, Math.round((pct / 100) * n)));
  return "●".repeat(f) + "○".repeat(n - f);
}

/** "08:00" → "8:00 am". */
export function time12(hhmm: string | null | undefined): string {
  if (!hhmm || !/^\d{2}:\d{2}/.test(hhmm)) return "";
  const h = Number(hhmm.slice(0, 2)), m = hhmm.slice(3, 5);
  return `${h % 12 === 0 ? 12 : h % 12}:${m} ${h < 12 ? "am" : "pm"}`;
}

export function firstName(n: string | null | undefined): string | null {
  return n?.trim().split(/\s+/)[0]?.slice(0, 30) || null;
}

/** Clean a name someone typed ("my name is Asha" → "Asha"). */
export function cleanName(raw: string): string | null {
  const t = raw
    .normalize("NFC")
    .replace(/^(my name is|i am|i'm|this is|name[:\s]|mera naam|माझे नाव|मेरा नाम)\s*/i, "")
    .replace(/\s*(hai|है|आहे)\s*$/i, "")
    .replace(/[^\p{L}\p{M}\s.'-]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
  if (t.length < 1 || t.length > 60) return null;
  return t.split(" ").slice(0, 4).join(" ");
}

/** What a list of schedule fields reads like: "8:00 am, 8:00 pm" or "5 days a week". */
export function scheduleText(i: { schedule_kind: string; times: string[]; weekdays?: number[]; weekly_target?: number | null }, perWeek = "days a week"): string {
  if (i.schedule_kind === "weekly_target") return `${i.weekly_target ?? 1} ${perWeek}`;
  const t = i.times.map(time12).filter(Boolean).join(", ");
  if (i.schedule_kind === "weekdays" && i.weekdays?.length) {
    const names = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    return `${i.weekdays.map((d) => names[d]).join(" ")}${t ? ` · ${t}` : ""}`;
  }
  return t || "any time";
}

// ---------------------------------------------------------------------------
// Phone numbers, times, emails
// ---------------------------------------------------------------------------
/**
 * A phone number as WhatsApp sends it: country code + number, digits only.
 * Ten-digit Indian mobiles (and 0-prefixed ones) get +91. Returns null when it can't be a number.
 */
export function normalizePhone(raw: string, defaultCountry = "91"): string | null {
  let d = raw.trim().replace(/[\s().-]/g, "");
  const plus = d.startsWith("+");
  d = d.replace(/^\+/, "").replace(/^00/, "");
  if (!/^\d+$/.test(d)) return null;
  if (!plus && d.length === 11 && d.startsWith("0")) d = defaultCountry + d.slice(1);
  else if (!plus && d.length === 10) {
    if (defaultCountry === "91" && !/^[6-9]/.test(d)) return null;
    d = defaultCountry + d;
  }
  return d.length >= 10 && d.length <= 15 ? d : null;
}

/** "+91 98200 01234" style display, last 4 visible for privacy when `mask` is set. */
export function phoneText(digits: string, mask = false): string {
  const cc = digits.length > 10 ? digits.slice(0, digits.length - 10) : "";
  const rest = digits.slice(-10);
  const shown = mask ? `${"•".repeat(6)}${rest.slice(-4)}` : `${rest.slice(0, 5)} ${rest.slice(5)}`;
  return `${cc ? `+${cc} ` : ""}${shown}`;
}

/** "mehul@gmail.com" → "m•••@gmail.com". */
export function maskEmail(email: string | null | undefined): string {
  if (!email || !email.includes("@")) return "";
  const [user, domain] = email.split("@");
  return `${user.slice(0, 1)}•••@${domain}`;
}

/**
 * Times someone typed: "8am", "8:30 pm", "20:00", "8.30pm, 9 pm", "7 and 21:15".
 * Returns sorted unique HH:MM, or null if any part can't be read.
 */
export function parseTimes(raw: string): string[] | null {
  const parts = raw.toLowerCase().replace(/\band\b|&|aur|आणि|और/g, ",").split(/[,;\/]+|\s{2,}/).map((s) => s.trim()).filter(Boolean);
  if (!parts.length || parts.length > 8) return null;
  const out: string[] = [];
  for (const p of parts) {
    const m = p.match(/^(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?$/);
    if (!m) return null;
    let h = Number(m[1]);
    const min = Number(m[2] ?? "0");
    const ap = m[3]?.replace(/\./g, "");
    if (min > 59) return null;
    if (ap) {
      if (h < 1 || h > 12) return null;
      if (ap === "pm" && h !== 12) h += 12;
      if (ap === "am" && h === 12) h = 0;
    } else if (h > 23) return null;
    out.push(`${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`);
  }
  return [...new Set(out)].sort();
}

/** Quiet hours typed as "10pm-7am" / "22:30 to 07:00". */
export function parseRange(raw: string): [string, string] | null {
  const m = raw.toLowerCase().split(/\s*(?:-|–|to|se|ते|से)\s*/);
  if (m.length !== 2) return null;
  const a = parseTimes(m[0]), b = parseTimes(m[1]);
  return a?.length === 1 && b?.length === 1 && a[0] !== b[0] ? [a[0], b[0]] : null;
}
