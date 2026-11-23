import { getLocale, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import Link from "next/link";
import { requireUser } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fmtDateTime, intlLocale } from "@/lib/format";
import { markFamilyAlertsSeen } from "@/app/actions";
import { PushToggle } from "@/components/PushToggle";
import { CheerButton } from "@/components/CheerButton";
import { caringFor } from "@/server/care-for";

export const dynamic = "force-dynamic";

// "Caring for" view for an accepted family member. Authorization is evaluated inside
// family_summary() on every request, so revocation takes effect immediately. Counts only.
export default async function CaringForPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const { supabase, user } = await requireUser();
  const t = await getTranslations();
  const locale = await getLocale();
  const { data, error } = await supabase.rpc("family_summary", { p_access: id });
  if (error || !data) {
    return <main className="mx-auto max-w-md px-4 py-8"><h1 className="text-xl font-bold">{t("caring.title")}</h1><p className="mt-3 text-ink-soft" role="alert">{t("family.revoked")}</p></main>;
  }
  const s = data as { first_name: string | null; garden_points: number | null; scopes: string[] };
  const admin = createAdminClient();
  const { data: access } = await admin.from("family_access").select("patient_id").eq("id", id).eq("member_user_id", user.id).eq("status", "active").maybeSingle();
  if (!access) notFound();
  const hasAlerts = s.scopes.includes("alerts");
  const [c, { data: alerts }, { data: me }] = await Promise.all([
    caringFor(admin, access.patient_id),
    hasAlerts ? supabase.from("family_alerts").select("id, kind, created_at, seen_at").eq("access_id", id).eq("member_user_id", user.id).order("created_at", { ascending: false }).limit(5) : Promise.resolve({ data: [] as { id: string; kind: string; created_at: string; seen_at: string | null }[] }),
    supabase.from("profiles").select("timezone, onboarded_at, primary_role").eq("id", user.id).maybeSingle(),
  ]);
  if (alerts?.some((a) => !a.seen_at)) await markFamilyAlertsSeen(id);
  const name = s.first_name ?? t("companion.someone");
  const dayFmt = new Intl.DateTimeFormat(intlLocale(locale), { weekday: "narrow", timeZone: "UTC" });
  const pctToday = c.today.total ? Math.round((100 * c.today.done) / c.today.total) : 0;

  return (
    <main className="mx-auto max-w-md px-4 pb-16 pt-6">
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">{t("caring.eyebrow")}</p>
      <h1 className="mt-0.5 text-xl font-bold">{name}</h1>

      <section aria-labelledby="ct" className="card mt-5">
        <h2 id="ct" className="text-sm font-semibold text-ink-soft">{t("caring.today")}</h2>
        {c.today.total ? (
          <>
            <p className="mt-1 text-2xl font-bold">{t("caring.todayCount", { done: c.today.done, total: c.today.total })}</p>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-sky" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pctToday} aria-label={t("caring.today")}>
              <div className="h-full rounded-full bg-primary" style={{ width: `${pctToday}%` }} />
            </div>
          </>
        ) : <p className="mt-1 text-ink-soft">{t("caring.nothingToday")}</p>}
      </section>

      <section aria-labelledby="cw" className="card mt-3">
        <h2 id="cw" className="text-sm font-semibold text-ink-soft">{t("caring.week")}</h2>
        <ol className="mt-3 grid grid-cols-7 gap-1 text-center">
          {c.days.map((d) => {
            const full = d.total > 0 && d.done >= d.total;
            const part = d.done > 0 && !full;
            return (
              <li key={d.date} className="flex flex-col items-center gap-1">
                <span aria-hidden="true" className={`h-7 w-7 rounded-full ${full ? "bg-primary" : part ? "bg-primary-soft ring-1 ring-primary" : d.total ? "bg-sky" : "border border-dashed border-line"}`} />
                <span className="text-[0.7rem] text-ink-soft">{dayFmt.format(new Date(`${d.date}T00:00:00Z`))}</span>
                <span className="sr-only">{d.total ? t("caring.todayCount", { done: d.done, total: d.total }) : t("caring.nothingPlanned")}</span>
              </li>
            );
          })}
        </ol>
        <dl className="mt-4 flex gap-6 text-sm">
          <div><dt className="text-ink-soft">{t("caring.weekPct")}</dt><dd className="text-lg font-bold">{c.pct === null ? "–" : `${c.pct}%`}</dd></div>
          <div><dt className="text-ink-soft">{t("caring.streak")}</dt><dd className="text-lg font-bold">{t("caring.days", { n: c.streak })}</dd></div>
          {s.garden_points !== null ? <div><dt className="text-ink-soft">{t("caring.points")}</dt><dd className="text-lg font-bold">{s.garden_points}</dd></div> : null}
        </dl>
      </section>

      <div className="mt-5"><CheerButton accessId={id} name={name} /></div>

      {hasAlerts ? (
        <section aria-labelledby="ca" className="mt-6">
          <h2 id="ca" className="text-sm font-semibold text-ink-soft">{t("companion.alertsTitle")}</h2>
          {(alerts ?? []).length === 0 ? <p className="mt-1 text-sm text-ink-soft">{t("companion.alertsNone")}</p> : (
            <ul className="mt-2 flex flex-col gap-2">
              {(alerts ?? []).map((a) => (
                <li key={a.id} className={`rounded-lg border p-3 text-sm ${a.seen_at ? "border-line" : "border-primary"}`}>
                  <p>{t(`companion.family_${a.kind}`, { name })}</p>
                  <p className="hint text-xs">{fmtDateTime(a.created_at, me?.timezone ?? "Asia/Kolkata", locale)}</p>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-3"><PushToggle publicKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || null} /></div>
        </section>
      ) : null}

      <p className="hint mt-8 text-xs">{t("caring.privacy", { name })}</p>
      {!me?.onboarded_at || me.primary_role === "family" ? <p className="mt-3 text-sm"><Link href="/onboarding" className="link">{t("family.ownPlan")}</Link></p> : null}
    </main>
  );
}
