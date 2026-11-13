"use client";
import Link from "next/link";
import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { Camera, Check, Clock, Moon, SkipForward } from "lucide-react";
import { checkIn } from "@/app/actions";
import { Alert, StatusBadge } from "@/components/ui";
import { bucketOf, BUCKET_COLOR } from "@/lib/status";
import { SupportFlow } from "@/components/SupportFlow";
import { TellFamilyButton } from "@/components/CompanionForms";
import { showToast } from "@/components/Toast";
import { BARRIER_CODES, type BarrierCode } from "@/domain/behaviour";
import type { SupportResult } from "@/server/support";

interface Props {
  action: { id: string; title: string; instructions: string | null; display: string; time: string | null; tz: string; weekly: { done: number; target: number } | null; planMode: string; canTellFamily?: boolean };
  variant?: "row" | "hero";
}

const OPEN = ["pending", "due", "awaiting_response", "later", "no_response", "needs_review"];

export function ActionCard({ action, variant = "row" }: Props) {
  const t = useTranslations();
  const [skipOpen, setSkipOpen] = useState(false);
  const [barrier, setBarrier] = useState<BarrierCode | null>(null);
  // A fresh idempotency key per intended submission; double-taps reuse the same key.
  const [key, setKey] = useState(() => crypto.randomUUID());
  const [state, formAction, pending] = useActionState(async (prev: Awaited<ReturnType<typeof checkIn>>, fd: FormData) => {
    const r = await checkIn(prev, fd);
    if (r?.ok) {
      // The card may re-mount elsewhere after the refresh (hero → list), so confirm via the app-level toast.
      const earned = ((r.data?.rewards as { points: number }[] | undefined) ?? []).reduce((s, x) => s + x.points, 0);
      if (earned > 0) showToast(t("today.pointsEarned", { points: earned }));
      setKey(crypto.randomUUID());
      setSkipOpen(false);
      setBarrier(null);
    }
    return r;
  }, null);

  const result = state?.data?.result as string | undefined;
  const lastKind = state?.data ? (state.data.status as string) : null;
  const support = (state?.data?.support as SupportResult | null | undefined) ?? null;
  const canAnswer = OPEN.includes(action.display) || (action.weekly && action.display !== "self_reported");
  const complete = action.display === "self_reported" || action.display === "evidence_supported";
  const color = BUCKET_COLOR[bucketOf(action.display)];
  const hero = variant === "hero";

  const feedback = (
    <div aria-live="polite" className="empty:hidden [&>*]:mt-3">
      {state?.error ? <Alert tone="danger">{t("common.error")}</Alert> : null}
      {state?.ok && (result === "already_recorded" || result === "already_counted") ? <Alert tone="info">{t("today.alreadyRecorded")}</Alert> : null}
      {state?.ok && lastKind === "unable" ? <Alert tone="info">{t("today.unwellNote")}</Alert> : null}
      {state?.ok && lastKind === "unable" && action.canTellFamily ? <TellFamilyButton /> : null}
      {state?.ok && support ? <SupportFlow key={support.reportId} occurrenceId={action.id} title={action.title} initial={support} /> : null}
    </div>
  );

  const buttons = canAnswer ? (
    <form action={formAction} className="mt-4 flex flex-col gap-2">
      <input type="hidden" name="occurrence_id" value={action.id} />
      <input type="hidden" name="idempotency_key" value={key} />
      <div className="flex flex-wrap gap-2">
        <button className={`pill-btn pill-btn-primary ${hero ? "min-h-[46px] px-6" : "px-4"}`} name="kind" value="done" disabled={pending}><Check size={16} aria-hidden="true" />{t("today.done")}</button>
        <button className={`pill-btn ${hero ? "min-h-[46px]" : ""}`} name="kind" value="later" disabled={pending}><Clock size={16} aria-hidden="true" />{t("today.later")}</button>
        <button type="button" className={`pill-btn ${hero ? "min-h-[46px]" : ""}`} aria-expanded={skipOpen} aria-controls={`skip-${action.id}`} onClick={() => setSkipOpen((v) => !v)}><SkipForward size={16} aria-hidden="true" />{t("today.skip")}</button>
        <button className={`pill-btn border-transparent bg-transparent text-ink-soft hover:!bg-sky ${hero ? "min-h-[46px]" : ""}`} name="kind" value="unable" disabled={pending}><Moon size={16} aria-hidden="true" />{t("today.unwell")}</button>
      </div>
      {skipOpen ? (
        <div id={`skip-${action.id}`} className="flex flex-col gap-2 rounded-xl bg-sky p-3 sm:flex-row sm:flex-wrap sm:items-end">
          <fieldset className="w-full">
            <legend className="label mb-1 !text-sm">{t("support.barrierQ")} <span className="hint font-normal">({t("common.optional")})</span></legend>
            <div className="flex flex-wrap gap-1.5" role="radiogroup">
              {BARRIER_CODES.map((c) => (
                <button key={c} type="button" role="radio" aria-checked={barrier === c} onClick={() => setBarrier(barrier === c ? null : c)} className={`pill-btn min-h-10 px-3 text-sm ${barrier === c ? "pill-btn-primary" : ""}`}>{t(`support.barrier_${c}`)}</button>
              ))}
            </div>
            {barrier ? <input type="hidden" name="barrier" value={barrier} /> : null}
          </fieldset>
          <div className="field flex-1">
            <label htmlFor={`reason-${action.id}`}>{t("today.skipReason")}</label>
            <input id={`reason-${action.id}`} name="reason" className="input" maxLength={300} />
          </div>
          <button className="pill-btn" name="kind" value="skipped" disabled={pending}>{t("today.confirmSkip")}</button>
        </div>
      ) : null}
    </form>
  ) : null;

  if (hero) {
    return (
      <article className="relative overflow-hidden rounded-[var(--r-lg)] border border-line bg-surface shadow-[var(--shadow-md)]" aria-labelledby={`t-${action.id}`}>
        <div className="px-5 pt-5 sm:px-6">
          <p className="flex items-center gap-1.5 text-[0.8rem] font-medium uppercase tracking-[0.08em] text-primary"><Clock size={14} aria-hidden="true" />{t("today.upNext")}{action.time ? ` · ${action.time}` : ""}</p>
        </div>
        <div className="px-5 pb-5 pt-2 sm:px-6 sm:pb-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <h2 id={`t-${action.id}`} className="text-[1.35rem] sm:text-[1.6rem]">{action.title}</h2>
            <StatusBadge status={action.display} label={t(`status.${action.display}`)} />
          </div>
          {action.instructions ? <p className="mt-1 max-w-xl text-ink-soft">{action.instructions}</p> : null}
          {buttons}
          {feedback}
          <Link href={`/actions/${action.id}`} className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"><Camera size={15} aria-hidden="true" />{t("today.addEvidence")}</Link>
        </div>
      </article>
    );
  }

  return (
    <article className={`panel relative overflow-hidden px-4 py-3.5 sm:p-5 ${complete ? "bg-[color-mix(in_srgb,var(--st-done)_6%,var(--surface))]" : ""}`} aria-labelledby={`t-${action.id}`}>
      <span aria-hidden="true" className="absolute inset-y-3 left-0 w-[3px] rounded-r-full" style={{ background: color }} />
      <div className="flex gap-4">
        <div className="w-14 shrink-0 pt-0.5 sm:w-16">
          <p className="text-[0.85rem] font-medium tabular-nums leading-tight text-ink-soft">{action.time ?? t("progress.week")}</p>
          {action.weekly ? <p className="mt-1 text-xs font-semibold text-ink-soft">{action.weekly.done}/{action.weekly.target}</p> : null}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <h3 id={`t-${action.id}`} className={`text-[1rem] font-medium ${complete ? "text-ink-soft line-through decoration-1" : ""}`}>{action.title}</h3>
            {/* Upcoming slots need no badge: the time already says when. */}
            {action.display !== "pending" ? <StatusBadge status={action.display} label={t(`status.${action.display}`)} /> : null}
          </div>
          {action.instructions ? <p className="mt-0.5 text-sm text-ink-soft">{action.instructions}</p> : null}
          {action.planMode === "clinician_instructions" ? <p className="mt-2 text-xs font-semibold text-ink-soft">{t("today.clinicianTag")}</p> : null}
          {action.time ? <span className="sr-only">{t("today.localTime", { time: action.time, tz: action.tz })}</span> : null}
          {action.weekly ? <span className="sr-only">{t("today.weeklyProgress", { done: action.weekly.done, target: action.weekly.target })}</span> : null}
          {action.display === "no_response" ? <p className="hint mt-1">{t("status.no_response_help")}</p> : null}
          {buttons}
          {feedback}
          {canAnswer || complete ? <Link href={`/actions/${action.id}`} className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"><Camera size={15} aria-hidden="true" />{t("today.addEvidence")}</Link> : null}
        </div>
      </div>
    </article>
  );
}
