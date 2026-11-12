import Link from "next/link";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { Stethoscope, X } from "lucide-react";
import { requireUser } from "@/lib/supabase/server";
import { setMemoryStatus } from "@/app/actions";
import { SubmitButton } from "@/components/SubmitButton";
import { AddQuestionForm, PrintButton } from "@/components/VisitTools";
import { completionRate, barrierDistribution } from "@/domain/learning";
import type { BarrierCode } from "@/domain/behaviour";
import { daysLeft } from "@/server/companion";
import { addDays, localDateOf } from "@/domain/schedule";
import { fmtDate } from "@/lib/format";

export const metadata: Metadata = { title: "Doctor visit" };

// A one-page, printable summary of what the person reported. It shows their own data and
// questions; it adds no interpretation or advice.
export default async function VisitPage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const sp = await searchParams;
  const days = sp.days === "14" ? 14 : 28;
  const { supabase, user } = await requireUser();
  const t = await getTranslations("visit");
  const tr = await getTranslations();
  const locale = await getLocale();
  const { data: profile } = await supabase.from("profiles").select("display_name, timezone, setup_for, care_recipient_name").eq("id", user.id).single();
  const tz = profile?.timezone ?? "Asia/Kolkata";
  const to = localDateOf(new Date(), tz);
  const from = addDays(to, -(days - 1));
  const [{ data: plans }, { data: occ }, { data: barriers }, { data: moods }, { data: questions }] = await Promise.all([
    supabase.from("care_plans").select("id, title, mode, status, clinician_name, paused_until, plan_items(id, title, category, schedule_kind, times, weekdays, weekly_target, instructions, status, stock_count, units_per_dose)").in("status", ["active", "paused"]).order("created_at"),
    supabase.from("action_occurrences").select("item_id, status").gte("local_date", from).lte("local_date", to).eq("target_count", 1).lt("window_end_at", new Date().toISOString()),
    supabase.from("barrier_reports").select("barrier_code").gte("created_at", `${from}T00:00:00Z`),
    supabase.from("mood_checkins").select("mood, stress, sleep_quality, sleep_hours").gte("local_date", from).lte("local_date", to),
    supabase.from("memory_facts").select("id, content, created_at").eq("kind", "open_question").in("status", ["proposed", "confirmed"]).order("created_at", { ascending: false }).limit(20),
  ]);
  const byItem = new Map<string, string[]>();
  for (const o of occ ?? []) (byItem.get(o.item_id) ?? byItem.set(o.item_id, []).get(o.item_id)!).push(o.status);
  const overall = completionRate((occ ?? []).map((o) => o.status));
  const dist = barrierDistribution((barriers ?? []).map((b) => b.barrier_code as BarrierCode));
  const m = moods ?? [];
  const avg = (xs: (number | null)[]) => { const v = xs.filter((x): x is number => x !== null).map(Number); return v.length ? Math.round((10 * v.reduce((a, b) => a + b, 0)) / v.length) / 10 : null; };
  const name = profile?.setup_for === "caregiver" ? profile.care_recipient_name || profile.display_name : profile?.display_name;
  const schedule = (i: { schedule_kind: string; times: string[]; weekdays: number[]; weekly_target: number | null }) =>
    i.schedule_kind === "weekly_target" ? t("weeklyTimes", { n: i.weekly_target ?? 1 }) : `${i.schedule_kind === "weekdays" ? `${i.weekdays.map((d) => tr(`weekday.${d}`)).join(" ")} · ` : ""}${i.times.join(", ")}`;
  const h2 = "text-lg font-bold";
  return (
    <div className="mx-auto max-w-3xl print:max-w-none">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="flex items-center gap-2 text-sm font-semibold text-primary"><Stethoscope size={16} aria-hidden="true" />{t("eyebrow")}</p>
          <h1 className="mt-1 text-[1.5rem] sm:text-[2.3rem]">{name ? t("titleFor", { name }) : t("title")}</h1>
          <p className="mt-1 text-ink-soft">{t("range", { from: fmtDate(from, locale), to: fmtDate(to, locale) })}</p>
        </div>
        <div className="flex flex-wrap gap-2 print:hidden">
          <Link href="?days=14" className={`pill-btn ${days === 14 ? "pill-btn-primary" : ""}`}>{t("days", { n: 14 })}</Link>
          <Link href="?days=28" className={`pill-btn ${days === 28 ? "pill-btn-primary" : ""}`}>{t("days", { n: 28 })}</Link>
          <PrintButton />
        </div>
      </header>

      <section className="panel mb-5 p-5" aria-labelledby="v-q">
        <h2 id="v-q" className={h2}>{t("questions")}</h2>
        {(questions ?? []).length === 0 ? <p className="mt-1 text-ink-soft">{t("questionsNone")}</p> : (
          <ol className="mt-2 flex list-decimal flex-col gap-1.5 pl-6">
            {(questions ?? []).map((q) => (
              <li key={q.id}><span className="flex items-start justify-between gap-2"><span>{q.content}</span>
                <form action={setMemoryStatus} className="print:hidden"><input type="hidden" name="memory_id" value={q.id} /><SubmitButton className="flex h-8 w-8 items-center justify-center rounded-full text-ink-faint hover:bg-surface-2" name="status" value="rejected"><X size={15} aria-label={t("remove")} /></SubmitButton></form>
              </span></li>
            ))}
          </ol>
        )}
        <AddQuestionForm />
      </section>

      <section className="panel mb-5 p-5" aria-labelledby="v-sum">
        <h2 id="v-sum" className={h2}>{t("summary")}</h2>
        <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div><dt className="text-sm text-ink-soft">{t("completed")}</dt><dd className="text-2xl font-bold">{overall.rate === null ? "—" : `${overall.rate}%`}</dd><dd className="text-xs text-ink-soft">{t("ofKnown", { done: overall.done, known: overall.known })}</dd></div>
          <div><dt className="text-sm text-ink-soft">{t("noReply")}</dt><dd className="text-2xl font-bold">{overall.unknown}</dd><dd className="text-xs text-ink-soft">{t("noReplyHint")}</dd></div>
          <div><dt className="text-sm text-ink-soft">{t("mood")}</dt><dd className="text-2xl font-bold">{avg(m.map((x) => x.mood)) ?? "—"}<span className="text-sm font-normal text-ink-soft">/5</span></dd><dd className="text-xs text-ink-soft">{t("checkins", { n: m.length })}</dd></div>
          <div><dt className="text-sm text-ink-soft">{t("sleep")}</dt><dd className="text-2xl font-bold">{avg(m.map((x) => x.sleep_hours)) ?? "—"}<span className="text-sm font-normal text-ink-soft"> {t("hrs")}</span></dd><dd className="text-xs text-ink-soft">{t("avgNight")}</dd></div>
        </dl>
        {dist.length ? <p className="mt-4 text-sm"><span className="font-semibold">{t("reasons")}:</span> {dist.map((d) => `${tr(`support.barrier_${d.code}`)} (${d.n})`).join(", ")}</p> : null}
      </section>

      <section className="panel mb-5 p-5" aria-labelledby="v-plan">
        <h2 id="v-plan" className={h2}>{t("plan")}</h2>
        {(plans ?? []).length === 0 ? <p className="mt-1 text-ink-soft">{t("planNone")}</p> : (plans ?? []).map((p) => {
          const items = (p.plan_items ?? []).filter((i) => i.status === "confirmed" || i.status === "paused");
          if (!items.length) return null;
          return (
            <div key={p.id} className="mt-4 first-of-type:mt-3">
              <p className="font-semibold">{p.title} <span className="text-sm font-normal text-ink-soft">· {p.mode === "clinician_instructions" ? (p.clinician_name ? t("fromDoctorNamed", { name: p.clinician_name }) : t("fromDoctor")) : t("personal")}{p.status === "paused" ? ` · ${t("paused")}` : ""}</span></p>
              <table className="mt-2 w-full text-left text-sm">
                <thead className="text-ink-soft"><tr><th className="py-1 pr-2 font-semibold">{t("colAction")}</th><th className="py-1 pr-2 font-semibold">{t("colWhen")}</th><th className="py-1 pr-2 font-semibold">{t("colDone")}</th><th className="py-1 font-semibold">{t("colStock")}</th></tr></thead>
                <tbody>
                  {items.map((i) => {
                    const r = completionRate(byItem.get(i.id) ?? []);
                    const dl = daysLeft(i);
                    return (
                      <tr key={i.id} className="border-t border-line align-top">
                        <td className="py-1.5 pr-2">{i.title}{i.instructions ? <span className="block text-xs text-ink-soft">{i.instructions}</span> : null}</td>
                        <td className="py-1.5 pr-2 tabular-nums">{schedule(i)}</td>
                        <td className="py-1.5 pr-2 tabular-nums">{r.known ? `${r.done}/${r.known}` : "—"}{r.unknown ? <span className="block text-xs text-ink-soft">{t("unknownN", { n: r.unknown })}</span> : null}</td>
                        <td className="py-1.5 tabular-nums">{i.stock_count === null ? "—" : `${i.stock_count}${dl !== null ? ` (${t("daysShort", { n: dl })})` : ""}`}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          );
        })}
      </section>
      <p className="hint">{t("disclaimer")}</p>
    </div>
  );
}
