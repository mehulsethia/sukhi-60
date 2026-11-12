import Link from "next/link";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { cookies } from "next/headers";
import { Bell, ClipboardList, HandHeart, Moon, PartyPopper, Sun, Sunrise, Sunset, CalendarRange } from "lucide-react";
import { dismissSupportPrompt } from "@/app/actions";
import { requireUser } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getToday, materializeOccurrences } from "@/server/core";
import { localDateOf } from "@/domain/schedule";
import { ActionCard } from "@/components/ActionCard";
import { InstallPrompt } from "@/components/InstallPrompt";
import { PushToggle } from "@/components/PushToggle";
import { MoodCard } from "@/components/CompanionForms";
import { COMPANION_POLICY, daysLeft } from "@/server/companion";
import { Package } from "lucide-react";
import { fmtTime, hoursAgoIso, nowMs } from "@/lib/format";
import { bucketOf, isDone } from "@/lib/status";

export const metadata: Metadata = { title: "Today" };

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
  const { data: profile } = await supabase.from("profiles").select("display_name, timezone, behaviour_prefs_updated_at").eq("id", user.id).single();
  // Existing accounts: offer the new support-style questions without forcing anything.
  const showSupportPrompt = !welcome && !profile?.behaviour_prefs_updated_at && (await cookies()).get("sukhi_support_prompt")?.value !== "dismissed";
  const tz = profile?.timezone ?? "UTC";
  const [firstActions, { data: notices }] = await Promise.all([
    getToday(supabase, user.id, tz),
    supabase.from("messages").select("id, content, created_at").eq("role", "notice").gte("created_at", hoursAgoIso(12)).order("created_at", { ascending: false }).limit(1),
  ]);
  const [{ data: mood }, { data: stocked }, { count: alertMembers }] = await Promise.all([
    supabase.from("mood_checkins").select("mood, stress, sleep_quality, sleep_hours").eq("user_id", user.id).eq("local_date", localDateOf(new Date(), tz)).maybeSingle(),
    supabase.from("plan_items").select("id, plan_id, title, stock_count, units_per_dose, schedule_kind, times, weekdays, weekly_target").eq("status", "confirmed").not("stock_count", "is", null),
    supabase.from("family_access").select("id", { count: "exact", head: true }).eq("patient_id", user.id).eq("status", "active").contains("scopes", ["alerts"]),
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
  const dateLabel = new Intl.DateTimeFormat(locale === "en" ? "en-IN" : `${locale}-IN`, { timeZone: tz, weekday: "long", day: "numeric", month: "long" }).format(new Date(now));
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
  const summary = actions.length === 0 ? null : done === actions.length ? t("app.allDone") : done === 0 ? t("app.nothingYet") : t("app.progressToday", { done, total: actions.length });

  return (
    <>
      <header className="mb-7">
        <p className="text-sm font-semibold text-ink-soft">{dateLabel}</p>
        <h1 className="mt-1 text-[2rem] leading-[1.1] sm:text-[2.5rem]">{greet}{first ? `, ${first}` : ""}.</h1>
        {summary ? <p className="mt-2 text-lg text-ink-soft">{summary}</p> : null}
      </header>

      <InstallPrompt />
      <PushToggle variant="prompt" publicKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || null} />
      {showSupportPrompt ? (
        <section aria-labelledby="support-prompt" className="mb-6 flex flex-col gap-3 rounded-[var(--r-lg)] border border-line bg-surface p-5 sm:flex-row sm:items-center">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary"><HandHeart size={22} aria-hidden="true" /></span>
          <div className="flex-1">
            <h2 id="support-prompt" className="text-lg">{t("support.promptTitle")}</h2>
            <p className="text-ink-soft">{t("support.promptBody")}</p>
          </div>
          <div className="flex gap-2">
            <Link href="/settings#support" className="btn btn-primary">{t("support.promptCta")}</Link>
            <form action={dismissSupportPrompt}><button className="btn btn-ghost">{t("support.promptDismiss")}</button></form>
          </div>
        </section>
      ) : null}
      {welcome ? (
        <section className="pop-in mb-6 rounded-[var(--r-lg)] border border-line bg-sky p-6">
          <h2 className="text-2xl">{first ? t("onb.welcomeTitle", { name: first }) : t("onb.welcomeTitleNoName")}</h2>
          <p className="mt-2 max-w-2xl text-ink-soft">{t("onb.welcomeBody")}</p>
          <Link href="/today" className="btn btn-primary mt-4">{t("onb.welcomeDismiss")}</Link>
        </section>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-8">
        <div className="flex min-w-0 flex-col gap-7">
          {actions.length === 0 ? (
            <div className="panel flex flex-col items-center px-6 py-14 text-center">
              <span className="flex h-14 w-14 items-center justify-center rounded-[var(--r-lg)] bg-sky text-primary"><ClipboardList size={26} aria-hidden="true" /></span>
              <p className="mt-4 text-xl font-semibold">{t("today.empty")}</p>
              <p className="mt-1 max-w-sm text-ink-soft">{t("today.emptyBody")}</p>
              <Link href="/plan" className="btn btn-primary btn-lg mt-6">{t("today.emptyCta")}</Link>
            </div>
          ) : heroAction ? (
            <ActionCard variant="hero" action={card(heroAction)} />
          ) : done === actions.length ? (
            <div className="flex items-center gap-4 rounded-[var(--r-lg)] border border-line bg-surface p-6 shadow-[var(--shadow-sm)]">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-ok-bg text-[var(--sukhi-success)]"><PartyPopper size={24} aria-hidden="true" /></span>
              <div><p className="text-xl font-bold">{t("today.allDoneTitle")}</p><p className="text-ink-soft">{t("today.allDoneBody")}</p></div>
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
          {runningLow.length ? (
            <div className="panel border-[color-mix(in_srgb,var(--st-open)_45%,var(--line))] p-5">
              <p className="flex items-center gap-2 font-bold"><Package size={18} className="text-warn-ink" aria-hidden="true" />{t("companion.lowTitle")}</p>
              <ul className="mt-2 flex flex-col gap-1.5 text-[0.95rem]">
                {runningLow.map((i) => <li key={i.id}><Link href={`/plan/${i.plan_id}`} className="hover:underline">{i.left! <= 0 ? t("companion.lowOut", { title: i.title }) : t("companion.lowDays", { title: i.title, days: i.left! })}</Link></li>)}
              </ul>
            </div>
          ) : null}
          <MoodCard today={mood ? { ...mood, sleep_hours: mood.sleep_hours === null ? null : Number(mood.sleep_hours) } : null} />
          {notices && notices.length > 0 ? (
            <p role="status" className="panel flex items-start gap-3 p-4">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-haldi-soft text-haldi-ink"><Bell size={17} aria-hidden="true" /></span>
              <span className="pt-1.5 text-[0.95rem]">{notices[0].content}</span>
            </p>
          ) : null}
        </aside>
      </div>
    </>
  );
}
