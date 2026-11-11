// Brand lines shown in their own language regardless of the page locale (spec §3.2, §4.2).
// Each is rendered with a matching `lang` attribute. Hindi/Marathi are drafts pending native review.
export const HERO_LINES = {
  en: { text: "Your health in your own hands.", lang: "en" },
  hinglish: { text: "Aapki sehat, aapke haath mein.", lang: "hi-Latn" },
  hi: { text: "आपकी सेहत, आपके हाथ में।", lang: "hi" },
  mr: { text: "तुमची तब्येत, तुमच्या हातात.", lang: "mr" },
} as const;

/** The two "also in" lines under the H1, chosen so the page's own language isn't repeated. */
export function alsoIn(locale: string) {
  if (locale === "hi") return [HERO_LINES.en, HERO_LINES.mr];
  if (locale === "mr") return [HERO_LINES.en, HERO_LINES.hi];
  return [HERO_LINES.hinglish, HERO_LINES.mr];
}

// Sukhi's greeting (spec §5.3) in each supported language, for the language section.
export const GREETINGS = [
  { label: "English", lang: "en", text: "Namaste! I'm Sukhi. How is your day going?" },
  { label: "हिन्दी", lang: "hi", text: "नमस्ते! मैं सुखी हूँ। आपका दिन कैसा जा रहा है?" },
  { label: "मराठी", lang: "mr", text: "नमस्कार! मी सुखी. तुमचा दिवस कसा चाललाय?" },
] as const;

// Illustrative example week (not anyone's real data): done / skipped / no reply / upcoming.
export const EXAMPLE_WEEK: ("done" | "skipped" | "none" | "upcoming")[] = ["done", "done", "skipped", "done", "none", "done", "upcoming"];
