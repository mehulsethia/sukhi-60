import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { getUser } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { features } from "@/lib/config";

export default async function Landing() {
  const { user } = await getUser();
  if (user) redirect("/today");
  const t = await getTranslations();
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center gap-6 p-6">
      <div>
        <p className="text-sm font-semibold uppercase tracking-widest text-primary">{t("common.appName")}</p>
        <h1 className="mt-2 text-3xl font-bold leading-tight">{t("landing.tagline")}</h1>
      </div>
      <ul className="space-y-3">
        {(["pillar1", "pillar2", "pillar3"] as const).map((k) => (
          <li key={k} className="card flex gap-3"><span aria-hidden="true" className="text-leaf">❀</span>{t(`landing.${k}`)}</li>
        ))}
      </ul>
      <div className="flex flex-col gap-3 sm:flex-row">
        <Link href="/login" className="btn btn-primary">{t("landing.signIn")}</Link>
        {features.demo() ? <Link href="/demo" className="btn btn-secondary">{t("landing.demo")}</Link> : null}
      </div>
      <p className="hint">{t("common.disclaimer")}</p>
    </main>
  );
}
