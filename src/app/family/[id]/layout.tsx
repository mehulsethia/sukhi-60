import { getTranslations } from "next-intl/server";
import { LogOut } from "lucide-react";
import { requireUser } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { Logo } from "@/components/Logo";
import { RoleSwitcher } from "@/components/RoleSwitcher";
import { getSwitchOptions } from "@/server/care-for";

export const dynamic = "force-dynamic";

// The "Caring for" view: a slim header with the role switcher, no patient tabs.
export default async function CaringLayout({ children }: { children: React.ReactNode }) {
  const { user } = await requireUser();
  const [t, options] = await Promise.all([getTranslations(), getSwitchOptions(createAdminClient(), user.id, "").catch(() => [])]);
  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b border-line/70 bg-bg/80 px-4 backdrop-blur-md">
        <Logo href="/today" size={24} />
        <div className="flex items-center gap-1.5">
          <RoleSwitcher options={options} />
          <form action="/auth/signout" method="post">
            <button className="flex h-9 w-9 items-center justify-center rounded-lg text-ink-soft hover:bg-sky hover:text-ink" aria-label={t("common.signOut")}><LogOut size={18} aria-hidden="true" /></button>
          </form>
        </div>
      </header>
      {children}
    </div>
  );
}
