import Link from "next/link";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { Award, CalendarCheck, Flame, Target, TrendingUp, Trophy } from "lucide-react";
import { requireUser } from "@/lib/supabase/server";
import { activeDays, goalProgress, summarizeWeek } from "@/domain/rewards";
import { pointsTotal } from "@/server/points";
import { addDays, localDateOf, weekStart } from "@/domain/schedule";
import { GoalForm } from "@/components/GoalForm";
import { removeRewardGoal } from "@/app/actions";
import { PageHeader, Section, StatusBadge } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { CategoryIcon } from "@/components/CategoryIcon";
import { Heatmap, Legend, SegBar, StackedBars, type DayStack } from "@/components/ProgressCharts";
import { BUCKETS, bucketOf, isAnswered, isDone, type Bucket } from "@/lib/status";
import { fmtDate } from "@/lib/format";

export const metadata: Metadata = { title: "Progress" };

const RANGES = { "7": 7, "30": 30, "90": 90, all: 365 } as const;
type RangeKey = keyof typeof RANGES;

export default async function ProgressPage({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  const sp = await searchParams;
  const range: RangeKey = (sp.range && sp.range in RANGES ? sp.range : "7") as RangeKey;
  const { supabase, user } = await requireUser();
  const t = await getTranslations();
  const locale = await getLocale();
  const loc = locale === "en" ? "en-IN" : `${locale}-IN`;
  const { data: profile } = await supabase.from("profiles").select("timezone, created_at").eq("id", user.id).single();
  const tz = profile?.timezone ?? "UTC";
  const today = localDateOf(new Date(), tz);
  const joined = profile?.created_at ? localDateOf(new Date(profile.created_at), tz) : today;
  const span = RANGES[range];
  let from = addDays(today, -(span - 1));
  if (range === "all" && joined > from) from = joined;
  const ws = weekStart(today);
  const weekDates = Array.from({ length: 7 }, (_, i) => addDays(ws, i));

  const [{ data: events }, { data: occ }, { data: weekOcc }, { data: goal }] = await Promise.all([
    // Only milestones/returns are listed; the points total comes from the profile.
    supabase.from("reward_events").select("kind, points, label, local_date, created_at").in("kind", ["milestone", "return"]).order("created_at", { ascending: false }).limit(100),
    supabase.from("action_occurrences").select("id, local_date, local_time, status, item_id, plan_items!inner(title, category)").gte("local_date", from).lte("local_date", today).order("due_at", { ascending: false }).limit(5000),
    supabase.from("action_occurrences").select("local_date, status").gte("local_date", ws).lte("local_date", addDays(ws, 6)),
    supabase.from("reward_goals").select("*").eq("active", true).maybeSingle(),
  ]);
  const rows = (occ ?? []).map((o) => ({ ...o, b: bucketOf(o.status), item: o.plan_items as unknown as { title: string; category: string } }));
  const stats = { points: await pointsTotal(supabase, user.id), milestones: (events ?? []).filter((e) => e.kind === "milestone").length };
  const week = summarizeWeek(weekDates, weekOcc ?? []);
  const gp = goalProgress(stats.points, goal ?? null);
  const milestones = (events ?? []).filter((e) => e.kind === "milestone" || e.kind === "return");
  const labels = Object.fromEntries(BUCKETS.map((b) => [b, t(`bucket.${b}`)])) as Record<Bucket, string>;

  // Per day
  const days: string[] = [];
  for (let d = from; d <= today; d = addDays(d, 1)) days.push(d);
  const byDay = new Map<string, Partial<Record<Bucket, number>>>();
  for (const r of rows) {
    const m = byDay.get(r.local_date) ?? {};
    m[r.b] = (m[r.b] ?? 0) + 1;
    byDay.set(r.local_date, m);
  }
  const totals: Partial<Record<Bucket, number>> = {};
  for (const r of rows) totals[r.b] = (totals[r.b] ?? 0) + 1;
  const closed = rows.filter((r) => r.b !== "open").length;
  const doneN = rows.filter((r) => isDone(r.b)).length;
  const answeredN = rows.filter((r) => isAnswered(r.b)).length;
  const completion = closed ? Math.round((100 * doneN) / closed) : null;
  const answerRate = closed ? Math.round((100 * answeredN) / closed) : null;
  const answeredDay = (d: string) => Object.entries(byDay.get(d) ?? {}).some(([b, n]) => n && isAnswered(b as Bucket));
  const active = days.filter(answeredDay).length;
  // Streaks of days with any answer (today doesn't break a streak until it's over).
  let current = 0;
  for (let i = days.length - 1; i >= 0; i--) {
    if (answeredDay(days[i])) current++;
    else if (days[i] === today) continue;
    else break;
  }
  let best = 0, run = 0;
  for (const d of days) { run = answeredDay(d) ? run + 1 : 0; best = Math.max(best, run); }

  // Chart: daily up to 30 days, weekly beyond.
  const fmtShort = (d: string, opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(loc, { timeZone: "UTC", ...opts }).format(new Date(`${d}T00:00:00Z`));
  let stacks: DayStack[];
  if (days.length <= 31) {
    stacks = days.map((d) => {
      const c = byDay.get(d) ?? {};
      return { label: days.length <= 7 ? fmtShort(d, { weekday: "short" }) : fmtShort(d, { day: "numeric" }), full: fmtShort(d, { weekday: "short", day: "numeric", month: "short" }), counts: c, total: Object.values(c).reduce((a, n) => a + (n ?? 0), 0), today: d === today };
    });
  } else {
    const weeks = new Map<string, Partial<Record<Bucket, number>>>();
    for (const d of days) {
      const k = weekStart(d);
      const w = weeks.get(k) ?? {};
      for (const [b, n] of Object.entries(byDay.get(d) ?? {})) w[b as Bucket] = (w[b as Bucket] ?? 0) + (n ?? 0);
      weeks.set(k, w);
    }
    stacks = [...weeks.entries()].map(([k, c]) => ({ label: fmtShort(k, { day: "numeric", month: "short" }), full: t("progressUi.weekOf", { date: fmtShort(k, { day: "numeric", month: "short" }) }), counts: c, total: Object.values(c).reduce((a, n) => a + (n ?? 0), 0), today: k === ws }));
  }
  const heat = days.map((d) => {
    const c = byDay.get(d) ?? {};
    const tot = Object.entries(c).filter(([b]) => b !== "open").reduce((a, [, n]) => a + (n ?? 0), 0);
    const dn = (c.done ?? 0) + (c.evidence ?? 0);
    return { date: d, ratio: tot ? dn / tot : null, label: `${fmtShort(d, { weekday: "short", day: "numeric", month: "short" })}: ${tot ? `${dn}/${tot}` : "—"}` };
  });

  // Per action
  const perItem = new Map<string, { title: string; category: string; counts: Partial<Record<Bucket, number>>; total: number }>();
  for (const r of rows) {
    const e = perItem.get(r.item_id) ?? { title: r.item.title, category: r.item.category, counts: {}, total: 0 };
    e.counts[r.b] = (e.counts[r.b] ?? 0) + 1;
    if (r.b !== "open") e.total++;
    perItem.set(r.item_id, e);
  }
  const items = [...perItem.values()].sort((a, b) => b.total - a.total);
  const recent = rows.filter((r) => r.b !== "open" || r.local_date === today).slice(0, 12);
  const present = BUCKETS.filter((b) => totals[b]);

  return (
    <>
      <PageHeader title={t("progress.title")} subtitle={t("progressUi.subtitle")}>
        <nav aria-label={t("progressUi.range")} className="seg">
          {(Object.keys(RANGES) as RangeKey[]).map((k) => (
            <Link key={k} href={`/progress?range=${k}`} aria-current={k === range ? "page" : undefined} scroll={false}>{t(`progressUi.range_${k}`)}</Link>
          ))}
        </nav>
      </PageHeader>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { Icon: Target, label: t("progressUi.completion"), value: completion === null ? "—" : `${completion}%`, sub: t("progressUi.completionSub", { done: doneN, total: closed }), color: "var(--st-done)" },
          { Icon: CalendarCheck, label: t("progressUi.answered"), value: answerRate === null ? "—" : `${answerRate}%`, sub: t("progressUi.answeredSub"), color: "var(--st-review)" },
          { Icon: Flame, label: t("progressUi.streak"), value: String(current), sub: t("progressUi.bestStreak", { n: best }), color: "var(--haldi)" },
          { Icon: Trophy, label: t("progress.pointsTotal"), value: String(stats.points), sub: t("progressUi.milestonesSub", { n: stats.milestones }), color: "var(--st-unable)" },
        ].map(({ Icon, label, value, sub, color }) => (
          <div key={label} className="panel p-4 sm:p-5">
            <p className="flex items-center gap-2 text-sm font-semibold text-ink-soft"><span className="flex h-7 w-7 items-center justify-center rounded-lg" style={{ background: `color-mix(in srgb, ${color} 16%, var(--surface))`, color }}><Icon size={15} aria-hidden="true" /></span>{label}</p>
            <p className="display mt-2 text-[2.1rem] font-bold tabular-nums leading-none">{value}</p>
            <p className="mt-1.5 text-xs text-ink-soft">{sub}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0">
          <Section title={days.length <= 31 ? t("progressUi.daily") : t("progressUi.weekly")} id="chart" description={t("progressUi.activeInRange", { active, total: days.length })} icon={<TrendingUp size={20} aria-hidden="true" />}>
            {rows.length ? (
              <>
                <StackedBars data={stacks} labels={labels} />
                <div className="mt-3"><Legend buckets={present} labels={labels} counts={totals} /></div>
              </>
            ) : <p className="py-8 text-center text-ink-soft">{t("progressUi.noData")}</p>}
          </Section>

          <Section title={t("progressUi.byAction")} id="by-action" description={t("progressUi.byActionHelp")}>
            {items.length ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[480px] text-left text-sm">
                  <caption className="sr-only">{t("progressUi.byAction")}</caption>
                  <thead><tr className="text-xs text-ink-soft"><th scope="col" className="pb-2 font-semibold">{t("progressUi.action")}</th><th scope="col" className="w-2/5 pb-2 font-semibold">{t("progressUi.breakdown")}</th><th scope="col" className="pb-2 text-right font-semibold">{t("progress.completed")}</th></tr></thead>
                  <tbody>
                    {items.map((it) => {
                      const dn = (it.counts.done ?? 0) + (it.counts.evidence ?? 0);
                      return (
                        <tr key={it.title} className="border-t border-line">
                          <th scope="row" className="py-3 pr-3 font-semibold"><span className="flex items-center gap-2.5"><CategoryIcon category={it.category} /><span className="min-w-0 truncate">{it.title}</span></span></th>
                          <td className="py-3 pr-3"><SegBar counts={it.counts} total={it.total} /></td>
                          <td className="py-3 text-right tabular-nums"><span className="font-bold">{dn}</span><span className="text-ink-soft">/{it.total}</span></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : <p className="text-ink-soft">{t("progressUi.noData")}</p>}
            <p className="hint mt-4">{t("progress.rule")}</p>
          </Section>

          <Section title={t("progress.historyTitle")} id="hist">
            {recent.length === 0 ? <p className="text-ink-soft">{t("progressUi.noData")}</p> : (
              <ul className="divide-y divide-line">
                {recent.map((h) => (
                  <li key={h.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                    <span className="flex min-w-0 items-center gap-2.5"><CategoryIcon category={h.item.category} /><span className="truncate">{h.item.title}</span><span className="shrink-0 text-sm text-ink-soft">{fmtDate(h.local_date, locale)}{h.local_time ? ` · ${h.local_time}` : ""}</span></span>
                    <StatusBadge status={h.status} label={t(`status.${h.status}`)} />
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>

        <aside className="flex flex-col">
          <Section title={t("progress.week")} id="week">
            <div className="grid grid-cols-7 gap-1.5">
              {week.map((d, i) => {
                const ratio = d.scheduled ? d.completed / d.scheduled : 0;
                return (
                  <div key={d.date} className="flex flex-col items-center gap-1.5" title={`${fmtDate(d.date, locale)}: ${d.completed}/${d.scheduled}`}>
                    <div className={`relative h-16 w-full overflow-hidden rounded-lg bg-surface-2 ${d.date === today ? "ring-2 ring-primary ring-offset-2 ring-offset-surface" : ""}`}>
                      <div className="absolute inset-x-0 bottom-0" style={{ height: `${d.responded && !ratio ? 18 : ratio * 100}%`, background: ratio ? "var(--st-done)" : d.responded ? "var(--st-skipped)" : "transparent" }} />
                    </div>
                    <span className={`text-xs ${d.date === today ? "font-bold text-ink" : "text-ink-faint"}`}>{t(`weekday.${i + 1}`)}</span>
                  </div>
                );
              })}
            </div>
            <p className="mt-4 text-sm font-semibold">{t("progress.activeDays", { days: activeDays(week) })}</p>
          </Section>

          {days.length > 7 ? (
            <Section title={t("progressUi.calendar")} id="cal" description={t("progressUi.calendarHelp")}>
              <Heatmap days={heat} weekdayLabels={[1, 2, 3, 4, 5, 6, 7].map((d) => t(`weekday.${d}`))} noneLabel={t("progressUi.calendarHelp")} />
            </Section>
          ) : null}

          <Section title={t("progress.milestones")} id="ms" icon={<Award size={20} aria-hidden="true" />}>
            {milestones.length === 0 ? <p className="hint">{t("progress.noMilestones")}</p> : (
              <ul className="flex flex-col gap-2">
                {milestones.slice(0, 8).map((m, i) => (
                  <li key={i} className="flex items-center gap-3 rounded-xl bg-haldi-soft/60 px-3 py-2.5">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-haldi text-white"><Award size={16} aria-hidden="true" /></span>
                    <span className="min-w-0 flex-1 truncate font-semibold">{m.kind === "return" ? t("progress.reward_return") : m.label}</span>
                    <span className="shrink-0 text-xs text-ink-soft">{fmtDate(m.local_date, locale)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title={t("progress.goal")} id="goal" icon={<Target size={20} aria-hidden="true" />} description={t("progress.goalHelp")}>
            {goal && gp ? (
              <div className="flex flex-col gap-2">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="font-semibold">{goal.title}</p>
                  <p className="text-sm tabular-nums text-ink-soft">{gp.done ? t("progress.goalDone") : t("progress.goalProgress", { earned: gp.earned, target: gp.target })}</p>
                </div>
                <div className="h-3 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuemin={0} aria-valuemax={gp.target} aria-valuenow={Math.min(gp.earned, gp.target)} aria-label={goal.title}><div className="h-full rounded-full bg-[linear-gradient(90deg,var(--haldi),var(--st-done))]" style={{ width: `${Math.round(gp.ratio * 100)}%` }} /></div>
                <form action={removeRewardGoal}><SubmitButton className="btn btn-ghost mt-1 px-0 text-sm underline">{t("progress.removeGoal")}</SubmitButton></form>
              </div>
            ) : <GoalForm />}
          </Section>
        </aside>
      </div>
    </>
  );
}
