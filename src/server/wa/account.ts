import "server-only";
// Accounts that start on WhatsApp. The phone number is proven by the message coming from it
// (Meta signs every webhook), so no password or OTP is needed. The person agreed by tapping
// Start on a message that says what Sukhi does with their messages.
import type { AdminClient } from "@/lib/supabase/admin";
import { audit } from "../core";

export type WaRole = "patient" | "family" | "doctor";

export async function createWaAccount(admin: AdminClient, from: string, role: WaRole): Promise<{ userId: string; bindingId: string }> {
  // A number that was unlinked earlier keeps its old account (no duplicate users per phone).
  const { data: prior } = await admin.from("channel_bindings").select("id, user_id, status").eq("channel", "whatsapp").eq("external_id", from).order("created_at", { ascending: false }).limit(1).maybeSingle();
  let userId = prior?.user_id ?? null;
  if (userId) {
    const { data: exists } = await admin.from("profiles").select("id").eq("id", userId).maybeSingle();
    if (!exists) userId = null;
  }
  if (!userId) {
    const created = await admin.auth.admin.createUser({ phone: from, phone_confirm: true, user_metadata: { signup: "whatsapp" } });
    if (created.error || !created.data.user) {
      // Phone already registered (e.g. signed up on the web with this phone): never take it over.
      throw new Error(`wa_account_create_failed:${created.error?.code ?? created.error?.message ?? "unknown"}`.slice(0, 120));
    }
    userId = created.data.user.id;
  }
  await admin.from("profiles").update({ signup_channel: "whatsapp", primary_role: role }).eq("id", userId);

  let bindingId: string;
  const { data: active } = await admin.from("channel_bindings").select("id").eq("channel", "whatsapp").eq("external_id", from).neq("status", "revoked").maybeSingle();
  if (active) {
    bindingId = active.id;
    await admin.from("channel_bindings").update({ status: "active", opted_out_at: null, last_inbound_at: new Date().toISOString() }).eq("id", active.id);
  } else {
    const { data: b, error } = await admin.from("channel_bindings").insert({ user_id: userId, external_id: from, status: "active", last_inbound_at: new Date().toISOString() }).select("id").single();
    if (error || !b) throw new Error(`wa_binding_failed:${error?.code ?? "unknown"}`);
    bindingId = b.id;
  }
  const now = new Date().toISOString();
  const kinds = role === "patient" ? (["whatsapp", "reminders", "ai_processing", "voice_processing"] as const) : (["whatsapp", "ai_processing"] as const);
  await admin.rpc("merge_phone_after_link", { p_user: userId, p_phone: from });
  await admin.from("consents").upsert(kinds.map((kind) => ({ user_id: userId!, kind, granted: true, granted_at: now, revoked_at: null, policy_version: "2026-11-wa-v1" })), { onConflict: "user_id,kind" });
  await audit(admin, userId, "user", "whatsapp_signup", "channel_binding", bindingId, { role });
  return { userId, bindingId };
}

/** Someone who first came as family or doctor later wants their own reminders. */
export async function grantPatientConsents(admin: AdminClient, userId: string) {
  const now = new Date().toISOString();
  await admin.from("consents").upsert((["reminders", "ai_processing", "voice_processing"] as const).map((kind) => ({ user_id: userId, kind, granted: true, granted_at: now, revoked_at: null, policy_version: "2026-11-wa-v1" })), { onConflict: "user_id,kind" });
}
