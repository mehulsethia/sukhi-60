// How Sukhi sounds: the person's chosen tone, and outcome-first reminder copy.
// Reminders lead with WHY (the result the person wants), not just WHAT, so a notification
// is worth opening. Deterministic and localized: no model needed, nothing medical promised.
import { effectiveStyles, type CommunicationStyle } from "./behaviour";

/** Prompt guidance for each tone (used by the chat, proactive check-ins and the circle). */
export const TONE_GUIDE: Record<CommunicationStyle, string> = {
  warm_gentle: "warm, caring and soft, like a close friend who really cares. Empathy first, gentle encouragement, never pushy.",
  fun_playful: "playful, light and a little cheeky, like a fun friend. Light humour and the odd emoji are welcome (never about symptoms, medicines or bad news).",
  motivating: "upbeat and energising, like a good coach. Confident, celebrates wins loudly, gives a friendly push.",
  simple_practical: "calm, clear and to the point. Short sentences, no fluff, still kind.",
};

export function toneInstruction(styles: readonly unknown[] | null | undefined): string {
  const s = effectiveStyles(styles);
  return s.map((x) => TONE_GUIDE[x]).join(" Also: ");
}

// ---------------------------------------------------------------------------
// Outcome ("why") lines
// ---------------------------------------------------------------------------
export const BENEFITS = ["water", "walk", "sleep", "breathe", "fruit", "stretch", "sun", "breakfast", "caffeine", "move", "gratitude", "stairs", "medicine", "measure", "appointment", "generic"] as const;
export type Benefit = (typeof BENEFITS)[number];

const RULES: [Benefit, RegExp][] = [
  ["water", /water|hydrat|पानी|पाणी|glass/i],
  ["caffeine", /caffeine|coffee|chai|tea|कॉफी|कॉफ़ी|चाय|चहा/i],
  ["sleep", /sleep|bed|screen|wind.?down|नींद|झोप|सोन/i],
  ["breathe", /breath|meditat|pranayam|सांस|साँस|श्वास/i],
  ["fruit", /fruit|salad|vegetable|veggie|फल|फळ|सलाद/i],
  ["stretch", /stretch|yoga|योग|स्ट्रेच/i],
  ["sun", /sun|daylight|धूप|ऊन/i],
  ["breakfast", /breakfast|नाश्ता|नाश्ता/i],
  ["stairs", /stair|सीढ़ी|सीढ़ि|जिना|जिन्या/i],
  ["move", /move break|stand up|break|ब्रेक/i],
  ["walk", /walk|steps|jog|run|cycle|चल|चाल|टहल|फिर|सैर/i],
  ["gratitude", /good thing|gratitude|journal|diary|अच्छी बात|चांगली गोष्ट/i],
];

export function benefitFor(item: { title: string; category?: string | null; planMode?: string | null }): Benefit {
  if (item.category === "medication") return "medicine";
  if (item.category === "measurement") return "measure";
  if (item.category === "appointment") return "appointment";
  const hit = RULES.find(([, re]) => re.test(item.title));
  if (hit) return hit[0];
  if (item.planMode === "clinician_instructions") return "medicine";
  if (item.category === "rest") return "sleep";
  if (item.category === "activity") return "walk";
  return "generic";
}

type Lines = Record<Benefit, string[]>;

// Short on purpose: a lock-screen line is read in a glance. Four per outcome so back-to-back
// reminders don't repeat themselves. Nothing medical is promised.
const OUTCOME: Record<"en" | "hi" | "mr", Lines> = {
  en: {
    water: ["Small sips, steady energy.", "Your skin will thank you.", "Hydrated now, sharper later.", "A clearer head this afternoon."],
    walk: ["Better mood for hours.", "Walk now, sleep deeper tonight.", "Fresh air, fresh mind.", "Every step counts."],
    sleep: ["Wake up clear-headed.", "Rest now, glow tomorrow.", "Tomorrow-you says thanks.", "Time to recharge."],
    breathe: ["Two slow minutes, calmer mind.", "Breathe out the day.", "A quiet reset.", "Slow in, slower out."],
    fruit: ["Natural energy, no crash.", "Some colour on your plate.", "A sweet, easy win.", "Fresh and light."],
    stretch: ["Less stiffness all day.", "Loosen up, lift your mood.", "Two minutes, real relief.", "Your back will thank you."],
    sun: ["Light now, better sleep tonight.", "Wakes you up better than coffee.", "Five minutes outside.", "A little daylight."],
    breakfast: ["Steady energy till lunch.", "Start strong.", "Skip the mid-morning slump.", "Fuel for the day."],
    caffeine: ["Easier sleep tonight.", "Swap it, sleep sooner.", "A calmer evening ahead.", "Your sleep will thank you."],
    move: ["A quick reset for your focus.", "Up and about for five.", "Shake off the stiffness.", "Your back will thank you."],
    gratitude: ["One good thing from today.", "End on a good note.", "What went well?", "Lighter mind, calmer sleep."],
    stairs: ["Stronger legs, step by step.", "Small climbs add up.", "A quick stamina boost.", "Skip the lift today."],
    medicine: ["On time keeps you on track.", "Right on schedule.", "Steady is what works.", "Quick one, then done."],
    measure: ["Quick reading, full picture.", "Helps your doctor see trends.", "Thirty seconds, then done.", "Stay in the know."],
    appointment: ["Keeps your care on track.", "One less thing to worry about.", "Worth showing up for.", "It's today."],
    generic: ["Small steps add up.", "Future you says thanks.", "One small win.", "Quick one, then done."],
  },
  hi: {
    water: ["थोड़ा पानी, पूरी energy।", "Skin thank you बोलेगी।", "अभी पानी, दोपहर fresh।"],
    walk: ["घंटों अच्छा mood।", "आज walk, रात गहरी नींद।", "ताज़ी हवा, ताज़ा मन।"],
    sleep: ["कल fresh उठिए।", "अभी आराम, कल glow।", "Recharge का time।"],
    breathe: ["दो मिनट, शांत मन।", "दिन का stress बाहर।", "धीमी साँस, हल्का मन।"],
    fruit: ["Natural energy, कोई crash नहीं।", "Plate पर थोड़ा रंग।", "Fresh और हल्का।"],
    stretch: ["दिन भर कम अकड़न।", "Body ढीली, mood बढ़िया।", "दो मिनट, बड़ा आराम।"],
    sun: ["धूप अभी, नींद रात को।", "Coffee से बेहतर wake-up।", "पाँच मिनट बाहर।"],
    breakfast: ["Lunch तक energy steady।", "दिन की strong शुरुआत।", "सुबह की सुस्ती गायब।"],
    caffeine: ["रात को नींद आसान।", "आज नींद जल्दी आएगी।", "शांत शाम।"],
    move: ["Focus फिर से fresh।", "पाँच मिनट उठिए-चलिए।", "कमर thank you बोलेगी।"],
    gratitude: ["आज की एक अच्छी बात।", "दिन अच्छे नोट पर ख़त्म।", "आज क्या अच्छा हुआ?"],
    stairs: ["हर सीढ़ी, मज़बूत पैर।", "छोटी चढ़ाई, बड़ा फ़र्क।", "आज lift skip।"],
    medicine: ["Time पर, track पर।", "Regular रहना ही काम करता है।", "एक मिनट, बस हो गया।"],
    measure: ["एक reading, पूरी picture।", "Doctor को trend दिखेगा।", "तीस second, बस।"],
    appointment: ["Care track पर रहे।", "एक visit, मन को शांति।", "आज है।"],
    generic: ["छोटे कदम, बड़ा फ़र्क।", "आगे वाले आप thank you बोलेंगे।", "एक छोटी जीत।"],
  },
  mr: {
    water: ["थोडं पाणी, पूर्ण energy.", "Skin thank you म्हणेल.", "आता पाणी, दुपारी fresh."],
    walk: ["तासन्तास छान mood.", "आज walk, रात्री गाढ झोप.", "ताजी हवा, ताजं मन."],
    sleep: ["उद्या fresh उठा.", "आता आराम, उद्या glow.", "Recharge ची वेळ."],
    breathe: ["दोन मिनिटं, शांत मन.", "दिवसाचा stress बाहेर.", "हळू श्वास, हलकं मन."],
    fruit: ["Natural energy, crash नाही.", "Plate वर थोडा रंग.", "Fresh आणि हलकं."],
    stretch: ["दिवसभर कमी आखडलेपणा.", "शरीर मोकळं, mood भारी.", "दोन मिनिटं, मोठा आराम."],
    sun: ["ऊन आता, झोप रात्री.", "Coffee पेक्षा भारी wake-up.", "पाच मिनिटं बाहेर."],
    breakfast: ["Lunch पर्यंत energy steady.", "दिवसाची strong सुरुवात.", "सकाळचा आळस गायब."],
    caffeine: ["रात्री झोप सोपी.", "आज झोप लवकर लागेल.", "शांत संध्याकाळ."],
    move: ["Focus पुन्हा fresh.", "पाच मिनिटं उठा-चाला.", "पाठ thank you म्हणेल."],
    gratitude: ["आजची एक चांगली गोष्ट.", "दिवस चांगल्या नोटवर संपवा.", "आज काय छान झालं?"],
    stairs: ["प्रत्येक जिना, मजबूत पाय.", "छोटे चढ, मोठा फरक.", "आज lift skip."],
    medicine: ["वेळेवर, track वर.", "Regular राहणं हेच काम करतं.", "एक मिनिट, झालं."],
    measure: ["एक reading, पूर्ण picture.", "Doctor ना trend दिसेल.", "तीस second, बस."],
    appointment: ["Care track वर राहू दे.", "एक visit, मनाला शांती.", "आज आहे."],
    generic: ["छोटी पावलं, मोठा फरक.", "पुढचे तुम्ही thank you म्हणाल.", "एक छोटा विजय."],
  },
};

// Title is the task itself (what to do, at a glance) with a light tone mark; the body is one
// short "why". No name and no wrapper phrase: the phone already shows the app name.
const MARK: Record<CommunicationStyle, string> = { warm_gentle: "", fun_playful: " 👀", motivating: " 💪", simple_practical: "" };

const loc = (l: string) => (l === "hi" || l === "mr" ? l : "en") as "en" | "hi" | "mr";
/** Small stable hash so the same reminder doesn't always get the same line. */
function hash(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return Math.abs(h);
}
function pick<T>(arr: T[], seed: string): T {
  return arr[hash(seed) % arr.length];
}

/** An outcome line, skipping any in `avoid` (lines the person saw recently) when possible. */
export function outcomeLine(locale: string, benefit: Benefit, seed = "", avoid: readonly string[] = []): string {
  const lines = OUTCOME[loc(locale)][benefit];
  const start = hash(seed) % lines.length;
  for (let k = 0; k < lines.length; k++) {
    const line = lines[(start + k) % lines.length];
    if (!avoid.some((a) => a.includes(line))) return line;
  }
  return lines[start];
}

/**
 * A reminder notification: the task as the title, one short outcome line as the body, in the
 * person's tone and language. Clinical items (medicine, a doctor's plan) never get playful
 * framing or goal lines. `recent` = recent notification texts, so lines don't repeat.
 */
export function reminderCopy(opts: { locale: string; styles: readonly unknown[] | null | undefined; task: string; category?: string | null; planMode?: string | null; motivation?: string | null; seed: string; recent?: readonly string[] }): { title: string; body: string } {
  const L = loc(opts.locale);
  const benefit = benefitFor({ title: opts.task, category: opts.category, planMode: opts.planMode });
  const clinical = benefit === "medicine" || benefit === "measure" || benefit === "appointment" || opts.planMode === "clinician_instructions";
  const style = clinical ? "simple_practical" : pick(effectiveStyles(opts.styles), opts.seed);
  const task = opts.task.replace(/[{}<>\n\r]/g, " ").replace(/\s+/g, " ").trim().slice(0, 50);
  const recent = opts.recent ?? [];
  const goal = opts.motivation?.replace(/[{}<>\n\r]/g, " ").replace(/\s+/g, " ").trim().slice(0, 50);
  // About one reminder in four points back to the person's own goal, if not just shown.
  const useGoal = !clinical && !!goal && hash(`${opts.seed}:g`) % 4 === 0 && !recent.some((r) => r.includes(goal));
  const body = useGoal ? goal! : outcomeLine(L, benefit, opts.seed, recent);
  return { title: `${task}${MARK[style]}`, body };
}

// ---------------------------------------------------------------------------
// Plain, human wording for model-written text
// ---------------------------------------------------------------------------
/** Appended to every chat / check-in prompt. */
export const PLAIN_STYLE = `Write like a real person texting, not like an AI. Never use em dashes (—) or en dashes (–): use a comma or a full stop instead. Avoid stock phrases such as "journey", "I hear you", "absolutely", "it's important to", "remember,", "you've got this", "small steps lead to big changes", "feel free to".`;

/** Safety net for model output: dashes become commas (number ranges keep a hyphen). */
export function plainText(s: string): string {
  return s
    .replace(/(\d)\s*[–—]\s*(\d)/g, "$1-$2")
    .replace(/\s*[—–]\s*/g, ", ")
    .replace(/,\s*([,.!?।])/g, "$1")
    .replace(/^,\s*/, "")
    .replace(/,\s*$/, "");
}
