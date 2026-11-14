// Deterministic, localized replies used by the router, WhatsApp, and fallbacks.
// Hindi/Marathi use an everyday, English-mixed register; native speakers should still review them.
import type { Locale } from "./safety";

type Dict = Record<string, string>;

const en: Dict = {
  recorded_done: "Yes! “{title}” done. That's exactly how it adds up.",
  recorded_later: "Okay, I'll remind you about “{title}” a bit later.",
  recorded_skipped: "Okay, “{title}” skipped for now. Thanks for being honest with me.",
  recorded_unable: "No worries about “{title}”. Rest up. If you feel worse, please contact your doctor.",
  recorded_missed: "“{title}” slipped today, that happens. Tomorrow's a fresh start.",
  already_recorded: "“{title}” is already recorded for this time. Nothing extra was added.",
  already_counted: "Today already counts toward “{title}”. Nothing extra was added.",
  no_open_action: "I don't see an action waiting right now. You can open Today to see your plan.",
  points: "+{points} points ({labels}).",
  ai_unconfigured: "Chat isn't available yet. You can still reply done, later, skip or unwell — or use the Today screen.",
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
  reminder: "{title}? Reply done, later, skip, or unwell.",
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

// Everyday spoken Hindi mixed with English (Hinglish), same approach as Marathi below.
const hi: Dict = {
  recorded_done: "बढ़िया! “{title}” done में note कर लिया। Thank you.",
  recorded_later: "ठीक है, “{title}” के लिए थोड़ी देर बाद फिर reminder दूँगा।",
  recorded_skipped: "ओके, “{title}” आज skip किया, note कर लिया। बताया, अच्छा किया।",
  recorded_unable: "कोई बात नहीं, अभी “{title}” नहीं हो पा रहा, note कर लिया। आराम कीजिए। तबीयत बिगड़े तो doctor को ज़रूर call करें।",
  recorded_missed: "“{title}” रह गया, कोई बात नहीं। कल फिर से शुरू करेंगे।",
  already_recorded: "“{title}” पहले ही note हो चुका है। दोबारा add नहीं किया।",
  already_counted: "आज का दिन “{title}” में पहले ही count हो गया है।",
  no_open_action: "अभी कुछ बाकी नहीं है। अपना plan देखने के लिए 'आज' खोलिए।",
  points: "+{points} points ({labels})।",
  ai_unconfigured: "Chat अभी चालू नहीं हुआ है। फिर भी आप done, later, skip या unwell लिखकर reply कर सकते हैं — या 'आज' screen इस्तेमाल करें।",
  ai_no_consent: "आपने AI की permission नहीं दी है, इसलिए मैं बस done, later, skip, unwell जैसे छोटे reply समझ सकता हूँ। Settings में बदल सकते हैं।",
  ai_error: "Sorry, अभी जवाब नहीं दे पाया। नीचे लिखे के अलावा कुछ नहीं बदला। फिर से try करें।",
  not_linked: "यह WhatsApp नंबर किसी Sukhi account से जुड़ा नहीं है। Link code के लिए Sukhi → Settings → WhatsApp खोलें।",
  link_ok: "जुड़ गया! यह WhatsApp नंबर अब आपके Sukhi account से जुड़ा है। Messages बंद करने हों तो कभी भी STOP लिखें।",
  link_already: "यह नंबर पहले से आपके account से जुड़ा है।",
  link_invalid: "यह code गलत है या expire हो गया है। Sukhi → Settings → WhatsApp में नया code बनाएँ।",
  link_other: "यह नंबर किसी दूसरे account से जुड़ा है। कुछ नहीं बदला।",
  link_rebind: "आपका account पहले से दूसरे नंबर से जुड़ा है। बदलना हो तो Settings में 'नंबर बदलें' code बनाएँ।",
  link_rate: "बहुत बार try हो गया। एक घंटे बाद फिर try करें।",
  stopped: "अब Sukhi से WhatsApp messages नहीं आएँगे। फिर से चालू करने के लिए START लिखें। Web app चलता रहेगा।",
  paused: "WhatsApp reminders रोक दिए गए हैं। फिर से शुरू करने के लिए START लिखें।",
  started: "WhatsApp messages फिर से चालू हैं।",
  reminder: "{title} का time हो गया। Reply करें: done, later, skip, या unwell।",
  confirm_ok: "हो गया! “{title}” का बदलाव save कर दिया।",
  confirm_rejected: "ठीक है, कुछ नहीं बदला।",
  confirm_invalid: "इस code से कोई बदलाव नहीं मिला (शायद expire हो गया)। कुछ नहीं बदला।",
  media_unsupported: "मैं text, फ़ोटो और voice note समझ सकता हूँ। यह message type नहीं चलता।",
  media_failed: "File download नहीं हुई। फिर से try करें या web app इस्तेमाल करें।",
  voice_unconfigured: "अभी voice note नहीं चल रहा। Type करके reply करें।",
  voice_heard: "मैंने सुना: “{text}”।",
  evidence_saved: "“{title}” के लिए फ़ोटो save कर दी।",
  recorded_footer: "Note किया: {items}",
};

// Everyday spoken Marathi mixed with English (pilot feedback: formal Marathi was hard to follow).
const mr: Dict = {
  recorded_done: "छान! “{title}” done म्हणून नोंद केलं. Thank you.",
  recorded_later: "ठीक आहे, “{title}” साठी थोड्या वेळाने परत reminder देतो.",
  recorded_skipped: "ओके, “{title}” आज skip केलं, नोंद केलं. सांगितलंत ते छान केलं.",
  recorded_unable: "ठीक आहे, आत्ता “{title}” जमत नाहीये, नोंद केलं. आराम करा. त्रास वाढला तर doctor ला नक्की फोन करा.",
  recorded_missed: "“{title}” राहून गेलं, काही हरकत नाही. उद्या परत सुरुवात करूया.",
  already_recorded: "“{title}” आधीच नोंद झालंय. परत add केलं नाही.",
  already_counted: "आजचा दिवस “{title}” मध्ये आधीच count झालाय.",
  no_open_action: "आत्ता काहीच बाकी नाहीये. तुमचा plan बघायला 'आज' उघडा.",
  points: "+{points} points ({labels}).",
  ai_unconfigured: "Chat अजून सुरू झालेलं नाही. तरी तुम्ही done, later, skip किंवा unwell असं reply करू शकता — किंवा 'आज' screen वापरा.",
  ai_no_consent: "तुम्ही AI ला परवानगी दिलेली नाही, म्हणून मी फक्त done, later, skip, unwell असे छोटे reply समजू शकतो. Settings मध्ये बदलू शकता.",
  ai_error: "Sorry, आत्ता उत्तर देता आलं नाही. खाली लिहिलंय त्याशिवाय काही बदललं नाही. परत try करा.",
  not_linked: "हा WhatsApp नंबर Sukhi account ला जोडलेला नाही. Link code साठी Sukhi → Settings → WhatsApp उघडा.",
  link_ok: "जोडलं! हा WhatsApp नंबर आता तुमच्या Sukhi account ला जोडला आहे. Messages बंद करायचे असतील तर कधीही STOP लिहा.",
  link_already: "हा नंबर आधीच तुमच्या account ला जोडलेला आहे.",
  link_invalid: "हा code चुकीचा आहे किंवा expire झालाय. Sukhi → Settings → WhatsApp मध्ये नवीन code बनवा.",
  link_other: "हा नंबर दुसऱ्या account ला जोडलेला आहे. काही बदललं नाही.",
  link_rebind: "तुमचं account आधीच दुसऱ्या नंबरला जोडलंय. बदलायचा असेल तर Settings मध्ये 'नंबर बदला' code बनवा.",
  link_rate: "खूप वेळा try झालं. एक तासाने परत try करा.",
  stopped: "आता Sukhi कडून WhatsApp messages येणार नाहीत. परत सुरू करायचे असतील तर START लिहा. Web app चालू राहील.",
  paused: "WhatsApp reminders थांबवले आहेत. परत सुरू करायला START लिहा.",
  started: "WhatsApp messages परत सुरू झाले.",
  reminder: "{title} ची वेळ झाली. Reply करा: done, later, skip, किंवा unwell.",
  confirm_ok: "झालं! “{title}” मधला बदल save केला.",
  confirm_rejected: "ठीक आहे, काही बदललं नाही.",
  confirm_invalid: "या code ने कोणताही बदल सापडला नाही (कदाचित expire झाला). काही बदललं नाही.",
  media_unsupported: "मी text, फोटो आणि voice note समजू शकतो. हा message type चालत नाही.",
  media_failed: "File download झाली नाही. परत try करा किंवा web app वापरा.",
  voice_unconfigured: "आत्ता voice note चालत नाहीये. Type करून reply करा.",
  voice_heard: "मी ऐकलं: “{text}”.",
  evidence_saved: "“{title}” साठी फोटो save केला.",
  recorded_footer: "नोंद केलं: {items}",
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
