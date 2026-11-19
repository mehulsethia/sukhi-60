"use client";
import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { requestReview } from "@/app/actions";
import { Alert } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { REVIEW_PROMISE_HOURS } from "@/domain/proof";

export function ReviewForm({ occurrenceId, evaluationId }: { occurrenceId: string; evaluationId?: string }) {
  const t = useTranslations();
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState(requestReview, null);
  if (state?.ok) return <Alert tone="ok">{t("action.reviewRequested", { hours: REVIEW_PROMISE_HOURS })}</Alert>;
  return open ? (
    <form action={action} className="mt-3 flex flex-col gap-2">
      <input type="hidden" name="occurrence_id" value={occurrenceId} />
      {evaluationId ? <input type="hidden" name="evaluation_id" value={evaluationId} /> : null}
      <label className="label" htmlFor={`rr-${evaluationId}`}>{t("action.reviewReason")}</label>
      <textarea id={`rr-${evaluationId}`} name="reason" className="input" required minLength={3} maxLength={500} rows={2} />
      {state?.error ? <Alert tone="danger">{t("common.error")}</Alert> : null}
      <SubmitButton className="btn btn-secondary" pendingLabel={t("common.saving")}>{t("action.requestReview")}</SubmitButton>
    </form>
  ) : (
    <button type="button" className="btn btn-ghost mt-2 underline" onClick={() => setOpen(true)}>{t("action.requestReview")}</button>
  );
}
