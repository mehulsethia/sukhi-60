import { getTranslations } from "next-intl/server";
import { Check } from "lucide-react";
import { Logo } from "@/components/Logo";

// Split layout for every auth screen: brand panel (desktop) + focused form.
export async function AuthShell({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  const t = await getTranslations();
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1fr_1.05fr]">
      <aside className="relative hidden bg-ink p-12 text-surface lg:flex lg:flex-col lg:justify-between">
        <div className="[&_span]:!text-surface"><Logo /></div>
        <div className="relative max-w-md">
          <p className="display text-[2.8rem] font-semibold leading-[1.08]">{t("auth.brandTitle")}</p>
          <ul className="mt-8 space-y-4 text-lg opacity-80">
            {(["brandPoint1", "brandPoint2", "brandPoint3"] as const).map((k) => (
              <li key={k} className="flex gap-3"><Check size={20} className="mt-1 shrink-0" aria-hidden="true" />{t(`auth.${k}`)}</li>
            ))}
          </ul>
        </div>
        <p className="relative text-sm opacity-60">{t("common.disclaimer")}</p>
      </aside>
      <main id="main" className="flex flex-col px-5 py-8 sm:px-10">
        <div className="lg:hidden"><Logo /></div>
        <div className="mx-auto flex w-full max-w-[420px] flex-1 flex-col justify-center py-10">
          <h1 className="text-[2rem] sm:text-[2.4rem]">{title}</h1>
          {subtitle ? <p className="mt-2 text-lg text-ink-soft">{subtitle}</p> : null}
          <div className="mt-8">{children}</div>
        </div>
        <p className="hint text-center lg:hidden">{t("common.disclaimer")}</p>
      </main>
    </div>
  );
}
