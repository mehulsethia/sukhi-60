import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { getUser } from "@/lib/supabase/server";
import { AuthShell } from "@/components/auth/AuthShell";
import { ResetForm } from "@/components/auth/ResetForm";
import Link from "next/link";

export const metadata: Metadata = { title: "Choose a new password" };

// Reached from the emailed recovery link via /auth/callback, which establishes a session.
export default async function ResetPage() {
  const { user } = await getUser();
  const t = await getTranslations("auth");
  return (
    <AuthShell title={t("resetTitle")}>
      {user ? <ResetForm /> : (
        <div className="flex flex-col gap-4">
          <p className="rounded-xl bg-warn-bg px-4 py-3 text-warn-ink">{t("resetExpired")}</p>
          <Link href="/forgot-password" className="btn btn-primary w-full">{t("sendReset")}</Link>
        </div>
      )}
    </AuthShell>
  );
}
