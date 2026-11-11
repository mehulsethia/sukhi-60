import { getLocale, getTranslations } from "next-intl/server";
import { getUser } from "@/lib/supabase/server";
import { getNotifications } from "@/server/notifications";
import { errorJson, json } from "@/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function relative(at: string, locale: string, now: number) {
  const diff = (new Date(at).getTime() - now) / 1000;
  const rtf = new Intl.RelativeTimeFormat(locale === "en" ? "en-IN" : `${locale}-IN`, { numeric: "auto" });
  const abs = Math.abs(diff);
  if (abs < 60) return rtf.format(Math.round(diff), "second");
  if (abs < 3600) return rtf.format(Math.round(diff / 60), "minute");
  if (abs < 86_400) return rtf.format(Math.round(diff / 3600), "hour");
  return rtf.format(Math.round(diff / 86_400), "day");
}

// The bell loads after the page renders, so no page waits on these ~10 queries.
export async function GET() {
  const { supabase, user } = await getUser();
  if (!user) return errorJson("unauthenticated", 401);
  const { data: profile } = await supabase.from("profiles").select("timezone").eq("id", user.id).single();
  const [t, locale, notifs] = await Promise.all([getTranslations(), getLocale(), getNotifications(supabase, user.id, profile?.timezone ?? "Asia/Kolkata")]);
  const now = Date.now();
  const items = notifs.map((n) => ({ id: n.id, kind: n.kind, text: t(`notif.${n.key}`, n.values), href: n.href, when: n.kind === "whatsapp" ? t("notif.tip") : relative(n.at, locale, now), unread: n.unread }));
  return json({ items });
}
