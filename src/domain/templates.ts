// Ready-made goal packs: one tap and the plan exists. They are PERSONAL wellbeing goals,
// never prescriptions, and contain no condition-specific treatment content.
// Each pack carries a motivation line, so reminders can talk about the outcome (the "why")
// instead of just naming the task.
export interface TemplateItem {
  title: string;
  instructions: string;
  category: "activity" | "nutrition" | "rest" | "other";
  schedule_kind: "daily" | "weekdays" | "weekly_target";
  times: string[];
  weekdays: number[];
  weekly_target: number | null;
  evidence_hint: "none" | "photo" | "text" | "any";
}

export const PACK_KEYS = ["glow", "sleep", "active", "calm", "energy", "water", "walk", "stretch"] as const;
export type PackKey = (typeof PACK_KEYS)[number];
/** Packs shown first (onboarding and the Plan tab). The rest stay addable. */
export const FEATURED_PACKS: PackKey[] = ["glow", "sleep", "active", "calm", "energy"];

export interface Pack {
  plan: string;
  /** Saved as the person's motivation when they have none yet (English; the assistant translates). */
  motivation: string;
  items: TemplateItem[];
}

const item = (title: string, instructions: string, category: TemplateItem["category"], times: string[], extra: Partial<TemplateItem> = {}): TemplateItem => ({
  title, instructions, category, schedule_kind: "daily", times, weekdays: [], weekly_target: null, evidence_hint: "none", ...extra,
});

export const TEMPLATES: Record<PackKey, Pack> = {
  glow: {
    plan: "Glow-up skin",
    motivation: "Clearer, glowing skin",
    items: [
      item("Glass of water", "One big glass. About 3 litres across the day.", "nutrition", ["09:00", "11:30", "14:00", "16:30", "19:00"]),
      item("Fruit or salad", "One bowl of fruit or salad with a meal.", "nutrition", ["13:30"]),
      item("Screens off, sleep by 11", "Put the phone away and wind down.", "rest", ["22:30"]),
    ],
  },
  sleep: {
    plan: "Sleep better",
    motivation: "Waking up fresh and rested",
    items: [
      item("No caffeine after 3 pm", "Switch to water or herbal tea.", "nutrition", ["15:00"]),
      item("Wind-down, screens away", "Dim the lights. Phone on the charger, away from the bed.", "rest", ["22:00"]),
      item("Morning sunlight", "Five minutes of daylight soon after waking.", "activity", ["07:30"]),
    ],
  },
  active: {
    plan: "Stay active",
    motivation: "Feeling lighter and stronger",
    items: [
      item("30-minute walk", "At a comfortable pace.", "activity", ["18:00"], { evidence_hint: "any" }),
      item("Take the stairs", "Any time today, skip the lift once.", "activity", [], { schedule_kind: "weekly_target", weekly_target: 5 }),
    ],
  },
  calm: {
    plan: "Calm mind",
    motivation: "Feeling calm and less stressed",
    items: [
      item("2 minutes of slow breathing", "Breathe in for 4, out for 6.", "rest", ["08:30", "21:30"]),
      item("One good thing today", "Note one thing that went well.", "other", ["21:00"], { evidence_hint: "text" }),
    ],
  },
  energy: {
    plan: "All-day energy",
    motivation: "Steady energy through the day",
    items: [
      item("Breakfast within an hour of waking", "Something with protein.", "nutrition", ["08:30"]),
      item("Glass of water", "One big glass.", "nutrition", ["10:00", "13:00", "16:00"]),
      item("5-minute move break", "Stand up, walk around, look away from the screen.", "activity", ["15:30"]),
    ],
  },
  water: {
    plan: "Water through the day",
    motivation: "Staying fresh and hydrated",
    items: [item("Glass of water", "One glass of water.", "nutrition", ["10:00", "13:00", "16:00"])],
  },
  walk: {
    plan: "Gentle daily walk",
    motivation: "Feeling lighter and more active",
    items: [item("Evening walk", "A comfortable walk, at your own pace.", "activity", ["18:00"], { evidence_hint: "any" })],
  },
  stretch: {
    plan: "Stretching",
    motivation: "Feeling loose and less stiff",
    items: [item("Light stretches", "Ten minutes of gentle stretches you are comfortable with.", "activity", [], { schedule_kind: "weekly_target", weekly_target: 3, evidence_hint: "text" })],
  },
};

export function isPackKey(v: unknown): v is PackKey {
  return typeof v === "string" && (PACK_KEYS as readonly string[]).includes(v);
}

// ---------------------------------------------------------------------------
// Hindi and Marathi packs: plan names, tasks and the "why", saved in the person's language.
// Item order matches the English pack; times and schedules come from it.
// ---------------------------------------------------------------------------
type Words = { plan: string; motivation: string; items: [title: string, instructions: string][] };
const LOCAL: Record<"hi" | "mr", Record<PackKey, Words>> = {
  hi: {
    glow: { plan: "चमकती त्वचा", motivation: "साफ़, चमकती त्वचा", items: [["एक गिलास पानी", "एक बड़ा गिलास। दिन भर में लगभग 3 लीटर।"], ["फल या सलाद", "खाने के साथ एक कटोरी फल या सलाद।"], ["स्क्रीन बंद, 11 बजे तक सोना", "फ़ोन रख दें और आराम करें।"]] },
    sleep: { plan: "अच्छी नींद", motivation: "सुबह तरोताज़ा उठना", items: [["3 बजे के बाद चाय-कॉफ़ी नहीं", "पानी या हर्बल चाय लें।"], ["सोने की तैयारी, फ़ोन दूर", "रोशनी धीमी करें। फ़ोन चार्जर पर, बिस्तर से दूर।"], ["सुबह की धूप", "उठने के बाद पाँच मिनट धूप लें।"]] },
    active: { plan: "एक्टिव रहें", motivation: "हल्का और मज़बूत महसूस करना", items: [["30 मिनट की सैर", "आराम से, अपनी रफ़्तार में।"], ["सीढ़ियाँ चढ़ें", "आज एक बार लिफ़्ट छोड़ें।"]] },
    calm: { plan: "शांत मन", motivation: "शांत मन, कम तनाव", items: [["2 मिनट धीमी साँस", "4 गिनकर साँस लें, 6 गिनकर छोड़ें।"], ["आज की एक अच्छी बात", "आज जो अच्छा हुआ, वो एक बात लिखें।"]] },
    energy: { plan: "दिन भर एनर्जी", motivation: "दिन भर बनी रहने वाली एनर्जी", items: [["उठने के एक घंटे में नाश्ता", "कुछ प्रोटीन वाला।"], ["एक गिलास पानी", "एक बड़ा गिलास।"], ["5 मिनट का ब्रेक", "उठें, थोड़ा घूमें, स्क्रीन से नज़र हटाएँ।"]] },
    water: { plan: "दिन भर पानी", motivation: "तरोताज़ा रहना", items: [["एक गिलास पानी", "एक गिलास पानी पिएँ।"]] },
    walk: { plan: "रोज़ हल्की सैर", motivation: "हल्का और एक्टिव महसूस करना", items: [["शाम की सैर", "आराम से, अपनी रफ़्तार में।"]] },
    stretch: { plan: "स्ट्रेचिंग", motivation: "ढीला, कम अकड़ा शरीर", items: [["हल्की स्ट्रेचिंग", "दस मिनट हल्की स्ट्रेचिंग, जितना आराम से हो सके।"]] },
  },
  mr: {
    glow: { plan: "चमकदार त्वचा", motivation: "स्वच्छ, चमकदार त्वचा", items: [["एक ग्लास पाणी", "एक मोठा ग्लास. दिवसभरात सुमारे 3 लिटर."], ["फळं किंवा सॅलड", "जेवणासोबत एक वाटी फळं किंवा सॅलड."], ["स्क्रीन बंद, 11 पर्यंत झोप", "फोन बाजूला ठेवा आणि आराम करा."]] },
    sleep: { plan: "चांगली झोप", motivation: "सकाळी ताजंतवानं उठणं", items: [["दुपारी 3 नंतर चहा-कॉफी नको", "पाणी किंवा हर्बल चहा घ्या."], ["झोपेची तयारी, फोन दूर", "दिवे मंद करा. फोन चार्जरवर, बेडपासून दूर."], ["सकाळचं ऊन", "उठल्यावर पाच मिनिटं ऊन घ्या."]] },
    active: { plan: "सक्रिय राहा", motivation: "हलकं आणि मजबूत वाटणं", items: [["30 मिनिटं चालणं", "आरामात, तुमच्या गतीने."], ["जिन्याने जा", "आज एकदा लिफ्ट टाळा."]] },
    calm: { plan: "शांत मन", motivation: "शांत मन, कमी ताण", items: [["2 मिनिटं हळू श्वास", "4 मोजत श्वास घ्या, 6 मोजत सोडा."], ["आजची एक चांगली गोष्ट", "आज चांगलं घडलेलं एक लिहा."]] },
    energy: { plan: "दिवसभर उत्साह", motivation: "दिवसभर टिकणारा उत्साह", items: [["उठल्यावर तासाभरात नाश्ता", "प्रोटीन असलेलं काहीतरी."], ["एक ग्लास पाणी", "एक मोठा ग्लास."], ["5 मिनिटांचा ब्रेक", "उठा, थोडं फिरा, स्क्रीनपासून नजर हटवा."]] },
    water: { plan: "दिवसभर पाणी", motivation: "ताजंतवानं राहणं", items: [["एक ग्लास पाणी", "एक ग्लास पाणी प्या."]] },
    walk: { plan: "रोज थोडं चालणं", motivation: "हलकं आणि सक्रिय वाटणं", items: [["संध्याकाळी चालणं", "आरामात, तुमच्या गतीने चाला."]] },
    stretch: { plan: "स्ट्रेचिंग", motivation: "मोकळं, कमी आखडलेलं शरीर", items: [["हलकं स्ट्रेचिंग", "तुम्हाला जमेल तसं दहा मिनिटं हलकं स्ट्रेचिंग."]] },
  },
};

/** A pack in the person's language (English when the language has no translation). */
export function packFor(key: PackKey, locale: string | null | undefined): Pack {
  const base = TEMPLATES[key];
  const w = locale === "hi" || locale === "mr" ? LOCAL[locale][key] : null;
  if (!w) return base;
  return { plan: w.plan, motivation: w.motivation, items: base.items.map((it, i) => ({ ...it, title: w.items[i]?.[0] ?? it.title, instructions: w.items[i]?.[1] ?? it.instructions })) };
}

/** Plan names of a pack in every language (to spot a pack that's already been added). */
export function packPlanNames(key: PackKey): string[] {
  return [TEMPLATES[key].plan, LOCAL.hi[key].plan, LOCAL.mr[key].plan];
}

/** The packs' "why", joined, in the person's language: saved as their goal if they have none. */
export function packMotivation(keys: readonly PackKey[], locale: string | null | undefined): string {
  const joiner = locale === "hi" ? " और " : locale === "mr" ? " आणि " : " & ";
  return keys.map((k, i) => {
    const m = packFor(k, locale).motivation;
    return i && joiner === " & " ? m.charAt(0).toLowerCase() + m.slice(1) : m;
  }).join(joiner).slice(0, 280);
}
