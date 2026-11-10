import { getLocale, getTranslations } from "next-intl/server";
import { requireUser } from "@/lib/supabase/server";
import { gardenFromEvents, goalProgress, summarizeWeek } from "@/domain/rewards";
import { addDays, localDateOf, weekStart } from "@/domain/schedule";
import { Garden } from "@/components/Garden";
import { GoalForm } from "@/components/GoalForm";
import { removeRewardGoal } from "@/app/actions";
import { PageHeader, Section, StatusBadge } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { fmtDate } from "@/lib/format";

export default async function ProgressPage() {
  const { supabase, user } = await requireUser();
  const t = await getTranslations();
  const locale = await getLocale();
  const { data: profile } = await supabase.from("profiles").select("timezone").eq("id", user.id).single();
  const tz = profile?.timezone ?? "UTC";
  const ws = weekStart(localDateOf(new Date(), tz));
  const days = Array.from({ length: 7 }, (_, i) => addDays(ws, i));
  const [{ data: events }, { data: occ }, { data: goal }, { data: history }] = await Promise.all([
    supabase.from("reward_events").select("kind, points, label, local_date, created_at").order("created_at", { ascending: false }),
    supabase.from("action_occurrences").select("local_date, status").gte("local_date", ws).lte("local_date", addDays(ws, 6)),
    supabase.from("reward_goals").select("*").eq("active", true).maybeSingle(),
    supabase.from("action_occurrences").select("id, local_date, local_time, status, plan_items!inner(title)").lte("local_date", localDateOf(new Date(), tz)).order("due_at", { ascending: false }).limit(20),
  ]);
  const garden = gardenFromEvents(events ?? []);
  const week = summarizeWeek(days, occ ?? []);
  const gp = goalProgress(garden.points, goal ?? null);
  const milestones = (events ?? []).filter((e) => e.kind === "milestone");

  return (
    <>
      <PageHeader title={t("progress.title")} />
      <Section title={t("progress.garden")} id="garden">
        <Garden state={garden} label={`${t(`progress.stage_${garden.stage}`)} — ${t("progress.points", { points: garden.points })}`} />
        <p className="text-center text-lg font-semibold">{t(`progress.stage_${garden.stage}`)}</p>
        <p className="text-center">{t("progress.points", { points: garden.points })}</p>
        <div className="mx-auto mt-2 h-3 max-w-xs overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(garden.progressToNext * 100)} aria-label={garden.nextStageAt ? t("progress.nextStage", { remaining: garden.nextStageAt - garden.points }) : t("progress.fullBloom")}>
          <div className="h-full bg-leaf" style={{ width: `${Math.round(garden.progressToNext * 100)}%` }} />
        </div>
        <p className="hint mt-1 text-center">{garden.nextStageAt ? t("progress.nextStage", { remaining: garden.nextStageAt - garden.points }) : t("progress.fullBloom")}</p>
        <p className="hint mt-3">{t("progress.gardenRule")}</p>
      </Section>

      <Section title={t("progress.week")} id="week">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm [&_td]:px-2 [&_td]:py-2.5 [&_th]:px-2 [&_thead_th]:pb-2 [&_thead_th]:align-bottom [&_thead_th]:text-xs [&_thead_th]:font-semibold [&_thead_th]:text-ink-soft sm:[&_thead_th]:text-sm">
            <caption className="sr-only">{t("progress.week")}</caption>
            <thead><tr><th scope="col" className="py-1">{t("progress.day")}</th><th scope="col">{t("progress.scheduled")}</th><th scope="col">{t("progress.completed")}</th><th scope="col">{t("progress.evidence")}</th><th scope="col">{t("progress.responded")}</th><th scope="col">{t("progress.noReply")}</th></tr></thead>
            <tbody>
              {week.map((d) => (
                <tr key={d.date} className="border-t border-line">
                  <th scope="row" className="whitespace-nowrap py-2.5 font-semibold">{fmtDate(d.date, locale)}</th>
                  <td>{d.scheduled}</td><td>{d.completed}</td><td>{d.evidenceSupported}</td><td>{d.responded}</td><td>{d.noResponse}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title={t("progress.milestones")} id="ms">
        {milestones.length === 0 ? <p className="hint">{t("progress.noMilestones")}</p> : (
          <ul className="flex flex-wrap gap-2">{milestones.map((m, i) => <li key={i} className="chip bg-ok-bg text-ok-ink">🌸 {m.label} · {fmtDate(m.local_date, locale)}</li>)}</ul>
        )}
      </Section>

      <Section title={t("progress.goal")} id="goal">
        <p className="hint mb-2">{t("progress.goalHelp")}</p>
        {goal && gp ? (
          <div className="flex flex-col gap-2">
            <p className="font-semibold">{goal.title}</p>
            <p>{gp.done ? t("progress.goalDone") : t("progress.goalProgress", { earned: gp.earned, target: gp.target })}</p>
            <div className="h-3 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuemin={0} aria-valuemax={gp.target} aria-valuenow={Math.min(gp.earned, gp.target)} aria-label={goal.title}><div className="h-full bg-accent" style={{ width: `${Math.round(gp.ratio * 100)}%` }} /></div>
            <form action={removeRewardGoal}><SubmitButton className="btn btn-ghost underline">{t("progress.removeGoal")}</SubmitButton></form>
          </div>
        ) : <GoalForm />}
      </Section>

      <Section title={t("progress.historyTitle")} id="hist">
        <ul className="flex flex-col gap-2">
          {(history ?? []).map((h) => (
            <li key={h.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-2">
              <span>{(h.plan_items as unknown as { title: string }).title} · {fmtDate(h.local_date, locale)}{h.local_time ? ` ${h.local_time}` : ""}</span>
              <StatusBadge status={h.status} label={t(`status.${h.status}`)} />
            </li>
          ))}
        </ul>
        <h3 className="mt-4 font-semibold">{t("progress.recent")}</h3>
        <ul className="mt-1 flex flex-col gap-1 text-sm">
          {(events ?? []).slice(0, 10).map((e, i) => <li key={i}>+{e.points} · {t(`progress.reward_${e.kind}`)} · {fmtDate(e.local_date, locale)}</li>)}
        </ul>
      </Section>
    </>
  );
}
