import Link from "next/link";
import { redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { LogOut, MessageCircle } from "lucide-react";
import { requireUser } from "@/lib/supabase/server";
import { BottomNav } from "@/components/BottomNav";
import { Logo } from "@/components/Logo";
import { NotificationBell, type BellItem } from "@/components/NotificationBell";
import { TopTitle } from "@/components/TopTitle";
import { getNotifications } from "@/server/notifications";
import { nowMs } from "@/lib/format";

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

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { supabase, user } = await requireUser();
  const { data: profile } = await supabase.from("profiles").select("onboarded_at, display_name, timezone").eq("id", user.id).single();
  if (!profile?.onboarded_at) redirect("/onboarding");
  // One row per user per day for engagement metrics; never blocks rendering.
  const [t, locale, notifs] = await Promise.all([
    getTranslations(),
    getLocale(),
    getNotifications(supabase, user.id, profile.timezone ?? "Asia/Kolkata").catch(() => []),
    supabase.rpc("touch_activity").then(() => undefined, () => undefined),
  ]);
  const now = nowMs();
  const bell: BellItem[] = notifs.map((n) => ({ id: n.id, kind: n.kind, text: t(`notif.${n.key}`, n.values), href: n.href, when: n.kind === "whatsapp" ? t("notif.tip") : relative(n.at, locale, now), unread: n.unread }));
  const name = profile.display_name || user.email || "";
  const initial = (profile.display_name || user.email || "?").trim().charAt(0).toUpperCase();

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[264px_minmax(0,1fr)]">
      <a href="#main" className="skip-link">{t("app.skipToContent")}</a>
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-dvh flex-col border-r border-line bg-surface px-4 py-6 lg:flex">
        <div className="px-2"><Logo href="/today" /></div>
        <div className="mt-9 flex-1"><BottomNav variant="sidebar" /></div>
        <Link href="/chat" className="mb-4 block rounded-2xl bg-[linear-gradient(135deg,var(--hero-from),var(--hero-to))] p-4 text-white">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/15"><MessageCircle size={18} aria-hidden="true" /></span>
          <span className="mt-3 block font-semibold">{t("shell.askTitle")}</span>
          <span className="mt-0.5 block text-sm text-white/80">{t("shell.askBody")}</span>
        </Link>
        <div className="flex items-center gap-3 rounded-2xl border border-line p-2.5">
          <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-soft text-sm font-bold text-primary">{initial}</span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold">{name}</span>
            <Link href="/settings" className="block text-xs text-ink-soft hover:underline">{t("app.account")}</Link>
          </span>
          <form action="/auth/signout" method="post">
            <button className="flex h-9 w-9 items-center justify-center rounded-lg text-ink-soft hover:bg-surface-2 hover:text-ink" aria-label={t("common.signOut")}><LogOut size={18} aria-hidden="true" /></button>
          </form>
        </div>
      </aside>

      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-3 border-b border-line bg-bg/85 px-4 backdrop-blur-md sm:px-6 lg:px-10">
          <div className="flex min-w-0 items-center gap-3">
            <span className="lg:hidden"><Logo href="/today" size={26} /></span>
            <TopTitle />
          </div>
          <div className="flex items-center gap-1.5">
            <NotificationBell items={bell} />
            <Link href="/settings" aria-label={t("app.account")} className="flex h-10 w-10 items-center justify-center rounded-full bg-primary-soft text-sm font-bold text-primary lg:hidden">{initial}</Link>
          </div>
        </header>
        <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 pb-32 pt-6 sm:px-6 lg:px-10 lg:pb-14 lg:pt-8">{children}</main>
      </div>
      <div className="lg:hidden"><BottomNav /></div>
    </div>
  );
}
