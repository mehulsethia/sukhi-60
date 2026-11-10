import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getUser } from "@/lib/supabase/server";
import { AuthShell } from "@/components/auth/AuthShell";
import { SignupForm } from "@/components/auth/SignupForm";

export const metadata: Metadata = { title: "Create account" };

export default async function SignupPage() {
  const { user } = await getUser();
  if (user) redirect("/today");
  const t = await getTranslations("auth");
  return (
    <AuthShell title={t("signupTitle")} subtitle={t("signupSubtitle")}>
      <SignupForm />
    </AuthShell>
  );
}
