import "server-only";
// What the next free-text reply on WhatsApp means (a name, a code, a doctor's note...).
// Kept on the binding; expires so a stale question never swallows a later message.
import type { AdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/database.types";

export type WaState =
  | "ob_lang" // onboarding: waiting for a language tap
  | "ob_name" // onboarding: waiting for a name
  | "ob_path" // onboarding: waiting for how to make the plan
  | "ob_words" // waiting for a goal in the person's own words
  | "rx_wait" // waiting for a prescription photo
  | "rx_fix" // waiting for a correction to a read prescription
  | "proof" // waiting for a proof photo for one task
  | "cl_join" // waiting for a circle code
  | "dr_name"
  | "dr_clinic"
  | "dr_reward"
  | "dr_note"
  | "dr_redeem"
  | "quiet" // waiting for quiet hours ("10pm-7am")
  | "pe_time" // waiting for new times for one task
  | "appeal"; // waiting for a note to go with an appeal

/** Minutes a question stays open. Onboarding and prescription waits last a day. */
const TTL: Partial<Record<WaState, number>> = { ob_lang: 1440, ob_name: 1440, ob_path: 1440, rx_wait: 1440, rx_fix: 1440, dr_name: 1440, dr_clinic: 1440, dr_reward: 1440 };
const DEFAULT_TTL = 30;

export type StateData = Record<string, string | number | boolean | null>;

export function currentState(b: { wa_state: string | null; wa_state_data: unknown; wa_state_at: string | null }, now = Date.now()): { state: WaState; data: StateData } | null {
  if (!b.wa_state || !b.wa_state_at) return null;
  const ttl = (TTL[b.wa_state as WaState] ?? DEFAULT_TTL) * 60_000;
  if (now - new Date(b.wa_state_at).getTime() > ttl) return null;
  return { state: b.wa_state as WaState, data: (b.wa_state_data ?? {}) as StateData };
}

export async function setState(admin: AdminClient, bindingId: string, state: WaState, data: StateData = {}) {
  await admin.from("channel_bindings").update({ wa_state: state, wa_state_data: data as Json, wa_state_at: new Date().toISOString() }).eq("id", bindingId);
}

export async function clearState(admin: AdminClient, bindingId: string) {
  await admin.from("channel_bindings").update({ wa_state: null, wa_state_data: {}, wa_state_at: null }).eq("id", bindingId);
}
