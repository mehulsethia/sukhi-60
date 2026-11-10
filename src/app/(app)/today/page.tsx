import Link from "next/link";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { Bell, Check, ClipboardList, TrendingUp } from "lucide-react";
import { requireUser } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getToday, materializeOccurrences } from "@/server/core";
import { activeDays, progressFromEvents, summarizeWeek } from "@/domain/rewards";
import { addDays, localDateOf, weekStart } from "@/domain/schedule";
import { ActionCard } from "@/components/ActionCard";
import { fmtTime, hoursAgoIso, nowMs } from "@/lib/format";

export const metadata: Metadata = { title: "Today" };

function ProgressRing({ done, total }: { done: number; total: number }) {
  const r = 34;
  const c = 2 * Math.PI * r;
  const ratio = total ? done / total : 0;
  return (
    <svg width="84" height="84" viewBox="0 0 84 84" aria-hidden="true" className="shrink-0">
      <circle cx="42" cy="42" r={r} fill="none" stroke="var(--surface-3)" strokeWidth="7" />
      <circle cx="42" cy="42" r={r} fill="none" stroke="var(--primary)" strokeWidth="7" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - ratio)} transform="rotate(-90 42 42)" />
      <text x="42" y="48" textAnchor="middle" className="display" fontSize="18" fontWeight="600" fill="var(--ink)">{done}/{total}</text>
    </svg>
  );
}

export default async function TodayPage({ searchParams }: { searchParams: Promise<{ welcome?: string }> }) {
  const { welcome } = await searchParams;
  const { supabase, user } = await requireUser();
  const t = await getTranslations();
  const locale = await getLocale();
  // Idempotent top-up so Today is correct even before the scheduler's next run.
  await materializeOccurrences(createAdminClient(), user.id, 2).catch(() => undefined);
  const { data: profile } = await supabase.from("profiles").select("display_name, timezone").eq("id", user.id).single();
  const tz = profile?.timezone ?? "UTC";
  const ws = weekStart(localDateOf(new Date(), tz));
  const weekDates = Array.from({ length: 7 }, (_, i) => addDays(ws, i));
  const [actions, { data: events }, { data: notices }, { data: weekOcc }] = await Promise.all([
    getToday(supabase, user.id, tz),
    supabase.from("reward_events").select("kind, points"),
    supabase.from("messages").select("id, content, created_at").eq("role", "notice").gte("created_at", hoursAgoIso(12)).order("created_at", { ascending: false }).limit(1),
    supabase.from("action_occurrences").select("local_date, status").gte("local_date", ws).lte("local_date", addDays(ws, 6)),
  ]);
  // Timed actions in order; weekly targets (no clock time) after them.
  actions.sort((a, b) => Number(a.target_count > 1) - Number(b.target_count > 1));
  const stats = progressFromEvents(events ?? []);
  const week = summarizeWeek(weekDates, weekOcc ?? []);
  const todayStr = localDateOf(new Date(), tz);
  const now = nowMs();
  const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", hourCycle: "h23" }).format(new Date(now)));
  const greet = hour < 12 ? t("app.morning") : hour < 17 ? t("app.afternoon") : t("app.evening");
  const first = profile?.display_name?.split(" ")[0];
  const dateLabel = new Intl.DateTimeFormat(locale === "en" ? "en-IN" : `${locale}-IN`, { timeZone: tz, weekday: "long", day: "numeric", month: "long" }).format(new Date(now));
  const done = actions.filter((a) => a.display === "self_reported" || a.display === "evidence_supported").length;
  const next = actions.find((a) => a.local_time && new Date(a.due_at).getTime() > now && ["pending", "later"].includes(a.display));

  return (
    <>
      <header className="mb-6">
        <p className="text-sm font-medium text-ink-soft">{dateLabel}</p>
        <h1 className="mt-1 text-[2rem] sm:text-[2.5rem]">{greet}{first ? `, ${first}` : ""}</h1>
      </header>

      {welcome ? (
        <section className="pop-in mb-6 rounded-2xl bg-primary p-6 text-primary-ink">
          <div>
            <h2 className="text-2xl">{first ? t("onb.welcomeTitle", { name: first }) : t("onb.welcomeTitleNoName")}</h2>
            <p className="mt-2 opacity-90">{t("onb.welcomeBody")}</p>
            <Link href="/today" className="btn btn-accent mt-4">{t("onb.welcomeDismiss")}</Link>
          </div>
        </section>
      ) : null}

      <div className={`mb-6 grid gap-4 ${actions.length ? "sm:grid-cols-[1.3fr_1fr]" : ""}`}>
        {actions.length ? <section className="card flex items-center gap-5 p-5" aria-label={t("today.title")}>
          <ProgressRing done={done} total={actions.length} />
          <div>
            <p className="text-lg font-bold">{actions.length ? t("app.progressToday", { done, total: actions.length }) : t("today.empty")}</p>
            <p className="mt-1 text-ink-soft">
              {actions.length === 0 ? null : done === actions.length ? t("app.allDone") : next ? `${t("today.nextCheckin")}: ${next.item.title} · ${fmtTime(next.due_at, tz, locale)}` : done === 0 ? t("app.nothingYet") : t("today.noNext")}
            </p>
          </div>
        </section> : null}
        <Link href="/progress" className="card group block p-5 transition-colors hover:border-line-strong">
          <div className="flex items-baseline justify-between gap-2">
            <p className="font-semibold">{t("app.weekCard")}</p>
            <p className="text-sm tabular-nums text-ink-soft">{t("progress.points", { points: stats.points })}</p>
          </div>
          <div className="mt-3 grid grid-cols-7 gap-1" aria-hidden="true">
            {week.map((d, i) => (
              <div key={d.date} className="flex flex-col items-center gap-1">
                <div className={`flex h-7 w-full items-center justify-center rounded ${d.responded ? "bg-primary text-primary-ink" : d.date === todayStr ? "border border-dashed border-line-strong" : "bg-surface-2"}`}>{d.responded ? <Check size={12} /> : null}</div>
                <span className="text-[0.65rem] text-ink-faint">{t(`weekday.${i + 1}`)}</span>
              </div>
            ))}
          </div>
          <p className="mt-3 flex items-center gap-1.5 text-sm text-ink-soft"><TrendingUp size={15} className="text-primary" aria-hidden="true" />{t("progress.activeDays", { days: activeDays(week) })}</p>
        </Link>
      </div>

      {notices && notices.length > 0 ? (
        <p role="status" className="mb-6 flex items-start gap-3 rounded-xl border border-line bg-surface px-4 py-3">
          <Bell size={18} className="mt-1 shrink-0 text-primary" aria-hidden="true" />
          {notices[0].content}
        </p>
      ) : null}

      {actions.length === 0 ? (
        <div className="card flex flex-col items-center px-6 py-12 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary-soft text-primary"><ClipboardList size={24} aria-hidden="true" /></span>
          <p className="mt-4 text-lg font-semibold">{t("today.empty")}</p>
          <Link href="/plan" className="btn btn-primary mt-5">{t("today.emptyCta")}</Link>
        </div>
      ) : (
        <ol className="relative flex flex-col gap-4" aria-label={t("today.title")}>
          {actions.map((a) => (
            <li key={a.id}>
              <ActionCard
                action={{
                  id: a.id,
                  title: a.item.title,
                  instructions: a.item.instructions,
                  display: a.display,
                  time: a.local_time ? fmtTime(a.due_at, tz, locale) : null,
                  tz,
                  weekly: a.target_count > 1 ? { done: a.completed_count, target: a.target_count } : null,
                  planMode: a.item.plan_mode,
                }}
              />
            </li>
          ))}
        </ol>
      )}
      <p className="hint mt-10">{t("common.disclaimer")}</p>
    </>
  );
}
