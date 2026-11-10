import { getTranslations } from "next-intl/server";

export default async function Offline() {
  const t = await getTranslations("offline");
  return (
    <main className="mx-auto max-w-md p-6">
      <h1 className="text-2xl font-bold">{t("title")}</h1>
      <p className="mt-2">{t("body")}</p>
    </main>
  );
}
