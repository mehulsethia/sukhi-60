"use client";
import Link from "next/link";
import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { Camera, Check, Clock, Moon, SkipForward } from "lucide-react";
import { checkIn } from "@/app/actions";
import { Alert, StatusBadge } from "@/components/ui";
import { bucketOf, BUCKET_COLOR } from "@/lib/status";

interface Props {
  action: { id: string; title: string; instructions: string | null; display: string; time: string | null; tz: string; weekly: { done: number; target: number } | null; planMode: string };
  variant?: "row" | "hero";
}

const OPEN = ["pending", "due", "awaiting_response", "later", "no_response", "needs_review"];

export function ActionCard({ action, variant = "row" }: Props) {
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
  const color = BUCKET_COLOR[bucketOf(action.display)];
  const hero = variant === "hero";

  const feedback = (
    <div aria-live="polite" className="empty:hidden [&>*]:mt-3">
      {state?.error ? <Alert tone="danger">{t("common.error")}</Alert> : null}
      {state?.ok && points > 0 ? <div className="pop-in"><Alert tone="ok">{t("today.pointsEarned", { points })}</Alert></div> : null}
      {state?.ok && (result === "already_recorded" || result === "already_counted") ? <Alert tone="info">{t("today.alreadyRecorded")}</Alert> : null}
      {state?.ok && lastKind === "unable" ? <Alert tone="info">{t("today.unwellNote")}</Alert> : null}
    </div>
  );

  const buttons = canAnswer ? (
    <form action={formAction} className="mt-4 flex flex-col gap-2">
      <input type="hidden" name="occurrence_id" value={action.id} />
      <input type="hidden" name="idempotency_key" value={key} />
      <div className="flex flex-wrap gap-2">
        <button className={`pill-btn ${hero ? "border-white bg-white text-[var(--hero-from)] hover:!bg-white/90" : "pill-btn-primary"} px-5`} name="kind" value="done" disabled={pending}><Check size={17} aria-hidden="true" />{t("today.done")}</button>
        <button className={`pill-btn ${hero ? "border-white/30 bg-white/10 text-white hover:!bg-white/20" : ""}`} name="kind" value="later" disabled={pending}><Clock size={16} aria-hidden="true" />{t("today.later")}</button>
        <button type="button" className={`pill-btn ${hero ? "border-white/30 bg-white/10 text-white hover:!bg-white/20" : ""}`} aria-expanded={skipOpen} aria-controls={`skip-${action.id}`} onClick={() => setSkipOpen((v) => !v)}><SkipForward size={16} aria-hidden="true" />{t("today.skip")}</button>
        <button className={`pill-btn ${hero ? "border-white/30 bg-white/10 text-white hover:!bg-white/20" : ""}`} name="kind" value="unable" disabled={pending}><Moon size={16} aria-hidden="true" />{t("today.unwell")}</button>
      </div>
      {skipOpen ? (
        <div id={`skip-${action.id}`} className={`flex flex-col gap-2 rounded-xl p-3 sm:flex-row sm:items-end ${hero ? "bg-white/10" : "bg-surface-2"}`}>
          <div className="field flex-1">
            <label className={hero ? "!text-white" : ""} htmlFor={`reason-${action.id}`}>{t("today.skipReason")}</label>
            <input id={`reason-${action.id}`} name="reason" className="input" maxLength={300} />
          </div>
          <button className="pill-btn" name="kind" value="skipped" disabled={pending}>{t("today.confirmSkip")}</button>
        </div>
      ) : null}
    </form>
  ) : null;

  if (hero) {
    return (
      <article className="relative overflow-hidden rounded-[24px] bg-[linear-gradient(135deg,var(--hero-from),var(--hero-to))] p-6 text-white shadow-[var(--shadow-md)] sm:p-7" aria-labelledby={`t-${action.id}`}>
        <svg aria-hidden="true" className="pointer-events-none absolute -right-10 -top-10 h-56 w-56 opacity-[0.12]" viewBox="0 0 200 200"><circle cx="100" cy="100" r="90" fill="none" stroke="white" strokeWidth="18" /><circle cx="100" cy="100" r="50" fill="none" stroke="white" strokeWidth="10" /></svg>
        <p className="flex items-center gap-2 text-sm font-semibold text-white/80"><Clock size={15} aria-hidden="true" />{t("today.upNext")}{action.time ? ` · ${action.time}` : ""}</p>
        <h2 id={`t-${action.id}`} className="mt-2 text-[1.7rem] text-white sm:text-[2rem]">{action.title}</h2>
        {action.instructions ? <p className="mt-1 max-w-xl text-white/85">{action.instructions}</p> : null}
        <div className="mt-3"><span className="chip bg-white/15 text-white">{t(`status.${action.display}`)}</span></div>
        {buttons}
        <div className="[&_[role=status]]:bg-white [&_[role=status]]:text-ink">{feedback}</div>
        <Link href={`/actions/${action.id}`} className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-white/90 underline-offset-4 hover:underline"><Camera size={15} aria-hidden="true" />{t("today.addEvidence")}</Link>
      </article>
    );
  }

  return (
    <article className={`panel relative overflow-hidden p-4 sm:p-5 ${complete ? "bg-[color-mix(in_srgb,var(--st-done)_6%,var(--surface))]" : ""}`} aria-labelledby={`t-${action.id}`}>
      <span aria-hidden="true" className="absolute inset-y-0 left-0 w-1" style={{ background: color }} />
      <div className="flex gap-4">
        <div className="w-14 shrink-0 pt-0.5 sm:w-16">
          <p className="text-[0.95rem] font-bold tabular-nums leading-tight">{action.time ?? t("progress.week")}</p>
          {action.weekly ? <p className="mt-1 text-xs font-semibold text-ink-soft">{action.weekly.done}/{action.weekly.target}</p> : null}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <h3 id={`t-${action.id}`} className={`text-[1.08rem] ${complete ? "text-ink-soft line-through decoration-1" : ""}`}>{action.title}</h3>
            <StatusBadge status={action.display} label={t(`status.${action.display}`)} />
          </div>
          {action.instructions ? <p className="mt-1 text-[0.95rem] text-ink-soft">{action.instructions}</p> : null}
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-semibold text-ink-soft">
            <span>{action.planMode === "clinician_instructions" ? t("today.clinicianTag") : t("today.personalTag")}</span>
            {action.time ? <span className="sr-only">{t("today.localTime", { time: action.time, tz: action.tz })}</span> : null}
            {action.weekly ? <span>{t("today.weeklyProgress", { done: action.weekly.done, target: action.weekly.target })}</span> : null}
          </div>
          {action.display === "no_response" ? <p className="hint mt-1">{t("status.no_response_help")}</p> : null}
          {buttons}
          {feedback}
          <Link href={`/actions/${action.id}`} className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"><Camera size={15} aria-hidden="true" />{t("today.addEvidence")}</Link>
        </div>
      </div>
    </article>
  );
}
