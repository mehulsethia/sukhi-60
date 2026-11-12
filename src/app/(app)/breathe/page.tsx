import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { requireUser } from "@/lib/supabase/server";
import { Breathing } from "@/components/Breathing";

export const metadata: Metadata = { title: "Breathe" };

export default async function BreathePage() {
  await requireUser();
  const t = await getTranslations("companion");
  return (
    <div className="mx-auto max-w-xl">
      <h1 className="text-[1.9rem] sm:text-[2.3rem]">{t("breatheTitle")}</h1>
      <p className="mt-2 text-lg text-ink-soft">{t("breatheBody")}</p>
      <div className="panel mt-6 p-6 sm:p-8"><Breathing /></div>
      <p className="hint mt-6">{t("breatheNote")}</p>
      <p className="mt-2 rounded-xl bg-sky p-3 text-sm">{t("helpline")}</p>
    </div>
  );
}
