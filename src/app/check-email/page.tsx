import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { AuthShell } from "@/components/auth/AuthShell";
import { ResendConfirmation } from "@/components/auth/ResendConfirmation";

export const metadata: Metadata = { title: "Check your email" };

export default async function CheckEmail({ searchParams }: { searchParams: Promise<{ email?: string }> }) {
  const { email = "" } = await searchParams;
  const t = await getTranslations("auth");
  return (
    <AuthShell title={t("checkEmailTitle")} subtitle={t("checkEmailBody", { email: email || "…" })}>
      <ResendConfirmation email={email} />
    </AuthShell>
  );
}
