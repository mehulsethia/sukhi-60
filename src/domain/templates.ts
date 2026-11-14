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
