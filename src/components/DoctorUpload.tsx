"use client";
import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { createDoctorPlan } from "@/app/actions";
import { SubmitButton } from "@/components/SubmitButton";
import { DocPicker } from "@/components/DocPicker";

/** Photo of the prescription → plan. Sukhi reads it; the person checks each item. */
export function DoctorUpload() {
  const t = useTranslations();
  const [state, action] = useActionState(createDoctorPlan, null);
  const [hasFile, setHasFile] = useState(false);
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="plan_title" value={t("onb.clinicianPlanTitle")} />
      <DocPicker id="doc_plan_file" name="plan_file" hintName="plan_hint" onChange={setHasFile} />
      {state?.error ? <p className="text-sm text-danger-ink" role="alert">{t("common.error")}</p> : null}
      {hasFile ? <SubmitButton className="btn btn-primary self-start" pendingLabel={t("onb.uploadReading")}>{t("quickPlan.readIt")}</SubmitButton> : null}
    </form>
  );
}
