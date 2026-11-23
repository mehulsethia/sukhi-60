import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getUser } from "@/lib/supabase/server";
import { AuthShell } from "@/components/auth/AuthShell";
import { LoginForm } from "@/components/auth/LoginForm";
import { DoctorLink } from "@/components/auth/DoctorLink";

export const metadata: Metadata = { title: "Log in" };

const safeNext = (n?: string) => (n && n.startsWith("/") && !n.startsWith("//") ? n : "/today");

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const sp = await searchParams;
  const { user } = await getUser();
  if (user) redirect(safeNext(sp.next));
  const t = await getTranslations("auth");
  return (
    <AuthShell title={t("loginTitle")} subtitle={t("loginSubtitle")}>
      <LoginForm next={safeNext(sp.next)} initialError={sp.error === "link" ? t("linkError") : sp.error ? t("genericError") : null} />
      {sp.next ? null : <DoctorLink />}
    </AuthShell>
  );
}
