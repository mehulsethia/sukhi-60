// The "Talk to Sukhi" conversation: what Sukhi says back, which actions run at once and which
// are read back first. Storage is passed in (`VoiceStore`), so the same flow runs against the
// real database on the server and against local state in the keyless demo.
//
// Runs at once (easy to undo, no data risk): snooze, open a screen, what's left, progress,
// language, tone, saving a question for the doctor.
// Read back first (changes the record): check-ins, adding a reminder, changing a time, pausing.
import { CLINICAL_REFERRAL_MESSAGE, type Locale } from "./safety";
import type { BarrierCode } from "./behaviour";
import { matchTask, normalize, parseVoiceCommand, pickFromChoices, type VoiceIntent, type VoicePending, type VoiceReply, type VoiceTask, type VoiceTone } from "./voice-intents";
import { time12 } from "./wa-ui";

const COPY = {
  en: {
    greeting: "Hi! What would you like to do?",
    confirm_done: "{title}, done at {time}. Is that right?",
    confirm_skip: "{title}, not done today{because}. Shall I note that?",
    confirm_batch: "{list}. Shall I save that?",
    word_done: "done", word_skip: "not done",
    saved_done: "Done ✓",
    saved_skip: "Noted. No guilt, it happens.",
    saved_batch: "Saved ✓",
    next: "Next: {title} at {time}.",
    later_ok: "Okay, I'll remind you about {title} in an hour.",
    choose: "Which one: {list}?",
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
    confirm_retime: "Move {title} to {time} every day?",
    confirm_pause: "Pause {title} for now?",
    confirm_resume: "Start {title} again?",
    need_time: "To what time? For example, “7 pm”.",
    changed: "Done. {title} is updated.",
    doctor_plan: "{title} is from your doctor's plan, so I can't change it. I've asked your care team to review it.",
    progress: "This week: {done} of {due} done. Today: {td} of {tt}.",
    progress_none: "Nothing has been scheduled yet this week.",
    lang_set: "Okay, I'll speak English now.",
    tone_set: "Okay, I'll talk that way from now on.",
    question_saved: "Saved for your doctor visit: “{q}”.",
    cancelled: "Okay, I didn't save anything.",
    not_understood: "Sorry, I didn't catch that. You can say “I took my tablet”, “move my walk to 7 pm” or “how was my week?”",
    not_heard: "I couldn't hear that clearly. Please say it again.",
    bye: "Okay. Tap the ball whenever you need me.",
    proof_needed: "{doctor} asked for a photo for this one. Opening the camera.",
    your_doctor: "Your doctor",
    not_yet: "{title} isn't due yet. I'll remind you at {time}.",
    failed: "Sorry, that didn't save. Please try again or tap it on the screen.",
    consent: "To understand you clearly, Sukhi sends your voice to ElevenLabs to turn it into text. Sukhi doesn't keep the recording. Allow?",
    allow: "Allow",
    yes: "Yes", no: "No",
    because: { physical_discomfort: " because of pain", forgot: " because you forgot", busy: " because you were busy", low_motivation: " because you didn't feel like it", routine_disrupted: " because the day changed", too_difficult: " because it felt too hard" } as Partial<Record<BarrierCode, string>>,
  },
  hi: {
    greeting: "नमस्ते! बताइए, क्या करना है?",
    confirm_done: "{title}, {time} पर हो गया। सही है?",
    confirm_skip: "{title} आज{because} नहीं हुआ। नोट कर दूँ?",
    confirm_batch: "{list}। सेव कर दूँ?",
    word_done: "हो गया", word_skip: "नहीं हुआ",
    saved_done: "हो गया ✓",
    saved_skip: "नोट कर लिया। कोई बात नहीं, ऐसा होता है।",
    saved_batch: "सेव हो गया ✓",
    next: "अगला: {title}, {time}।",
    later_ok: "ठीक है, {title} के लिए एक घंटे बाद याद दिलाऊँगा।",
    choose: "कौन सा: {list}?",
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
    confirm_retime: "{title} रोज़ {time} पर कर दूँ?",
    confirm_pause: "{title} अभी के लिए रोक दूँ?",
    confirm_resume: "{title} फिर से शुरू कर दूँ?",
    need_time: "किस समय पर? जैसे, “शाम 7 बजे”।",
    changed: "हो गया। {title} बदल दिया।",
    doctor_plan: "{title} आपके डॉक्टर के प्लान से है, इसलिए मैं इसे नहीं बदल सकता। मैंने आपकी केयर टीम से देखने को कहा है।",
    progress: "इस हफ़्ते: {due} में से {done} हुए। आज: {tt} में से {td}।",
    progress_none: "इस हफ़्ते अभी कुछ तय नहीं है।",
    lang_set: "ठीक है, अब हिंदी में बात करेंगे।",
    tone_set: "ठीक है, अब से ऐसे ही बात करूँगा।",
    question_saved: "डॉक्टर विज़िट के लिए नोट कर लिया: “{q}”।",
    cancelled: "ठीक है, कुछ सेव नहीं किया।",
    not_understood: "माफ़ कीजिए, समझ नहीं आया। आप बोल सकते हैं “टैबलेट ले ली”, “walk का टाइम शाम 7 बजे कर दो” या “हफ़्ता कैसा रहा?”",
    not_heard: "आवाज़ साफ़ नहीं आई। फिर से बोलिए।",
    bye: "ठीक है। जब चाहें बॉल दबाइए।",
    proof_needed: "{doctor} ने इसके लिए फ़ोटो माँगी है। कैमरा खोल रहा हूँ।",
    your_doctor: "आपके डॉक्टर",
    not_yet: "{title} का समय अभी नहीं हुआ। {time} पर याद दिलाऊँगा।",
    failed: "माफ़ कीजिए, सेव नहीं हुआ। फिर से कोशिश करें या स्क्रीन पर दबाएँ।",
    consent: "आपकी बात साफ़ समझने के लिए सुखी आपकी आवाज़ ElevenLabs को भेजता है, ताकि वह टेक्स्ट बन सके। सुखी रिकॉर्डिंग नहीं रखता। अनुमति दें?",
    allow: "अनुमति दें",
    yes: "हाँ", no: "नहीं",
    because: { physical_discomfort: " दर्द की वजह से", forgot: " भूल जाने की वजह से", busy: " व्यस्त होने की वजह से", low_motivation: " मन न होने की वजह से", routine_disrupted: " दिन बदलने की वजह से", too_difficult: " मुश्किल लगने की वजह से" } as Partial<Record<BarrierCode, string>>,
  },
  mr: {
    greeting: "नमस्कार! काय करायचं ते सांगा.",
    confirm_done: "{title}, {time} ला झालं. बरोबर?",
    confirm_skip: "{title} आज{because} झालं नाही. नोंद करू?",
    confirm_batch: "{list}. सेव्ह करू?",
    word_done: "झालं", word_skip: "झालं नाही",
    saved_done: "झालं ✓",
    saved_skip: "नोंद केली. काही हरकत नाही, असं होतं.",
    saved_batch: "सेव्ह झालं ✓",
    next: "पुढे: {title}, {time}.",
    later_ok: "ठीक आहे, {title} साठी एका तासाने आठवण करून देतो.",
    choose: "कोणतं: {list}?",
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
    confirm_retime: "{title} रोज {time} ला करू?",
    confirm_pause: "{title} सध्या थांबवू?",
    confirm_resume: "{title} पुन्हा सुरू करू?",
    need_time: "किती वाजता? उदा. “संध्याकाळी 7 वाजता”.",
    changed: "झालं. {title} बदललं.",
    doctor_plan: "{title} तुमच्या डॉक्टरांच्या प्लानमधलं आहे, म्हणून मी ते बदलू शकत नाही. मी तुमच्या केअर टीमला पाहायला सांगितलं आहे.",
    progress: "या आठवड्यात: {due} पैकी {done} झाले. आज: {tt} पैकी {td}.",
    progress_none: "या आठवड्यात अजून काही ठरलेलं नाही.",
    lang_set: "ठीक आहे, आता मराठीत बोलूया.",
    tone_set: "ठीक आहे, आता असंच बोलतो.",
    question_saved: "डॉक्टर भेटीसाठी नोंदवलं: “{q}”.",
    cancelled: "ठीक आहे, काही सेव्ह केलं नाही.",
    not_understood: "माफ करा, समजलं नाही. तुम्ही म्हणू शकता “गोळी घेतली”, “चालण्याची वेळ संध्याकाळी 7 करा” किंवा “आठवडा कसा गेला?”",
    not_heard: "आवाज स्पष्ट आला नाही. पुन्हा बोला.",
    bye: "ठीक आहे. गरज लागेल तेव्हा बॉल दाबा.",
    proof_needed: "{doctor} नी यासाठी फोटो मागितला आहे. कॅमेरा उघडतो.",
    your_doctor: "तुमच्या डॉक्टर",
    not_yet: "{title} ची वेळ अजून झाली नाही. {time} ला आठवण करून देतो.",
    failed: "माफ करा, सेव्ह झालं नाही. पुन्हा प्रयत्न करा किंवा स्क्रीनवर दाबा.",
    consent: "तुमचं बोलणं स्पष्ट समजण्यासाठी सुखी तुमचा आवाज ElevenLabs ला पाठवतो, म्हणजे त्याचा मजकूर बनतो. सुखी रेकॉर्डिंग ठेवत नाही. परवानगी द्याल?",
    allow: "परवानगी द्या",
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
  changeTask?: (taskId: string, action: "retime" | "pause" | "resume", time?: string) => Promise<"ok" | "doctor_plan" | "failed">;
  progress?: () => Promise<{ weekDone: number; weekDue: number; todayDone: number; todayTotal: number }>;
  setLanguage?: (lang: "en" | "hi" | "mr") => Promise<boolean>;
  setTone?: (tone: VoiceTone) => Promise<boolean>;
  addQuestion?: (q: string) => Promise<boolean>;
  /** The smart router: understands anything the word lists don't. Optional (needs an AI key). */
  route?: (text: string, tasks: FlowTask[]) => Promise<VoiceIntent | null>;
  photoPath: (taskId: string) => string;
}

const yesNo = (l: string) => [{ label: vt(l, "yes"), text: vt(l, "yes") }, { label: vt(l, "no"), text: vt(l, "no") }];
const listOf = (tasks: { title: string }[]) => tasks.slice(0, 5).map((t) => t.title).join(", ");

function readBack(l: string, p: VoicePending, nowTime: string): VoiceReply {
  switch (p.kind) {
    case "checkin": {
      const because = p.status === "skipped" && p.reason ? COPY[voiceLocale(l)].because[p.reason] ?? "" : "";
      const say = p.status === "done" ? vt(l, "confirm_done", { title: p.title, time: nowTime }) : vt(l, "confirm_skip", { title: p.title, because });
      return { say, pending: p, choices: yesNo(l) };
    }
    case "batch": {
      const list = p.items.map((i) => `${i.title} ${vt(l, i.status === "done" ? "word_done" : "word_skip")}`).join(", ");
      return { say: vt(l, "confirm_batch", { list }), pending: p, choices: yesNo(l) };
    }
    case "add_task":
      return { say: vt(l, "add_confirm", { title: p.title, time: time12(p.time) }), pending: p, choices: yesNo(l) };
    case "change": {
      const key = p.action === "retime" ? "confirm_retime" : p.action === "pause" ? "confirm_pause" : "confirm_resume";
      return { say: vt(l, key, { title: p.title, time: time12(p.time ?? "") }), pending: p, choices: yesNo(l) };
    }
    case "choose":
      return { say: vt(l, "choose", { list: listOf(p.candidates) }), pending: p, choices: p.candidates.slice(0, 4).map((c) => ({ label: c.title, text: c.title })) };
  }
}

/** One turn of the conversation. `pending` is what Sukhi last asked about, if anything. */
export async function respond(text: string, pending: VoicePending | null, store: VoiceStore): Promise<VoiceReply> {
  const l = store.locale;
  const all = await store.tasks();
  const open = all.filter((t) => t.open);
  const pool = open.length ? open : all;
  let intent = parseVoiceCommand(text, pool);
  // Time changes, pauses and resumes are about the plan, not just what's open today.
  if ((intent.kind === "retime" || intent.kind === "pause" || intent.kind === "resume") && !intent.match.taskId) intent = { ...intent, match: matchTask(normalize(text), all) };

  if (intent.kind === "medical") return { say: CLINICAL_REFERRAL_MESSAGE[voiceLocale(l)] };
  if (intent.kind === "stop") return { say: vt(l, "bye"), end: true };

  // Answering a question Sukhi asked.
  if (pending) {
    if (pending.kind === "choose") {
      const id = pickFromChoices(text, pending.candidates);
      if (id) {
        const task = pending.candidates.find((c) => c.id === id)!;
        return act(pending.action, task, store, { reason: pending.reason, note: pending.note, time: pending.time });
      }
      if (intent.kind === "no") return { say: vt(l, "cancelled") };
      if (intent.kind === "unknown" || intent.kind === "yes") return readBack(l, pending, store.nowTime);
    } else {
      if (intent.kind === "yes") return save(pending, store);
      if (intent.kind === "no") return { say: vt(l, "cancelled") };
      // "Change" to a pending retime: "nahi, 8 baje" keeps the task, takes the new time.
    }
    // Anything else: a new request (the read-back is dropped; nothing was saved).
  }

  // Nothing in the word lists matched: ask the smart router.
  if (intent.kind === "unknown" && store.route) intent = (await store.route(text, pool).catch(() => null)) ?? intent;
  if (intent.kind === "medical") return { say: CLINICAL_REFERRAL_MESSAGE[voiceLocale(l)] };

  switch (intent.kind) {
    case "stop":
      return { say: vt(l, "bye"), end: true };
    case "yes":
    case "no":
      return { say: vt(l, "greeting") };
    case "navigate":
      return { say: vt(l, "open_page", { page: intent.label }), navigate: intent.path };
    case "remaining": {
      if (!open.length) return { say: all.length ? vt(l, "all_done") : vt(l, "nothing_open") };
      return { say: vt(l, "remaining", { list: open.slice(0, 5).map((t) => (t.time ? `${t.title} (${time12(t.time)})` : t.title)).join(", ") }) };
    }
    case "progress": {
      const p = store.progress ? await store.progress().catch(() => null) : null;
      if (!p) return { say: vt(l, "not_understood") };
      if (!p.weekDue) return { say: vt(l, "progress_none") };
      return { say: vt(l, "progress", { done: String(p.weekDone), due: String(p.weekDue), td: String(p.todayDone), tt: String(p.todayTotal) }) };
    }
    case "set_language": {
      const ok = store.setLanguage ? await store.setLanguage(intent.lang) : false;
      return ok ? { say: vt(intent.lang, "lang_set"), setLocale: intent.lang, refresh: true } : { say: vt(l, "failed") };
    }
    case "set_tone": {
      const ok = store.setTone ? await store.setTone(intent.tone) : false;
      return ok ? { say: vt(l, "tone_set") } : { say: vt(l, "failed") };
    }
    case "doctor_question": {
      const ok = store.addQuestion ? await store.addQuestion(intent.question) : false;
      return ok ? { say: vt(l, "question_saved", { q: intent.question }) } : { say: vt(l, "failed") };
    }
    case "chat":
      return { say: intent.reply };
    case "add_task": {
      if (intent.medicine) return { say: vt(l, "add_medicine"), navigate: "/plan" };
      if (!intent.title) return { say: vt(l, "add_need_title") };
      if (!intent.time) return { say: vt(l, "add_need_time") };
      if (!store.addTask) return { say: vt(l, "not_understood") };
      return readBack(l, { kind: "add_task", title: intent.title, time: intent.time, category: intent.category }, store.nowTime);
    }
    case "batch": {
      const items = intent.items.map((i) => ({ ...i, title: all.find((t) => t.id === i.taskId)?.title ?? "" })).filter((i) => i.title);
      return readBack(l, { kind: "batch", items }, store.nowTime);
    }
    case "retime":
    case "pause":
    case "resume":
    case "photo":
    case "later":
    case "done":
    case "skipped": {
      const action = intent.kind;
      // Pause/resume/retime can target tasks that aren't due today.
      const scope = action === "retime" || action === "pause" || action === "resume" ? all : pool;
      const { taskId, candidates, mentioned } = intent.match;
      const extra = { reason: intent.kind === "skipped" ? intent.reason : undefined, note: intent.kind === "skipped" ? intent.note : undefined, time: intent.kind === "retime" ? intent.time ?? undefined : undefined };
      if (action === "retime" && !extra.time) return { say: vt(l, "need_time") };
      if (taskId) {
        const task = scope.find((t) => t.id === taskId) ?? all.find((t) => t.id === taskId);
        if (task) return act(action, task, store, extra);
      }
      if (candidates.length > 1) return readBack(l, { kind: "choose", action, candidates: candidates.map((c) => ({ id: c.id, title: c.title })), ...extra }, store.nowTime);
      // No task named: the one that is due now, if there is exactly one obvious choice.
      if (!mentioned && open.length === 1 && action !== "retime" && action !== "pause" && action !== "resume") return act(action, open[0], store, extra);
      const options = (action === "retime" || action === "pause" || action === "resume" ? all : open).slice(0, 4);
      if (!options.length) return { say: vt(l, "nothing_open") };
      return readBack(l, { kind: "choose", action, candidates: options.map((c) => ({ id: c.id, title: c.title })), ...extra }, store.nowTime);
    }
    case "unknown":
      return { say: vt(l, "not_understood") };
  }
}

type Action = "done" | "skipped" | "later" | "photo" | "retime" | "pause" | "resume";

/** Decide what to do with one named task: snooze and photo act at once, the rest read back first. */
async function act(action: Action, task: { id: string; title: string }, store: VoiceStore, extra: { reason?: BarrierCode; note?: string; time?: string }): Promise<VoiceReply> {
  const l = store.locale;
  if (action === "photo") return { say: vt(l, "photo", { title: task.title }), navigate: store.photoPath(task.id), end: true };
  if (action === "later") {
    const r = await store.checkIn(task.id, "later");
    return r.ok ? { say: vt(l, "later_ok", { title: task.title }), refresh: true } : { say: vt(l, "failed") };
  }
  if (action === "retime" || action === "pause" || action === "resume") {
    if (!store.changeTask) return { say: vt(l, "not_understood") };
    return readBack(l, { kind: "change", action, taskId: task.id, title: task.title, time: extra.time }, store.nowTime);
  }
  return readBack(l, { kind: "checkin", taskId: task.id, title: task.title, status: action, reason: extra.reason, note: extra.note }, store.nowTime);
}

async function save(p: VoicePending, store: VoiceStore): Promise<VoiceReply> {
  const l = store.locale;
  if (p.kind === "add_task") {
    const ok = store.addTask ? await store.addTask(p.title, p.time, p.category) : false;
    return ok ? { say: vt(l, "added", { time: time12(p.time) }), refresh: true } : { say: vt(l, "failed") };
  }
  if (p.kind === "change") {
    const r = store.changeTask ? await store.changeTask(p.taskId, p.action, p.time) : "failed";
    if (r === "doctor_plan") return { say: vt(l, "doctor_plan", { title: p.title }) };
    return r === "ok" ? { say: vt(l, "changed", { title: p.title }), refresh: true } : { say: vt(l, "failed") };
  }
  if (p.kind === "batch") {
    let saved = 0;
    for (const i of p.items) if ((await store.checkIn(i.taskId, i.status, i.reason)).ok) saved++;
    return saved ? { say: vt(l, "saved_batch"), refresh: true } : { say: vt(l, "failed") };
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
