import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getUser } from "@/lib/supabase/server";
import { AuthShell } from "@/components/auth/AuthShell";
import { SignupForm } from "@/components/auth/SignupForm";
import { DoctorLink } from "@/components/auth/DoctorLink";

export const metadata: Metadata = { title: "Create account" };

const safeNext = (n?: string) => (n && n.startsWith("/") && !n.startsWith("//") ? n : undefined);

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = safeNext((await searchParams).next);
  const { user } = await getUser();
  if (user) redirect(next ?? "/today");
  const t = await getTranslations("auth");
  return (
    <AuthShell title={t("signupTitle")} subtitle={t("signupSubtitle")}>
      <SignupForm next={next} />
      {next ? null : <DoctorLink />}
    </AuthShell>
  );
}
