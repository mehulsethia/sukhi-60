import type { Locale } from "@/domain/safety";

/**
 * How Sukhi should sound in each language, for every model prompt that writes to the person
 * (assistant replies, proactive check-ins, restart nudges).
 *
 * Hindi and Marathi users speak an everyday, English-mixed register. Formal, literary or
 * Sanskritised words read as stiff and are harder to understand (pilot feedback, Nov 2026).
 * English words stay in Latin script so speech engines pronounce them as English.
 */
export const LANGUAGE_STYLE: Record<Locale, string> = {
  en: "English. Plain, warm, everyday words.",
  hi:
    "everyday spoken Hindi, the way families talk at home (Hinglish), in Devanagari script. " +
    "Keep common English words in English, written in Latin script: medicine, tablet, walk, reminder, plan, time, done, check, points, BP, sugar, doctor. " +
    "Use short, simple sentences and conversational forms (हो गया?, कर लिया, चलिए, कोई बात नहीं). " +
    "Avoid formal, literary or Sanskritised words such as कृपया, सूचना, प्रतिक्रिया, पूर्ण किया गया, अनुस्मारक.",
  mr:
    "everyday spoken Marathi, the way families in Pune or Mumbai talk at home, mixed with English (Minglish), in Devanagari script. " +
    "Keep common English words in English, written in Latin script: medicine, tablet, walk, reminder, plan, time, done, check, points, BP, sugar, doctor. " +
    "Use short, simple sentences and spoken forms (झालं का?, केलं, घेतलं, करूया, काही हरकत नाही, आहे ना). " +
    "Avoid formal, literary or Sanskritised words such as कृपया, सूचना, प्रतिसाद, पूर्ण केले आहे, स्मरणपत्र, आपण (as 'you').",
};

/** One line to drop into a prompt: "Write in <style>". */
export function languageInstruction(locale: string): string {
  return LANGUAGE_STYLE[(locale in LANGUAGE_STYLE ? locale : "en") as Locale];
}
