import { getTranslations } from "next-intl/server";

export default async function Offline() {
  const t = await getTranslations();
  return (
    <main className="mx-auto max-w-md p-6">
      <h1 className="text-2xl font-bold">{t("offline.title")}</h1>
      <p className="mt-2">{t("offline.body")}</p>
      {/* A plain link: this page is served from the offline cache, without the app's scripts. */}
      <a href="/today" className="btn btn-primary mt-5 inline-flex">{t("common.retry")}</a>
    </main>
  );
}
