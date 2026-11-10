import { getLocale, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/supabase/server";
import { fmtDate } from "@/lib/format";

export const dynamic = "force-dynamic";

// Summary-only view for an accepted family member. Authorization is evaluated inside
// family_summary() on every request, so revocation takes effect immediately.
export default async function FamilySummary({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const { supabase } = await requireUser();
  const t = await getTranslations();
  const locale = await getLocale();
  const { data, error } = await supabase.rpc("family_summary", { p_access: id });
  if (error || !data) {
    return <main className="mx-auto max-w-md p-6"><h1 className="text-2xl font-bold">{t("family.summaryTitle")}</h1><p className="mt-3" role="alert">{t("family.revoked")}</p></main>;
  }
  const s = data as { first_name: string | null; week_start: string; days: { date: string; responded: number; completed: number }[]; garden_points: number | null; scopes: string[] };
  return (
    <main className="mx-auto max-w-md p-6">
      <h1 className="text-2xl font-bold">{s.first_name ? t("family.summaryFor", { name: s.first_name }) : t("family.summaryTitle")}</h1>
      <p className="hint mb-4">{t("family.summaryIntro")}</p>
      <table className="card w-full text-left">
        <caption className="sr-only">{t("family.summaryTitle")}</caption>
        <thead><tr><th scope="col">{t("progress.day")}</th><th scope="col">{t("progress.responded")}</th><th scope="col">{t("progress.completed")}</th></tr></thead>
        <tbody>{s.days.map((d) => <tr key={d.date} className="border-t border-line"><th scope="row" className="py-2">{fmtDate(d.date, locale)}</th><td>{d.responded}</td><td>{d.completed}</td></tr>)}</tbody>
      </table>
      {s.garden_points !== null ? <p className="mt-4">{t("progress.points", { points: s.garden_points })}</p> : null}
    </main>
  );
}
