// Deterministic, localized replies used by the router, WhatsApp, and fallbacks.
// Hindi/Marathi strings need review by native speakers before a pilot (see USER_HANDOFF.md).
import type { Locale } from "./safety";

type Dict = Record<string, string>;

const en: Dict = {
  recorded_done: "Noted: “{title}” marked as done (your report). Thank you.",
  recorded_later: "Okay, I'll remind you about “{title}” a bit later.",
  recorded_skipped: "Noted that you skipped “{title}”. Thanks for telling me — that helps keep your history honest.",
  recorded_unable: "Noted that you're not able to do “{title}” right now. Rest matters. If you feel worse, please contact your doctor.",
  recorded_missed: "Noted that “{title}” was missed. Tomorrow is a fresh start.",
  already_recorded: "“{title}” is already recorded for this time. Nothing extra was added.",
  already_counted: "Today already counts toward “{title}”. Nothing extra was added.",
  no_open_action: "I don't see an action waiting right now. You can open Today to see your plan.",
  points: "+{points} garden points ({labels}).",
  ai_unconfigured: "The conversational assistant isn't set up yet. You can still reply: done, later, skip, or unwell — or use the Today screen.",
  ai_no_consent: "You haven't allowed AI processing, so I can only handle quick replies (done, later, skip, unwell). You can change this in Settings.",
  ai_error: "Sorry — I couldn't answer just now. Nothing was changed unless listed below. Please try again.",
  not_linked: "This WhatsApp number isn't connected to a Sukhi account. Open Sukhi → Settings → WhatsApp to get a link code.",
  link_ok: "Connected! This WhatsApp number is now linked to your Sukhi account. Reply STOP any time to stop messages.",
  link_already: "This number is already linked to your account.",
  link_invalid: "That code is invalid or has expired. Please create a new one in Sukhi → Settings → WhatsApp.",
  link_other: "This number is already linked to another account. It was not changed.",
  link_rebind: "Your account is already linked to another number. To switch, create a ‘switch number’ code in Settings.",
  link_rate: "Too many attempts. Please wait an hour and try again.",
  stopped: "You won't get WhatsApp messages from Sukhi any more. Reply START to turn them back on. The web app still works.",
  paused: "WhatsApp reminders are paused. Reply START to resume.",
  started: "WhatsApp messages are on again.",
  reminder: "Time for: {title}. Reply done, later, skip, or unwell.",
  confirm_ok: "Confirmed. The change to “{title}” is saved.",
  confirm_rejected: "Okay, the change was not made.",
  confirm_invalid: "I couldn't find a pending change with that code (it may have expired). Nothing was changed.",
  media_unsupported: "I can read text, photos and voice notes. This type of message isn't supported.",
  media_failed: "I couldn't download that file. Please try again or use the web app.",
  voice_unconfigured: "Voice notes aren't available right now. Please type your reply.",
  voice_heard: "I heard: “{text}”.",
  evidence_saved: "Photo saved for “{title}”.",
  recorded_footer: "Recorded: {items}",
};

const hi: Dict = {
  recorded_done: "नोट किया: “{title}” पूरा हुआ (आपकी जानकारी के अनुसार)। धन्यवाद।",
  recorded_later: "ठीक है, मैं थोड़ी देर बाद “{title}” की याद दिलाऊँगा।",
  recorded_skipped: "नोट किया कि आपने “{title}” छोड़ा। बताने के लिए धन्यवाद — इससे आपका रिकॉर्ड सही रहता है।",
  recorded_unable: "नोट किया कि आप अभी “{title}” नहीं कर पा रहे हैं। आराम ज़रूरी है। तबीयत बिगड़े तो कृपया डॉक्टर से संपर्क करें।",
  recorded_missed: "नोट किया कि “{title}” छूट गया। कल नई शुरुआत है।",
  already_recorded: "“{title}” इस समय के लिए पहले से दर्ज है। कुछ अतिरिक्त नहीं जोड़ा गया।",
  already_counted: "आज का दिन “{title}” में पहले से गिना जा चुका है।",
  no_open_action: "अभी कोई काम बाकी नहीं दिख रहा। अपना प्लान देखने के लिए 'आज' खोलें।",
  points: "+{points} बगीचा अंक ({labels})।",
  ai_unconfigured: "बातचीत वाला सहायक अभी सेट नहीं है। आप फिर भी जवाब दे सकते हैं: done, later, skip, या unwell — या 'आज' स्क्रीन का उपयोग करें।",
  ai_no_consent: "आपने AI प्रोसेसिंग की अनुमति नहीं दी है, इसलिए मैं केवल छोटे जवाब (done, later, skip, unwell) संभाल सकता हूँ। सेटिंग्स में इसे बदल सकते हैं।",
  ai_error: "माफ़ कीजिए — अभी जवाब नहीं दे सका। नीचे लिखे के अलावा कुछ नहीं बदला गया। कृपया फिर कोशिश करें।",
  not_linked: "यह व्हाट्सऐप नंबर किसी सुखी खाते से जुड़ा नहीं है। लिंक कोड के लिए सुखी → सेटिंग्स → व्हाट्सऐप खोलें।",
  link_ok: "जुड़ गया! यह व्हाट्सऐप नंबर अब आपके सुखी खाते से जुड़ा है। संदेश रोकने के लिए कभी भी STOP लिखें।",
  link_already: "यह नंबर पहले से आपके खाते से जुड़ा है।",
  link_invalid: "यह कोड गलत है या समाप्त हो गया है। सुखी → सेटिंग्स → व्हाट्सऐप में नया कोड बनाएँ।",
  link_other: "यह नंबर पहले से किसी दूसरे खाते से जुड़ा है। कुछ नहीं बदला गया।",
  link_rebind: "आपका खाता पहले से दूसरे नंबर से जुड़ा है। बदलने के लिए सेटिंग्स में 'नंबर बदलें' कोड बनाएँ।",
  link_rate: "बहुत ज़्यादा प्रयास। कृपया एक घंटे बाद फिर कोशिश करें।",
  stopped: "अब आपको सुखी से व्हाट्सऐप संदेश नहीं मिलेंगे। फिर से चालू करने के लिए START लिखें। वेब ऐप चलता रहेगा।",
  paused: "व्हाट्सऐप रिमाइंडर रोक दिए गए हैं। फिर शुरू करने के लिए START लिखें।",
  started: "व्हाट्सऐप संदेश फिर से चालू हैं।",
  reminder: "समय हो गया: {title}। जवाब दें: done, later, skip, या unwell।",
  confirm_ok: "पुष्टि हुई। “{title}” में बदलाव सहेजा गया।",
  confirm_rejected: "ठीक है, बदलाव नहीं किया गया।",
  confirm_invalid: "इस कोड से कोई लंबित बदलाव नहीं मिला (शायद समय समाप्त)। कुछ नहीं बदला गया।",
  media_unsupported: "मैं टेक्स्ट, फ़ोटो और वॉइस नोट पढ़ सकता हूँ। यह संदेश प्रकार समर्थित नहीं है।",
  media_failed: "फ़ाइल डाउनलोड नहीं हो सकी। कृपया फिर कोशिश करें या वेब ऐप का उपयोग करें।",
  voice_unconfigured: "अभी वॉइस नोट उपलब्ध नहीं हैं। कृपया लिखकर जवाब दें।",
  voice_heard: "मैंने सुना: “{text}”।",
  evidence_saved: "“{title}” के लिए फ़ोटो सहेजी गई।",
  recorded_footer: "दर्ज किया गया: {items}",
};

const mr: Dict = {
  recorded_done: "नोंद केली: “{title}” पूर्ण झाले (तुमच्या सांगण्यानुसार). धन्यवाद.",
  recorded_later: "ठीक आहे, मी थोड्या वेळाने “{title}” ची आठवण करून देईन.",
  recorded_skipped: "तुम्ही “{title}” वगळले याची नोंद केली. सांगितल्याबद्दल धन्यवाद — त्यामुळे तुमची नोंद खरी राहते.",
  recorded_unable: "तुम्ही आत्ता “{title}” करू शकत नाही याची नोंद केली. विश्रांती महत्त्वाची आहे. त्रास वाढल्यास कृपया डॉक्टरांशी संपर्क साधा.",
  recorded_missed: "“{title}” चुकले याची नोंद केली. उद्या नवी सुरुवात आहे.",
  already_recorded: "“{title}” या वेळेसाठी आधीच नोंदवले आहे. काहीही जास्त जोडले नाही.",
  already_counted: "आजचा दिवस “{title}” मध्ये आधीच मोजला आहे.",
  no_open_action: "आत्ता कोणतेही काम बाकी दिसत नाही. तुमची योजना पाहण्यासाठी 'आज' उघडा.",
  points: "+{points} बाग गुण ({labels}).",
  ai_unconfigured: "संवाद साधणारा सहाय्यक अजून सेट केलेला नाही. तरीही तुम्ही उत्तर देऊ शकता: done, later, skip, किंवा unwell — किंवा 'आज' स्क्रीन वापरा.",
  ai_no_consent: "तुम्ही AI प्रक्रियेला परवानगी दिलेली नाही, त्यामुळे मी फक्त छोटी उत्तरे (done, later, skip, unwell) हाताळू शकतो. सेटिंग्जमध्ये बदलू शकता.",
  ai_error: "माफ करा — आत्ता उत्तर देता आले नाही. खाली लिहिलेल्याशिवाय काहीही बदलले नाही. कृपया पुन्हा प्रयत्न करा.",
  not_linked: "हा व्हॉट्सॲप नंबर कोणत्याही सुखी खात्याशी जोडलेला नाही. लिंक कोडसाठी सुखी → सेटिंग्ज → व्हॉट्सॲप उघडा.",
  link_ok: "जोडले गेले! हा व्हॉट्सॲप नंबर आता तुमच्या सुखी खात्याशी जोडला आहे. संदेश थांबवण्यासाठी कधीही STOP लिहा.",
  link_already: "हा नंबर आधीच तुमच्या खात्याशी जोडलेला आहे.",
  link_invalid: "हा कोड चुकीचा आहे किंवा त्याची मुदत संपली आहे. सुखी → सेटिंग्ज → व्हॉट्सॲप मध्ये नवीन कोड तयार करा.",
  link_other: "हा नंबर आधीच दुसऱ्या खात्याशी जोडलेला आहे. काहीही बदलले नाही.",
  link_rebind: "तुमचे खाते आधीच दुसऱ्या नंबरशी जोडलेले आहे. बदलण्यासाठी सेटिंग्जमध्ये 'नंबर बदला' कोड तयार करा.",
  link_rate: "खूप प्रयत्न झाले. कृपया एका तासानंतर पुन्हा प्रयत्न करा.",
  stopped: "आता तुम्हाला सुखीकडून व्हॉट्सॲप संदेश येणार नाहीत. पुन्हा सुरू करण्यासाठी START लिहा. वेब ॲप चालू राहील.",
  paused: "व्हॉट्सॲप आठवणी थांबवल्या आहेत. पुन्हा सुरू करण्यासाठी START लिहा.",
  started: "व्हॉट्सॲप संदेश पुन्हा सुरू झाले.",
  reminder: "वेळ झाली: {title}. उत्तर द्या: done, later, skip, किंवा unwell.",
  confirm_ok: "पुष्टी झाली. “{title}” मधील बदल जतन केला.",
  confirm_rejected: "ठीक आहे, बदल केला नाही.",
  confirm_invalid: "या कोडने कोणताही प्रलंबित बदल सापडला नाही (कदाचित मुदत संपली). काहीही बदलले नाही.",
  media_unsupported: "मी मजकूर, फोटो आणि व्हॉइस नोट वाचू शकतो. हा संदेश प्रकार समर्थित नाही.",
  media_failed: "फाइल डाउनलोड करता आली नाही. कृपया पुन्हा प्रयत्न करा किंवा वेब ॲप वापरा.",
  voice_unconfigured: "आत्ता व्हॉइस नोट उपलब्ध नाहीत. कृपया लिहून उत्तर द्या.",
  voice_heard: "मी ऐकले: “{text}”.",
  evidence_saved: "“{title}” साठी फोटो जतन केला.",
  recorded_footer: "नोंद केली: {items}",
};

const DICTS: Record<Locale, Dict> = { en, hi, mr };

export function reply(locale: string, key: keyof typeof en, vars: Record<string, string | number> = {}): string {
  const dict = DICTS[(locale as Locale) in DICTS ? (locale as Locale) : "en"];
  const template = dict[key] ?? en[key] ?? key;
  return template.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ""));
}

export function rewardLine(locale: string, rewards: { points: number; label: string }[]): string {
  const pts = rewards.reduce((s, r) => s + r.points, 0);
  if (pts <= 0) return "";
  return reply(locale, "points", { points: pts, labels: rewards.filter((r) => r.points > 0).map((r) => r.label).join(", ") });
}
