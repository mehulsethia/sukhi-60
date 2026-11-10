import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { AuthShell } from "@/components/auth/AuthShell";
import { ForgotForm } from "@/components/auth/ForgotForm";

export const metadata: Metadata = { title: "Reset password" };

export default async function ForgotPage() {
  const t = await getTranslations("auth");
  return (
    <AuthShell title={t("forgotTitle")} subtitle={t("forgotBody")}>
      <ForgotForm />
    </AuthShell>
  );
}
