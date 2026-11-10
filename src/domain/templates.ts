// Fictional example routines offered at onboarding. They are PERSONAL wellbeing goals,
// never prescriptions, and contain no condition-specific treatment content.
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

export const TEMPLATES: Record<"walk" | "water" | "stretch", { titleKey: string; plan: string; items: TemplateItem[] }> = {
  walk: {
    titleKey: "templates.walk",
    plan: "Gentle daily walk",
    items: [{ title: "Evening walk", instructions: "A comfortable walk, at your own pace.", category: "activity", schedule_kind: "daily", times: ["18:00"], weekdays: [], weekly_target: null, evidence_hint: "any" }],
  },
  water: {
    titleKey: "templates.water",
    plan: "Water through the day",
    items: [{ title: "Glass of water", instructions: "One glass of water.", category: "nutrition", schedule_kind: "daily", times: ["10:00", "13:00", "16:00"], weekdays: [], weekly_target: null, evidence_hint: "none" }],
  },
  stretch: {
    titleKey: "templates.stretch",
    plan: "Stretching",
    items: [{ title: "Light stretches", instructions: "Ten minutes of gentle stretches you are comfortable with.", category: "activity", schedule_kind: "weekly_target", times: [], weekdays: [], weekly_target: 3, evidence_hint: "text" }],
  },
};
