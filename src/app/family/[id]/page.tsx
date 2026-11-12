import { getLocale, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/supabase/server";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { markFamilyAlertsSeen } from "@/app/actions";
import { PushToggle } from "@/components/PushToggle";

export const dynamic = "force-dynamic";

// Summary-only view for an accepted family member. Authorization is evaluated inside
// family_summary() on every request, so revocation takes effect immediately.
export default async function FamilySummary({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const { supabase, user } = await requireUser();
  const t = await getTranslations();
  const locale = await getLocale();
  const { data, error } = await supabase.rpc("family_summary", { p_access: id });
  if (error || !data) {
    return <main className="mx-auto max-w-md p-6"><h1 className="text-2xl font-bold">{t("family.summaryTitle")}</h1><p className="mt-3" role="alert">{t("family.revoked")}</p></main>;
  }
  const s = data as { first_name: string | null; week_start: string; days: { date: string; responded: number; completed: number }[]; garden_points: number | null; scopes: string[] };
  const hasAlerts = s.scopes.includes("alerts");
  const [{ data: alerts }, { data: me }] = await Promise.all([
    hasAlerts ? supabase.from("family_alerts").select("id, kind, created_at, seen_at").eq("access_id", id).eq("member_user_id", user.id).order("created_at", { ascending: false }).limit(10) : Promise.resolve({ data: [] as { id: string; kind: string; created_at: string; seen_at: string | null }[] }),
    supabase.from("profiles").select("timezone").eq("id", user.id).maybeSingle(),
  ]);
  if (alerts?.some((a) => !a.seen_at)) await markFamilyAlertsSeen(id);
  const name = s.first_name ?? t("companion.someone");
  return (
    <main className="mx-auto max-w-md p-6">
      <h1 className="text-2xl font-bold">{s.first_name ? t("family.summaryFor", { name: s.first_name }) : t("family.summaryTitle")}</h1>
      <p className="hint mb-4">{t("family.summaryIntro")}</p>
      {hasAlerts ? (
        <section aria-labelledby="fa" className="card mb-5 p-4">
          <h2 id="fa" className="text-lg font-bold">{t("companion.alertsTitle")}</h2>
          {(alerts ?? []).length === 0 ? <p className="mt-1 text-ink-soft">{t("companion.alertsNone")}</p> : (
            <ul className="mt-2 flex flex-col gap-2">
              {(alerts ?? []).map((a) => (
                <li key={a.id} className={`rounded-lg border p-3 ${a.seen_at ? "border-line" : "border-primary"}`}>
                  <p>{t(`companion.family_${a.kind}`, { name })}</p>
                  <p className="hint text-xs">{fmtDateTime(a.created_at, me?.timezone ?? "Asia/Kolkata", locale)}</p>
                </li>
              ))}
            </ul>
          )}
          <p className="hint mt-3 text-sm">{t("companion.alertsMemberHelp")}</p>
          <div className="mt-3"><PushToggle publicKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || null} /></div>
        </section>
      ) : null}
      <table className="card w-full text-left">
        <caption className="sr-only">{t("family.summaryTitle")}</caption>
        <thead><tr><th scope="col">{t("progress.day")}</th><th scope="col">{t("progress.responded")}</th><th scope="col">{t("progress.completed")}</th></tr></thead>
        <tbody>{s.days.map((d) => <tr key={d.date} className="border-t border-line"><th scope="row" className="py-2">{fmtDate(d.date, locale)}</th><td>{d.responded}</td><td>{d.completed}</td></tr>)}</tbody>
      </table>
      {s.garden_points !== null ? <p className="mt-4">{t("progress.points", { points: s.garden_points })}</p> : null}
    </main>
  );
}
