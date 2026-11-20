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
    water: ["थोड़ा पानी, दिन भर ताज़गी।", "एक गिलास, बस इतना।", "पानी पी लीजिए, मन ताज़ा रहेगा।", "घूँट-घूँट, आराम से।"],
    walk: ["थोड़ा चलिए, मन अच्छा रहेगा।", "आज की सैर, रात को अच्छी नींद।", "ताज़ी हवा, ताज़ा मन।", "हर कदम गिनती में है।"],
    sleep: ["कल सुबह ताज़गी से उठिए।", "अब आराम का समय।", "फ़ोन रखिए, आँखें बंद।", "अच्छी नींद, अच्छा कल।"],
    breathe: ["दो मिनट, शांत मन।", "धीरे साँस लीजिए, धीरे छोड़िए।", "दिन की थकान बाहर।", "थोड़ा रुकिए, साँस लीजिए।"],
    fruit: ["मीठा भी, हल्का भी।", "थाली में थोड़ा रंग।", "आसान और ताज़ा।", "एक फल, बस इतना।"],
    stretch: ["दो मिनट, शरीर खुल जाएगा।", "अकड़न कम, मन हल्का।", "धीरे-धीरे, आराम से।", "कमर को थोड़ा आराम।"],
    sun: ["थोड़ी धूप, रात को अच्छी नींद।", "पाँच मिनट बाहर।", "सुबह की धूप, अच्छी शुरुआत।", "थोड़ी रोशनी, थोड़ी ताज़गी।"],
    breakfast: ["दोपहर तक ताक़त बनी रहेगी।", "दिन की अच्छी शुरुआत।", "पहले नाश्ता, फिर काम।", "सुबह की सुस्ती दूर।"],
    caffeine: ["आज रात नींद आसान।", "शाम शांत रहेगी।", "आज कुछ और पी लीजिए।", "नींद जल्दी आएगी।"],
    move: ["पाँच मिनट उठिए, थोड़ा चलिए।", "थोड़ा हिलिए-डुलिए।", "कमर को थोड़ा आराम।", "फिर से ध्यान लगेगा।"],
    gratitude: ["आज की एक अच्छी बात।", "आज क्या अच्छा हुआ?", "दिन अच्छे से ख़त्म करें।", "मन हल्का, नींद अच्छी।"],
    stairs: ["आज लिफ़्ट नहीं, सीढ़ियाँ।", "धीरे-धीरे, एक-एक सीढ़ी।", "छोटी चढ़ाई, बड़ा फ़र्क।", "पैरों में ताक़त।"],
    medicine: ["समय पर लेना ही सबसे ज़रूरी।", "रोज़ इसी समय, बस।", "एक मिनट का काम।", "डॉक्टर ने जैसा कहा, वैसा।"],
    measure: ["एक reading, पूरी तस्वीर।", "डॉक्टर को बदलाव दिखेगा।", "बस तीस सेकंड।", "रोज़ की reading, साफ़ तस्वीर।"],
    appointment: ["आज मिलना है, याद है न?", "इलाज सही रास्ते पर रहे।", "अपने सवाल लिख लीजिए।", "आज ही है।"],
    generic: ["छोटे कदम, बड़ा फ़र्क।", "आज का एक छोटा काम।", "बस एक मिनट।", "थोड़ा-थोड़ा, रोज़।"],
  },
  mr: {
    water: ["थोडं पाणी, दिवसभर ताजेपणा.", "एक ग्लास, बस इतकंच.", "पाणी प्या, मन ताजं राहील.", "घोट घोट, आरामात."],
    walk: ["थोडं चाला, मन छान राहील.", "आजचं चालणं, रात्री छान झोप.", "ताजी हवा, ताजं मन.", "प्रत्येक पाऊल महत्त्वाचं."],
    sleep: ["उद्या सकाळी ताजेतवाने उठा.", "आता आरामाची वेळ.", "फोन बाजूला, डोळे बंद.", "छान झोप, छान उद्या."],
    breathe: ["दोन मिनिटं, शांत मन.", "हळू श्वास घ्या, हळू सोडा.", "दिवसाचा थकवा बाहेर.", "थोडं थांबा, श्वास घ्या."],
    fruit: ["गोड पण हलकं.", "ताटात थोडा रंग.", "सोपं आणि ताजं.", "एक फळ, बस इतकंच."],
    stretch: ["दोन मिनिटं, शरीर मोकळं.", "आखडलेपणा कमी, मन हलकं.", "हळूहळू, आरामात.", "पाठीला थोडा आराम."],
    sun: ["थोडं ऊन, रात्री छान झोप.", "पाच मिनिटं बाहेर.", "सकाळचं ऊन, छान सुरुवात.", "थोडा उजेड, थोडा ताजेपणा."],
    breakfast: ["दुपारपर्यंत ताकद टिकेल.", "दिवसाची छान सुरुवात.", "आधी नाश्ता, मग काम.", "सकाळचा आळस दूर."],
    caffeine: ["आज रात्री झोप सोपी.", "संध्याकाळ शांत राहील.", "आज काहीतरी दुसरं प्या.", "झोप लवकर लागेल."],
    move: ["पाच मिनिटं उठा, थोडं चाला.", "थोडी हालचाल करा.", "पाठीला थोडा आराम.", "पुन्हा लक्ष लागेल."],
    gratitude: ["आजची एक चांगली गोष्ट.", "आज काय छान झालं?", "दिवस छान संपवा.", "मन हलकं, झोप छान."],
    stairs: ["आज लिफ्ट नको, जिना.", "हळूहळू, एकेक पायरी.", "छोटा चढ, मोठा फरक.", "पायांना ताकद."],
    medicine: ["वेळेवर घेणं सगळ्यात महत्त्वाचं.", "रोज याच वेळी, बस.", "एका मिनिटाचं काम.", "डॉक्टरांनी सांगितलं तसं."],
    measure: ["एक reading, पूर्ण चित्र.", "डॉक्टरांना बदल दिसेल.", "फक्त तीस सेकंद.", "रोजची reading, स्पष्ट चित्र."],
    appointment: ["आज भेट आहे, लक्षात आहे ना?", "उपचार योग्य मार्गावर राहू दे.", "तुमचे प्रश्न लिहून ठेवा.", "आजच आहे."],
    generic: ["छोटी पावलं, मोठा फरक.", "आजचं एक छोटं काम.", "बस एक मिनिट.", "थोडं थोडं, रोज."],
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
