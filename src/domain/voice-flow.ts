// The "Talk to Sukhi" conversation: what Sukhi says back, and when it asks before saving.
// Storage is passed in (`VoiceStore`), so the same flow runs against the real database on the
// server and against local state in the keyless demo.
import { CLINICAL_REFERRAL_MESSAGE, type Locale } from "./safety";
import type { BarrierCode } from "./behaviour";
import { parseVoiceCommand, pickFromChoices, type VoicePending, type VoiceReply, type VoiceTask } from "./voice-intents";
import { time12 } from "./wa-ui";

const COPY = {
  en: {
    greeting: "Hi! What would you like to do?",
    confirm_done: "{title}, done at {time}. Is that right?",
    confirm_skip: "{title}, not done today{because}. Shall I note that?",
    saved_done: "Done ✓",
    saved_skip: "Noted. No guilt, it happens.",
    next: "Next: {title} at {time}.",
    later_ok: "Okay, I'll remind you about {title} in an hour.",
    choose: "Which one: {list}?",
    which_task: "Which task do you mean? You can say its name.",
    nothing_open: "Nothing is waiting right now.",
    remaining: "Still to do today: {list}.",
    all_done: "Everything for today is done. Well done!",
    open_page: "Opening {page}.",
    photo: "Opening the camera for {title}.",
    add_confirm: "{title}, every day at {time}. Shall I add it?",
    add_need_time: "At what time should I remind you? For example, “10 pm”.",
    add_need_title: "What should I remind you about?",
    add_medicine: "Medicines come from your doctor's plan, so I can't add them by voice. Add a photo of the prescription in My plan.",
    added: "Added. I'll remind you every day at {time}.",
    cancelled: "Okay, I didn't save anything.",
    not_understood: "Sorry, I didn't catch that. You can say “I took my tablet”, “I couldn't walk today” or “what's left today?”",
    not_heard: "I couldn't hear that clearly. Please say it again.",
    bye: "Okay. Tap the mic whenever you need me.",
    proof_needed: "{doctor} asked for a photo for this one. Opening the camera.",
    your_doctor: "Your doctor",
    not_yet: "{title} isn't due yet. I'll remind you at {time}.",
    failed: "Sorry, that didn't save. Please try again or tap it on the screen.",
    yes: "Yes", no: "No",
    because: { physical_discomfort: " because of pain", forgot: " because you forgot", busy: " because you were busy", low_motivation: " because you didn't feel like it", routine_disrupted: " because the day changed", too_difficult: " because it felt too hard" } as Partial<Record<BarrierCode, string>>,
  },
  hi: {
    greeting: "नमस्ते! बताइए, क्या करना है?",
    confirm_done: "{title}, {time} पर हो गया। सही है?",
    confirm_skip: "{title} आज{because} नहीं हुआ। नोट कर दूँ?",
    saved_done: "हो गया ✓",
    saved_skip: "नोट कर लिया। कोई बात नहीं, ऐसा होता है।",
    next: "अगला: {title}, {time}।",
    later_ok: "ठीक है, {title} के लिए एक घंटे बाद याद दिलाऊँगा।",
    choose: "कौन सा: {list}?",
    which_task: "कौन सा काम? उसका नाम बोलिए।",
    nothing_open: "अभी कुछ बाकी नहीं है।",
    remaining: "आज बाकी: {list}।",
    all_done: "आज का सब हो गया। बहुत बढ़िया!",
    open_page: "{page} खोल रहा हूँ।",
    photo: "{title} की फ़ोटो के लिए कैमरा खोल रहा हूँ।",
    add_confirm: "{title}, रोज़ {time}। जोड़ दूँ?",
    add_need_time: "किस समय याद दिलाऊँ? जैसे, “रात 10 बजे”।",
    add_need_title: "किस चीज़ की याद दिलाऊँ?",
    add_medicine: "दवाइयाँ आपके डॉक्टर के प्लान से आती हैं, इसलिए मैं उन्हें बोलकर नहीं जोड़ सकता। My plan में पर्ची की फ़ोटो डालिए।",
    added: "जोड़ दिया। रोज़ {time} पर याद दिलाऊँगा।",
    cancelled: "ठीक है, कुछ सेव नहीं किया।",
    not_understood: "माफ़ कीजिए, समझ नहीं आया। आप बोल सकते हैं “टैबलेट ले ली”, “आज walk नहीं हुआ” या “आज क्या बाकी है?”",
    not_heard: "आवाज़ साफ़ नहीं आई। फिर से बोलिए।",
    bye: "ठीक है। जब चाहें माइक दबाइए।",
    proof_needed: "{doctor} ने इसके लिए फ़ोटो माँगी है। कैमरा खोल रहा हूँ।",
    your_doctor: "आपके डॉक्टर",
    not_yet: "{title} का समय अभी नहीं हुआ। {time} पर याद दिलाऊँगा।",
    failed: "माफ़ कीजिए, सेव नहीं हुआ। फिर से कोशिश करें या स्क्रीन पर दबाएँ।",
    yes: "हाँ", no: "नहीं",
    because: { physical_discomfort: " दर्द की वजह से", forgot: " भूल जाने की वजह से", busy: " व्यस्त होने की वजह से", low_motivation: " मन न होने की वजह से", routine_disrupted: " दिन बदलने की वजह से", too_difficult: " मुश्किल लगने की वजह से" } as Partial<Record<BarrierCode, string>>,
  },
  mr: {
    greeting: "नमस्कार! काय करायचं ते सांगा.",
    confirm_done: "{title}, {time} ला झालं. बरोबर?",
    confirm_skip: "{title} आज{because} झालं नाही. नोंद करू?",
    saved_done: "झालं ✓",
    saved_skip: "नोंद केली. काही हरकत नाही, असं होतं.",
    next: "पुढे: {title}, {time}.",
    later_ok: "ठीक आहे, {title} साठी एका तासाने आठवण करून देतो.",
    choose: "कोणतं: {list}?",
    which_task: "कोणतं काम? त्याचं नाव सांगा.",
    nothing_open: "आत्ता काही बाकी नाही.",
    remaining: "आज बाकी: {list}.",
    all_done: "आजचं सगळं झालं. छान!",
    open_page: "{page} उघडतो.",
    photo: "{title} च्या फोटोसाठी कॅमेरा उघडतो.",
    add_confirm: "{title}, रोज {time}. जोडू?",
    add_need_time: "किती वाजता आठवण करू? उदा. “रात्री 10 वाजता”.",
    add_need_title: "कशाची आठवण करू?",
    add_medicine: "औषधं तुमच्या डॉक्टरांच्या प्लानमधून येतात, म्हणून मी ती बोलून जोडू शकत नाही. My plan मध्ये चिठ्ठीचा फोटो टाका.",
    added: "जोडलं. रोज {time} ला आठवण करून देतो.",
    cancelled: "ठीक आहे, काही सेव्ह केलं नाही.",
    not_understood: "माफ करा, समजलं नाही. तुम्ही म्हणू शकता “गोळी घेतली”, “आज चालणं झालं नाही” किंवा “आज काय बाकी आहे?”",
    not_heard: "आवाज स्पष्ट आला नाही. पुन्हा बोला.",
    bye: "ठीक आहे. गरज लागेल तेव्हा माईक दाबा.",
    proof_needed: "{doctor} नी यासाठी फोटो मागितला आहे. कॅमेरा उघडतो.",
    your_doctor: "तुमच्या डॉक्टर",
    not_yet: "{title} ची वेळ अजून झाली नाही. {time} ला आठवण करून देतो.",
    failed: "माफ करा, सेव्ह झालं नाही. पुन्हा प्रयत्न करा किंवा स्क्रीनवर दाबा.",
    yes: "हो", no: "नाही",
    because: { physical_discomfort: " दुखण्यामुळे", forgot: " विसरल्यामुळे", busy: " कामामुळे", low_motivation: " मन नसल्यामुळे", routine_disrupted: " दिवस बदलल्यामुळे", too_difficult: " अवघड वाटल्यामुळे" } as Partial<Record<BarrierCode, string>>,
  },
};
type Key = Exclude<keyof typeof COPY.en, "because">;

export const voiceLocale = (l: string | null | undefined): Locale => (l === "hi" || l === "mr" ? l : "en");
export function vt(locale: string | null | undefined, key: Key, vars: Record<string, string> = {}): string {
  const s = COPY[voiceLocale(locale)][key] as string;
  return s.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? "");
}

/** A task the flow can act on, plus what it needs to say about it. */
export interface FlowTask extends VoiceTask { open: boolean; time?: string | null }

export type SaveResult = { ok: true; message?: string; next?: FlowTask | null } | { ok: false; error: "proof_required"; doctor?: string } | { ok: false; error: "not_yet_due" | "failed" };

/** Where the flow reads and writes. The server version hits the database; the demo keeps state. */
export interface VoiceStore {
  locale: string;
  nowTime: string; // "8:10 am" in the person's time zone
  tasks: () => Promise<FlowTask[]>;
  checkIn: (taskId: string, status: "done" | "skipped" | "later", reason?: BarrierCode, note?: string) => Promise<SaveResult>;
  addTask?: (title: string, time: string, category: Extract<VoicePending, { kind: "add_task" }>["category"]) => Promise<boolean>;
  /** Free conversation when nothing matched (the AI buddy). Optional: absent without an AI key. */
  converse?: (text: string) => Promise<string | null>;
  photoPath: (taskId: string) => string;
}

const yesNo = (l: string) => [{ label: vt(l, "yes"), text: vt(l, "yes") }, { label: vt(l, "no"), text: vt(l, "no") }];
const listOf = (tasks: { title: string }[], l: string) => tasks.slice(0, 5).map((t) => t.title).join(l === "en" ? ", " : ", ");

function readBack(l: string, p: VoicePending, nowTime: string): VoiceReply {
  if (p.kind === "checkin") {
    const because = p.status === "skipped" && p.reason ? COPY[voiceLocale(l)].because[p.reason] ?? "" : "";
    const say = p.status === "done" ? vt(l, "confirm_done", { title: p.title, time: nowTime }) : vt(l, "confirm_skip", { title: p.title, because });
    return { say, pending: p, choices: yesNo(l) };
  }
  if (p.kind === "add_task") return { say: vt(l, "add_confirm", { title: p.title, time: time12(p.time) }), pending: p, choices: yesNo(l) };
  return { say: vt(l, "choose", { list: listOf(p.candidates, l) }), pending: p, choices: p.candidates.slice(0, 4).map((c) => ({ label: c.title, text: c.title })) };
}

/** One turn of the conversation. `pending` is what Sukhi last asked about, if anything. */
export async function respond(text: string, pending: VoicePending | null, store: VoiceStore): Promise<VoiceReply> {
  const l = store.locale;
  const all = await store.tasks();
  const open = all.filter((t) => t.open);
  const intent = parseVoiceCommand(text, open.length ? open : all);

  if (intent.kind === "medical") return { say: CLINICAL_REFERRAL_MESSAGE[voiceLocale(l)] };
  if (intent.kind === "stop") return { say: vt(l, "bye"), end: true };

  // Answering a question Sukhi asked.
  if (pending) {
    if (pending.kind === "choose") {
      const id = pickFromChoices(text, pending.candidates);
      if (id) {
        const task = pending.candidates.find((c) => c.id === id)!;
        return act(pending.action, { id: task.id, title: task.title }, store, pending.reason, pending.note);
      }
      if (intent.kind === "no") return { say: vt(l, "cancelled") };
      return readBack(l, pending, store.nowTime);
    }
    if (intent.kind === "yes") return save(pending, store);
    if (intent.kind === "no") return { say: vt(l, "cancelled") };
    // Anything else: treat it as a new request (the read-back is dropped, nothing was saved).
  }

  switch (intent.kind) {
    case "yes":
    case "no":
      return { say: vt(l, "greeting") };
    case "navigate":
      return { say: vt(l, "open_page", { page: intent.label }), navigate: intent.path };
    case "remaining": {
      if (!open.length) return { say: all.length ? vt(l, "all_done") : vt(l, "nothing_open") };
      return { say: vt(l, "remaining", { list: open.slice(0, 5).map((t) => (t.time ? `${t.title} (${time12(t.time)})` : t.title)).join(", ") }) };
    }
    case "add_task": {
      if (intent.medicine) return { say: vt(l, "add_medicine"), navigate: "/plan" };
      if (!intent.title) return { say: vt(l, "add_need_title") };
      if (!intent.time) return { say: vt(l, "add_need_time") };
      if (!store.addTask) return { say: vt(l, "not_understood") };
      return readBack(l, { kind: "add_task", title: intent.title, time: intent.time, category: intent.category }, store.nowTime);
    }
    case "photo":
    case "later":
    case "done":
    case "skipped": {
      const action = intent.kind;
      const pool = open.length ? open : all;
      const { taskId, candidates, mentioned } = intent.match;
      const reason = intent.kind === "skipped" ? intent.reason : undefined;
      const note = intent.kind === "skipped" ? intent.note : undefined;
      if (taskId) {
        const task = pool.find((t) => t.id === taskId)!;
        return act(action, task, store, reason, note);
      }
      if (candidates.length > 1) return readBack(l, { kind: "choose", action, candidates: candidates.map((c) => ({ id: c.id, title: c.title })), reason, note }, store.nowTime);
      // No task named: the one that is due now, if there is exactly one obvious choice.
      if (!mentioned && open.length === 1) return act(action, open[0], store, reason, note);
      if (!open.length) return { say: vt(l, "nothing_open") };
      return readBack(l, { kind: "choose", action, candidates: open.slice(0, 4).map((c) => ({ id: c.id, title: c.title })), reason, note }, store.nowTime);
    }
    case "unknown": {
      const reply = store.converse ? await store.converse(text).catch(() => null) : null;
      return { say: reply ?? vt(l, "not_understood") };
    }
  }
}

/** Decide what to do with one named task: snooze and photo act at once, the rest read back first. */
async function act(action: "done" | "skipped" | "later" | "photo", task: { id: string; title: string }, store: VoiceStore, reason?: BarrierCode, note?: string): Promise<VoiceReply> {
  const l = store.locale;
  if (action === "photo") return { say: vt(l, "photo", { title: task.title }), navigate: store.photoPath(task.id), end: true };
  if (action === "later") {
    const r = await store.checkIn(task.id, "later");
    return r.ok ? { say: vt(l, "later_ok", { title: task.title }), refresh: true } : { say: vt(l, "failed") };
  }
  return readBack(l, { kind: "checkin", taskId: task.id, title: task.title, status: action, reason, note }, store.nowTime);
}

async function save(p: VoicePending, store: VoiceStore): Promise<VoiceReply> {
  const l = store.locale;
  if (p.kind === "add_task") {
    const ok = store.addTask ? await store.addTask(p.title, p.time, p.category) : false;
    return ok ? { say: vt(l, "added", { time: time12(p.time) }), refresh: true } : { say: vt(l, "failed") };
  }
  if (p.kind !== "checkin") return { say: vt(l, "cancelled") };
  const r = await store.checkIn(p.taskId, p.status, p.reason, p.note);
  if (!r.ok) {
    if (r.error === "proof_required") return { say: vt(l, "proof_needed", { doctor: r.doctor || vt(l, "your_doctor") }), navigate: store.photoPath(p.taskId), end: true };
    if (r.error === "not_yet_due") {
      const task = (await store.tasks()).find((t) => t.id === p.taskId);
      return { say: vt(l, "not_yet", { title: p.title, time: time12(task?.time ?? "") }) };
    }
    return { say: vt(l, "failed") };
  }
  const parts = [p.status === "done" ? vt(l, "saved_done") : r.message || vt(l, "saved_skip")];
  if (p.status === "done" && r.next) parts.push(vt(l, "next", { title: r.next.title, time: time12(r.next.time ?? "") }));
  return { say: parts.join(" "), refresh: true };
}
