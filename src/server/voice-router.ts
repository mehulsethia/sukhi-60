import "server-only";
// The smart router for "Talk to Sukhi". The word lists in domain/voice-intents handle the common
// phrases instantly and for free; anything they don't recognise comes here. A small, fast Claude
// model picks ONE action from a fixed menu and fills in its details. It can't do anything outside
// that menu, its task ids are checked against the person's own tasks, and every change still
// goes through the spoken read-back before anything is saved.
import { createAnthropic } from "@ai-sdk/anthropic";
import { generateText, Output } from "ai";
import { z } from "zod";
import { features, settings } from "@/lib/config";
import { BARRIER_CODES } from "@/domain/behaviour";
import { isClinicalAdviceRequest, quoteUntrusted } from "@/domain/safety";
import { isValidTime } from "@/domain/schedule";
import type { FlowTask } from "@/domain/voice-flow";
import type { VoiceIntent } from "@/domain/voice-intents";

const PAGES = { "/today": "Today", "/plan": "My plan", "/progress": "Progress", "/chat": "Buddy", "/circle": "Circle", "/people": "Your people", "/settings": "Settings", "/visit": "Doctor visit prep" } as const;

const Schema = z.object({
  action: z.enum(["done", "skipped", "later", "add_task", "remaining", "progress", "navigate", "photo", "retime", "pause", "resume", "set_language", "set_tone", "doctor_question", "medical", "chat", "unclear"]),
  task_ids: z.array(z.string()).describe("Ids from the task list this is about. Several for 'done'/'skipped' when the person mentions several tasks."),
  reason: z.enum(BARRIER_CODES).nullable().describe("For 'skipped': why it didn't happen."),
  time: z.string().nullable().describe("24h HH:MM for 'retime' or 'add_task'."),
  title: z.string().nullable().describe("For 'add_task': a short task name in the person's language, max 40 characters."),
  category: z.enum(["activity", "nutrition", "rest", "measurement", "other"]).nullable(),
  page: z.enum(Object.keys(PAGES) as [keyof typeof PAGES, ...(keyof typeof PAGES)[]]).nullable(),
  language: z.enum(["en", "hi", "mr"]).nullable(),
  tone: z.enum(["warm_gentle", "fun_playful", "motivating", "simple_practical"]).nullable(),
  question: z.string().nullable().describe("For 'doctor_question': the question to save, in the person's words."),
  reply: z.string().nullable().describe("For 'chat' only: a warm reply of at most 25 words in the person's language. Never medical advice."),
});

const SYSTEM = `You route ONE spoken sentence from a user of Sukhi, a care-plan companion used by older adults in India, to exactly one app action. People speak Hindi, Marathi, English or a mix (Hinglish), and speech-to-text may contain small errors: read for meaning.

Actions:
- done / skipped: they did / didn't do one or more tasks today (set task_ids; reason for skipped).
- later: remind me later about a task.
- add_task: a new daily reminder (title, time, category). Never for medicines.
- remaining: what's left today. progress: how they are doing this week.
- navigate: open a screen (page). photo: take a photo as proof for a task.
- retime: change a task's daily time (task_ids + time). pause / resume a task.
- set_language (language) / set_tone (tone): how Sukhi should speak.
- doctor_question: save a question to ask their doctor at the next visit.
- medical: any question about doses, medicines, symptoms, diagnosis or treatment changes. Never answer these.
- chat: greetings, thanks, feelings, small talk. Give a short kind reply, no advice.
- unclear: you are not reasonably sure. Prefer unclear over guessing.

Use only task ids from the list. Fill only the fields the action needs; leave the rest null.`;

export async function routeVoice(text: string, tasks: FlowTask[], locale: string, nowTime: string): Promise<VoiceIntent | null> {
  if (!features.ai()) return null;
  const anthropic = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const list = tasks.slice(0, 30).map((t) => `${t.id} | ${t.title}${t.time ? ` | ${t.time}` : ""}${t.open ? "" : " | (done today)"}`).join("\n");
  let o: z.infer<typeof Schema>;
  try {
    const r = await generateText({
      model: anthropic(settings.voiceRouterModel()),
      system: SYSTEM,
      prompt: `Person's language setting: ${locale}. Their local time now: ${nowTime}.\nTheir tasks (id | title | time):\n${list || "(none)"}\n\n${quoteUntrusted("spoken", text, 500)}`,
      output: Output.object({ schema: Schema }),
      timeout: { totalMs: 8_000 },
      maxRetries: 0,
    });
    o = r.output;
  } catch {
    return null;
  }
  const ids = o.task_ids.filter((id) => tasks.some((t) => t.id === id));
  const one = ids.length === 1 ? ids[0] : null;
  const match = { taskId: one, candidates: ids.length > 1 ? tasks.filter((t) => ids.includes(t.id)) : [], mentioned: ids.length > 0 };
  const time = o.time && isValidTime(o.time) ? o.time : null;
  switch (o.action) {
    case "medical": return { kind: "medical" };
    case "done":
    case "skipped":
      if (ids.length > 1) return { kind: "batch", items: ids.map((id) => ({ taskId: id, status: o.action as "done" | "skipped", reason: o.reason ?? undefined })) };
      return o.action === "done" ? { kind: "done", match } : { kind: "skipped", match, reason: o.reason ?? "other", note: text.slice(0, 200) };
    case "later": return { kind: "later", match };
    case "photo": return { kind: "photo", match };
    case "retime": return { kind: "retime", match, time };
    case "pause": return { kind: "pause", match };
    case "resume": return { kind: "resume", match };
    case "remaining": return { kind: "remaining" };
    case "progress": return { kind: "progress" };
    case "navigate": return o.page ? { kind: "navigate", path: o.page, label: PAGES[o.page] } : null;
    case "add_task": {
      const title = (o.title ?? "").replace(/[<>{}\n\r]/g, " ").trim().slice(0, 40);
      const medicine = /mg|tablet|goli|dawa|medicine|pill|capsule|insulin|गोली|दवा|गोळी|औषध/i.test(`${title} ${text}`);
      return { kind: "add_task", title, time, category: o.category ?? "other", medicine };
    }
    case "set_language": return o.language ? { kind: "set_language", lang: o.language } : null;
    case "set_tone": return o.tone ? { kind: "set_tone", tone: o.tone } : null;
    case "doctor_question": return o.question?.trim() ? { kind: "doctor_question", question: o.question.trim().slice(0, 300) } : null;
    case "chat": {
      const reply = (o.reply ?? "").trim().slice(0, 300);
      return reply && !isClinicalAdviceRequest(reply) ? { kind: "chat", reply } : null;
    }
    default: return null;
  }
}
