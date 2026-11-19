"use client";
// A device reading on the action page, with a small form to fix a misread number.
import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { fixReadingAction } from "@/app/actions";
import { SubmitButton } from "@/components/SubmitButton";
import { formatReading, readingExample, type Reading } from "@/domain/readings";

export function ReadingFix({ reading, occurrenceId }: { reading: Reading & { id: string; source: string }; occurrenceId: string }) {
  const t = useTranslations("action");
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState(fixReadingAction, null);
  const example = readingExample(reading.kind, reading.unit);
  const editing = open && !state?.ok;
  return (
    <div className="rounded-xl bg-surface-2 px-3 py-2">
      <div className="flex items-baseline justify-between gap-3">
        <p><span className="text-xs font-semibold uppercase tracking-wide text-ink-soft">{t("reading")}</span> <span className="font-semibold tabular-nums">{formatReading(reading, t("readingPulse"))}</span>{reading.source === "corrected" ? <span className="hint"> · {t("readingTyped")}</span> : null}</p>
        {!editing ? <button type="button" onClick={() => setOpen(true)} className="text-sm font-semibold text-primary">{t("readingFix")}</button> : null}
      </div>
      {editing ? (
        <form action={action} className="mt-2 flex items-end gap-2">
          <input type="hidden" name="reading_id" value={reading.id} />
          <input type="hidden" name="occurrence_id" value={occurrenceId} />
          <div className="field min-w-0 flex-1">
            <label htmlFor={`rd-${reading.id}`} className="!text-sm">{t("readingFixLabel")}</label>
            <input id={`rd-${reading.id}`} name="value" inputMode="decimal" autoComplete="off" required maxLength={40} placeholder={example} className="input" />
          </div>
          <SubmitButton className="btn btn-primary" pendingLabel="…">{t("readingSave")}</SubmitButton>
        </form>
      ) : null}
      {state?.error === "invalid" ? <p className="mt-1 text-sm text-danger-ink">{t("readingInvalid", { example })}</p> : null}
    </div>
  );
}
