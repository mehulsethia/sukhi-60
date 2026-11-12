import "server-only";
// Web push to the user's own devices (installed PWA on Android/iPhone, or desktop browsers).
// Payloads are short and lock-screen safe. Failures never break the caller.
import webpush from "web-push";
import type { AdminClient } from "@/lib/supabase/admin";
import { features } from "@/lib/config";

export interface PushMessage {
  title: string;
  body: string;
  /** In-app path opened when the notification is tapped. */
  url: string;
  /** Same tag replaces an earlier notification instead of stacking. */
  tag?: string;
}

let configured = false;
function configure() {
  if (configured) return true;
  if (!features.push()) return false;
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:support@sukhi.app", process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!, process.env.VAPID_PRIVATE_KEY!);
  configured = true;
  return true;
}

/** Send to every device of a user. Returns how many deliveries the push service accepted. */
export async function sendPush(admin: AdminClient, userId: string, msg: PushMessage): Promise<number> {
  if (!configure()) return 0;
  const { data: subs } = await admin.from("push_subscriptions").select("id, endpoint, p256dh, auth, failures").eq("user_id", userId);
  if (!subs?.length) return 0;
  const payload = JSON.stringify({ title: msg.title.slice(0, 60), body: msg.body.slice(0, 180), url: msg.url.startsWith("/") ? msg.url : "/today", tag: msg.tag });
  let sent = 0;
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 6 * 3600, urgency: "normal" });
        sent++;
        await admin.from("push_subscriptions").update({ last_success_at: new Date().toISOString(), failures: 0 }).eq("id", s.id);
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        // 404/410: the browser dropped this subscription. Remove it; otherwise count failures.
        if (status === 404 || status === 410 || s.failures >= 4) await admin.from("push_subscriptions").delete().eq("id", s.id);
        else await admin.from("push_subscriptions").update({ failures: s.failures + 1 }).eq("id", s.id);
      }
    }),
  );
  return sent;
}

export async function saveSubscription(admin: AdminClient, userId: string, sub: { endpoint: string; p256dh: string; auth: string; userAgent?: string | null }) {
  // An endpoint belongs to one browser; if it moved to another account (shared phone), re-own it.
  const { error } = await admin.from("push_subscriptions").upsert(
    { user_id: userId, endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth, user_agent: sub.userAgent?.slice(0, 300) ?? null, failures: 0 },
    { onConflict: "endpoint" },
  );
  return !error;
}

export async function removeSubscription(admin: AdminClient, userId: string, endpoint: string) {
  await admin.from("push_subscriptions").delete().eq("user_id", userId).eq("endpoint", endpoint);
}
