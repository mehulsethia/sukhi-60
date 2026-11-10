import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { requireUser } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getToday, materializeOccurrences } from "@/server/core";
import { gardenFromEvents } from "@/domain/rewards";
import { Garden } from "@/components/Garden";
import { ActionCard } from "@/components/ActionCard";
import { Alert, PageHeader } from "@/components/ui";
import { fmtTime, hoursAgoIso, nowMs } from "@/lib/format";

export default async function TodayPage() {
  const { supabase, user } = await requireUser();
  const t = await getTranslations();
  const locale = await getLocale();
  // Idempotent top-up so Today is correct even before the scheduler's next run.
  await materializeOccurrences(createAdminClient(), user.id, 2).catch(() => undefined);
  const { data: profile } = await supabase.from("profiles").select("display_name, timezone").eq("id", user.id).single();
  const tz = profile?.timezone ?? "UTC";
  const [actions, { data: events }, { data: notices }] = await Promise.all([
    getToday(supabase, user.id, tz),
    supabase.from("reward_events").select("kind, points"),
    supabase.from("messages").select("id, content, created_at").eq("role", "notice").gte("created_at", hoursAgoIso(12)).order("created_at", { ascending: false }).limit(3),
  ]);
  const garden = gardenFromEvents(events ?? []);
  const now = nowMs();
  const next = actions.find((a) => a.local_time && new Date(a.due_at).getTime() > now && ["pending", "later"].includes(a.display));
  const first = profile?.display_name?.split(" ")[0];

  return (
    <>
      <PageHeader title={t("today.greeting", { name: first ? `, ${first}` : "" })} />
      <div className="mb-4 grid grid-cols-[1fr_auto] items-center gap-3 card">
        <div>
          <p className="hint">{t("today.nextCheckin")}</p>
          <p className="text-lg font-semibold">{next ? `${next.item.title} · ${fmtTime(next.due_at, tz, locale)}` : t("today.noNext")}</p>
          <Link href="/progress" className="mt-1 inline-block text-sm font-semibold text-primary underline">{t("progress.points", { points: garden.points })}</Link>
        </div>
        <Garden state={garden} label={t(`progress.stage_${garden.stage}`)} size={96} />
      </div>
      {notices && notices.length > 0 ? (
        <section aria-label={t("today.reminderNotices")} className="mb-4">
          {notices.slice(0, 1).map((n) => <Alert key={n.id} tone="info">🔔 {n.content}</Alert>)}
        </section>
      ) : null}
      {actions.length === 0 ? (
        <div className="card text-center">
          <p>{t("today.empty")}</p>
          <Link href="/plan" className="btn btn-primary mt-3">{t("today.emptyCta")}</Link>
        </div>
      ) : (
        <ul className="flex flex-col gap-3" aria-label={t("today.title")}>
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
        </ul>
      )}
      <p className="hint mt-6">{t("common.disclaimer")}</p>
    </>
  );
}
