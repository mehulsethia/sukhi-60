import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { LogOut } from "lucide-react";
import { requireUser } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { Logo } from "@/components/Logo";
import { RoleSwitcher } from "@/components/RoleSwitcher";
import { getSwitchOptions } from "@/server/care-for";
import { getDoctor } from "@/server/clinic";

export const dynamic = "force-dynamic";

// The doctor's web clinic. Only for accounts with a doctor profile.
export default async function ClinicLayout({ children }: { children: React.ReactNode }) {
  const { user } = await requireUser();
  const admin = createAdminClient();
  const [doc, options, t] = await Promise.all([getDoctor(admin, user.id), getSwitchOptions(admin, user.id, "").catch(() => []), getTranslations()]);
  if (!doc) redirect("/today");
  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b border-line/70 bg-bg/80 px-4 backdrop-blur-md sm:px-6">
        <div className="flex min-w-0 items-center gap-2">
          <Logo href="/clinic" size={24} />
          <span className="rounded-full bg-primary-soft px-2 py-0.5 text-[0.7rem] font-semibold text-primary">{t("clinic.badge")}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <RoleSwitcher options={options} />
          <form action="/auth/signout" method="post">
            <button className="flex h-9 w-9 items-center justify-center rounded-lg text-ink-soft hover:bg-sky hover:text-ink" aria-label={t("common.signOut")}><LogOut size={18} aria-hidden="true" /></button>
          </form>
        </div>
      </header>
      <main id="main" className="mx-auto w-full max-w-3xl px-4 pb-16 pt-6 sm:px-6">{children}</main>
    </div>
  );
}
