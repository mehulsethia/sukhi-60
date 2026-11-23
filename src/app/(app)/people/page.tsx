import type { Metadata } from "next";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { ChevronRight, Eye, Stethoscope, Users, UsersRound } from "lucide-react";
import { requireUser } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { revokeFamily, stopDoctorSharingAction } from "@/app/actions";
import { FAMILY_LIMIT, familySeats } from "@/domain/family";
import { summarizeWeek } from "@/domain/rewards";
import { addDays, localDateOf, weekStart } from "@/domain/schedule";
import { fmtDate } from "@/lib/format";
import { FamilyInviteForm } from "@/components/SettingsForms";
import { DoctorInvite } from "@/components/PeopleClient";
import { PageHeader, Section } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";

export const metadata: Metadata = { title: "Your people" };

// Everyone connected to this person, in one place: their doctor, family who follow them,
// their circles, and the people they follow. Also where they stop sharing.
export default async function PeoplePage() {
  const { supabase, user } = await requireUser();
  const t = await getTranslations();
  const locale = await getLocale();
  const admin = createAdminClient();
  const [{ data: profile }, { data: consent }, { data: family }, { data: doctors }, { data: memberships }, { data: follows }] = await Promise.all([
    supabase.from("profiles").select("timezone").eq("id", user.id).single(),
    supabase.from("consents").select("granted").eq("kind", "family_sharing").maybeSingle(),
    supabase.from("family_access").select("id, invitee_label, status, expires_at, created_at").eq("patient_id", user.id).order("created_at", { ascending: false }),
    admin.from("doctor_patients").select("id, doctors!inner(name, clinic)").eq("patient_id", user.id).eq("status", "active").order("created_at", { ascending: false }),
    admin.from("circle_members").select("circle_id").eq("user_id", user.id),
    admin.from("family_access").select("id, patient_id").eq("member_user_id", user.id).eq("status", "active"),
  ]);
  const circleIds = (memberships ?? []).map((m) => m.circle_id);
  const followIds = (follows ?? []).map((f) => f.patient_id);
  const [{ data: circles }, { data: counts }, { data: followNames }] = await Promise.all([
    circleIds.length ? admin.from("circles").select("id, name").in("id", circleIds) : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    circleIds.length ? admin.from("circle_members").select("circle_id").in("circle_id", circleIds) : Promise.resolve({ data: [] as { circle_id: string }[] }),
    followIds.length ? admin.from("profiles").select("id, display_name").in("id", followIds) : Promise.resolve({ data: [] as { id: string; display_name: string | null }[] }),
  ]);
  const size = (id: string) => (counts ?? []).filter((c) => c.circle_id === id).length;
  const tz = profile?.timezone ?? "UTC";
  const ws = weekStart(localDateOf(new Date(), tz));
  const { data: weekOcc } = await supabase.from("action_occurrences").select("local_date, status").gte("local_date", ws).lte("local_date", addDays(ws, 6));
  const preview = summarizeWeek(Array.from({ length: 7 }, (_, i) => addDays(ws, i)), weekOcc ?? []);
  const row = "flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line p-3";

  return (
    <>
      <PageHeader title={t("people.title")} />

      <Section title={t("people.doctor")} id="doctor" icon={<Stethoscope aria-hidden="true" />}>
        {(doctors ?? []).length ? (
          <ul className="mb-3 flex flex-col gap-2">
            {(doctors ?? []).map((d) => {
              const doc = d.doctors as unknown as { name: string; clinic: string | null };
              return (
                <li key={d.id} className={row}>
                  <span><span className="font-semibold">{doc.name}</span>{doc.clinic ? <span className="text-ink-soft"> · {doc.clinic}</span> : null}</span>
                  <form action={stopDoctorSharingAction}><input type="hidden" name="link_id" value={d.id} /><SubmitButton className="btn btn-ghost underline">{t("people.stopSharing")}</SubmitButton></form>
                </li>
              );
            })}
          </ul>
        ) : <p className="mb-3">{t("people.doctorNone")}</p>}
        <DoctorInvite />
      </Section>

      <Section title={t("settings.family")} id="family" icon={<Users aria-hidden="true" />}>
        <p className="mb-2 text-sm text-ink-soft">{t("settings.familyIntro", { n: FAMILY_LIMIT })}</p>
        {(family ?? []).length === 0 ? null : (
          <ul className="mb-3 flex flex-col gap-2">
            {(family ?? []).map((f) => (
              <li key={f.id} className={row}>
                <span><span className="font-semibold">{f.invitee_label}</span> · {t(`settings.fam_${f.status === "invited" && new Date(f.expires_at) < new Date() ? "expired" : f.status}`)}</span>
                {f.status !== "revoked" ? (
                  <form action={revokeFamily}><input type="hidden" name="access_id" value={f.id} /><SubmitButton className="btn btn-ghost underline">{t("settings.familyRevoke")}</SubmitButton></form>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        <FamilyInviteForm disabled={!consent?.granted} full={familySeats(family ?? []) >= FAMILY_LIMIT} />
        <details className="mt-3">
          <summary className="cursor-pointer text-sm font-semibold">{t("settings.familyPreview")}</summary>
          <ul className="mt-2 text-sm">{preview.map((d) => <li key={d.date}>{fmtDate(d.date, locale)}: {t("progress.responded")} {d.responded} · {t("progress.completed")} {d.completed}</li>)}</ul>
        </details>
      </Section>

      <Section title={t("people.circles")} id="circles" icon={<UsersRound aria-hidden="true" />} action={<Link href="/circle" className="text-sm text-primary underline">{t("people.openCircles")}</Link>}>
        {(circles ?? []).length ? (
          <ul className="flex flex-col gap-2">
            {(circles ?? []).map((c) => (
              <li key={c.id}><Link href={`/circle?c=${c.id}`} className={`${row} hover:border-ink-soft`}><span className="font-semibold">{c.name}</span><span className="flex items-center gap-1 text-sm text-ink-soft">{t("people.members", { n: size(c.id) })}<ChevronRight size={16} aria-hidden="true" /></span></Link></li>
            ))}
          </ul>
        ) : <p>{t("people.circlesNone")}</p>}
      </Section>

      {(follows ?? []).length ? (
        <Section title={t("people.following")} id="following" icon={<Eye aria-hidden="true" />}>
          <ul className="flex flex-col gap-2">
            {(follows ?? []).map((f) => (
              <li key={f.id}><Link href={`/family/${f.id}`} className={`${row} hover:border-ink-soft`}><span className="font-semibold">{(followNames ?? []).find((p) => p.id === f.patient_id)?.display_name ?? t("people.someone")}</span><ChevronRight size={16} aria-hidden="true" /></Link></li>
            ))}
          </ul>
        </Section>
      ) : null}
    </>
  );
}
