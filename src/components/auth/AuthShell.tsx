import { getTranslations } from "next-intl/server";
import { Check } from "lucide-react";
import { Logo } from "@/components/Logo";

// Split layout for every auth screen: brand panel (desktop) + focused form.
export async function AuthShell({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  const t = await getTranslations();
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1fr_1.05fr]">
      <aside className="relative hidden overflow-hidden bg-[#18213f] p-12 text-[#eef0f8] lg:flex lg:flex-col lg:justify-between">
        <div aria-hidden="true" className="absolute -bottom-40 -left-24 h-[480px] w-[480px] rounded-full bg-[radial-gradient(circle,color-mix(in_srgb,#f0b23a_35%,transparent),transparent_65%)]" />
        <div className="relative [&_span]:!text-[#eef0f8]"><Logo /></div>
        <div className="relative max-w-md">
          <p className="display text-5xl font-bold leading-[1.05]">{t("auth.brandTitle")}</p>
          <ul className="mt-8 space-y-4 text-lg text-[#c3c9e0]">
            {(["brandPoint1", "brandPoint2", "brandPoint3"] as const).map((k) => (
              <li key={k} className="flex gap-3"><Check size={22} className="mt-0.5 shrink-0 text-[#8fe0b8]" aria-hidden="true" />{t(`auth.${k}`)}</li>
            ))}
          </ul>
        </div>
        <p className="relative text-sm text-[#9aa2c0]">{t("common.disclaimer")}</p>
      </aside>
      <main id="main" className="flex flex-col px-5 py-8 sm:px-10">
        <div className="lg:hidden"><Logo /></div>
        <div className="mx-auto flex w-full max-w-[420px] flex-1 flex-col justify-center py-10">
          <h1 className="text-[2.1rem] font-bold sm:text-4xl">{title}</h1>
          {subtitle ? <p className="mt-2 text-lg text-ink-soft">{subtitle}</p> : null}
          <div className="mt-8">{children}</div>
        </div>
        <p className="hint text-center lg:hidden">{t("common.disclaimer")}</p>
      </main>
    </div>
  );
}
