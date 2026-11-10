"use client";
import Link from "next/link";
import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { checkIn } from "@/app/actions";
import { Alert, StatusBadge } from "@/components/ui";

interface Props {
  action: { id: string; title: string; instructions: string | null; display: string; time: string | null; tz: string; weekly: { done: number; target: number } | null; planMode: string };
}

const OPEN = ["pending", "due", "awaiting_response", "later", "no_response", "needs_review"];

export function ActionCard({ action }: Props) {
  const t = useTranslations();
  const [skipOpen, setSkipOpen] = useState(false);
  // A fresh idempotency key per intended submission; double-taps reuse the same key.
  const [key, setKey] = useState(() => crypto.randomUUID());
  const [state, formAction, pending] = useActionState(async (prev: Awaited<ReturnType<typeof checkIn>>, fd: FormData) => {
    const r = await checkIn(prev, fd);
    if (r?.ok) {
      setKey(crypto.randomUUID());
      setSkipOpen(false);
    }
    return r;
  }, null);

  const rewards = (state?.data?.rewards as { points: number }[] | undefined) ?? [];
  const points = rewards.reduce((s, r) => s + r.points, 0);
  const result = state?.data?.result as string | undefined;
  const lastKind = state?.data ? (state.data.status as string) : null;
  const canAnswer = OPEN.includes(action.display) || (action.weekly && action.display !== "self_reported");

  const complete = action.display === "self_reported" || action.display === "evidence_supported";

  return (
    <article className={`card overflow-hidden p-0 ${complete ? "bg-[color-mix(in_srgb,var(--leaf-soft)_45%,var(--surface))]" : ""}`} aria-labelledby={`t-${action.id}`}>
      <div className="flex gap-4 p-5">
        <div className="hidden w-16 shrink-0 text-center sm:block">
          <p className="display text-lg font-bold leading-tight">{action.time ?? t("progress.week")}</p>
          {action.weekly ? <p className="mt-1 text-xs font-semibold text-ink-soft">{action.weekly.done}/{action.weekly.target}</p> : null}
        </div>
        <div className="min-w-0 flex-1">
          <p className="display mb-1 text-sm font-bold text-primary sm:hidden">{action.time ?? t("progress.week")}{action.weekly ? ` · ${action.weekly.done}/${action.weekly.target}` : ""}</p>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <h2 id={`t-${action.id}`} className="text-xl font-bold">{action.title}</h2>
            <StatusBadge status={action.display} label={t(`status.${action.display}`)} />
          </div>
          {action.instructions ? <p className="mt-1 text-ink-soft">{action.instructions}</p> : null}
          <p className="mt-2 text-xs font-semibold text-ink-soft">
            {action.planMode === "clinician_instructions" ? t("today.clinicianTag") : t("today.personalTag")}
            {action.time ? <span className="sr-only"> · {t("today.localTime", { time: action.time, tz: action.tz })}</span> : null}
          </p>
          {action.weekly ? <p className="hint mt-1">{t("today.weeklyProgress", { done: action.weekly.done, target: action.weekly.target })}</p> : null}
          {action.display === "no_response" ? <p className="hint mt-1">{t("status.no_response_help")}</p> : null}
        </div>
      </div>

      <div aria-live="polite" className="px-5 empty:hidden">
        {state?.error ? <Alert tone="danger">{t("common.error")}</Alert> : null}
        {state?.ok && points > 0 ? <div className="pop-in"><Alert tone="ok">🌱 {t("today.pointsEarned", { points })}</Alert></div> : null}
        {state?.ok && (result === "already_recorded" || result === "already_counted") ? <Alert tone="info">{t("today.alreadyRecorded")}</Alert> : null}
        {state?.ok && lastKind === "unable" ? <Alert tone="info">{t("today.unwellNote")}</Alert> : null}
      </div>

      {canAnswer ? (
        <form action={formAction} className="grid grid-cols-2 gap-2 p-5 pt-3 sm:grid-cols-[1.4fr_1fr_1fr_1.4fr]">
          <input type="hidden" name="occurrence_id" value={action.id} />
          <input type="hidden" name="idempotency_key" value={key} />
          <button className="btn btn-primary col-span-2 sm:col-span-1" name="kind" value="done" disabled={pending}>✓ {t("today.done")}</button>
          <button className="btn btn-secondary" name="kind" value="later" disabled={pending}>{t("today.later")}</button>
          <button type="button" className="btn btn-secondary" aria-expanded={skipOpen} aria-controls={`skip-${action.id}`} onClick={() => setSkipOpen((v) => !v)}>{t("today.skip")}</button>
          <button className="btn btn-secondary col-span-2 sm:col-span-1" name="kind" value="unable" disabled={pending}>{t("today.unwell")}</button>
          {skipOpen ? (
            <div id={`skip-${action.id}`} className="col-span-2 flex flex-col gap-2 rounded-2xl bg-surface-2 p-3 sm:col-span-4">
              <label className="label" htmlFor={`reason-${action.id}`}>{t("today.skipReason")}</label>
              <input id={`reason-${action.id}`} name="reason" className="input" maxLength={300} />
              <button className="btn btn-secondary" name="kind" value="skipped" disabled={pending}>{t("today.confirmSkip")}</button>
            </div>
          ) : null}
        </form>
      ) : null}
      <div className="border-t border-line px-5 py-3">
        <Link href={`/actions/${action.id}`} className="text-sm font-semibold text-primary hover:underline">{t("today.addEvidence")}</Link>
      </div>
    </article>
  );
}
