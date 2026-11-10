import { getTranslations } from "next-intl/server";
import { getUser } from "@/lib/supabase/server";
import { SiteHeader } from "@/components/landing/SiteHeader";

export async function LegalPage({ titleKey, introKey, sections }: { titleKey: string; introKey: string; sections: [string, string][] }) {
  const t = await getTranslations("legal");
  const { user } = await getUser();
  return (
    <>
      <SiteHeader signedIn={!!user} />
      <main id="main" className="mx-auto max-w-2xl px-4 py-14 sm:px-6">
        <h1 className="text-4xl font-bold sm:text-5xl">{t(titleKey)}</h1>
        <p className="mt-3 text-sm text-ink-soft">{t("draftNote")}</p>
        <p className="mt-6 text-lg">{t(introKey)}</p>
        {sections.map(([h, b]) => (
          <section key={h} className="mt-10">
            <h2 className="text-2xl font-bold">{t(h)}</h2>
            <p className="mt-3 leading-relaxed text-ink-soft">{t(b)}</p>
          </section>
        ))}
      </main>
    </>
  );
}
