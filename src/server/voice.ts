import "server-only";
// "Talk to Sukhi" against the real database. Check-ins go through the same applyCheckIn path as
// WhatsApp and the assistant (so doctor-required photo proof, idempotency and rewards all apply),
// and a skip with a reason goes through the same barrier support as tapping a reason chip.
import type { AdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/database.types";
import { localDateOf, localTimeOf, weekStart } from "@/domain/schedule";
import { generateConfirmCode } from "@/domain/router";
import { time12 } from "@/domain/wa-ui";
import { respond, type FlowTask, type VoiceStore } from "@/domain/voice-flow";
import { isBarrierCode } from "@/domain/behaviour";
import type { VoicePending, VoiceReply } from "@/domain/voice-intents";
import { applyCheckIn, getProfile, getToday, materializeOccurrences, ProofRequiredError, type TodayAction } from "./core";
import { reportBarrier } from "./support";
import { decideProposal } from "./agent";
import { routeVoice } from "./voice-router";

const OPEN = new Set(["due", "awaiting_response", "later", "pending"]);
const isOpen = (a: TodayAction) => OPEN.has(a.display) || (a.target_count > 1 && a.display !== "self_reported" && a.display !== "evidence_supported");

function toFlow(a: TodayAction): FlowTask {
  return { id: a.id, title: a.item.title, category: a.item.category, time: a.local_time, open: isOpen(a) };
}

export async function voiceTurn(admin: AdminClient, userId: string, input: { text: string; pending: VoicePending | null; key: string }): Promise<VoiceReply> {
  const profile = await getProfile(admin, userId);
  await materializeOccurrences(admin, userId, 2).catch(() => undefined);
  let today: TodayAction[] = await getToday(admin, userId, profile.timezone);
  const refresh = async () => (today = await getToday(admin, userId, profile.timezone));
  // Paused tasks have nothing scheduled today, but "walk phir se shuru karo" must still find them.
  const { data: paused } = await admin.from("plan_items").select("id, title, category, care_plans!inner(status)").eq("user_id", userId).eq("status", "paused").eq("care_plans.status", "active").limit(20);
  const pausedTasks: FlowTask[] = (paused ?? []).map((i) => ({ id: `item:${i.id}`, title: i.title, category: i.category, time: null, open: false }));
  const n = { i: 0 };

  const store: VoiceStore = {
    locale: profile.locale,
    nowTime: time12(localTimeOf(new Date(), profile.timezone)),
    tasks: async () => [...today.filter((a) => a.display !== "paused").map(toFlow), ...pausedTasks],
    photoPath: (id) => `/actions/${id}`,
    async checkIn(taskId, status, reason, note) {
      const key = `voice:${input.key}:${taskId}:${status}:${n.i++}`;
      try {
        const r = await applyCheckIn(admin, userId, taskId, status, { channel: "web", idempotencyKey: key.slice(0, 120), reason: note ?? null });
        let message: string | undefined;
        if (status === "skipped" && reason && isBarrierCode(reason) && reason !== "other") {
          const support = await reportBarrier(admin, userId, { occurrenceId: taskId, code: reason, idempotencyKey: `${key}:barrier`.slice(0, 120), checkInId: r.check_in_id ?? null }).catch(() => null);
          message = support?.text;
        }
        await refresh();
        const next = today.filter((a) => a.id !== taskId && isOpen(a) && a.target_count === 1).sort((a, b) => a.due_at.localeCompare(b.due_at))[0];
        return { ok: true, message, next: next ? toFlow(next) : null };
      } catch (e) {
        if (e instanceof ProofRequiredError) return { ok: false, error: "proof_required", doctor: e.doctor };
        if (e instanceof Error && e.message.includes("not_yet_due")) return { ok: false, error: "not_yet_due" };
        return { ok: false, error: "failed" };
      }
    },
    async addTask(title, time, category) {
      // Spoken reminders live in one personal plan, never in the doctor's plan.
      let { data: plan } = await admin.from("care_plans").select("id").eq("user_id", userId).eq("mode", "personal_goal").eq("status", "active").eq("source_description", "Added by voice").limit(1).maybeSingle();
      if (!plan) {
        const ins = await admin.from("care_plans").insert({ user_id: userId, title: "My reminders", mode: "personal_goal", status: "active", source_description: "Added by voice" }).select("id").single();
        plan = ins.data;
      }
      if (!plan) return false;
      const { error } = await admin.from("plan_items").insert({ plan_id: plan.id, user_id: userId, title: title.slice(0, 80), category, schedule_kind: "daily", times: [time], weekdays: [], status: "confirmed", provenance: "manual", instructions: null });
      if (error) return false;
      await materializeOccurrences(admin, userId, 7).catch(() => undefined);
      return true;
    },
    async changeTask(taskId, action, time) {
      const itemId = taskId.startsWith("item:")
        ? taskId.slice(5)
        : (await admin.from("action_occurrences").select("item_id").eq("id", taskId).eq("user_id", userId).maybeSingle()).data?.item_id;
      if (!itemId) return "failed";
      const { data: item } = await admin.from("plan_items").select("id, version, title, weekdays, care_plans!inner(mode)").eq("id", itemId).eq("user_id", userId).maybeSingle();
      if (!item) return "failed";
      if ((item.care_plans as unknown as { mode: string }).mode === "clinician_instructions") {
        // Sukhi never changes the doctor's plan; a timing wish goes to the care team instead.
        await admin.from("review_requests").insert({ user_id: userId, item_id: item.id, reason: `Asked by voice to ${action}${time ? ` to ${time}` : ""}: ${input.text}`.slice(0, 500), source: "assistant" });
        return "doctor_plan";
      }
      // Same path as the buddy's Apply button: versioned, audited, re-scheduled.
      const code = generateConfirmCode();
      const change = (action === "retime" ? { kind: "retime", times: [time], weekdays: item.weekdays ?? [] } : { kind: action }) as Json;
      const { error } = await admin.from("change_proposals").insert({ user_id: userId, item_id: item.id, item_version: item.version, confirm_code: code, change, summary: `${action} ${item.title}`.slice(0, 200) });
      if (error) return "failed";
      await decideProposal(admin, userId, code, true, profile.locale);
      const { data: done } = await admin.from("change_proposals").select("status").eq("user_id", userId).eq("confirm_code", code).maybeSingle();
      if (done?.status !== "confirmed") return "failed";
      await refresh();
      return "ok";
    },
    async progress() {
      const day = localDateOf(new Date(), profile.timezone);
      const { data: occ } = await admin.from("action_occurrences").select("status, local_date, due_at").eq("user_id", userId).gte("local_date", weekStart(day)).lte("local_date", day).neq("status", "paused");
      const isDone = (s: string) => s === "self_reported" || s === "evidence_supported";
      const now = Date.now();
      const due = (occ ?? []).filter((o) => isDone(o.status) || new Date(o.due_at).getTime() <= now);
      const todays = (occ ?? []).filter((o) => o.local_date === day);
      return { weekDone: due.filter((o) => isDone(o.status)).length, weekDue: due.length, todayDone: todays.filter((o) => isDone(o.status)).length, todayTotal: todays.length };
    },
    async setLanguage(lang) {
      const { error } = await admin.from("profiles").update({ locale: lang }).eq("id", userId);
      return !error;
    },
    async setTone(tone) {
      const { error } = await admin.from("profiles").update({ communication_styles: [tone], behaviour_prefs_updated_at: new Date().toISOString() }).eq("id", userId);
      return !error;
    },
    async addQuestion(q) {
      const { error } = await admin.from("memory_facts").insert({ user_id: userId, kind: "open_question", content: q.slice(0, 300), source_type: "user_message", status: "confirmed" });
      return !error;
    },
    route: (text, tasks) => routeVoice(text, tasks, profile.locale, time12(localTimeOf(new Date(), profile.timezone))),
  };
  return respond(input.text, input.pending, store);
}
