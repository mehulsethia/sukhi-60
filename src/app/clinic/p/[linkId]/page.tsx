import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { ChevronLeft } from "lucide-react";
import { requireUser } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fmtAgo, fmtDateTime } from "@/lib/format";
import { scheduleText } from "@/domain/wa-ui";
import { formatReading } from "@/server/readings";
import { patientDetail } from "@/server/clinic";
import { ApproveButton, NoteForm, ProofToggle } from "@/components/ClinicForms";

export const dynamic = "force-dynamic";

const pct = (p: number | null) => (p === null ? "–" : `${p}%`);

// One patient, as their doctor sees it: adherence and proof results only, never chats.
export default async function ClinicPatient({ params }: { params: Promise<{ linkId: string }> }) {
  const { linkId } = await params;
  const { user } = await requireUser();
  const admin = createAdminClient();
  const [p, t, locale] = await Promise.all([patientDetail(admin, user.id, linkId), getTranslations("clinic"), getLocale()]);
  if (!p) notFound();
  const proofOf = new Map(p.items.map((i) => [i.id, i.proofRequired]));
  const share = (n: number) => (p.week.proof.done ? Math.round((100 * n) / p.week.proof.done) : null);
  // Tasks with activity this week, then confirmed ones not yet due.
  const rows = [
    ...p.week.items.map((i) => ({ id: i.itemId, title: i.title, done: i.done, due: i.due, pct: i.pct, clinician: i.clinician })),
    ...p.items.filter((i) => !p.week.items.some((w) => w.itemId === i.id)).map((i) => ({ id: i.id, title: i.title, done: 0, due: 0, pct: null, clinician: i.clinician })),
  ];

  return (
    <>
      <Link href="/clinic" className="inline-flex items-center gap-1 text-sm text-ink-soft hover:text-ink"><ChevronLeft size={16} aria-hidden="true" />{t("allPatients")}</Link>
      <h1 className="mt-2 text-xl font-bold">{p.name}</h1>
      <p className="text-sm text-ink-soft">{p.lastCheckIn ? t("active", { when: fmtAgo(p.lastCheckIn, locale) }) : t("noCheckIn")}</p>

      <dl className="mt-5 grid grid-cols-3 gap-2">
        {[
          [t("sevenDays"), pct(p.week.pct), t("doneOf", { done: p.week.done, due: p.week.due })],
          [t("thirtyDays"), pct(p.month.pct), t("doneOf", { done: p.month.done, due: p.month.due })],
          [t("photos"), pct(share(p.week.proof.photo)), t("ofDone")],
        ].map(([label, value, sub]) => (
          <div key={label} className="card !p-3">
            <dt className="text-xs text-ink-soft">{label}</dt>
            <dd className="text-xl font-bold">{value}</dd>
            <dd className="text-[0.7rem] text-ink-soft">{sub}</dd>
          </div>
        ))}
      </dl>
      {p.week.proof.flagged ? <p className="mt-2 text-sm text-ink-soft">{t("flagged", { n: p.week.proof.flagged })}</p> : null}

      {p.checkPlanId ? (
        <section aria-labelledby="ck" className="card mt-5 border-primary">
          <h2 id="ck" className="font-semibold">{t("checkTitle")}</h2>
          <p className="mt-1 text-sm text-ink-soft">{t("checkHelp", { name: p.name })}</p>
          <ol className="mt-3 flex list-decimal flex-col gap-1 pl-5 text-sm">
            {p.checkItems.map((i, n) => <li key={n}><span className="font-medium">{i.title}</span> <span className="text-ink-soft">· {scheduleText(i)}</span></li>)}
          </ol>
          <div className="mt-4 flex flex-wrap items-center gap-3"><ApproveButton linkId={p.linkId} planId={p.checkPlanId} /></div>
          <details className="mt-3">
            <summary className="cursor-pointer text-sm text-ink-soft">{t("needsChange")}</summary>
            <div className="mt-3"><NoteForm linkId={p.linkId} name={p.name} review /></div>
          </details>
        </section>
      ) : null}

      <section aria-labelledby="tk" className="mt-6">
        <h2 id="tk" className="text-sm font-semibold text-ink-soft">{t("tasks")}</h2>
        {rows.length === 0 ? <p className="card mt-2 text-ink-soft">{t("noTasks")}</p> : (
          <ul className="card mt-2 divide-y divide-line !p-0">
            {rows.map((r) => (
              <li key={r.id} className="flex items-center gap-3 px-4 py-3">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{r.title}{r.clinician ? null : <span className="ml-1.5 text-xs font-normal text-ink-soft">{t("ownGoal")}</span>}</span>
                  <span className="mt-1 flex items-center gap-2">
                    <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-sky" aria-hidden="true"><span className="block h-full rounded-full bg-primary" style={{ width: `${r.pct ?? 0}%` }} /></span>
                    <span className="w-12 text-right text-xs text-ink-soft">{r.due ? `${r.done}/${r.due}` : "–"}</span>
                  </span>
                </span>
                {proofOf.has(r.id) ? <ProofToggle linkId={p.linkId} itemId={r.id} on={!!proofOf.get(r.id)} title={r.title} /> : null}
              </li>
            ))}
          </ul>
        )}
        <p className="hint mt-2 text-xs">{t("photoHelp")}</p>
      </section>

      {p.readings.length ? (
        <section aria-labelledby="rd" className="mt-6">
          <h2 id="rd" className="text-sm font-semibold text-ink-soft">{t("readings")}</h2>
          <ul className="card mt-2 flex flex-col gap-1.5 text-sm">
            {p.readings.map((r) => <li key={r.id} className="flex justify-between gap-3"><span>{formatReading(r)}{r.source === "corrected" ? <span className="ml-1 text-xs text-ink-soft">{t("typed")}</span> : null}</span><span className="text-xs text-ink-soft">{fmtDateTime(r.measured_at, p.tz, locale)}</span></li>)}
          </ul>
          <p className="hint mt-2 text-xs">{t("readingsHelp")}</p>
        </section>
      ) : null}

      {p.reward ? (
        <p className="mt-6 text-sm text-ink-soft">{p.reward.pct === null
          ? t("rewardProgressNew", { day: p.reward.day, days: p.reward.days, target: p.reward.target })
          : t("rewardProgress", { day: p.reward.day, days: p.reward.days, pct: pct(p.reward.pct), target: p.reward.target })}</p>
      ) : null}

      <section aria-labelledby="nt" className="card mt-6">
        <h2 id="nt" className="sr-only">{t("noteTitle")}</h2>
        <NoteForm linkId={p.linkId} name={p.name} />
      </section>
    </>
  );
}
