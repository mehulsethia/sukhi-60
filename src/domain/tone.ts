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
  ["caffeine", /caffeine|coffee|chai|tea|कॉफी|चाय|चहा/i],
  ["sleep", /sleep|bed|screen|wind.?down|नींद|झोप/i],
  ["breathe", /breath|meditat|pranayam|सांस|श्वास/i],
  ["fruit", /fruit|salad|vegetable|veggie|फल|फळ|सलाद/i],
  ["stretch", /stretch|yoga|योग/i],
  ["sun", /sun|daylight|धूप|ऊन/i],
  ["breakfast", /breakfast|नाश्ता|नाश्ता/i],
  ["stairs", /stair|सीढ़ी|जिना/i],
  ["move", /move break|stand up|break/i],
  ["walk", /walk|steps|jog|run|cycle|चल|टहल|फिर/i],
  ["gratitude", /good thing|gratitude|journal|diary/i],
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

const OUTCOME: Record<"en" | "hi" | "mr", Lines> = {
  en: {
    water: ["3 litres a day for a week, and your skin starts to glow.", "Hydrated now means more energy this afternoon."],
    walk: ["A 30-minute walk lifts your mood for hours.", "Walk today, sleep deeper tonight."],
    sleep: ["Sleep 8 hours tonight and wake up relaxed and clear-headed.", "Your skin repairs while you sleep. Tomorrow-you says thanks."],
    breathe: ["Two slow minutes can quiet a busy mind.", "Breathe out today's stress. You'll feel lighter."],
    fruit: ["Colour on your plate shows up as glow on your face.", "Fresh fruit means natural energy, no crash."],
    stretch: ["Ten minutes now, less stiffness all day.", "A looser body puts you in a better mood."],
    sun: ["Morning light sets your body clock for better sleep tonight.", "Five minutes of sun wakes you up better than coffee."],
    breakfast: ["A good breakfast keeps your energy steady till lunch.", "Start strong and skip the mid-morning slump."],
    caffeine: ["No caffeine now means easier sleep tonight.", "Swap the chai, and tonight's sleep comes faster."],
    move: ["A quick move break resets your focus.", "Five minutes up and about, and your back thanks you."],
    gratitude: ["Noticing one good thing makes tomorrow feel lighter.", "Ending on a good note helps you sleep calmer."],
    stairs: ["Every flight builds stamina and stronger legs.", "Small climbs add up to a fitter you."],
    medicine: ["Taking it on time keeps your recovery on track.", "Staying regular is what helps your plan work."],
    measure: ["Regular readings help your doctor see the full picture.", "One quick reading keeps you in control."],
    appointment: ["Showing up keeps your care on track.", "One visit now saves a lot of worry later."],
    generic: ["Small steps, done daily, change how you feel.", "Future you will thank you for this one."],
  },
  hi: {
    water: ["एक हफ्ता रोज़ 3 litre पानी, और skin glow करने लगती है।", "अभी पानी पिएँगे तो दोपहर में energy बनी रहेगी।"],
    walk: ["30 मिनट की walk से mood घंटों अच्छा रहता है।", "आज walk, आज रात गहरी नींद।"],
    sleep: ["आज 8 घंटे सोइए, कल fresh और relaxed उठेंगे।", "सोते वक्त skin repair होती है। कल आप ख़ुद को thank you बोलेंगे।"],
    breathe: ["दो मिनट धीमी साँसें, और मन शांत।", "आज का stress साँस के साथ बाहर। हल्का लगेगा।"],
    fruit: ["Plate पर रंग, चेहरे पर glow।", "Fresh fruit से natural energy, कोई crash नहीं।"],
    stretch: ["अभी दस मिनट, पूरे दिन कम अकड़न।", "Body ढीली, mood बढ़िया।"],
    sun: ["सुबह की धूप से रात को नींद अच्छी आती है।", "पाँच मिनट धूप, coffee से बेहतर wake-up।"],
    breakfast: ["अच्छा नाश्ता, lunch तक energy steady।", "दिन की strong शुरुआत, सुबह की सुस्ती गायब।"],
    caffeine: ["अभी caffeine नहीं, तो रात को नींद आसान।", "चाय skip करें, आज नींद जल्दी आएगी।"],
    move: ["छोटा सा move break, focus फिर से fresh।", "पाँच मिनट उठिए-चलिए, कमर thank you बोलेगी।"],
    gratitude: ["एक अच्छी बात याद करने से कल हल्का लगता है।", "दिन अच्छी बात पर ख़त्म, नींद शांत।"],
    stairs: ["हर सीढ़ी से stamina और मज़बूत पैर।", "छोटी-छोटी चढ़ाई, ज़्यादा fit आप।"],
    medicine: ["Time पर लेने से recovery track पर रहती है।", "Regular रहना ही plan को काम करने देता है।"],
    measure: ["Regular reading से doctor को पूरी picture मिलती है।", "एक quick reading, और सब control में।"],
    appointment: ["Visit पर जाना care को track पर रखता है।", "अभी एक visit, बाद में बहुत कम चिंता।"],
    generic: ["रोज़ के छोटे कदम, बड़ा फ़र्क।", "आगे वाले आप इसके लिए thank you बोलेंगे।"],
  },
  mr: {
    water: ["एक आठवडा रोज 3 litre पाणी, आणि skin glow करायला लागते.", "आता पाणी प्यायलात तर दुपारी energy टिकून राहील."],
    walk: ["30 मिनिटांच्या walk ने mood तासन्तास छान राहतो.", "आज walk, आज रात्री गाढ झोप."],
    sleep: ["आज 8 तास झोपा, उद्या fresh आणि relaxed उठाल.", "झोपेत skin repair होते. उद्या तुम्हीच thank you म्हणाल."],
    breathe: ["दोन मिनिटं हळू श्वास, आणि मन शांत.", "आजचा stress श्वासाबरोबर बाहेर. हलकं वाटेल."],
    fruit: ["Plate वर रंग, चेहऱ्यावर glow.", "Fresh fruit मुळे natural energy, crash नाही."],
    stretch: ["आता दहा मिनिटं, दिवसभर कमी आखडलेपणा.", "शरीर मोकळं, mood भारी."],
    sun: ["सकाळच्या उन्हामुळे रात्री झोप छान लागते.", "पाच मिनिटं ऊन, coffee पेक्षा भारी wake-up."],
    breakfast: ["चांगला नाश्ता, lunch पर्यंत energy steady.", "दिवसाची strong सुरुवात, सकाळचा आळस गायब."],
    caffeine: ["आता caffeine नको, म्हणजे रात्री झोप सोपी.", "चहा skip करा, आज झोप लवकर लागेल."],
    move: ["छोटा move break, focus पुन्हा fresh.", "पाच मिनिटं उठा-चाला, पाठ thank you म्हणेल."],
    gratitude: ["एक चांगली गोष्ट आठवली की उद्या हलकं वाटतं.", "दिवस चांगल्या गोष्टीवर संपवा, झोप शांत."],
    stairs: ["प्रत्येक जिन्याने stamina आणि मजबूत पाय.", "छोटे-छोटे चढ, जास्त fit तुम्ही."],
    medicine: ["वेळेवर घेतल्याने recovery track वर राहते.", "Regular राहणं हेच plan ला काम करू देतं."],
    measure: ["Regular reading मुळे doctor ना पूर्ण picture मिळते.", "एक quick reading, आणि सगळं control मध्ये."],
    appointment: ["Visit ला जाणं care ला track वर ठेवतं.", "आता एक visit, नंतर खूप कमी काळजी."],
    generic: ["रोजची छोटी पावलं, मोठा फरक.", "पुढचे तुम्ही यासाठी thank you म्हणाल."],
  },
};

type Frame = { title: string; body: string };
// {name} may be empty; {task} is the person's own label; {why} the outcome line.
const FRAMES: Record<"en" | "hi" | "mr", Record<CommunicationStyle, Frame>> = {
  en: {
    warm_gentle: { title: "A little care for you{name}", body: "{task}? {why}" },
    fun_playful: { title: "Psst{name} 👀", body: "{task} o'clock! {why}" },
    motivating: { title: "Let's go{name} 💪", body: "{task}, right now. {why}" },
    simple_practical: { title: "{task}", body: "{why}" },
  },
  hi: {
    warm_gentle: { title: "आपके लिए एक छोटा सा पल{name}", body: "{task}? {why}" },
    fun_playful: { title: "Psst{name} 👀", body: "{task} का time! {why}" },
    motivating: { title: "चलिए{name} 💪", body: "{task}, अभी। {why}" },
    simple_practical: { title: "{task}", body: "{why}" },
  },
  mr: {
    warm_gentle: { title: "तुमच्यासाठी एक छोटा क्षण{name}", body: "{task}? {why}" },
    fun_playful: { title: "Psst{name} 👀", body: "{task} चा time! {why}" },
    motivating: { title: "चला{name} 💪", body: "{task}, आत्ताच. {why}" },
    simple_practical: { title: "{task}", body: "{why}" },
  },
};

const GOAL_LINE: Record<"en" | "hi" | "mr", string> = {
  en: "One step closer to: {goal}.",
  hi: "आपके goal के एक कदम और पास: {goal}।",
  mr: "तुमच्या goal च्या एक पाऊल जवळ: {goal}.",
};

const loc = (l: string) => (l === "hi" || l === "mr" ? l : "en") as "en" | "hi" | "mr";
const fill = (s: string, v: Record<string, string>) => s.replace(/\{(\w+)\}/g, (_, k) => v[k] ?? "");
/** Small stable hash so the same reminder doesn't always get the same line. */
function pick<T>(arr: T[], seed: string): T {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return arr[Math.abs(h) % arr.length];
}

export function outcomeLine(locale: string, benefit: Benefit, seed = ""): string {
  return pick(OUTCOME[loc(locale)][benefit], seed);
}

/**
 * A reminder notification: outcome-led, in the person's tone and language.
 * Clinical items (medicine, a doctor's plan) never get playful framing or goal promises.
 */
export function reminderCopy(opts: { locale: string; styles: readonly unknown[] | null | undefined; task: string; category?: string | null; planMode?: string | null; name?: string | null; motivation?: string | null; seed: string }): { title: string; body: string } {
  const L = loc(opts.locale);
  const benefit = benefitFor({ title: opts.task, category: opts.category, planMode: opts.planMode });
  const clinical = benefit === "medicine" || benefit === "measure" || benefit === "appointment";
  const styles = effectiveStyles(opts.styles);
  let style = pick(styles, opts.seed);
  if (clinical && style === "fun_playful") style = "warm_gentle";
  const task = opts.task.replace(/[{}<>\n\r]/g, " ").replace(/\s+/g, " ").trim().slice(0, 60);
  const goal = opts.motivation?.replace(/[{}<>\n\r]/g, " ").trim().slice(0, 80);
  // Every other reminder ties back to their own goal, when they told us one.
  const useGoal = !clinical && !!goal && pick([true, false], `${opts.seed}:g`);
  const why = useGoal ? fill(GOAL_LINE[L], { goal: goal! }) : outcomeLine(L, benefit, opts.seed);
  const f = FRAMES[L][style];
  const first = opts.name?.trim().split(/\s+/)[0]?.slice(0, 30);
  const vars = { name: first ? `, ${first}` : "", task, why };
  return { title: fill(f.title, vars).slice(0, 60), body: fill(f.body, vars).slice(0, 180) };
}
