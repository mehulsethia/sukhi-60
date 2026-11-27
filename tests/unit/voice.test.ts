import { describe, expect, it, vi } from "vitest";
import { parseSpokenTime, parseVoiceCommand, pickFromChoices, normalize } from "@/domain/voice-intents";
import { respond, type FlowTask, type VoiceStore } from "@/domain/voice-flow";

const TASKS: FlowTask[] = [
  { id: "med", title: "Metformin 500 mg", category: "medication", time: "08:00", open: true },
  { id: "walk", title: "Morning walk 30 min", category: "activity", time: "08:30", open: true },
  { id: "water", title: "Glass of water", category: "nutrition", time: "13:00", open: true },
];

describe("parseVoiceCommand: the phrases people actually say", () => {
  it("“Tablet le li, khane ke baad” marks the medicine done", () => {
    expect(parseVoiceCommand("Tablet le li, khane ke baad", TASKS)).toMatchObject({ kind: "done", match: { taskId: "med" } });
  });
  it("“Aaj walk nahi hua, ghutna dard” is a skip with a pain reason", () => {
    expect(parseVoiceCommand("Aaj walk nahi hua, ghutna dard", TASKS)).toMatchObject({ kind: "skipped", match: { taskId: "walk" }, reason: "physical_discomfort" });
  });
  it("“Baad mein” snoozes", () => {
    expect(parseVoiceCommand("Baad mein", TASKS)).toMatchObject({ kind: "later", match: { taskId: null } });
  });
  it("“Har roz raat 10 baje paani yaad dilana” drafts a daily 22:00 water reminder", () => {
    expect(parseVoiceCommand("Har roz raat 10 baje paani yaad dilana", TASKS)).toEqual({ kind: "add_task", title: "Drink water", time: "22:00", category: "nutrition", medicine: false });
  });
  it("“Aaj kya baaki hai?” asks what's left", () => {
    expect(parseVoiceCommand("Aaj kya baaki hai?", TASKS).kind).toBe("remaining");
  });
  it("navigates by voice", () => {
    expect(parseVoiceCommand("Progress dikhao", TASKS)).toMatchObject({ kind: "navigate", path: "/progress" });
    expect(parseVoiceCommand("Open my plan", TASKS)).toMatchObject({ kind: "navigate", path: "/plan" });
  });
  it("“Walk ki photo” opens the camera for the walk", () => {
    expect(parseVoiceCommand("Walk ki photo", TASKS)).toMatchObject({ kind: "photo", match: { taskId: "walk" } });
  });
  it("understands Devanagari Hindi and Marathi", () => {
    expect(parseVoiceCommand("मैंने दवा ले ली", TASKS)).toMatchObject({ kind: "done", match: { taskId: "med" } });
    expect(parseVoiceCommand("गोळी घेतली", TASKS)).toMatchObject({ kind: "done", match: { taskId: "med" } });
    expect(parseVoiceCommand("आज चालणं झालं नाही, गुडघा दुखतोय", TASKS)).toMatchObject({ kind: "skipped", match: { taskId: "walk" } });
  });
  it("never answers medical questions", () => {
    expect(parseVoiceCommand("Kitni goli leni hai?", TASKS).kind).toBe("medical");
    expect(parseVoiceCommand("Can I take two tablets today?", TASKS).kind).toBe("medical");
    expect(parseVoiceCommand("Do goli le loon?", TASKS).kind).toBe("medical");
  });
  it("short yes and no", () => {
    expect(parseVoiceCommand("haan", TASKS).kind).toBe("yes");
    expect(parseVoiceCommand("हो", TASKS).kind).toBe("yes");
    expect(parseVoiceCommand("nahi", TASKS).kind).toBe("no");
  });
  it("noise stays unknown instead of guessing", () => {
    expect(parseVoiceCommand("hmm the the uh", TASKS).kind).toBe("unknown");
  });
  it("refuses to add medicines by voice", () => {
    expect(parseVoiceCommand("Roz subah 8 baje dawai yaad dilana", TASKS)).toMatchObject({ kind: "add_task", medicine: true });
  });
});

describe("helpers", () => {
  it("reads spoken times", () => {
    expect(parseSpokenTime(normalize("raat 10 baje"))).toBe("22:00");
    expect(parseSpokenTime(normalize("subah 7:30"))).toBe("07:30");
    expect(parseSpokenTime(normalize("at 6 pm"))).toBe("18:00");
    expect(parseSpokenTime(normalize("शाम 6 बजे"))).toBe("18:00");
  });
  it("picks from a choice list by name or position", () => {
    const c = [{ id: "a", title: "Metformin 500 mg" }, { id: "b", title: "Amlodipine 5 mg" }];
    expect(pickFromChoices("Amlodipine", c)).toBe("b");
    expect(pickFromChoices("pehli wali", c)).toBe("a");
  });
});

function store(tasks: FlowTask[], locale = "en") {
  const checkIn = vi.fn(async () => ({ ok: true as const, next: null }));
  const addTask = vi.fn(async () => true);
  const s: VoiceStore = { locale, nowTime: "8:10 am", tasks: async () => tasks, checkIn, addTask, photoPath: (id) => `/actions/${id}` };
  return { s, checkIn, addTask };
}

describe("respond: read back before saving", () => {
  it("asks “Is that right?” and saves only after yes", async () => {
    const { s, checkIn } = store(TASKS);
    const r1 = await respond("tablet le li", null, s);
    expect(r1.say).toBe("Metformin 500 mg, done at 8:10 am. Is that right?");
    expect(checkIn).not.toHaveBeenCalled();
    const r2 = await respond("haan", r1.pending!, s);
    expect(checkIn).toHaveBeenCalledWith("med", "done", undefined, undefined);
    expect(r2.refresh).toBe(true);
  });
  it("speaks Hindi read-backs", async () => {
    const { s } = store(TASKS, "hi");
    expect((await respond("tablet le li", null, s)).say).toBe("Metformin 500 mg, 8:10 am पर हो गया। सही है?");
  });
  it("“no” saves nothing", async () => {
    const { s, checkIn } = store(TASKS);
    const r1 = await respond("walk ho gaya", null, s);
    await respond("nahi", r1.pending!, s);
    expect(checkIn).not.toHaveBeenCalled();
  });
  it("asks a choice question when two tasks match", async () => {
    const two = [...TASKS, { id: "amlo", title: "Amlodipine 5 mg", category: "medication", time: "19:30", open: true }];
    const { s, checkIn } = store(two);
    const r1 = await respond("dawai le li", null, s);
    expect(r1.choices?.map((c) => c.label)).toEqual(["Metformin 500 mg", "Amlodipine 5 mg"]);
    const r2 = await respond("Amlodipine", r1.pending!, s);
    expect(r2.say).toContain("Amlodipine 5 mg, done");
    await respond("yes", r2.pending!, s);
    expect(checkIn).toHaveBeenCalledWith("amlo", "done", undefined, undefined);
  });
  it("snoozes at once and adds a reminder after yes", async () => {
    const { s, checkIn, addTask } = store([TASKS[1]]);
    const later = await respond("baad mein", null, s);
    expect(checkIn).toHaveBeenCalledWith("walk", "later");
    expect(later.say).toContain("in an hour");
    const r1 = await respond("har roz raat 10 baje paani yaad dilana", null, s);
    expect(r1.say).toBe("Drink water, every day at 10:00 pm. Shall I add it?");
    await respond("ok", r1.pending!, s);
    expect(addTask).toHaveBeenCalledWith("Drink water", "22:00", "nutrition");
  });
  it("sends a doctor-required photo task to the camera", async () => {
    const { s } = store(TASKS);
    s.checkIn = async () => ({ ok: false, error: "proof_required", doctor: "Dr. Rao" });
    const r1 = await respond("tablet le li", null, s);
    const r2 = await respond("haan", r1.pending!, s);
    expect(r2).toMatchObject({ navigate: "/actions/med", end: true });
    expect(r2.say).toContain("Dr. Rao");
  });
  it("medical questions get the referral, never a save", async () => {
    const { s, checkIn } = store(TASKS);
    const r = await respond("kitni goli leni hai", null, s);
    expect(r.say).toMatch(/doctor or pharmacist/);
    expect(checkIn).not.toHaveBeenCalled();
  });
});

describe("more actions by voice", () => {
  it("parses time changes, pause and resume", () => {
    expect(parseVoiceCommand("walk ka time shaam 7 baje kar do", TASKS)).toMatchObject({ kind: "retime", match: { taskId: "walk" }, time: "19:00" });
    expect(parseVoiceCommand("paani wala reminder kuch din band kar do", TASKS)).toMatchObject({ kind: "pause", match: { taskId: "water" } });
    expect(parseVoiceCommand("walk phir se shuru karo", TASKS)).toMatchObject({ kind: "resume", match: { taskId: "walk" } });
  });
  it("parses progress, language, tone and a doctor question", () => {
    expect(parseVoiceCommand("is hafte kaisa raha?", TASKS).kind).toBe("progress");
    expect(parseVoiceCommand("Marathi madhe bola", TASKS)).toEqual({ kind: "set_language", lang: "mr" });
    expect(parseVoiceCommand("thoda pyaar se baat karo", TASKS)).toEqual({ kind: "set_tone", tone: "warm_gentle" });
    expect(parseVoiceCommand("doctor se poochna hai ki chakkar kyun aata hai", TASKS)).toMatchObject({ kind: "doctor_question", question: "chakkar kyun aata hai" });
  });
  it("takes several tasks in one sentence", () => {
    expect(parseVoiceCommand("tablet le li aur walk bhi ho gaya", TASKS)).toEqual({ kind: "batch", items: [{ taskId: "med", status: "done", reason: undefined }, { taskId: "walk", status: "done", reason: undefined }] });
  });
});

describe("respond: new actions", () => {
  function full(tasks = TASKS) {
    const base = store(tasks);
    const changeTask = vi.fn(async () => "ok" as const);
    const s: VoiceStore = { ...base.s, changeTask, progress: async () => ({ weekDone: 12, weekDue: 18, todayDone: 1, todayTotal: 3 }), setLanguage: async () => true, setTone: async () => true, addQuestion: vi.fn(async () => true) };
    return { s, changeTask, checkIn: base.checkIn };
  }
  it("reads back a time change, then applies it", async () => {
    const { s, changeTask } = full();
    const r1 = await respond("walk ka time shaam 7 baje kar do", null, s);
    expect(r1.say).toBe("Move Morning walk 30 min to 7:00 pm every day?");
    expect(changeTask).not.toHaveBeenCalled();
    const r2 = await respond("haan", r1.pending!, s);
    expect(changeTask).toHaveBeenCalledWith("walk", "retime", "19:00");
    expect(r2.say).toContain("updated");
  });
  it("explains it can't change the doctor's plan", async () => {
    const { s } = full();
    s.changeTask = async () => "doctor_plan";
    const r1 = await respond("Metformin ka time 9 baje kar do", null, s);
    const r2 = await respond("haan", r1.pending!, s);
    expect(r2.say).toMatch(/doctor's plan/);
  });
  it("saves several check-ins after one yes", async () => {
    const { s, checkIn } = full();
    const r1 = await respond("tablet le li aur walk bhi ho gaya", null, s);
    expect(r1.say).toBe("Metformin 500 mg done, Morning walk 30 min done. Shall I save that?");
    await respond("haan", r1.pending!, s);
    expect(checkIn).toHaveBeenCalledTimes(2);
  });
  it("answers progress, switches language and saves a doctor question at once", async () => {
    const { s } = full();
    expect((await respond("how am i doing", null, s)).say).toBe("This week: 12 of 18 done. Today: 1 of 3.");
    const lang = await respond("Hindi mein bolo", null, s);
    expect(lang).toMatchObject({ setLocale: "hi", say: "ठीक है, अब हिंदी में बात करेंगे।" });
    expect((await respond("ask my doctor about my sleep", null, s)).say).toContain("Saved for your doctor visit");
  });
  it("uses the smart router only when the word lists don't match", async () => {
    const { s } = full();
    const route = vi.fn(async () => ({ kind: "progress" as const }));
    s.route = route;
    expect((await respond("aaj tak kitna score bana", null, s)).say).toContain("This week");
    expect(route).toHaveBeenCalledOnce();
    await respond("tablet le li", null, s);
    expect(route).toHaveBeenCalledOnce();
  });
});
