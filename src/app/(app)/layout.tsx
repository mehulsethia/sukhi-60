import { ToastHost } from "@/components/Toast";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { LogOut } from "lucide-react";
import { requireUser } from "@/lib/supabase/server";
import { BottomNav } from "@/components/BottomNav";
import { Logo } from "@/components/Logo";
import { NotificationBell } from "@/components/NotificationBell";
import { ActivityPing } from "@/components/ActivityPing";
import { TopTitle } from "@/components/TopTitle";
import { cookies } from "next/headers";
import { nowMs } from "@/lib/format";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSwitchOptions } from "@/server/care-for";
import { RoleSwitcher } from "@/components/RoleSwitcher";
import { TalkToSukhi } from "@/components/TalkToSukhi";
import { features } from "@/lib/config";
import { getConsents } from "@/server/core";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { supabase, user } = await requireUser();
  const { data: profile } = await supabase.from("profiles").select("onboarded_at, display_name, phone, primary_role, locale").eq("id", user.id).single();
  if (profile?.primary_role === "doctor") {
    // Doctor-only accounts land on their clinic. "Start your own plan" there goes to onboarding.
    const { data: doc } = await createAdminClient().from("doctors").select("user_id").eq("user_id", user.id).maybeSingle();
    if (doc) redirect("/clinic");
  }
  if (!profile?.onboarded_at || profile.primary_role === "family") {
    // Came as family (follows someone, no plan of their own): land on that person's summary,
    // not patient onboarding. Their page links to onboarding if they want a plan.
    const { data: follow } = await supabase.from("family_access").select("id").eq("member_user_id", user.id).eq("status", "active").limit(1).maybeSingle();
    if (follow) redirect(`/family/${follow.id}`);
    if (!profile?.onboarded_at) redirect("/onboarding");
  }
  // Every account has a phone number (it connects WhatsApp to this account).
  if (!profile.phone) redirect("/phone");
  const chatSeen = (await cookies()).get("sukhi_chat_seen")?.value ?? profile.onboarded_at;
  const [t, unreadChat, switchOpts, consents] = await Promise.all([
    getTranslations(),
    // Messages Sukhi started (reminders, check-ins) since the chat was last opened.
    supabase.from("messages").select("id", { count: "exact", head: true }).gt("created_at", chatSeen).eq("role", "assistant").eq("channel", "system").then((r) => r.count ?? 0, () => 0),
    getSwitchOptions(createAdminClient(), user.id, "").catch(() => []),
    getConsents(createAdminClient(), user.id).catch(() => null),
  ]);
  // ElevenLabs speech when it's configured and the person allowed voice processing; otherwise
  // the browser's own speech recognition and voice.
  const serverSpeech = features.speech() && !!consents?.voice_processing;
  const name = profile.display_name || user.email || "";
  const initial = (profile.display_name || user.email || "?").trim().charAt(0).toUpperCase();

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[264px_minmax(0,1fr)]">
      <a href="#main" className="skip-link">{t("app.skipToContent")}</a>
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-dvh flex-col border-r border-line bg-surface px-4 py-6 lg:flex print:!hidden">
        <div className="px-2"><Logo href="/today" /></div>
        <div className="mt-9 flex-1"><BottomNav variant="sidebar" badges={{ chat: unreadChat }} /></div>
        <div className="flex items-center gap-3 rounded-[var(--r-lg)] border border-line p-2.5">
          <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-soft text-sm font-bold text-primary">{initial}</span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold">{name}</span>
            <Link href="/settings" className="block text-xs text-ink-soft hover:underline">{t("app.account")}</Link>
          </span>
          <form action="/auth/signout" method="post">
            <button className="flex h-9 w-9 items-center justify-center rounded-lg text-ink-soft hover:bg-sky hover:text-ink" aria-label={t("common.signOut")}><LogOut size={18} aria-hidden="true" /></button>
          </form>
        </div>
      </aside>

      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-30 flex h-14 print:hidden items-center justify-between gap-3 border-b border-line/70 bg-bg/80 px-4 backdrop-blur-md sm:px-6 lg:px-10">
          <div className="flex min-w-0 items-center gap-3">
            <span className="lg:hidden"><Logo href="/today" size={24} /></span>
            <TopTitle />
          </div>
          <div className="flex items-center gap-1.5">
            <RoleSwitcher options={switchOpts} />
            <NotificationBell />
            <Link href="/settings" aria-label={t("app.account")} className="flex h-9 w-9 items-center justify-center rounded-full bg-primary-soft text-[0.8rem] font-semibold text-primary lg:hidden">{initial}</Link>
          </div>
        </header>
        <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 pb-32 pt-6 sm:px-6 lg:px-10 lg:pb-14 lg:pt-8">{children}</main>
      </div>
      <div className="lg:hidden print:hidden"><BottomNav badges={{ chat: unreadChat }} /></div>
      <TalkToSukhi locale={profile.locale ?? "en"} serverSpeech={serverSpeech} />
      <ActivityPing renderedAt={nowMs()} />
      <ToastHost />
    </div>
  );
}
