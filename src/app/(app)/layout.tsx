import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { LogOut } from "lucide-react";
import { requireUser } from "@/lib/supabase/server";
import { BottomNav } from "@/components/BottomNav";
import { Logo } from "@/components/Logo";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { supabase, user } = await requireUser();
  const { data: profile } = await supabase.from("profiles").select("onboarded_at, display_name").eq("id", user.id).single();
  if (!profile?.onboarded_at) redirect("/onboarding");
  const t = await getTranslations();
  const name = profile.display_name || user.email || "";
  const initial = (profile.display_name || user.email || "?").trim().charAt(0).toUpperCase();

  return (
    <div className="min-h-dvh md:grid md:grid-cols-[248px_1fr]">
      <a href="#main" className="skip-link">{t("app.skipToContent")}</a>
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-dvh flex-col border-r border-line bg-surface px-3 py-5 md:flex">
        <div className="px-2"><Logo href="/today" /></div>
        <div className="mt-8 flex-1"><BottomNav variant="sidebar" /></div>
        <div className="flex items-center gap-3 rounded-lg border border-line p-2.5">
          <span aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-soft text-sm font-semibold text-primary">{initial}</span>
          <span className="min-w-0 flex-1 truncate text-sm font-semibold">{name}</span>
          <form action="/auth/signout" method="post">
            <button className="flex h-9 w-9 items-center justify-center rounded-md text-ink-soft hover:bg-surface-2 hover:text-ink" aria-label={t("common.signOut")}><LogOut size={19} aria-hidden="true" /></button>
          </form>
        </div>
      </aside>

      <div className="min-w-0">
        {/* Mobile top bar */}
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-line bg-surface/90 px-4 backdrop-blur-md md:hidden">
          <Logo href="/today" size={26} />
          <Link href="/settings" aria-label={t("app.account")} className="flex h-9 w-9 items-center justify-center rounded-full bg-primary-soft text-sm font-semibold text-primary">{initial}</Link>
        </header>
        <main id="main" className="mx-auto max-w-3xl px-4 pb-32 pt-6 sm:px-6 md:pb-16 md:pt-10">{children}</main>
      </div>
      <div className="md:hidden"><BottomNav /></div>
    </div>
  );
}
