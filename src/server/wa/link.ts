import "server-only";
// One Sukhi account across the web app and WhatsApp.
//  - Web → WhatsApp: a link code (Settings) opened as a wa.me link, sent from the phone.
//  - WhatsApp → web: a one-time link sent to the number; the person logs in and confirms.
//  - An account that was created on WhatsApp is merged into the web account when linked.
//  - Open on the web: a one-time login link sent only to the verified WhatsApp number.
import type { AdminClient } from "@/lib/supabase/admin";
import { settings } from "@/lib/config";
import { randomToken, sha256Hex } from "@/domain/router";
import { COUNTRIES, maskEmail, normalizePhone } from "@/domain/wa-ui";

const CONNECT_MINUTES = 30;

const hashToken = (t: string) => sha256Hex(`${process.env.LINK_CODE_PEPPER ?? ""}:waconnect:${t}`);

/** A one-time "connect this WhatsApp to my web account" link for a number. */
export async function createConnectLink(admin: AdminClient, externalId: string): Promise<string> {
  // A few links an hour per number is plenty; older unused ones simply expire.
  const since = new Date(Date.now() - 3600_000).toISOString();
  const { count } = await admin.from("wa_connect_requests").select("token_hash", { count: "exact", head: true }).eq("external_id", externalId).gte("created_at", since);
  if ((count ?? 0) >= 6) throw new Error("connect_rate_limited");
  const token = randomToken(24);
  await admin.from("wa_connect_requests").insert({ token_hash: await hashToken(token), external_id: externalId, expires_at: new Date(Date.now() + CONNECT_MINUTES * 60_000).toISOString() });
  return `${settings.appUrl()}/whatsapp/connect/${token}`;
}

export async function findConnectRequest(admin: AdminClient, token: string) {
  if (!/^[0-9a-f]{48}$/.test(token)) return null;
  const { data } = await admin.from("wa_connect_requests").select("token_hash, external_id, expires_at, used_at").eq("token_hash", await hashToken(token)).maybeSingle();
  if (!data || data.used_at || new Date(data.expires_at) < new Date()) return null;
  const { data: bound } = await admin.from("channel_bindings").select("user_id").eq("channel", "whatsapp").eq("external_id", data.external_id).neq("status", "revoked").maybeSingle();
  const { data: prof } = bound ? await admin.from("profiles").select("signup_channel").eq("id", bound.user_id).maybeSingle() : { data: null };
  return { ...data, boundTo: bound?.user_id ?? null, boundIsWhatsAppAccount: prof?.signup_channel === "whatsapp" };
}

export type ConnectResult = "linked" | "already" | "merged" | "other_account";

/** Attach a WhatsApp number to an account, merging a WhatsApp-only account if there is one. */
export async function connectNumber(admin: AdminClient, userId: string, externalId: string): Promise<ConnectResult> {
  const { data: bound } = await admin.from("channel_bindings").select("id, user_id, status").eq("channel", "whatsapp").eq("external_id", externalId).neq("status", "revoked").maybeSingle();
  let result: ConnectResult;
  if (bound?.user_id === userId) {
    await admin.from("channel_bindings").update({ status: "active", opted_out_at: null }).eq("id", bound.id);
    result = "already";
  } else if (bound) {
    const { data: src } = await admin.from("profiles").select("signup_channel").eq("id", bound.user_id).maybeSingle();
    if (src?.signup_channel !== "whatsapp") return "other_account";
    const { error } = await admin.rpc("merge_whatsapp_account", { p_src: bound.user_id, p_dst: userId });
    if (error) throw new Error(`merge_failed:${error.message}`.slice(0, 160));
    await admin.auth.admin.deleteUser(bound.user_id);
    result = "merged";
  } else {
    // Replaces any other number this account had.
    await admin.from("channel_bindings").update({ status: "revoked", opted_out_at: new Date().toISOString() }).eq("user_id", userId).neq("status", "revoked");
    const { data: prior } = await admin.from("channel_bindings").select("last_inbound_at").eq("external_id", externalId).order("created_at", { ascending: false }).limit(1).maybeSingle();
    const { error } = await admin.from("channel_bindings").insert({ user_id: userId, external_id: externalId, status: "active", last_inbound_at: prior?.last_inbound_at ?? null });
    if (error) throw new Error(`bind_failed:${error.code}`);
    result = "linked";
  }
  await admin.from("consents").upsert({ user_id: userId, kind: "whatsapp", granted: true, granted_at: new Date().toISOString(), revoked_at: null }, { onConflict: "user_id,kind" });
  // The number is now proven for this account.
  await admin.rpc("merge_phone_after_link", { p_user: userId, p_phone: externalId });
  await admin.from("audit_events").insert({ user_id: userId, actor: "user", action: "whatsapp_connected", entity: "channel_binding", details: { result } });
  return result;
}

/** WhatsApp → web confirm step: consume the link and connect. */
export async function claimConnectRequest(admin: AdminClient, userId: string, token: string): Promise<ConnectResult | "invalid"> {
  const req = await findConnectRequest(admin, token);
  if (!req) return "invalid";
  const { data: claimed } = await admin.from("wa_connect_requests").update({ used_at: new Date().toISOString(), used_by: userId }).eq("token_hash", req.token_hash).is("used_at", null).select("external_id").maybeSingle();
  if (!claimed) return "invalid";
  return connectNumber(admin, userId, claimed.external_id);
}

/** A web link code (SUKHI-XXXXXXXX) sent from a number that already has a WhatsApp-only account. */
export async function consumeCodeForBoundNumber(admin: AdminClient, codeHash: string, externalId: string): Promise<{ result: ConnectResult | "invalid"; userId?: string }> {
  const { data: lc } = await admin.from("link_codes").update({ used_at: new Date().toISOString() }).eq("code_hash", codeHash).is("used_at", null).gt("expires_at", new Date().toISOString()).select("user_id").maybeSingle();
  if (!lc) return { result: "invalid" };
  return { result: await connectNumber(admin, lc.user_id, externalId), userId: lc.user_id };
}

/** One-time login link for the web app, sent only to the person's verified WhatsApp number. */
export async function webLoginLink(admin: AdminClient, userId: string, externalId: string): Promise<string> {
  const { data } = await admin.auth.admin.getUserById(userId);
  let email = data.user?.email ?? null;
  if (!email) {
    // Phone-only accounts get an internal address so a login link can be made. Nothing is sent to it.
    email = `wa${externalId}@${new URL(settings.appUrl()).hostname}`;
    const up = await admin.auth.admin.updateUserById(userId, { email, email_confirm: true });
    if (up.error) throw new Error(`web_login_email:${up.error.code ?? up.error.message}`.slice(0, 120));
  }
  const link = await admin.auth.admin.generateLink({ type: "magiclink", email });
  const hashed = link.data.properties?.hashed_token;
  if (link.error || !hashed) throw new Error("web_login_link_failed");
  return `${settings.appUrl()}/auth/wa?t=${encodeURIComponent(hashed)}`;
}

// ---------------------------------------------------------------------------
// Matching a WhatsApp number to a web account by the phone saved on it
// ---------------------------------------------------------------------------
export interface WebMatch { userId: string; name: string; email: string }

/** The one web account (other than `exclude`) that has this phone on it, if exactly one does. */
export async function findWebMatch(admin: AdminClient, phone: string, exclude?: string): Promise<WebMatch | null> {
  let q = admin.from("profiles").select("id, display_name").eq("phone", phone).eq("signup_channel", "web").limit(2);
  if (exclude) q = q.neq("id", exclude);
  const { data } = await q;
  if (data?.length !== 1) return null;
  const { data: u } = await admin.auth.admin.getUserById(data[0].id);
  return { userId: data[0].id, name: data[0].display_name?.split(" ")[0] ?? "", email: maskEmail(u.user?.email) };
}

/** A prompt was answered for this pair recently: don't ask again. */
export async function matchRecentlyAsked(admin: AdminClient, userId: string, phone: string, withinHours: number) {
  const since = new Date(Date.now() - withinHours * 3600_000).toISOString();
  const { count } = await admin.from("audit_events").select("id", { count: "exact", head: true }).eq("user_id", userId).in("action", ["wa_match_prompted", "wa_match_declined"]).eq("entity_id", phone).gte("created_at", since);
  return (count ?? 0) > 0;
}

export type SavePhoneResult = { ok: true; phone: string; verified: boolean; whatsappAccount: string | null } | { ok: false; error: "invalid_phone" | "phone_taken" };

/** Save the phone a web user typed. Verified only when their own WhatsApp link already proves it. */
export async function savePhone(admin: AdminClient, userId: string, raw: string, dialRaw?: string | null): Promise<SavePhoneResult> {
  const dial = COUNTRIES.some((c) => c.dial === dialRaw) ? dialRaw! : "91";
  const phone = normalizePhone(raw, dial);
  if (!phone) return { ok: false, error: "invalid_phone" };
  const { data: verifiedElsewhere } = await admin.from("profiles").select("id, signup_channel").eq("phone", phone).not("phone_verified_at", "is", null).neq("id", userId).maybeSingle();
  if (verifiedElsewhere && verifiedElsewhere.signup_channel !== "whatsapp") return { ok: false, error: "phone_taken" };
  const { data: bound } = await admin.from("channel_bindings").select("user_id").eq("channel", "whatsapp").eq("external_id", phone).neq("status", "revoked").maybeSingle();
  const verified = bound?.user_id === userId;
  await admin.from("profiles").update({ phone, phone_verified_at: verified ? new Date().toISOString() : null }).eq("id", userId);
  // Already chatting on WhatsApp with an account made there: that account is asked to join.
  return { ok: true, phone, verified, whatsappAccount: bound && bound.user_id !== userId && verifiedElsewhere?.signup_channel === "whatsapp" ? bound.user_id : null };
}
