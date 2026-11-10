import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { Award, Check } from "lucide-react";
import { requireUser } from "@/lib/supabase/server";
import { activeDays, goalProgress, progressFromEvents, summarizeWeek } from "@/domain/rewards";
import { addDays, localDateOf, weekStart } from "@/domain/schedule";
import { GoalForm } from "@/components/GoalForm";
import { removeRewardGoal } from "@/app/actions";
import { PageHeader, Section, StatusBadge } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { fmtDate } from "@/lib/format";

export const metadata: Metadata = { title: "Progress" };

export default async function ProgressPage() {
  const { supabase, user } = await requireUser();
  const t = await getTranslations();
  const locale = await getLocale();
  const { data: profile } = await supabase.from("profiles").select("timezone").eq("id", user.id).single();
  const tz = profile?.timezone ?? "UTC";
  const today = localDateOf(new Date(), tz);
  const ws = weekStart(today);
  const days = Array.from({ length: 7 }, (_, i) => addDays(ws, i));
  const [{ data: events }, { data: occ }, { data: goal }, { data: history }] = await Promise.all([
    supabase.from("reward_events").select("kind, points, label, local_date, created_at").order("created_at", { ascending: false }),
    supabase.from("action_occurrences").select("local_date, status").gte("local_date", ws).lte("local_date", addDays(ws, 6)),
    supabase.from("reward_goals").select("*").eq("active", true).maybeSingle(),
    supabase.from("action_occurrences").select("id, local_date, local_time, status, plan_items!inner(title)").lte("local_date", today).order("due_at", { ascending: false }).limit(20),
  ]);
  const stats = progressFromEvents(events ?? []);
  const week = summarizeWeek(days, occ ?? []);
  const active = activeDays(week);
  const gp = goalProgress(stats.points, goal ?? null);
  const milestones = (events ?? []).filter((e) => e.kind === "milestone" || e.kind === "return");

  return (
    <>
      <PageHeader title={t("progress.title")} />

      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {[
          [t("progress.consistency"), `${active}/7`, t("progress.activeDays", { days: active })],
          [t("progress.pointsTotal"), String(stats.points), null],
          [t("progress.milestones"), String(stats.milestones), null],
        ].map(([label, value, sub]) => (
          <div key={label} className="card p-5">
            <p className="text-sm font-medium text-ink-soft">{label}</p>
            <p className="display mt-1 text-[2rem] font-semibold tabular-nums">{value}</p>
            {sub ? <p className="text-sm text-ink-soft">{sub}</p> : null}
          </div>
        ))}
      </div>

      <Section title={t("progress.week")} id="week">
        <div className="grid grid-cols-7 gap-1.5 sm:gap-2" aria-hidden="true">
          {week.map((d, i) => (
            <div key={d.date} className="flex flex-col items-center gap-1.5">
              <div className={`flex h-10 w-full items-center justify-center rounded-md ${d.responded ? "bg-primary text-primary-ink" : d.date === today ? "border border-dashed border-line-strong" : "bg-surface-2"}`}>{d.responded ? <Check size={15} /> : null}</div>
              <span className={`text-xs ${d.date === today ? "font-semibold text-ink" : "text-ink-faint"}`}>{t(`weekday.${i + 1}`)}</span>
            </div>
          ))}
        </div>
        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[480px] text-left text-sm [&_td]:px-2 [&_td]:py-2.5 [&_th]:px-2 [&_thead_th]:pb-2 [&_thead_th]:align-bottom [&_thead_th]:text-xs [&_thead_th]:font-semibold [&_thead_th]:text-ink-soft">
            <caption className="sr-only">{t("progress.week")}</caption>
            <thead><tr><th scope="col">{t("progress.day")}</th><th scope="col">{t("progress.scheduled")}</th><th scope="col">{t("progress.completed")}</th><th scope="col">{t("progress.evidence")}</th><th scope="col">{t("progress.responded")}</th><th scope="col">{t("progress.noReply")}</th></tr></thead>
            <tbody>
              {week.map((d) => (
                <tr key={d.date} className="border-t border-line tabular-nums">
                  <th scope="row" className="whitespace-nowrap py-2.5 font-medium">{fmtDate(d.date, locale)}</th>
                  <td>{d.scheduled}</td><td>{d.completed}</td><td>{d.evidenceSupported}</td><td>{d.responded}</td><td>{d.noResponse}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="hint mt-4">{t("progress.rule")}</p>
      </Section>

      <Section title={t("progress.milestones")} id="ms">
        {milestones.length === 0 ? <p className="hint">{t("progress.noMilestones")}</p> : (
          <ul className="divide-y divide-line">
            {milestones.map((m, i) => (
              <li key={i} className="flex items-center gap-3 py-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary"><Award size={18} aria-hidden="true" /></span>
                <span className="font-medium">{m.kind === "return" ? t("progress.reward_return") : m.label}</span>
                <span className="ml-auto text-sm text-ink-soft">{fmtDate(m.local_date, locale)}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title={t("progress.goal")} id="goal">
        <p className="hint mb-3">{t("progress.goalHelp")}</p>
        {goal && gp ? (
          <div className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between gap-2">
              <p className="font-semibold">{goal.title}</p>
              <p className="text-sm tabular-nums text-ink-soft">{gp.done ? t("progress.goalDone") : t("progress.goalProgress", { earned: gp.earned, target: gp.target })}</p>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-surface-3" role="progressbar" aria-valuemin={0} aria-valuemax={gp.target} aria-valuenow={Math.min(gp.earned, gp.target)} aria-label={goal.title}><div className="h-full rounded-full bg-primary" style={{ width: `${Math.round(gp.ratio * 100)}%` }} /></div>
            <form action={removeRewardGoal}><SubmitButton className="btn btn-ghost mt-1 px-0 text-sm underline">{t("progress.removeGoal")}</SubmitButton></form>
          </div>
        ) : <GoalForm />}
      </Section>

      <Section title={t("progress.historyTitle")} id="hist">
        <ul className="divide-y divide-line">
          {(history ?? []).map((h) => (
            <li key={h.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
              <span>{(h.plan_items as unknown as { title: string }).title} <span className="text-ink-soft">· {fmtDate(h.local_date, locale)}{h.local_time ? ` ${h.local_time}` : ""}</span></span>
              <StatusBadge status={h.status} label={t(`status.${h.status}`)} />
            </li>
          ))}
        </ul>
        <h3 className="mt-6 text-sm font-semibold text-ink-soft">{t("progress.recent")}</h3>
        <ul className="mt-2 flex flex-col gap-1 text-sm">
          {(events ?? []).slice(0, 10).map((e, i) => <li key={i} className="tabular-nums">+{e.points} · {t(`progress.reward_${e.kind}`)} · {fmtDate(e.local_date, locale)}</li>)}
        </ul>
      </Section>
    </>
  );
}
