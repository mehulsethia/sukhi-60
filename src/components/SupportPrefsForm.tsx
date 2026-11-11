"use client";
import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { resetLearnedSignals, saveSupportPreferences } from "@/app/actions";
import { Alert } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { RestartQuestion, StyleQuestion, SupportHiddenInputs } from "@/components/SupportChoices";
import { MOTIVATION_MAX, type CommunicationStyle, type RestartPreference } from "@/domain/behaviour";

export function SupportPrefsForm({ initial }: { initial: { styles: CommunicationStyle[]; restart: RestartPreference | null; motivation: string } }) {
  const t = useTranslations();
  const [state, action] = useActionState(saveSupportPreferences, null);
  const [styles, setStyles] = useState(initial.styles);
  const [restart, setRestart] = useState(initial.restart);
  return (
    <form action={action} className="flex flex-col gap-6">
      <SupportHiddenInputs styles={styles} restart={restart} />
      <StyleQuestion value={styles} onChange={setStyles} id="set-style-q" />
      <RestartQuestion value={restart} onChange={setRestart} id="set-restart-q" />
      <div className="field">
        <label htmlFor="set-motivation">{t("support.motivationSettings")}</label>
        <textarea id="set-motivation" name="personal_motivation" defaultValue={initial.motivation} rows={2} maxLength={MOTIVATION_MAX} className="input" aria-describedby="set-motivation-hint" />
        <span id="set-motivation-hint" className="hint text-xs">{t("onb.motivationHint")}</span>
      </div>
      <div aria-live="polite">{state?.ok ? <Alert tone="ok">{t("common.saved")}</Alert> : state?.error ? <Alert tone="danger">{state.error === "too_many_styles" ? t("onb.styleMax") : t("common.error")}</Alert> : null}</div>
      <SubmitButton className="btn btn-primary self-start px-6" pendingLabel={t("common.saving")}>{t("common.save")}</SubmitButton>
    </form>
  );
}

export function ResetLearnedForm() {
  const t = useTranslations();
  const [state, action] = useActionState(resetLearnedSignals, null);
  return (
    <form action={action} className="mt-3 flex flex-col gap-2">
      <SubmitButton className="btn btn-secondary self-start" pendingLabel={t("common.saving")}>{t("support.learnedReset")}</SubmitButton>
      <div aria-live="polite">{state?.ok ? <Alert tone="ok">{t("support.learnedResetDone")}</Alert> : state?.error ? <Alert tone="danger">{t("common.error")}</Alert> : null}</div>
    </form>
  );
}
