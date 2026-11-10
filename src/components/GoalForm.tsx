"use client";
import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { setRewardGoal } from "@/app/actions";
import { Alert } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";

export function GoalForm() {
  const t = useTranslations();
  const [state, action] = useActionState(setRewardGoal, null);
  return (
    <form action={action} className="flex flex-col gap-3">
      {state?.error ? <Alert tone="danger">{t("common.error")}</Alert> : null}
      <div className="field"><label htmlFor="goal-title">{t("progress.goalTitle")}</label><input id="goal-title" name="title" className="input" required maxLength={80} /></div>
      <div className="field"><label htmlFor="goal-target">{t("progress.goalTarget")}</label><input id="goal-target" name="target_points" type="number" min={5} max={500} defaultValue={30} className="input w-32" /></div>
      <SubmitButton pendingLabel={t("common.saving")}>{t("progress.setGoal")}</SubmitButton>
    </form>
  );
}
