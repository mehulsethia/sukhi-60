"use client";
import Link from "next/link";
import { useActionState, useOptimistic, useState } from "react";
import { useTranslations } from "next-intl";
import { Camera, Check, Clock, Moon, MoreHorizontal, SkipForward } from "lucide-react";
import { checkIn } from "@/app/actions";
import { Alert, StatusBadge } from "@/components/ui";
import { bucketOf, BUCKET_COLOR } from "@/lib/status";
import { SupportFlow } from "@/components/SupportFlow";
import { TellFamilyButton } from "@/components/CompanionForms";
import { showToast } from "@/components/Toast";
import { BARRIER_CODES, type BarrierCode } from "@/domain/behaviour";
import type { SupportResult } from "@/server/support";

interface Props {
  action: { id: string; title: string; instructions: string | null; display: string; time: string | null; tz: string; weekly: { done: number; target: number } | null; planMode: string; canTellFamily?: boolean; proofNeeded?: boolean };
  variant?: "row" | "hero";
}

const OPEN = ["pending", "due", "awaiting_response", "later", "no_response", "needs_review"];

export function ActionCard({ action, variant = "row" }: Props) {
  const t = useTranslations();
  const [skipOpen, setSkipOpen] = useState(false);
  // Less on screen: just "done"; the other answers sit behind "⋯".
  const [more, setMore] = useState(false);
  const [barrier, setBarrier] = useState<BarrierCode | null>(null);
  // A fresh idempotency key per intended submission; double-taps reuse the same key.
  const [key, setKey] = useState(() => crypto.randomUUID());
  // "Done" shows the moment it's tapped; it falls back on its own if saving fails.
  const [doneNow, setDoneNow] = useOptimistic(false);
  const [state, formAction, pending] = useActionState(async (prev: Awaited<ReturnType<typeof checkIn>>, fd: FormData) => {
    if (fd.get("kind") === "done" && !action.weekly) setDoneNow(true);
    const r = await checkIn(prev, fd);
    if (r?.ok) {
      // The card may re-mount elsewhere after the refresh (hero → list), so confirm via the app-level toast.
      const earned = ((r.data?.rewards as { points: number }[] | undefined) ?? []).reduce((s, x) => s + x.points, 0);
      if (earned > 0) showToast(t("today.pointsEarned", { points: earned }));
      setKey(crypto.randomUUID());
      setSkipOpen(false);
      setMore(false);
      setBarrier(null);
    }
    return r;
  }, null);

  const result = state?.data?.result as string | undefined;
  const lastKind = state?.data ? (state.data.status as string) : null;
  const support = (state?.data?.support as SupportResult | null | undefined) ?? null;
  const complete = doneNow || action.display === "self_reported" || action.display === "evidence_supported";
  const canAnswer = !doneNow && (OPEN.includes(action.display) || (action.weekly && action.display !== "self_reported"));
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
    <form action={formAction} className={`flex flex-col gap-2 ${hero ? "mt-4" : ""}`}>
      <input type="hidden" name="occurrence_id" value={action.id} />
      <input type="hidden" name="idempotency_key" value={key} />
      {hero && action.proofNeeded ? <p className="text-sm text-ink-soft">{t("today.photoNeeded")}</p> : null}
      {hero ? (
        <div className="flex flex-wrap gap-2">
          {action.proofNeeded
            ? <Link href={`/actions/${action.id}`} className="pill-btn pill-btn-primary min-h-[46px] px-6"><Camera size={16} aria-hidden="true" />{t("today.addPhoto")}</Link>
            : <button className="pill-btn pill-btn-primary min-h-[46px] px-6" name="kind" value="done" disabled={pending}><Check size={16} aria-hidden="true" />{t("today.done")}</button>}
          <button className="pill-btn min-h-[46px]" name="kind" value="later" disabled={pending}><Clock size={16} aria-hidden="true" />{t("today.later")}</button>
          <button type="button" className="pill-btn min-h-[46px] w-[46px] justify-center px-0" aria-expanded={more} aria-label={t("today.moreOptions")} onClick={() => setMore((v) => !v)}><MoreHorizontal size={18} aria-hidden="true" /></button>
        </div>
      ) : null}
      {more ? (
        <div className="flex flex-wrap gap-2">
          {!hero ? <button className="pill-btn min-h-9 px-3 text-sm" name="kind" value="later" disabled={pending}><Clock size={14} aria-hidden="true" />{t("today.later")}</button> : null}
          <button type="button" className="pill-btn min-h-9 px-3 text-sm" aria-expanded={skipOpen} aria-controls={`skip-${action.id}`} onClick={() => setSkipOpen((v) => !v)}><SkipForward size={14} aria-hidden="true" />{t("today.skip")}</button>
          <button className="pill-btn min-h-9 px-3 text-sm" name="kind" value="unable" disabled={pending}><Moon size={14} aria-hidden="true" />{t("today.unwell")}</button>
          <Link href={`/actions/${action.id}`} className="pill-btn min-h-9 px-3 text-sm"><Camera size={14} aria-hidden="true" />{t("chatUi.proof")}</Link>
        </div>
      ) : null}
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
            <h2 id={`t-${action.id}`} className={`text-[1.35rem] sm:text-[1.6rem] ${doneNow ? "text-ink-soft line-through decoration-1" : ""}`}>{action.title}</h2>
            {doneNow ? <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-ink"><Check size={18} aria-hidden="true" /></span> : <StatusBadge status={action.display} label={t(`status.${action.display}`)} />}
          </div>
          {action.instructions ? <p className="mt-1 max-w-xl text-ink-soft">{action.instructions}</p> : null}
          {buttons}
          {feedback}
        </div>
      </article>
    );
  }

  return (
    <article className={`panel relative overflow-hidden px-4 py-3 ${complete ? "bg-[color-mix(in_srgb,var(--st-done)_6%,var(--surface))]" : ""}`} aria-labelledby={`t-${action.id}`}>
      <span aria-hidden="true" className="absolute inset-y-3 left-0 w-[3px] rounded-r-full" style={{ background: color }} />
      <div className="flex items-center gap-3">
        <p className="w-14 shrink-0 text-[0.8rem] font-medium tabular-nums leading-tight text-ink-soft">{action.weekly ? `${action.weekly.done}/${action.weekly.target}` : action.time}</p>
        <Link href={`/actions/${action.id}`} className="min-w-0 flex-1">
          <h3 id={`t-${action.id}`} className={`truncate text-[0.98rem] font-medium ${complete ? "text-ink-soft line-through decoration-1" : ""}`}>{action.title}</h3>
          {action.display !== "pending" && !complete && !canAnswer ? <span className="text-xs text-ink-faint">{t(`status.${action.display}`)}</span> : null}
          {action.time ? <span className="sr-only">{t("today.localTime", { time: action.time, tz: action.tz })}</span> : null}
          {action.weekly ? <span className="sr-only">{t("today.weeklyProgress", { done: action.weekly.done, target: action.weekly.target })}</span> : null}
        </Link>
        {canAnswer ? (
          <>
            <button type="button" onClick={() => setMore((v) => !v)} aria-expanded={more} aria-label={t("today.moreOptions")} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-ink-faint hover:bg-surface-2"><MoreHorizontal size={17} aria-hidden="true" /></button>
            {action.proofNeeded ? (
              <Link href={`/actions/${action.id}`} aria-label={`${t("today.addPhoto")}: ${action.title}`} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 border-primary text-primary transition-colors hover:bg-primary hover:text-primary-ink"><Camera size={18} aria-hidden="true" /></Link>
            ) : (
              <form action={formAction}>
                <input type="hidden" name="occurrence_id" value={action.id} />
                <input type="hidden" name="idempotency_key" value={key} />
                <button name="kind" value="done" disabled={pending} aria-label={`${t("today.done")}: ${action.title}`} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 border-primary text-primary transition-colors hover:bg-primary hover:text-primary-ink disabled:opacity-50"><Check size={18} aria-hidden="true" /></button>
              </form>
            )}
          </>
        ) : complete ? <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-ink"><Check size={18} aria-hidden="true" /></span> : null}
      </div>
      {more ? <div className="mt-3 pl-[4.25rem]">{buttons}</div> : null}
      {feedback}
    </article>
  );
}
