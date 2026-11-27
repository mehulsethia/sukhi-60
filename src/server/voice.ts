import "server-only";
// "Talk to Sukhi" against the real database. Check-ins go through the same applyCheckIn path as
// WhatsApp and the assistant (so doctor-required photo proof, idempotency and rewards all apply),
// and a skip with a reason goes through the same barrier support as tapping a reason chip.
import type { AdminClient } from "@/lib/supabase/admin";
import { features } from "@/lib/config";
import { localTimeOf } from "@/domain/schedule";
import { time12 } from "@/domain/wa-ui";
import { respond, type FlowTask, type VoiceStore } from "@/domain/voice-flow";
import { isBarrierCode } from "@/domain/behaviour";
import type { VoicePending, VoiceReply } from "@/domain/voice-intents";
import { applyCheckIn, getProfile, getToday, materializeOccurrences, ProofRequiredError, type TodayAction } from "./core";
import { reportBarrier } from "./support";
import { runAssistant } from "./agent";

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
  const n = { i: 0 };

  const store: VoiceStore = {
    locale: profile.locale,
    nowTime: time12(localTimeOf(new Date(), profile.timezone)),
    tasks: async () => today.filter((a) => a.display !== "paused").map(toFlow),
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
    converse: features.ai()
      ? async (text) => (await runAssistant({ admin, userId, channel: "web", text, messageKey: `voice:${input.key}` })).text
      : undefined,
  };
  return respond(input.text, input.pending, store);
}
