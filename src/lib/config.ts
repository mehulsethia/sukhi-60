// Central, server-side configuration. Reports only set/missing/invalid — never values.
// Import from server code only (no NEXT_PUBLIC secrets live here).

export type CheckState = "set" | "missing" | "invalid";

interface VarSpec {
  name: string;
  required: boolean;
  secret: boolean;
  group: "supabase" | "app" | "worker" | "anthropic" | "speech" | "sarvam" | "whatsapp" | "push";
  validate?: (v: string) => boolean;
}

export const VARS: VarSpec[] = [
  { name: "NEXT_PUBLIC_SUPABASE_URL", required: true, secret: false, group: "supabase", validate: (v) => /^https?:\/\//.test(v) },
  { name: "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", required: true, secret: false, group: "supabase", validate: (v) => v.length > 20 },
  { name: "SUPABASE_SECRET_KEY", required: true, secret: true, group: "supabase", validate: (v) => v.length > 20 },
  { name: "NEXT_PUBLIC_APP_URL", required: true, secret: false, group: "app", validate: (v) => /^https?:\/\//.test(v) },
  { name: "WORKER_SECRET", required: true, secret: true, group: "worker", validate: (v) => v.length >= 32 },
  { name: "LINK_CODE_PEPPER", required: true, secret: true, group: "worker", validate: (v) => v.length >= 32 },
  { name: "DEMO_MODE_ENABLED", required: false, secret: false, group: "app", validate: (v) => v === "true" || v === "false" },
  { name: "ANTHROPIC_API_KEY", required: false, secret: true, group: "anthropic", validate: (v) => v.startsWith("sk-ant-") },
  { name: "ANTHROPIC_MODEL", required: false, secret: false, group: "anthropic", validate: (v) => /^claude-[a-z0-9-]+$/.test(v) },
  { name: "ANTHROPIC_EXTRACT_MODEL", required: false, secret: false, group: "anthropic", validate: (v) => /^claude-[a-z0-9-]+$/.test(v) },
  // Optional: let the LLM re-phrase approved support messages (validated; templates are the fallback). Default off.
  { name: "SUPPORT_LLM_WORDING", required: false, secret: false, group: "anthropic", validate: (v) => v === "true" || v === "false" },
  { name: "ADMIN_EMAILS", required: false, secret: false, group: "app", validate: (v) => /@/.test(v) },
  { name: "ELEVENLABS_API_KEY", required: false, secret: true, group: "speech", validate: (v) => v.length > 10 },
  { name: "ELEVENLABS_VOICE_ID", required: false, secret: false, group: "speech", validate: (v) => /^[A-Za-z0-9]{10,40}$/.test(v) },
  { name: "ELEVENLABS_VOICE_ID_HI", required: false, secret: false, group: "speech", validate: (v) => /^[A-Za-z0-9]{10,40}$/.test(v) },
  { name: "ELEVENLABS_VOICE_ID_MR", required: false, secret: false, group: "speech", validate: (v) => /^[A-Za-z0-9]{10,40}$/.test(v) },
  { name: "ELEVENLABS_TTS_MODEL", required: false, secret: false, group: "speech", validate: (v) => /^eleven_[a-z0-9_]+$/.test(v) },
  { name: "ELEVENLABS_STT_MODEL", required: false, secret: false, group: "speech", validate: (v) => /^scribe_[a-z0-9_]+$/.test(v) },
  { name: "SARVAM_API_KEY", required: false, secret: true, group: "sarvam", validate: (v) => v.length > 10 },
  { name: "SARVAM_ASR_MODEL", required: false, secret: false, group: "sarvam", validate: (v) => /^saaras:v\d/.test(v) },
  { name: "SARVAM_TTS_MODEL", required: false, secret: false, group: "sarvam", validate: (v) => /^bulbul:v\d/.test(v) },
  { name: "SARVAM_TTS_SPEAKER", required: false, secret: false, group: "sarvam", validate: (v) => /^[a-z_]+$/.test(v) },
  // Web push (phone notifications). Generate with: npx web-push generate-vapid-keys
  { name: "NEXT_PUBLIC_VAPID_PUBLIC_KEY", required: false, secret: false, group: "push", validate: (v) => /^[A-Za-z0-9_-]{80,100}$/.test(v) },
  { name: "VAPID_PRIVATE_KEY", required: false, secret: true, group: "push", validate: (v) => /^[A-Za-z0-9_-]{40,50}$/.test(v) },
  { name: "VAPID_SUBJECT", required: false, secret: false, group: "push", validate: (v) => /^(mailto:|https:\/\/)/.test(v) },
  // MVP: WhatsApp connect is shown as "coming soon" until this is "true" (and the keys below are set).
  { name: "WHATSAPP_ENABLED", required: false, secret: false, group: "whatsapp", validate: (v) => v === "true" || v === "false" },
  { name: "WHATSAPP_ACCESS_TOKEN", required: false, secret: true, group: "whatsapp", validate: (v) => v.length > 20 },
  { name: "WHATSAPP_PHONE_NUMBER_ID", required: false, secret: false, group: "whatsapp", validate: (v) => /^\d{6,20}$/.test(v) },
  { name: "WHATSAPP_APP_SECRET", required: false, secret: true, group: "whatsapp", validate: (v) => v.length >= 16 },
  { name: "WHATSAPP_VERIFY_TOKEN", required: false, secret: true, group: "whatsapp", validate: (v) => v.length >= 16 },
  { name: "WHATSAPP_GRAPH_VERSION", required: false, secret: false, group: "whatsapp", validate: (v) => /^v\d+\.\d+$/.test(v) },
  { name: "WHATSAPP_APPROVED_TEMPLATES", required: false, secret: false, group: "whatsapp", validate: (v) => /^[a-z0-9_,]*$/.test(v) },
  // Optional: the business number in digits, for wa.me links. Read from the Graph API when unset.
  { name: "WHATSAPP_DISPLAY_NUMBER", required: false, secret: false, group: "whatsapp", validate: (v) => /^\+?\d{8,15}$/.test(v.replace(/[\s-]/g, "")) },
  { name: "WHATSAPP_TEMPLATE_LANGUAGES", required: false, secret: false, group: "whatsapp", validate: (v) => /^[a-zA-Z_,]*$/.test(v) },
];

export function checkVar(name: string, env: Record<string, string | undefined> = process.env): CheckState {
  const spec = VARS.find((v) => v.name === name);
  const value = env[name];
  if (!value) return "missing";
  if (spec?.validate && !spec.validate(value)) return "invalid";
  return "set";
}

export function configReport(env: Record<string, string | undefined> = process.env) {
  return VARS.map((v) => ({ name: v.name, group: v.group, required: v.required, secret: v.secret, state: checkVar(v.name, env) }));
}

const ok = (name: string) => checkVar(name) === "set";

export const features = {
  /** Sign-in and data. Without these the app runs in keyless mode: landing page and /demo only. */
  supabase: () => ok("NEXT_PUBLIC_SUPABASE_URL") && ok("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"),
  ai: () => ok("ANTHROPIC_API_KEY") && ok("ANTHROPIC_MODEL"),
  speech: () => ok("ELEVENLABS_API_KEY") || ok("SARVAM_API_KEY"),
  whatsapp: () => ok("WHATSAPP_ACCESS_TOKEN") && ok("WHATSAPP_PHONE_NUMBER_ID") && ok("WHATSAPP_APP_SECRET") && ok("WHATSAPP_VERIFY_TOKEN"),
  push: () => ok("NEXT_PUBLIC_VAPID_PUBLIC_KEY") && ok("VAPID_PRIVATE_KEY"),
  /** Offered to users (connect, consent, copy). Off for the MVP: shown as "coming soon". */
  whatsappLaunched: () => process.env.WHATSAPP_ENABLED === "true" && features.whatsapp(),
  demo: () => process.env.DEMO_MODE_ENABLED === "true",
};

export function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`config_missing:${name}`);
  return v;
}

export const settings = {
  anthropicModel: () => process.env.ANTHROPIC_MODEL ?? "",
  /** Reading handwritten prescriptions needs the strongest vision model; defaults to Opus. */
  extractModel: () => (ok("ANTHROPIC_EXTRACT_MODEL") ? process.env.ANTHROPIC_EXTRACT_MODEL! : "claude-opus-5-5"),
  supportLlmWording: () => process.env.SUPPORT_LLM_WORDING === "true",
  adminEmails: () => (process.env.ADMIN_EMAILS ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean),
  /** ElevenLabs when its key is set, otherwise Sarvam, otherwise none. */
  speechProvider: (): "elevenlabs" | "sarvam" | null => (ok("ELEVENLABS_API_KEY") ? "elevenlabs" : ok("SARVAM_API_KEY") ? "sarvam" : null),
  elevenTtsModel: () => process.env.ELEVENLABS_TTS_MODEL || "eleven_v4",
  elevenSttModel: () => process.env.ELEVENLABS_STT_MODEL || "scribe_v2",
  /** Live transcription for "Talk to Sukhi" (WebSocket, partial text while the person speaks). */
  /** Small, fast model that maps unusual voice commands to one app action. */
  voiceRouterModel: () => process.env.VOICE_ROUTER_MODEL || "claude-haiku-5-5",
  elevenRealtimeModel: () => process.env.ELEVENLABS_REALTIME_MODEL || "scribe_v2_realtime",
  /** Low-latency streamed voice for spoken replies. eleven_v4_turbo supports Hindi and Marathi. */
  elevenStreamModel: () => process.env.ELEVENLABS_TTS_STREAM_MODEL || "eleven_v4_turbo",
  elevenVoice: (locale: string) => (locale === "hi" ? process.env.ELEVENLABS_VOICE_ID_HI : locale === "mr" ? process.env.ELEVENLABS_VOICE_ID_MR : undefined) || process.env.ELEVENLABS_VOICE_ID || "",
  sarvamAsrModel: () => process.env.SARVAM_ASR_MODEL || "saaras:v4",
  sarvamTtsModel: () => process.env.SARVAM_TTS_MODEL || "bulbul:v3",
  sarvamSpeaker: () => process.env.SARVAM_TTS_SPEAKER || "shubh",
  graphVersion: () => process.env.WHATSAPP_GRAPH_VERSION || "v26.0",
  approvedTemplates: () => (process.env.WHATSAPP_APPROVED_TEMPLATES ?? "").split(",").map((s) => s.trim()).filter(Boolean),
  templateLanguages: () => (process.env.WHATSAPP_TEMPLATE_LANGUAGES || "en,hi,mr").split(",").map((s) => s.trim()).filter(Boolean),
  appUrl: () => (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, ""),
};

// Operational limits (exposed in UI/docs as expected latency).
export const LIMITS = {
  agentMaxSteps: 5,
  agentTimeoutMs: 25_000,
  agentHistoryMessages: 12,
  chatMaxChars: 2000,
  chatPerMinute: 10,
  evidencePerHour: 20,
  // Vercel Functions reject request bodies over ~4.5 MB; keep route uploads under that.
  uploadMaxBytes: 4 * 1024 * 1024,
  audioMaxBytes: 4 * 1024 * 1024,
  workerBatch: 20,
  workerLeaseSeconds: 120,
  workerIntervalSeconds: 60,
  linkCodeMinutes: 15,
};
