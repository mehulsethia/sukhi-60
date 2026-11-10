"use client";
import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { acceptFamilyInvite } from "@/app/actions";
import { Alert } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";

export function AcceptInvite({ token }: { token: string }) {
  const t = useTranslations();
  const [state, action] = useActionState(acceptFamilyInvite, null);
  return (
    <form action={action} className="card flex flex-col gap-3">
      <input type="hidden" name="token" value={token} />
      <p className="hint">{t("family.summaryIntro")}</p>
      {state?.error ? <Alert tone="danger">{t("family.invalid")}</Alert> : null}
      <SubmitButton pendingLabel={t("common.saving")}>{t("family.accept")}</SubmitButton>
    </form>
  );
}
