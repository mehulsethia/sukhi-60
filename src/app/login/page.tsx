import { getTranslations } from "next-intl/server";
import { LoginForm } from "./LoginForm";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const sp = await searchParams;
  const t = await getTranslations();
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center p-6">
      <h1 className="mb-6 text-3xl font-bold">{t("login.title")}</h1>
      <LoginForm next={sp.next && sp.next.startsWith("/") && !sp.next.startsWith("//") ? sp.next : "/today"} initialError={sp.error ? t("login.failed") : null} />
      <p className="hint mt-6">{t("common.disclaimer")}</p>
    </main>
  );
}
