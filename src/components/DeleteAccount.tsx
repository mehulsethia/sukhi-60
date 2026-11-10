"use client";
import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { deleteAccount } from "@/app/actions";
import { Alert } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";

export function DeleteAccount() {
  const t = useTranslations();
  const [state, action] = useActionState(deleteAccount, null);
  const [value, setValue] = useState("");
  return (
    <form action={action} className="flex flex-col gap-3">
      <p className="text-ink-soft">{t("app.deleteBody")}</p>
      <div className="field">
        <label htmlFor="delete-confirm">{t("app.deleteConfirmLabel")}</label>
        <input id="delete-confirm" name="confirm" className="input sm:max-w-xs" autoComplete="off" value={value} onChange={(e) => setValue(e.target.value)} />
      </div>
      {state?.error ? <Alert tone="danger">{state.error === "confirm_mismatch" ? t("app.deleteMismatch") : t("common.error")}</Alert> : null}
      <div><SubmitButton className="btn btn-danger" pendingLabel={t("common.saving")}>{t("app.deleteButton")}</SubmitButton></div>
    </form>
  );
}
