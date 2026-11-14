import type { Metadata } from "next";
import { cookies } from "next/headers";
import { getLocale, getTranslations } from "next-intl/server";
import { Flame } from "lucide-react";
import { requireUser } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCircleView, type CirclePost } from "@/server/circle";
import { InviteShare, Reactions } from "@/components/CircleClient";
import { Alert } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { dismissInviteAction, joinCircleAction, leaveCircleAction } from "@/app/actions";
import { INVITE_COOKIE } from "@/lib/invite";
import { intlLocale } from "@/lib/format";

export const metadata: Metadata = { title: "Circle" };

const POST_EMOJI: Record<string, string> = { joined: "👋", day_done: "✅", streak: "🔥", milestone: "🏅", missed: "💭", comeback: "💪", note: "💬" };
const eyebrow = "mb-2.5 text-[0.75rem] font-medium uppercase tracking-[0.08em] text-ink-faint";

function ago(iso: string, locale: string) {
  const s = Math.round((new Date(iso).getTime() - Date.now()) / 1000);
  const rtf = new Intl.RelativeTimeFormat(intlLocale(locale), { numeric: "auto", style: "short" });
  const a = Math.abs(s);
  if (a < 3600) return rtf.format(Math.round(s / 60), "minute");
  if (a < 86400) return rtf.format(Math.round(s / 3600), "hour");
  return rtf.format(Math.round(s / 86400), "day");
}

export default async function CirclePage({ searchParams }: { searchParams: Promise<{ r?: string }> }) {
  const { r } = await searchParams;
  const { supabase, user } = await requireUser();
  const t = await getTranslations();
  const locale = await getLocale();
  const { data: profile } = await supabase.from("profiles").select("timezone").eq("id", user.id).single();
  const view = await getCircleView(createAdminClient(), user.id, profile?.timezone ?? "Asia/Kolkata");
  const pending = (await cookies()).get(INVITE_COOKIE)?.value;
  const invite = pending && pending !== view.circle.code ? pending : null;
  const base = process.env.NEXT_PUBLIC_APP_URL || "https://sukhi-60.vercel.app";
  const link = `${base.replace(/\/$/, "")}/circle/join/${view.circle.code}`;
  const alone = view.members.length === 1;
  const name = (p: { name: string | null; me: boolean }) => (p.me ? t("circle.you") : p.name ?? t("circle.someone"));
  const postText = (p: CirclePost) => t(`circle.post_${p.kind}`, { name: name(p), n: Number(p.meta.n ?? 0), label: String(p.meta.label ?? "") });

  return (
    <>
      <header className="mb-5">
        <h1 className="text-[1.6rem] sm:text-[2rem]">{t("circle.title")}</h1>
      </header>

      {r && r !== "in_other" ? <div className="mb-4"><Alert tone={r === "joined" || r === "already" ? "ok" : "warn"}>{t(`circle.r_${r === "joined" || r === "already" || r === "full" ? r : "invalid"}`)}</Alert></div> : null}

      {invite ? (
        <section className="panel mb-5 p-4">
          <p className="font-medium">{alone ? t("circle.joinTitle") : t("circle.switchTitle")}</p>
          {!alone ? <p className="mt-1 text-sm text-ink-soft">{t("circle.switchBody")}</p> : null}
          <div className="mt-3 flex gap-2">
            <form action={joinCircleAction}>
              <input type="hidden" name="code" value={invite} />
              {!alone ? <input type="hidden" name="switch" value="1" /> : null}
              <SubmitButton className="btn btn-primary">{alone ? t("circle.join") : t("circle.switchCta")}</SubmitButton>
            </form>
            <form action={dismissInviteAction}><button className="btn btn-ghost">{t("circle.notNow")}</button></form>
          </div>
        </section>
      ) : null}

      {alone ? (
        <section className="panel mb-6 flex flex-col items-center px-6 py-8 text-center">
          <div aria-hidden="true" className="flex -space-x-2">
            {["🙂", "😄", "🥳"].map((e) => <span key={e} className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-surface bg-surface-2 text-lg">{e}</span>)}
          </div>
          <p className="mt-4 text-[1.05rem] font-medium">{t("circle.aloneTitle")}</p>
          <p className="mt-1 max-w-xs text-sm text-ink-soft">{t("circle.aloneBody")}</p>
          <div className="mt-5"><InviteShare url={link} label={t("circle.invite")} /></div>
        </section>
      ) : null}

      <section aria-labelledby="board" className="mb-7">
        <div className="flex items-center justify-between">
          <h2 id="board" className={eyebrow}>{t("circle.week")}</h2>
          {!alone && view.slotsLeft > 0 ? <InviteShare url={link} label={t("circle.spots", { n: view.slotsLeft })} variant="pill" /> : null}
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
                  {!p.me ? <Reactions postId={p.id} counts={p.counts} mine={p.mine} canNudge={p.kind === "missed"} /> : (p.counts.cheer + p.counts.fire + p.counts.hug + p.counts.nudge > 0 ? <p className="mt-1 text-xs text-ink-faint">{p.counts.cheer ? `👏 ${p.counts.cheer} ` : ""}{p.counts.fire ? `🔥 ${p.counts.fire} ` : ""}{p.counts.hug ? `🤗 ${p.counts.hug} ` : ""}{p.counts.nudge ? `👋 ${p.counts.nudge}` : ""}</p> : null)}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {!alone ? (
        <details className="text-sm text-ink-faint">
          <summary className="cursor-pointer">{t("circle.more")}</summary>
          <form action={leaveCircleAction} className="mt-2"><SubmitButton className="btn btn-ghost px-0 text-sm text-danger-ink underline">{t("circle.leave")}</SubmitButton></form>
        </details>
      ) : null}
    </>
  );
}
