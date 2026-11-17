import Link from "next/link";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { getLocale, getTranslations } from "next-intl/server";
import { Flame } from "lucide-react";
import { requireUser } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCircleView, type CirclePost } from "@/server/circle";
import { CircleActions, CodeCopy, InviteShare, Reactions } from "@/components/CircleClient";
import { Alert } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { dismissInviteAction, joinCircleAction, leaveCircleAction, newCircleCodeAction } from "@/app/actions";
import { INVITE_COOKIE } from "@/lib/invite";
import { intlLocale, nowMs } from "@/lib/format";
import { FreshOnOpen } from "@/components/FreshOnOpen";

export const metadata: Metadata = { title: "Circle" };

const POST_EMOJI: Record<string, string> = { joined: "👋", day_done: "✅", streak: "🔥", milestone: "🏅", missed: "💭", comeback: "💪", note: "💬", challenge_start: "🏁", challenge_last_day: "⏳", challenge_end: "🏆" };
const eyebrow = "mb-2.5 text-[0.75rem] font-medium uppercase tracking-[0.08em] text-ink-faint";

function ago(iso: string, locale: string) {
  const s = Math.round((new Date(iso).getTime() - Date.now()) / 1000);
  const rtf = new Intl.RelativeTimeFormat(intlLocale(locale), { numeric: "auto", style: "short" });
  const a = Math.abs(s);
  if (a < 3600) return rtf.format(Math.round(s / 60), "minute");
  if (a < 86400) return rtf.format(Math.round(s / 3600), "hour");
  return rtf.format(Math.round(s / 86400), "day");
}

const RESULTS = ["joined", "already", "full", "invalid", "too_many", "rate_limited", "created", "ended"];

export default async function CirclePage({ searchParams }: { searchParams: Promise<{ r?: string; c?: string }> }) {
  const { r, c } = await searchParams;
  const { supabase, user } = await requireUser();
  const t = await getTranslations();
  const locale = await getLocale();
  const { data: profile } = await supabase.from("profiles").select("timezone").eq("id", user.id).single();
  const view = await getCircleView(createAdminClient(), user.id, profile?.timezone ?? "Asia/Kolkata", c && /^[0-9a-f-]{36}$/.test(c) ? c : null);
  const pending = (await cookies()).get(INVITE_COOKIE)?.value;
  const invite = pending && pending !== view.circle.code ? pending : null;
  const base = process.env.NEXT_PUBLIC_APP_URL || "https://sukhi-60.vercel.app";
  const link = `${base.replace(/\/$/, "")}/circle/join/${view.circle.code}`;
  const alone = view.members.length === 1;
  const name = (p: { name: string | null; me: boolean }) => (p.me ? t("circle.you") : p.name ?? t("circle.someone"));
  const postText = (p: CirclePost) => (p.kind === "challenge_end" && !p.meta.label ? t("circle.post_challenge_end_none") : t(`circle.post_${p.kind}`, { name: name(p), n: Number(p.meta.n ?? 0), label: String(p.meta.label ?? "") }));
  const ch = view.challenge;
  const dateFmt = (d: string) => new Intl.DateTimeFormat(intlLocale(locale), { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${d}T00:00:00Z`));
  const myRank = view.members.findIndex((m) => m.me) + 1;

  return (
    <>
      <FreshOnOpen renderedAt={nowMs()} />
      <header className="mb-4">
        <h1 className="text-[1.6rem] sm:text-[2rem]">{t("circle.title")}</h1>
      </header>

      {view.circles.length > 1 ? (
        <nav aria-label={t("circle.title")} className="-mx-1 mb-4 flex gap-1.5 overflow-x-auto px-1 pb-1">
          {view.circles.map((x) => (
            <Link key={x.id} href={`/circle?c=${x.id}`} aria-current={x.id === view.circle.id ? "page" : undefined} className={`shrink-0 rounded-full border px-3.5 py-1.5 text-sm transition-colors ${x.id === view.circle.id ? "border-primary bg-primary text-primary-ink" : "border-line bg-surface text-ink-soft hover:border-ink-soft"}`}>{x.challenge ? "🏆 " : ""}{x.name}</Link>
          ))}
        </nav>
      ) : null}

      <CircleActions canCreate={view.canCreate} />

      {r && RESULTS.includes(r) ? <div className="mb-4"><Alert tone={r === "joined" || r === "already" || r === "created" ? "ok" : "warn"}>{t(`circle.r_${r}`)}</Alert></div> : null}

      {invite ? (
        <section className="panel mb-5 p-4">
          <p className="font-medium">{t("circle.joinTitle")}</p>
          <div className="mt-3 flex gap-2">
            <form action={joinCircleAction}>
              <input type="hidden" name="code" value={invite} />
              <SubmitButton className="btn btn-primary">{t("circle.join")}</SubmitButton>
            </form>
            <form action={dismissInviteAction}><button className="btn btn-ghost">{t("circle.notNow")}</button></form>
          </div>
        </section>
      ) : null}

      {ch ? (
        <section aria-labelledby="challenge" className="panel mb-5 p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 id="challenge" className="text-[1.05rem] font-semibold">🏆 {view.circle.name}</h2>
              <p className="mt-0.5 text-sm text-ink-soft">{t("circle.dates", { start: dateFmt(ch.startsOn), end: dateFmt(ch.endsOn) })}</p>
            </div>
            <span className={`chip shrink-0 ${ch.state === "live" ? "bg-primary-soft text-primary" : ""}`}>
              {ch.state === "upcoming" ? t("circle.startsOn", { date: dateFmt(ch.startsOn) }) : ch.state === "ended" ? t("circle.ended") : ch.daysLeft === 0 ? t("circle.lastDay") : ch.daysLeft === 1 ? t("circle.endsTomorrow") : t("circle.daysLeft", { n: ch.daysLeft })}
            </span>
          </div>
          {ch.prize ? <p className="mt-3 text-sm"><span className="text-ink-faint">{t("circle.prize")}: </span><span className="font-medium">{ch.prize}</span></p> : null}
          {myRank && ch.state !== "upcoming" ? <p className="mt-1 text-sm font-medium text-primary">{t("circle.rank", { n: myRank, total: view.members.length })}</p> : null}
        </section>
      ) : null}

      {alone && !ch ? (
        <section className="panel mb-5 flex flex-col items-center px-6 pb-6 pt-7 text-center">
          <div aria-hidden="true" className="flex -space-x-2">
            {["🙂", "😄", "🥳"].map((e) => <span key={e} className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-surface bg-surface-2 text-lg">{e}</span>)}
          </div>
          <p className="mt-4 text-[1.05rem] font-medium">{t("circle.aloneTitle")}</p>
          <p className="mt-1 max-w-xs text-sm text-ink-soft">{t("circle.aloneBody")}</p>
        </section>
      ) : null}

      {(view.slotsLeft === null ? ch?.state !== "ended" : view.slotsLeft > 0) ? (
        <section aria-labelledby="code" className="panel mb-6 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 id="code" className="text-[0.75rem] font-medium uppercase tracking-[0.08em] text-ink-faint">{t("circle.code")}</h2>
              {/^\d{5}$/.test(view.circle.code) ? <p className="display mt-0.5 text-[1.9rem] font-semibold tabular-nums tracking-[0.2em]">{view.circle.code}</p> : <p className="mt-1 text-sm text-ink-soft">{t("circle.noCode")}</p>}
            </div>
            {/^\d{5}$/.test(view.circle.code) ? <CodeCopy code={view.circle.code} /> : null}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <InviteShare url={link} code={view.circle.code} label={t("circle.invite")} variant="pill" />
            {view.circle.isOwner ? (
              <form action={newCircleCodeAction}>
                <input type="hidden" name="circle_id" value={view.circle.id} />
                <SubmitButton className="btn btn-ghost px-3 text-sm">{/^\d{5}$/.test(view.circle.code) ? t("circle.newCode") : t("circle.makeCode")}</SubmitButton>
              </form>
            ) : null}
            {view.slotsLeft !== null ? <span className="ml-auto text-xs text-ink-faint">{t("circle.spotsLeft", { n: view.slotsLeft })}</span> : null}
          </div>
        </section>
      ) : null}

      <section aria-labelledby="board" className="mb-7">
        <div className="flex items-center justify-between">
          <h2 id="board" className={eyebrow}>{ch ? t("circle.challengePoints") : t("circle.week")}</h2>
        </div>
        <ol className="panel divide-y divide-line">
          {view.members.map((m, i) => (
            <li key={m.userId} className={`flex items-center gap-3 px-4 py-3 ${m.me ? "bg-primary-soft/40" : ""}`}>
              <span className="w-4 text-center text-sm font-semibold tabular-nums text-ink-faint">{i + 1}</span>
              <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-2 text-sm font-semibold">{(m.name ?? "?").charAt(0).toUpperCase()}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{name(m)}</span>
                <span className="flex items-center gap-2 text-xs text-ink-faint">
                  {m.streak > 0 ? <span className="flex items-center gap-0.5"><Flame size={12} className="text-haldi" aria-hidden="true" />{m.streak}</span> : null}
                  {m.totalToday ? <span>{t("circle.today", { done: m.doneToday, total: m.totalToday })}</span> : null}
                </span>
              </span>
              <span className="text-right">
                <span className="display block text-[1.15rem] font-semibold tabular-nums leading-none">{m.points}</span>
                <span className="text-[0.7rem] text-ink-faint">{t("circle.pts")}</span>
              </span>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="feed" className="mb-8">
        <h2 id="feed" className={eyebrow}>{t("circle.feed")}</h2>
        {view.feed.length === 0 ? <p className="text-sm text-ink-soft">{t("circle.feedEmpty")}</p> : (
          <ul className="flex flex-col gap-2.5">
            {view.feed.map((p) => (
              <li key={p.id} className="panel flex gap-3 p-3.5">
                <span aria-hidden="true" className="text-lg leading-6">{POST_EMOJI[p.kind] ?? "•"}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-[0.92rem]">{postText(p)} <span className="text-xs text-ink-faint">· {ago(p.createdAt, locale)}</span></p>
                  {p.userId === null ? null : !p.me ? <Reactions postId={p.id} counts={p.counts} mine={p.mine} canNudge={p.kind === "missed"} /> : (p.counts.cheer + p.counts.fire + p.counts.hug + p.counts.nudge > 0 ? <p className="mt-1 text-xs text-ink-faint">{p.counts.cheer ? `👏 ${p.counts.cheer} ` : ""}{p.counts.fire ? `🔥 ${p.counts.fire} ` : ""}{p.counts.hug ? `🤗 ${p.counts.hug} ` : ""}{p.counts.nudge ? `👋 ${p.counts.nudge}` : ""}</p> : null)}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {!alone || view.circles.length > 1 ? (
        <details className="text-sm text-ink-faint">
          <summary className="cursor-pointer">{t("circle.more")}</summary>
          <form action={leaveCircleAction} className="mt-2"><input type="hidden" name="circle_id" value={view.circle.id} /><SubmitButton className="btn btn-ghost px-0 text-sm text-danger-ink underline">{t("circle.leave")}</SubmitButton></form>
        </details>
      ) : null}
    </>
  );
}
