"use client";
import { useActionState, useRef } from "react";
import { useTranslations } from "next-intl";
import { Printer } from "lucide-react";
import { addDoctorQuestion } from "@/app/actions";
import { Alert } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";

export function PrintButton() {
  const t = useTranslations("visit");
  return <button type="button" className="btn btn-primary print:hidden" onClick={() => window.print()}><Printer size={17} aria-hidden="true" />{t("print")}</button>;
}

export function AddQuestionForm() {
  const t = useTranslations("visit");
  const tc = useTranslations("common");
  const ref = useRef<HTMLFormElement>(null);
  const [state, action] = useActionState(async (p: Awaited<ReturnType<typeof addDoctorQuestion>>, fd: FormData) => {
    const r = await addDoctorQuestion(p, fd);
    if (r?.ok) ref.current?.reset();
    return r;
  }, null);
  return (
    <form ref={ref} action={action} className="mt-3 flex flex-col gap-2 print:hidden sm:flex-row sm:items-end">
      <div className="field flex-1"><label htmlFor="vq" className="!text-sm">{t("addQuestion")}</label><input id="vq" name="question" className="input" minLength={3} maxLength={300} required /></div>
      <SubmitButton className="btn btn-secondary" pendingLabel={tc("saving")}>{tc("save")}</SubmitButton>
      {state?.error ? <Alert tone="danger">{tc("error")}</Alert> : null}
    </form>
  );
}
