import Link from "next/link";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { ChevronRight, Moon, PartyPopper, Stethoscope, Sun, Sunrise, Sunset, CalendarRange } from "lucide-react";
import { requireUser } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getToday, materializeOccurrences, nextUpcoming } from "@/server/core";
import { addDays, localDateOf } from "@/domain/schedule";
import { ActionCard } from "@/components/ActionCard";
import { PackPicker } from "@/components/PackPicker";
import { FEATURED_PACKS } from "@/domain/templates";
import { InstallPrompt } from "@/components/InstallPrompt";
import { PushToggle } from "@/components/PushToggle";
import { MoodCard } from "@/components/CompanionForms";
import { COMPANION_POLICY, daysLeft } from "@/server/companion";
import { Package } from "lucide-react";
import { fmtTime, fmtWhen, nowMs, intlLocale } from "@/lib/format";
import { bucketOf, isDone } from "@/lib/status";

export const metadata: Metadata = { title: "Today" };

const PARTS = [
  { key: "morning", from: 0, to: 12, Icon: Sunrise },
  { key: "afternoon", from: 12, to: 17, Icon: Sun },
  { key: "evening", from: 17, to: 21, Icon: Sunset },
  { key: "night", from: 21, to: 24, Icon: Moon },
] as const;

export default async function TodayPage() {
  const { supabase, user } = await requireUser();
  const t = await getTranslations();
  const locale = await getLocale();
  const { data: profile } = await supabase.from("profiles").select("display_name, timezone").eq("id", user.id).single();
  const tz = profile?.timezone ?? "UTC";
  const firstActions = await getToday(supabase, user.id, tz);
  const todayDate = localDateOf(new Date(), tz);
  const [{ data: mood }, { data: stocked }, { count: alertMembers }, { data: drafts }, { data: tomorrowRows }] = await Promise.all([
    supabase.from("mood_checkins").select("mood, stress, sleep_quality, sleep_hours").eq("user_id", user.id).eq("local_date", localDateOf(new Date(), tz)).maybeSingle(),
    supabase.from("plan_items").select("id, plan_id, title, stock_count, units_per_dose, schedule_kind, times, weekdays, weekly_target").eq("status", "confirmed").not("stock_count", "is", null),
    supabase.from("family_access").select("id", { count: "exact", head: true }).eq("patient_id", user.id).eq("status", "active").contains("scopes", ["alerts"]),
    // Items read from a doctor's note wait for the person's OK before they're scheduled: say so here.
    supabase.from("plan_items").select("plan_id").eq("user_id", user.id).eq("status", "draft"),
    // A peek at tomorrow so a nearly-finished day never looks empty.
    supabase.from("action_occurrences").select("id, due_at, target_count, plan_items!inner(title)").eq("user_id", user.id).eq("local_date", addDays(todayDate, 1)).neq("status", "paused").order("due_at").limit(20),
  ]);
  const runningLow = (stocked ?? []).map((i) => ({ ...i, left: daysLeft(i) })).filter((i) => i.left !== null && i.left <= COMPANION_POLICY.refillWarnDays);
  // Top up only when today looks empty (new plan, or before the scheduler's daily run).
  let actions = firstActions;
  if (actions.length === 0) {
    const r = await materializeOccurrences(createAdminClient(), user.id, 2).catch(() => null);
    if (r) actions = await getToday(supabase, user.id, tz);
  }
  const timed = actions.filter((a) => a.target_count === 1);
  const weekly = actions.filter((a) => a.target_count > 1);
  const now = nowMs();
  const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", hourCycle: "h23" }).format(new Date(now)));
  const greet = hour < 12 ? t("app.morning") : hour < 17 ? t("app.afternoon") : t("app.evening");
  const first = profile?.display_name?.split(" ")[0];
  const dateLabel = new Intl.DateTimeFormat(intlLocale(locale), { timeZone: tz, weekday: "long", day: "numeric", month: "long" }).format(new Date(now));
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
    canTellFamily: (alertMembers ?? 0) > 0,
  });
  const hourOf = (a: (typeof actions)[number]) => Number((a.local_time ?? "00:00").slice(0, 2));
  const allDone = actions.length > 0 && done === actions.length;
  // Nothing (left) today: show what's next instead of "set up your plan" or a dead end.
  const upcoming = actions.length === 0 || allDone ? await nextUpcoming(supabase, user.id).catch(() => null) : null;
  const whenNext = upcoming ? fmtWhen(upcoming.due_at, upcoming.local_date, localDateOf(new Date(), tz), t("today.tomorrow"), tz, locale) : "";
  // When everything is done, the "All done" card says it; the header line would only repeat it.
  const openToday = timed.filter((a) => !isDone(bucketOf(a.display))).length;
  const tomorrow = (tomorrowRows ?? []).filter((o) => o.target_count === 1).map((o) => ({ id: o.id, time: fmtTime(o.due_at, tz, locale), title: (o.plan_items as unknown as { title: string }).title }));
  const showTomorrow = actions.length > 0 && openToday <= 2 && tomorrow.length > 0;
  const reviewPlan = drafts?.[0]?.plan_id ?? null;
  const summary = actions.length === 0 || allDone ? null : done === 0 ? t("app.nothingYet") : t("app.progressToday", { done, total: actions.length });

  return (
    <>
      <header className="mb-6">
        <p className="text-[0.8rem] font-medium uppercase tracking-[0.08em] text-ink-faint">{dateLabel}</p>
        <h1 className="mt-1.5 text-[1.6rem] leading-tight sm:text-[2rem]">{greet}{first ? `, ${first}` : ""}</h1>
        {summary && done > 0 ? <p className="mt-1 text-sm text-ink-soft">{summary}</p> : null}
      </header>

      <InstallPrompt />
      <PushToggle variant="prompt" publicKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || null} />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-8">
        <div className="flex min-w-0 flex-col gap-6">
          {reviewPlan ? (
            <Link href={`/plan/${reviewPlan}`} className="flex items-center gap-3 rounded-[var(--r-lg)] border border-[color-mix(in_srgb,var(--st-open)_45%,var(--line))] bg-surface p-4 transition-colors hover:border-primary">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-warn-bg text-warn-ink"><Stethoscope size={18} aria-hidden="true" /></span>
              <span className="min-w-0 flex-1 font-medium leading-snug">{t("today.reviewTitle", { count: drafts!.length })}</span>
              <span className="flex shrink-0 items-center gap-0.5 text-sm font-semibold text-primary">{t("today.reviewCta")}<ChevronRight size={16} aria-hidden="true" /></span>
            </Link>
          ) : null}
          {actions.length === 0 && upcoming ? (
            <div className="panel flex flex-col items-center px-6 py-10 text-center">
              <PartyPopper size={22} strokeWidth={1.6} className="text-ink-faint" aria-hidden="true" />
              <p className="mt-3 text-[1.05rem] font-medium">{t("today.nothingLeftTitle")}</p>
              <p className="mt-1 max-w-sm text-sm text-ink-soft">{t("today.nextUp", { title: upcoming.title, when: whenNext })}</p>
            </div>
          ) : actions.length === 0 ? (
            <section aria-labelledby="start">
              <h2 id="start" className="text-[1.05rem] font-medium">{t("today.emptyPick")}</h2>
              <div className="mt-3"><PackPicker keys={FEATURED_PACKS} /></div>
              <Link href="/plan" className="link mt-3 inline-block text-sm">{t("today.emptyMore")}</Link>
            </section>
          ) : heroAction ? (
            <ActionCard variant="hero" action={card(heroAction)} />
          ) : done === actions.length ? (
            <div className="flex items-center gap-3 rounded-[var(--r-lg)] border border-line bg-surface p-5">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-ok-bg text-[var(--sukhi-success)]"><PartyPopper size={19} aria-hidden="true" /></span>
              <div><p className="text-[1.05rem] font-semibold">{t("today.allDoneTitle")}</p><p className="text-ink-soft">{upcoming && !showTomorrow ? t("today.nextUp", { title: upcoming.title, when: whenNext }) : t("today.allDoneBody")}</p></div>
            </div>
          ) : null}

          {PARTS.map(({ key, from, to, Icon }) => {
            const list = timed.filter((a) => a.id !== heroAction?.id && hourOf(a) >= from && hourOf(a) < to);
            if (!list.length) return null;
            return (
              <section key={key} aria-labelledby={`part-${key}`}>
                <h2 id={`part-${key}`} className="mb-2.5 flex items-center gap-2 text-[0.8rem] font-medium uppercase tracking-[0.08em] text-ink-faint"><Icon size={15} aria-hidden="true" />{t(`today.part_${key}`)}<span className="text-ink-faint/80">· {list.length}</span></h2>
                <ol className="flex flex-col gap-2.5">{list.map((a) => <li key={a.id}><ActionCard action={card(a)} /></li>)}</ol>
              </section>
            );
          })}
          {weekly.length ? (
            <section aria-labelledby="part-week">
              <h2 id="part-week" className="mb-2.5 flex items-center gap-2 text-[0.8rem] font-medium uppercase tracking-[0.08em] text-ink-faint"><CalendarRange size={15} aria-hidden="true" />{t("today.part_week")}</h2>
              <ol className="flex flex-col gap-3">{weekly.map((a) => <li key={a.id}><ActionCard action={card(a)} /></li>)}</ol>
            </section>
          ) : null}
          {showTomorrow ? (
            <section aria-labelledby="part-tomorrow">
              <h2 id="part-tomorrow" className="mb-2.5 flex items-center gap-2 text-[0.8rem] font-medium uppercase tracking-[0.08em] text-ink-faint"><Sunrise size={15} aria-hidden="true" />{t("today.part_tomorrow")}<span className="text-ink-faint/80">· {tomorrow.length}</span></h2>
              <ol className="panel divide-y divide-line/70 px-4">
                {tomorrow.slice(0, 6).map((o) => (
                  <li key={o.id} className="flex items-center gap-3 py-2.5 text-[0.92rem]">
                    <span className="w-[4.5rem] shrink-0 whitespace-nowrap text-[0.8rem] tabular-nums text-ink-faint">{o.time}</span>
                    <span className="min-w-0 flex-1 truncate text-ink-soft">{o.title}</span>
                  </li>
                ))}
              </ol>
              {tomorrow.length > 6 ? <Link href="/plan" className="link mt-2 inline-block text-sm">{t("today.moreTomorrow", { count: tomorrow.length - 6 })}</Link> : null}
            </section>
          ) : null}
        </div>

        <aside className="flex flex-col gap-4">
          {runningLow.length ? (
            <div className="panel border-[color-mix(in_srgb,var(--st-open)_45%,var(--line))] p-5">
              <p className="flex items-center gap-2 font-bold"><Package size={18} className="text-warn-ink" aria-hidden="true" />{t("companion.lowTitle")}</p>
              <ul className="mt-2 flex flex-col gap-1.5 text-[0.95rem]">
                {runningLow.map((i) => <li key={i.id}><Link href={`/plan/${i.plan_id}`} className="hover:underline">{i.left! <= 0 ? t("companion.lowOut", { title: i.title }) : t("companion.lowDays", { title: i.title, days: i.left! })}</Link></li>)}
              </ul>
            </div>
          ) : null}
          <MoodCard today={mood ? { ...mood, sleep_hours: mood.sleep_hours === null ? null : Number(mood.sleep_hours) } : null} />
        </aside>
      </div>
    </>
  );
}
