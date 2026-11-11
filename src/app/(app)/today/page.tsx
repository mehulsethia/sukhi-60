import Link from "next/link";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { Bell, ClipboardList, Flame, MessageCircle, Moon, PartyPopper, Sun, Sunrise, Sunset, CalendarRange } from "lucide-react";
import { requireUser } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getToday, materializeOccurrences } from "@/server/core";
import { assistantSuggestions } from "@/server/suggestions";
import { activeDays, progressFromEvents, summarizeWeek } from "@/domain/rewards";
import { addDays, localDateOf, weekStart } from "@/domain/schedule";
import { ActionCard } from "@/components/ActionCard";
import { InstallPrompt } from "@/components/InstallPrompt";
import { fmtTime, hoursAgoIso, nowMs } from "@/lib/format";
import { BUCKETS, BUCKET_COLOR, bucketOf, isDone, type Bucket } from "@/lib/status";

export const metadata: Metadata = { title: "Today" };

/** Ring split into one arc per check-in state, so the day reads at a glance. */
function DayRing({ counts, total, label }: { counts: Partial<Record<Bucket, number>>; total: number; label: string }) {
  const r = 52, c = 2 * Math.PI * r, gap = total > 1 ? 4 : 0;
  const present = BUCKETS.filter((b) => counts[b]);
  const lens = present.map((b) => ((counts[b] ?? 0) / Math.max(total, 1)) * c);
  const arcs = present.map((b, i) => ({ b, dash: Math.max(0, lens[i] - gap), offset: lens.slice(0, i).reduce((a, n) => a + n, 0) }));
  const done = (counts.done ?? 0) + (counts.evidence ?? 0);
  return (
    <svg width="132" height="132" viewBox="0 0 132 132" role="img" aria-label={label} className="shrink-0">
      <circle cx="66" cy="66" r={r} fill="none" stroke="var(--surface-3)" strokeWidth="12" />
      {arcs.map((a) => (
        <circle key={a.b} cx="66" cy="66" r={r} fill="none" stroke={a.b === "open" ? "var(--surface-3)" : BUCKET_COLOR[a.b]} strokeWidth="12" strokeLinecap="butt" strokeDasharray={`${a.dash} ${c}`} strokeDashoffset={-a.offset} transform="rotate(-90 66 66)" />
      ))}
      <text x="66" y="66" textAnchor="middle" className="display" fontSize="30" fontWeight="700" fill="var(--ink)">{done}<tspan fontSize="18" fill="var(--ink-faint)">/{total}</tspan></text>
      <text x="66" y="88" textAnchor="middle" fontSize="12" fill="var(--ink-soft)">{label}</text>
    </svg>
  );
}

const PARTS = [
  { key: "morning", from: 0, to: 12, Icon: Sunrise },
  { key: "afternoon", from: 12, to: 17, Icon: Sun },
  { key: "evening", from: 17, to: 21, Icon: Sunset },
  { key: "night", from: 21, to: 24, Icon: Moon },
] as const;

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
  const [actions, { data: events }, { data: notices }, { data: weekOcc }, suggestions] = await Promise.all([
    getToday(supabase, user.id, tz),
    supabase.from("reward_events").select("kind, points"),
    supabase.from("messages").select("id, content, created_at").eq("role", "notice").gte("created_at", hoursAgoIso(12)).order("created_at", { ascending: false }).limit(1),
    supabase.from("action_occurrences").select("local_date, status").gte("local_date", ws).lte("local_date", addDays(ws, 6)),
    assistantSuggestions(supabase, user.id, tz, t),
  ]);
  const timed = actions.filter((a) => a.target_count === 1);
  const weekly = actions.filter((a) => a.target_count > 1);
  const stats = progressFromEvents(events ?? []);
  const week = summarizeWeek(weekDates, weekOcc ?? []);
  const todayStr = localDateOf(new Date(), tz);
  const now = nowMs();
  const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", hourCycle: "h23" }).format(new Date(now)));
  const greet = hour < 12 ? t("app.morning") : hour < 17 ? t("app.afternoon") : t("app.evening");
  const first = profile?.display_name?.split(" ")[0];
  const dateLabel = new Intl.DateTimeFormat(locale === "en" ? "en-IN" : `${locale}-IN`, { timeZone: tz, weekday: "long", day: "numeric", month: "long" }).format(new Date(now));
  const counts: Partial<Record<Bucket, number>> = {};
  for (const a of actions) counts[bucketOf(a.display)] = (counts[bucketOf(a.display)] ?? 0) + 1;
  const done = actions.filter((a) => isDone(bucketOf(a.display))).length;
  // Up next: whatever needs an answer now, else the next one coming up.
  const heroAction =
    timed.find((a) => ["due", "awaiting_response"].includes(a.display)) ??
    timed.find((a) => a.display === "later") ??
    timed.find((a) => a.display === "pending" && new Date(a.due_at).getTime() > now);
  const card = (a: (typeof actions)[number]) => ({
    id: a.id, title: a.item.title, instructions: a.item.instructions, display: a.display,
    time: a.local_time ? fmtTime(a.due_at, tz, locale) : null, tz,
    weekly: a.target_count > 1 ? { done: a.completed_count, target: a.target_count } : null, planMode: a.item.plan_mode,
  });
  const hourOf = (a: (typeof actions)[number]) => Number((a.local_time ?? "00:00").slice(0, 2));
  const summary = actions.length === 0 ? null : done === actions.length ? t("app.allDone") : done === 0 ? t("app.nothingYet") : t("app.progressToday", { done, total: actions.length });

  return (
    <>
      <header className="mb-7">
        <p className="text-sm font-semibold text-ink-soft">{dateLabel}</p>
        <h1 className="mt-1 text-[2.1rem] leading-[1.05] sm:text-[2.9rem]">{greet}{first ? `, ${first}` : ""}</h1>
        {summary ? <p className="mt-2 text-lg text-ink-soft">{summary}</p> : null}
      </header>

      <InstallPrompt />
      {welcome ? (
        <section className="pop-in mb-6 rounded-[24px] border border-line bg-surface p-6 shadow-[var(--shadow-md)]">
          <h2 className="text-2xl">{first ? t("onb.welcomeTitle", { name: first }) : t("onb.welcomeTitleNoName")}</h2>
          <p className="mt-2 max-w-2xl text-ink-soft">{t("onb.welcomeBody")}</p>
          <Link href="/today" className="btn btn-primary mt-4">{t("onb.welcomeDismiss")}</Link>
        </section>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-8">
        <div className="flex min-w-0 flex-col gap-7">
          {actions.length === 0 ? (
            <div className="panel flex flex-col items-center px-6 py-14 text-center">
              <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-soft text-primary"><ClipboardList size={26} aria-hidden="true" /></span>
              <p className="mt-4 text-xl font-semibold">{t("today.empty")}</p>
              <p className="mt-1 max-w-sm text-ink-soft">{t("today.emptyBody")}</p>
              <Link href="/plan" className="btn btn-primary btn-lg mt-6">{t("today.emptyCta")}</Link>
            </div>
          ) : heroAction ? (
            <ActionCard variant="hero" action={card(heroAction)} />
          ) : done === actions.length ? (
            <div className="flex items-center gap-4 rounded-[24px] bg-[linear-gradient(135deg,var(--hero-from),var(--hero-to))] p-6 text-white shadow-[var(--shadow-md)]">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white/15"><PartyPopper size={24} aria-hidden="true" /></span>
              <div><p className="text-xl font-semibold">{t("today.allDoneTitle")}</p><p className="text-white/85">{t("today.allDoneBody")}</p></div>
            </div>
          ) : null}

          {PARTS.map(({ key, from, to, Icon }) => {
            const list = timed.filter((a) => a.id !== heroAction?.id && hourOf(a) >= from && hourOf(a) < to);
            if (!list.length) return null;
            return (
              <section key={key} aria-labelledby={`part-${key}`}>
                <h2 id={`part-${key}`} className="mb-3 flex items-center gap-2 text-base font-bold text-ink-soft"><Icon size={18} aria-hidden="true" />{t(`today.part_${key}`)}<span className="font-semibold text-ink-faint">· {list.length}</span></h2>
                <ol className="flex flex-col gap-3">{list.map((a) => <li key={a.id}><ActionCard action={card(a)} /></li>)}</ol>
              </section>
            );
          })}
          {weekly.length ? (
            <section aria-labelledby="part-week">
              <h2 id="part-week" className="mb-3 flex items-center gap-2 text-base font-bold text-ink-soft"><CalendarRange size={18} aria-hidden="true" />{t("today.part_week")}</h2>
              <ol className="flex flex-col gap-3">{weekly.map((a) => <li key={a.id}><ActionCard action={card(a)} /></li>)}</ol>
            </section>
          ) : null}
        </div>

        <aside className="flex flex-col gap-5">
          {actions.length ? (
            <div className="panel flex items-center gap-4 p-5">
              <DayRing counts={counts} total={actions.length} label={t("today.ringLabel")} />
              <ul className="flex min-w-0 flex-col gap-1.5 text-sm">
                {BUCKETS.filter((b) => counts[b]).map((b) => (
                  <li key={b} className="flex items-center gap-2"><span className="dot" style={{ background: b === "open" ? "var(--surface-3)" : BUCKET_COLOR[b] }} /><span className="truncate">{t(`bucket.${b}`)}</span><span className="ml-auto pl-2 font-semibold tabular-nums">{counts[b]}</span></li>
                ))}
              </ul>
            </div>
          ) : null}

          <Link href="/progress" className="panel block p-5 transition-colors hover:border-line-strong">
            <div className="flex items-baseline justify-between gap-2">
              <p className="font-bold">{t("app.weekCard")}</p>
              <p className="flex items-center gap-1 text-sm font-semibold tabular-nums text-haldi-ink"><Flame size={15} className="text-haldi" aria-hidden="true" />{t("progress.points", { points: stats.points })}</p>
            </div>
            <div className="mt-4 grid grid-cols-7 gap-1.5" aria-hidden="true">
              {week.map((d, i) => {
                const ratio = d.scheduled ? d.completed / d.scheduled : 0;
                return (
                  <div key={d.date} className="flex flex-col items-center gap-1.5">
                    <div className={`relative h-14 w-full overflow-hidden rounded-lg ${d.date === todayStr ? "ring-2 ring-primary ring-offset-2 ring-offset-surface" : ""}`} style={{ background: "var(--surface-2)" }}>
                      <div className="absolute inset-x-0 bottom-0" style={{ height: `${d.responded && !ratio ? 18 : ratio * 100}%`, background: ratio ? "var(--st-done)" : d.responded ? "var(--st-skipped)" : "transparent" }} />
                    </div>
                    <span className={`text-[0.7rem] ${d.date === todayStr ? "font-bold text-ink" : "text-ink-faint"}`}>{t(`weekday.${i + 1}`)}</span>
                  </div>
                );
              })}
            </div>
            <p className="mt-4 text-sm text-ink-soft">{t("progress.activeDays", { days: activeDays(week) })}</p>
          </Link>

          {notices && notices.length > 0 ? (
            <p role="status" className="panel flex items-start gap-3 p-4">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-haldi-soft text-haldi-ink"><Bell size={17} aria-hidden="true" /></span>
              <span className="pt-1.5 text-[0.95rem]">{notices[0].content}</span>
            </p>
          ) : null}

          <div className="panel p-5">
            <p className="flex items-center gap-2 font-bold"><MessageCircle size={18} className="text-primary" aria-hidden="true" />{t("shell.askTitle")}</p>
            <ul className="mt-3 flex flex-col gap-2">
              {suggestions.map((s) => (
                <li key={s}><Link href={`/chat?q=${encodeURIComponent(s)}`} className="block rounded-xl border border-line px-3.5 py-2.5 text-[0.95rem] transition-colors hover:border-primary hover:bg-primary-soft">{s}</Link></li>
              ))}
            </ul>
          </div>
        </aside>
      </div>
      <p className="hint mt-12 max-w-3xl">{t("common.disclaimer")}</p>
    </>
  );
}
