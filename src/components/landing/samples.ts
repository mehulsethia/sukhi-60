// Sample CONTENT for the landing page (fictional person, shown in each language at once
// so visitors can compare). UI chrome lives in messages/*.json.
export const DEMO_CARD = {
  en: { greeting: "Good evening, Asha", item: "Evening walk", detail: "20 minutes, at your own pace", time: "6:00 pm", done: "I did it", later: "Later", recorded: "Recorded. That's 5 active days this week.", points: "points", week: "This week" },
  hi: { greeting: "शुभ संध्या, आशा", item: "शाम की सैर", detail: "20 मिनट, अपनी रफ़्तार से", time: "शाम 6:00", done: "मैंने कर लिया", later: "बाद में", recorded: "दर्ज हो गया। इस हफ़्ते 5 दिन सक्रिय।", points: "अंक", week: "इस हफ़्ते" },
  mr: { greeting: "शुभ संध्याकाळ, आशा", item: "संध्याकाळचे चालणे", detail: "20 मिनिटे, तुमच्या गतीने", time: "संध्या. 6:00", done: "मी केले", later: "नंतर", recorded: "नोंद झाली. या आठवड्यात 5 दिवस सक्रिय.", points: "गुण", week: "हा आठवडा" },
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
export const DAY_LABELS = { en: ["M", "T", "W", "T", "F", "S", "S"], hi: ["सो", "मं", "बु", "गु", "शु", "श", "र"], mr: ["सो", "मं", "बु", "गु", "शु", "श", "र"] } as const;

export const WHATSAPP_SAMPLE: { from: "sukhi" | "me"; text: string; lang?: string }[] = [
  { from: "sukhi", text: "Time for: Evening walk. Reply done, later, skip, or unwell." },
  { from: "me", text: "हो गया 🙂", lang: "hi" },
  { from: "sukhi", text: "Noted: “Evening walk” marked as done (your report). Thank you. +5 points." },
  { from: "me", text: "उद्या सकाळी लवकर आठवण करशील का?", lang: "mr" },
  { from: "sukhi", text: "मी तुमच्या सकाळच्या आठवणीची वेळ बदलण्याचा प्रस्ताव तयार केला आहे. लागू करण्यासाठी CONFIRM K7P2Q लिहा.", lang: "mr" },
];
