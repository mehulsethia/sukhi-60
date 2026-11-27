// "Talk to Sukhi": turns one spoken sentence (Hindi, Marathi, English or Hinglish, in Latin or
// Devanagari script) into an intent. Pure and deterministic, so it runs on the server and in the
// keyless demo alike, needs no AI key, and never guesses: unclear input becomes "unknown" or a
// choice between named tasks.
import { isClinicalAdviceRequest } from "./safety";
import type { BarrierCode } from "./behaviour";

export interface VoiceTask { id: string; title: string; category?: string | null; time?: string | null }

/** Something Sukhi read back and is waiting for a yes/no on. Nothing is saved before that. */
export type VoicePending =
  | { kind: "checkin"; taskId: string; title: string; status: "done" | "skipped"; reason?: BarrierCode; note?: string }
  | { kind: "add_task"; title: string; time: string; category: "activity" | "nutrition" | "rest" | "measurement" | "other" }
  | { kind: "choose"; action: "done" | "skipped" | "later" | "photo"; candidates: { id: string; title: string }[]; reason?: BarrierCode; note?: string };

export interface VoiceReply {
  say: string;
  /** Set when Sukhi asked a yes/no question; send it back with the next utterance. */
  pending?: VoicePending | null;
  /** Tappable answers (each sends its `text` as if spoken). */
  choices?: { label: string; text: string }[];
  navigate?: string;
  /** Data changed: refresh the screen. */
  refresh?: boolean;
  /** The conversation is over: stop listening. */
  end?: boolean;
}

export type VoiceIntent =
  | { kind: "medical" }
  | { kind: "stop" }
  | { kind: "yes" }
  | { kind: "no" }
  | { kind: "navigate"; path: string; label: string }
  | { kind: "photo"; match: TaskMatch }
  | { kind: "add_task"; title: string; time: string | null; category: VoicePendingAdd["category"]; medicine: boolean }
  | { kind: "remaining" }
  | { kind: "skipped"; match: TaskMatch; reason: BarrierCode; note: string }
  | { kind: "later"; match: TaskMatch }
  | { kind: "done"; match: TaskMatch }
  | { kind: "unknown" };

type VoicePendingAdd = Extract<VoicePending, { kind: "add_task" }>;
export interface TaskMatch { taskId: string | null; candidates: VoiceTask[]; mentioned: boolean }

// ---------------------------------------------------------------------------
// Normalising and word lists
// ---------------------------------------------------------------------------
export function normalize(text: string): string {
  return ` ${text.toLowerCase().normalize("NFC").replace(/(\d)[.:](\d)/g, "$1:$2").replace(/(?<!\d):|:(?!\d)/g, " ").replace(/[.,!?;"'“”‘’()\-–—।]/g, " ").replace(/\s+/g, " ").trim()} `;
}

/** Whole-word or whole-phrase match (works for Devanagari, where \b does not). */
const has = (t: string, words: readonly string[]) => words.some((w) => t.includes(` ${w} `));
const count = (t: string) => t.trim().split(" ").filter(Boolean).length;

const YES = ["haan", "han", "haa", "ha", "hanji", "haan ji", "ho", "hoy", "yes", "yeah", "yep", "sahi", "sahi hai", "theek", "theek hai", "thik", "thik hai", "ok", "okay", "bilkul", "correct", "right", "barobar", "chalel", "हाँ", "हां", "हा", "जी", "हो", "होय", "सही", "ठीक", "ठीक है", "बरोबर", "चालेल"];
const NO = ["nahi", "nahin", "na", "no", "nope", "nako", "nahi nahi", "galat", "wrong", "cancel", "rehne do", "chhodo", "नहीं", "नही", "ना", "नको", "नाही", "गलत", "चूक"];
const STOP = ["bas", "bas karo", "stop", "band karo", "thank you", "thanks", "dhanyavad", "bye", "that's all", "thats all", "बस", "धन्यवाद", "थांब", "पुरे"];

const DONE = ["le li", "le liya", "li", "liya", "le lee", "kha li", "kha liya", "pi li", "pi liya", "ho gaya", "ho gayi", "hogaya", "kar liya", "kar li", "kar diya", "kiya", "done", "took", "taken", "did", "finished", "completed", "complete", "zala", "jhala", "zhala", "ghetli", "ghetla", "ghetle", "keli", "kela", "kele", "ले ली", "ले लिया", "ली", "लिया", "खा ली", "पी ली", "हो गया", "हो गई", "कर ली", "कर लिया", "किया", "झाला", "झाली", "झालं", "घेतली", "घेतला", "घेतले", "केली", "केला", "केलं"];
const SKIP = ["nahi hua", "nahi hui", "nahi kiya", "nahi ki", "nahi li", "nahi le", "nahi gaya", "nahi ho paya", "nahi kar paya", "skip", "skipped", "missed", "miss", "couldn't", "could not", "didn't", "did not", "not done", "zala nahi", "nahi zala", "jamla nahi", "nahi jamla", "nahi ghetli", "नहीं हुआ", "नहीं हुई", "नहीं किया", "नहीं ली", "छूट गया", "छूट गई", "झालं नाही", "झाला नाही", "नाही झालं", "जमलं नाही", "घेतली नाही", "राहिलं"];
const LATER = ["baad mein", "baad me", "bad me", "later", "thodi der", "thodi der baad", "snooze", "remind me later", "nantar", "nanter", "बाद में", "थोड़ी देर", "नंतर", "थोड्या वेळाने"];
const REMAINING = ["kya baaki", "kya baki", "baaki hai", "baki hai", "kya bacha", "what's left", "whats left", "what is left", "remaining", "what's next", "whats next", "what is next", "aage kya", "kay baki", "kay rahila", "क्या बाकी", "बाकी है", "क्या बचा", "काय बाकी", "काय राहिलं", "पुढे काय"];
const PHOTO = ["photo", "foto", "photu", "pic", "picture", "camera", "proof", "saboot", "फोटो", "फ़ोटो", "कैमरा", "सबूत", "पुरावा"];
const REMIND = ["yaad dilana", "yaad dila", "yaad dilao", "yaad dila do", "yaad karana", "remind me", "reminder", "remind", "aathvan", "athvan", "आठवण", "याद दिलाना", "याद दिला", "याद दिलाओ", "रिमाइंडर"];
const NAV_VERB = ["dikhao", "dikha", "dikhana", "kholo", "khol", "open", "show", "go to", "take me to", "chalo", "dakhva", "dakhav", "ughad", "दिखाओ", "दिखा", "खोलो", "खोल", "दाखवा", "उघडा", "उघड"];
const DAILY = ["har roz", "har din", "roz", "rozana", "daily", "every day", "everyday", "रोज", "हर रोज", "दररोज", "रोज़"];

const NAV: { path: string; label: string; words: string[] }[] = [
  { path: "/progress", label: "Progress", words: ["progress", "pragati", "pragti", "mera hafta", "my week", "प्रगति", "प्रगती"] },
  { path: "/plan", label: "My plan", words: ["plan", "my plan", "mera plan", "yojana", "प्लान", "योजना"] },
  { path: "/today", label: "Today", words: ["today", "aaj", "aaj ka", "home", "आज", "होम"] },
  { path: "/chat", label: "Buddy", words: ["chat", "buddy", "baat", "बात", "चैट"] },
  { path: "/circle", label: "Circle", words: ["circle", "friends", "dost", "सर्कल"] },
  { path: "/people", label: "Your people", words: ["people", "family", "parivar", "doctor", "परिवार", "कुटुंब"] },
  { path: "/settings", label: "Settings", words: ["settings", "setting", "सेटिंग"] },
];

const REASONS: [BarrierCode, string[]][] = [
  ["physical_discomfort", ["dard", "pain", "hurt", "hurts", "ghutna", "ghutne", "knee", "back", "kamar", "dukh", "dukhat", "bimar", "sick", "unwell", "fever", "bukhar", "दर्द", "घुटना", "घुटने", "कमर", "दुख", "बीमार", "बुखार", "गुडघा", "पाठ", "आजारी"]],
  ["forgot", ["bhool", "bhul", "bhool gaya", "bhool gayi", "forgot", "forget", "visarlo", "visarle", "yaad nahi", "भूल", "भूल गया", "भूल गई", "विसरलो", "विसरले"]],
  ["busy", ["busy", "time nahi", "samay nahi", "vel nahi", "kaam", "work", "office", "व्यस्त", "समय नहीं", "वेळ नाही", "काम"]],
  ["low_motivation", ["mann nahi", "man nahi", "mood", "tired", "thak", "thaka", "lazy", "aalas", "मन नहीं", "थका", "थक", "आलस", "कंटाळा", "थकलो"]],
  ["routine_disrupted", ["guests", "mehmaan", "mehman", "shaadi", "wedding", "travel", "bahar", "safar", "function", "मेहमान", "शादी", "बाहर", "सफर", "पाहुणे", "लग्न", "प्रवास"]],
  ["too_difficult", ["mushkil", "hard", "difficult", "kathin", "मुश्किल", "कठिन", "अवघड"]],
];

// Words that point at a kind of task, so "tablet le li" finds "Metformin 500 mg".
const TOPICS: { words: string[]; category?: string; title: RegExp }[] = [
  { words: ["tablet", "tab", "goli", "dawai", "dawa", "medicine", "meds", "pill", "pills", "capsule", "aushadh", "गोली", "दवा", "दवाई", "गोळी", "औषध", "टैबलेट"], category: "medication", title: /mg|tablet|tab|capsule|syrup|pill|medicine|dawa|goli|गोली|दवा|गोळी|औषध/i },
  { words: ["walk", "walking", "chalna", "chala", "chal", "sair", "tahal", "tahalna", "chalnar", "फिरना", "चलना", "सैर", "टहल", "चालणं", "चालणे", "फिरायला"], title: /walk|steps|chal|sair|टहल|चल|चाल|सैर/i },
  { words: ["paani", "pani", "water", "पानी", "पाणी"], title: /water|paani|pani|पानी|पाणी/i },
  { words: ["sugar", "reading", "bp", "pressure", "check", "glucose", "शुगर", "रीडिंग"], category: "measurement", title: /sugar|bp|pressure|reading|check|glucose/i },
  { words: ["yoga", "stretch", "stretching", "exercise", "vyayam", "योग", "व्यायाम"], title: /yoga|stretch|exercise|योग|व्यायाम/i },
  { words: ["sleep", "neend", "sona", "zop", "नींद", "सोना", "झोप"], category: "rest", title: /sleep|bed|neend|नींद|झोप/i },
  { words: ["breakfast", "nashta", "naashta", "नाश्ता"], title: /breakfast|nashta|नाश्ता/i },
  { words: ["fruit", "phal", "salad", "फल", "फळ"], title: /fruit|salad|phal|फल|फळ/i },
];

// ---------------------------------------------------------------------------
// Task matching
// ---------------------------------------------------------------------------
export function matchTask(t: string, tasks: readonly VoiceTask[]): TaskMatch {
  const scored = tasks.map((task) => {
    let score = 0;
    const title = task.title.toLowerCase();
    for (const w of title.split(/[^\p{L}\p{N}]+/u).filter((x) => x.length >= 3)) if (t.includes(` ${w} `)) score += 3;
    for (const topic of TOPICS) {
      if (!has(t, topic.words)) continue;
      if ((topic.category && task.category === topic.category) || topic.title.test(task.title)) score += 2;
    }
    return { task, score };
  });
  const best = Math.max(0, ...scored.map((s) => s.score));
  if (best === 0) return { taskId: null, candidates: [], mentioned: false };
  const top = scored.filter((s) => s.score === best).map((s) => s.task);
  return { taskId: top.length === 1 ? top[0].id : null, candidates: top, mentioned: true };
}

function reasonOf(t: string): BarrierCode {
  return REASONS.find(([, words]) => has(t, words))?.[0] ?? "other";
}

// ---------------------------------------------------------------------------
// "raat 10 baje", "10 pm", "subah 7:30", "शाम 6 बजे"
// ---------------------------------------------------------------------------
export function parseSpokenTime(t: string): string | null {
  const m = t.match(/ (\d{1,2})(?:[:.](\d{2}))? ?(am|pm|a m|p m|baje|bje|vajta|o'clock|oclock|बजे|वाजता)? /);
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2] ?? "0");
  if (h > 23 || min > 59) return null;
  const suffix = (m[3] ?? "").replace(" ", "");
  const pm = suffix === "pm" || has(t, ["raat", "rat", "night", "shaam", "sham", "evening", "ratri", "sandhyakali", "रात", "शाम", "रात्री", "संध्याकाळी"]);
  const noon = has(t, ["dopahar", "dupari", "afternoon", "दोपहर", "दुपारी"]);
  const am = suffix === "am" || has(t, ["subah", "subha", "morning", "sakali", "सुबह", "सकाळी"]);
  if (h <= 12) {
    if (pm && h !== 12) h += 12;
    else if (noon && h < 6) h += 12;
    else if (am && h === 12) h = 0;
  }
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

const FILLER = ["mujhe", "muje", "please", "plz", "ka", "ki", "ke", "ko", "karna", "karne", "peena", "pina", "lena", "set", "add", "a", "an", "the", "to", "at", "me", "my", "for", "kar", "do", "de", "dena", "baje", "bje", "vajta", "am", "pm", "raat", "rat", "subah", "shaam", "sham", "dopahar", "morning", "evening", "night", "मुझे", "का", "की", "के", "को", "करना", "पीना", "बजे", "रात", "सुबह", "शाम", "वाजता", "मला"];
const FRIENDLY: [string[], string, VoicePendingAdd["category"]][] = [
  [["paani", "pani", "water", "पानी", "पाणी"], "Drink water", "nutrition"],
  [["walk", "chalna", "sair", "tahal", "चलना", "सैर", "चालणं"], "Walk", "activity"],
  [["yoga", "stretch", "exercise", "vyayam", "योग", "व्यायाम"], "Stretch or yoga", "activity"],
  [["sleep", "neend", "sona", "zop", "नींद", "झोप"], "Get ready for bed", "rest"],
  [["fruit", "phal", "फल", "फळ"], "Eat a fruit", "nutrition"],
];

function taskFromWords(t: string): { title: string; category: VoicePendingAdd["category"] } {
  for (const [words, title, category] of FRIENDLY) if (has(t, words)) return { title, category };
  let rest = t;
  for (const p of [...REMIND, ...DAILY]) rest = rest.replaceAll(` ${p} `, " ");
  const words = rest.trim().split(" ").filter((w) => w && !FILLER.includes(w) && !/^\d/.test(w));
  const title = words.join(" ").slice(0, 40).trim();
  return { title: title ? title.charAt(0).toUpperCase() + title.slice(1) : "", category: "other" };
}

// ---------------------------------------------------------------------------
// The parser
// ---------------------------------------------------------------------------
const MEDICAL = [/\b(kitni|kitne|how many|how much)\b.*\b(goli|tablet|dose|dawai|pill)/i, /\b(double|extra|do|2)\s+(goli|tablet|dose|pill)/i, /\b(dose|khurak)\b.*\b(badha|ghata|change|kam|zyada|double)/i, /\b(can|should)\s+i\s+(take|stop|skip|double)\b/i, /\b(band kar|stop taking|chhod d)/i, /कितनी\s*(गोली|दवा)|दो\s*गोली|कितनी\s*खुराक/, /किती\s*(गोळ्या|औषध)|दोन\s*गोळ्या/];

export function parseVoiceCommand(text: string, tasks: readonly VoiceTask[]): VoiceIntent {
  const t = normalize(text);
  if (!t.trim()) return { kind: "unknown" };
  if (isClinicalAdviceRequest(text) || MEDICAL.some((re) => re.test(text))) return { kind: "medical" };
  const short = count(t) <= 4;
  if (short && has(t, STOP)) return { kind: "stop" };
  if (short && has(t, YES) && !has(t, NO) && !has(t, DONE)) return { kind: "yes" };
  if (short && has(t, NO) && !has(t, SKIP) && !has(t, LATER)) return { kind: "no" };

  const nav = NAV.find((n) => has(t, n.words));
  if (nav && (has(t, NAV_VERB) || count(t) <= 2)) return { kind: "navigate", path: nav.path, label: nav.label };
  if (has(t, PHOTO)) return { kind: "photo", match: matchTask(t, tasks) };
  if (has(t, REMIND) && !has(t, LATER)) {
    const { title, category } = taskFromWords(t);
    const medicine = has(t, TOPICS[0].words);
    return { kind: "add_task", title, time: parseSpokenTime(t), category, medicine };
  }
  if (has(t, REMAINING)) return { kind: "remaining" };
  if (has(t, SKIP)) return { kind: "skipped", match: matchTask(t, tasks), reason: reasonOf(t), note: text.trim().slice(0, 200) };
  if (has(t, LATER)) return { kind: "later", match: matchTask(t, tasks) };
  if (has(t, DONE)) return { kind: "done", match: matchTask(t, tasks) };
  // Only a task name ("Metformin"): useful as an answer to a choice question.
  return { kind: "unknown" };
}

/** Pick one task out of a choice list from whatever the person said ("Metformin", "pehli wali", "2"). */
export function pickFromChoices(text: string, candidates: readonly { id: string; title: string }[]): string | null {
  const t = normalize(text);
  const ord = [["pehla", "pehli", "first", "one", "1", "पहला", "पहली", "पहिला", "पहिली"], ["doosra", "dusra", "doosri", "dusri", "second", "two", "2", "दूसरा", "दूसरी", "दुसरा", "दुसरी"], ["teesra", "tisra", "third", "three", "3", "तीसरा", "तिसरा"]];
  for (let i = 0; i < Math.min(ord.length, candidates.length); i++) if (has(t, ord[i])) return candidates[i].id;
  const m = matchTask(t, candidates);
  return m.taskId;
}
