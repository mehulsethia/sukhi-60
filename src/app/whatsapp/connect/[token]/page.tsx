import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { requireUser } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { AuthShell } from "@/components/auth/AuthShell";
import { Alert } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { findConnectRequest } from "@/server/wa/link";
import { connectWhatsAppAction } from "@/app/actions";

export const metadata: Metadata = { title: "Connect WhatsApp" };

// Opened from the link Sukhi sends on WhatsApp. Logging in (the proxy sends you to /login
// first) proves the account; the link itself only reached that WhatsApp chat.
export default async function ConnectWhatsApp({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ e?: string }> }) {
  const { token } = await params;
  const { e } = await searchParams;
  const { user } = await requireUser();
  const t = await getTranslations("settings");
  const req = await findConnectRequest(createAdminClient(), token);
  if (!req) {
    return <AuthShell title={t("waConnectTitle")}><Alert tone="warn">{t("waConnectInvalid")}</Alert></AuthShell>;
  }
  if (req.boundTo === user.id) redirect("/settings#wa");
  const masked = `+${req.external_id.slice(0, -4).replace(/\d/g, "•")}${req.external_id.slice(-4)}`;
  const blocked = !!req.boundTo && !req.boundIsWhatsAppAccount;
  return (
    <AuthShell title={t("waConnectTitle")}>
      <div className="flex flex-col gap-4">
        <p>{t("waConnectBody", { number: masked })}</p>
        {req.boundIsWhatsAppAccount ? <p className="hint">{t("waConnectMerge")}</p> : null}
        {blocked || e === "other" ? <Alert tone="danger">{t("waConnectOther")}</Alert> : null}
        {e === "failed" ? <Alert tone="danger">{t("waConnectInvalid")}</Alert> : null}
        {!blocked ? (
          <form action={connectWhatsAppAction}>
            <input type="hidden" name="token" value={token} />
            <SubmitButton className="btn btn-primary w-full" pendingLabel="…">{t("waConnectButton")}</SubmitButton>
          </form>
        ) : null}
      </div>
    </AuthShell>
  );
}
