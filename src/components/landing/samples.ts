// Sample CONTENT for the landing page (fictional person, shown in each language at once
// so visitors can compare). UI chrome lives in messages/*.json.
export const DEMO_CARD = {
  en: { greeting: "Good evening, Asha", item: "Evening walk", detail: "20 minutes, at your own pace", time: "6:00 pm", done: "I did it", later: "Later", recorded: "Noted. Your garden grew a little.", points: "garden points" },
  hi: { greeting: "शुभ संध्या, आशा", item: "शाम की सैर", detail: "20 मिनट, अपनी रफ़्तार से", time: "शाम 6:00", done: "मैंने कर लिया", later: "बाद में", recorded: "नोट कर लिया। आपका बगीचा थोड़ा बढ़ा।", points: "बगीचा अंक" },
  mr: { greeting: "शुभ संध्याकाळ, आशा", item: "संध्याकाळचे चालणे", detail: "20 मिनिटे, तुमच्या गतीने", time: "संध्या. 6:00", done: "मी केले", later: "नंतर", recorded: "नोंद केली. तुमची बाग थोडी वाढली.", points: "बाग गुण" },
} as const;

export const CHAT_SAMPLE = {
  user: "मैंने आज शाम 20 मिनट टहल लिया",
  reply: "Wonderful, Asha! I've noted your evening walk for today.",
  source: "Evening walk · 6:00 pm",
};

export const ASSESSMENT_SAMPLE = {
  outcome: "Partly supports this action",
  observed: ["A park path", "Walking shoes"],
  cannot: ["How long or how far the walk lasted"],
};

export const WEEK_SAMPLE = [2, 3, 1, 3, 0, 2, 3]; // check-ins answered per day (fictional)
