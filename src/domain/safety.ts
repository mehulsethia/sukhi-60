// Conservative, deterministic safety screens that run BEFORE any model call.
// This is not clinical triage and not emergency monitoring. A non-match never means
// "safe" and the product never says so.

export type Locale = "en" | "hi" | "mr";

// Phrases that interrupt routine coaching. Kept intentionally broad (false positives are
// acceptable; the response only points to real help). Includes Hindi/Marathi (Devanagari)
// and common romanized forms for code-switched messages.
const CONCERN_PATTERNS: RegExp[] = [
  /chest\s*(pain|tight|pressure)/i,
  /can'?t\s*breathe|cannot\s*breathe|short(ness)?\s*of\s*breath|breathless|trouble\s*breathing/i,
  /faint(ed|ing)?|pass(ed)?\s*out|unconscious|collapsed?/i,
  /stroke|face\s*droop|slurred\s*speech|numb(ness)?\s*(in\s*)?(arm|face|leg)/i,
  /severe\s*(pain|bleeding|headache|allerg)/i,
  /bleeding\s*(a\s*lot|heavily|won'?t\s*stop)|vomit(ing)?\s*blood|blood\s*in\s*(stool|vomit|urine)/i,
  /suicid|kill\s*myself|end\s*my\s*life|self[-\s]?harm|want\s*to\s*die/i,
  /overdose|took\s*(too\s*many|double|extra)\s*(pills|tablets|doses?)/i,
  /seizure|convulsion|fits?\b/i,
  /very\s*(low|high)\s*sugar|sugar\s*(is\s*)?(very\s*)?(low|high)\s*and\s*(shaky|confused|dizzy)/i,
  /confus(ed|ion)\s*(and|suddenly)|suddenly\s*confused/i,
  // Hindi (Devanagari + romanized)
  /सीने\s*में\s*दर्द|छाती\s*में\s*दर्द|सांस\s*(नहीं|लेने\s*में)|बेहोश|खून\s*(बह|की\s*उल्टी)|आत्महत्या|मरना\s*चाहता|मरना\s*चाहती|दौरा\s*पड़/,
  /seene\s*(mein|me)\s*dard|chhati\s*(mein|me)\s*dard|saans\s*(nahi|nahin|lene\s*me)|behosh|marna\s*chahta|marna\s*chahti/i,
  // Marathi
  /छातीत\s*दुख|श्वास\s*घेता\s*येत\s*नाही|बेशुद्ध|रक्तस्त्राव|आत्महत्या|मरायचं|मरायचे/,
  /chhatit\s*dukh|shwas\s*gheta\s*yet\s*nahi|beshuddh/i,
];

export function detectConcern(text: string): boolean {
  const t = text.normalize("NFC");
  return CONCERN_PATTERNS.some((re) => re.test(t));
}

/** Prewritten escalation text. No diagnosis, no reassurance, no claim of monitoring. */
export const ESCALATION_MESSAGE: Record<Locale, string> = {
  en:
    "I'm stopping our routine check-in because what you described may need prompt medical attention. " +
    "If this feels serious or is getting worse, call your local emergency number now (112 in India) or ask someone nearby to help. " +
    "Please also contact your doctor or care team. Sukhi cannot assess symptoms and does not monitor emergencies.",
  hi:
    "मैं हमारी नियमित बातचीत यहीं रोक रहा हूँ, क्योंकि आपने जो बताया उसमें तुरंत चिकित्सा सहायता की ज़रूरत हो सकती है। " +
    "अगर यह गंभीर लगे या बढ़ रहा हो, तो अभी अपने स्थानीय आपातकालीन नंबर (भारत में 112) पर कॉल करें या पास के किसी व्यक्ति से मदद लें। " +
    "कृपया अपने डॉक्टर या देखभाल टीम से भी संपर्क करें। सुखी लक्षणों का आकलन नहीं कर सकता और आपात स्थिति की निगरानी नहीं करता।",
  mr:
    "मी आपली नेहमीची चर्चा इथे थांबवत आहे, कारण तुम्ही जे सांगितले त्यासाठी तातडीने वैद्यकीय मदतीची गरज असू शकते. " +
    "हे गंभीर वाटत असेल किंवा वाढत असेल, तर आत्ताच स्थानिक आपत्कालीन क्रमांकावर (भारतात 112) कॉल करा किंवा जवळच्या व्यक्तीची मदत घ्या. " +
    "कृपया तुमच्या डॉक्टरांशी किंवा काळजी घेणाऱ्या टीमशीही संपर्क साधा. सुखी लक्षणांचे मूल्यांकन करू शकत नाही आणि आपत्कालीन स्थितीवर लक्ष ठेवत नाही.",
};

// Requests the assistant must decline and refer to the treating professional.
const CLINICAL_REQUEST_PATTERNS: RegExp[] = [
  /(should|can|may)\s+i\s+(take|skip|stop|double|increase|decrease|change)\s+(my\s+)?(dose|medicine|medication|tablet|pill|insulin)/i,
  /(missed|forgot)\s+(a\s+|my\s+)?(dose|tablet|pill|insulin).*(take|double|make\s*up|now)/i,
  /how\s+much\s+(insulin|medicine|medication)\s+should/i,
  /what\s+(disease|condition)\s+do\s+i\s+have|diagnos(e|is)\s+me/i,
  /दवा\s*(बढ़ा|घटा|बंद|दोगुनी)|खुराक\s*(बढ़ा|घटा|दोगुनी)/,
  /औषध\s*(वाढव|कमी\s*कर|बंद)|डोस\s*(वाढव|दुप्पट)/,
];

export function isClinicalAdviceRequest(text: string): boolean {
  return CLINICAL_REQUEST_PATTERNS.some((re) => re.test(text));
}

export const CLINICAL_REFERRAL_MESSAGE: Record<Locale, string> = {
  en: "I can't advise on doses, missed-dose catch-up, or changes to treatment. Please ask your doctor or pharmacist — I can note this question so you remember to ask.",
  hi: "मैं खुराक, छूटी खुराक की भरपाई या इलाज में बदलाव पर सलाह नहीं दे सकता। कृपया अपने डॉक्टर या फार्मासिस्ट से पूछें — मैं यह सवाल नोट कर सकता हूँ ताकि आपको पूछना याद रहे।",
  mr: "मी डोस, चुकलेल्या डोसची भरपाई किंवा उपचारातील बदल यावर सल्ला देऊ शकत नाही. कृपया तुमच्या डॉक्टरांना किंवा फार्मासिस्टना विचारा — विचारायचे लक्षात राहावे म्हणून मी हा प्रश्न नोंदवू शकतो.",
};

// Untrusted content (uploads, OCR, chat, retrieved docs) that tries to issue instructions.
const INJECTION_PATTERNS: RegExp[] = [
  /ignore\s+(all\s+|any\s+)?(previous|prior|above)\s+(instructions|rules)/i,
  /disregard\s+(the\s+)?(system|previous)\s+(prompt|instructions)/i,
  /you\s+are\s+now\s+(a|an|in)\b/i,
  /system\s*prompt|developer\s*mode|jailbreak/i,
  /mark\s+(all|every|this)\s+.*\s+(as\s+)?(done|complete|verified)/i,
  /(set|change)\s+clinician_verification|clinician[_\s]verified/i,
  /call\s+the\s+tool|use\s+the\s+tool\s+\w+\s+with/i,
  /user_id\s*[:=]/i,
];

export function looksLikeInjection(text: string): boolean {
  return INJECTION_PATTERNS.some((re) => re.test(text));
}

/** Wrap untrusted text so the model sees it as quoted data, never as instructions. */
export function quoteUntrusted(label: string, text: string, max = 4000): string {
  const clipped = text.slice(0, max).replace(/<\/?untrusted[^>]*>/gi, "");
  return `<untrusted source="${label}">\n${clipped}\n</untrusted>`;
}

// WhatsApp opt-out / pause keywords (en/hi/mr, romanized).
const STOP_RE = /^\s*(stop|unsubscribe|band\s*karo|बंद\s*करो|बंद\s*करा|थांबवा|ruko|रुको)\s*[.!]*\s*$/i;
const PAUSE_RE = /^\s*(pause|पॉज़|विराम)\s*[.!]*\s*$/i;
const START_RE = /^\s*(start|resume|शुरू|सुरू)\s*[.!]*\s*$/i;

export function parseChannelCommand(text: string): "stop" | "pause" | "start" | null {
  if (STOP_RE.test(text)) return "stop";
  if (PAUSE_RE.test(text)) return "pause";
  if (START_RE.test(text)) return "start";
  return null;
}
