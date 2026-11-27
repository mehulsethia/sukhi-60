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
