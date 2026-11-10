import { getLocale, getTranslations } from "next-intl/server";
import { requireUser } from "@/lib/supabase/server";
import { features } from "@/lib/config";
import { revokeFamily, setMemoryStatus, unlinkWhatsApp } from "@/app/actions";
import { ConsentsForm, FamilyInviteForm, LinkCodeForm, PreferencesForm } from "@/components/SettingsForms";
import { PageHeader, Section } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { DeleteAccount } from "@/components/DeleteAccount";
import { summarizeWeek } from "@/domain/rewards";
import { addDays, localDateOf, weekStart } from "@/domain/schedule";
import { fmtDate, fmtDateTime } from "@/lib/format";

export default async function SettingsPage() {
  const { supabase, user } = await requireUser();
  const t = await getTranslations();
  const locale = await getLocale();
  const [{ data: profile }, { data: consents }, { data: binding }, { data: family }, { data: memory }] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).single(),
    supabase.from("consents").select("kind, granted"),
    supabase.from("channel_bindings").select("status, last_inbound_at, opted_out_at").neq("status", "revoked").maybeSingle(),
    supabase.from("family_access").select("id, invitee_label, scopes, status, expires_at, created_at").eq("patient_id", user.id).order("created_at", { ascending: false }),
    supabase.from("memory_facts").select("id, kind, content, status, created_at").in("status", ["proposed", "confirmed"]).order("created_at", { ascending: false }).limit(30),
  ]);
  const tz = profile?.timezone ?? "UTC";
  const consentMap = Object.fromEntries((consents ?? []).map((c) => [c.kind, c.granted]));
  const ws = weekStart(localDateOf(new Date(), tz));
  const { data: weekOcc } = await supabase.from("action_occurrences").select("local_date, status").gte("local_date", ws).lte("local_date", addDays(ws, 6));
  const preview = summarizeWeek(Array.from({ length: 7 }, (_, i) => addDays(ws, i)), weekOcc ?? []).map((d) => ({ date: d.date, responded: d.responded, completed: d.completed }));
  const exportHref = `data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify({ week_start: ws, days: preview, note: "Participation counts only; no plan details or messages." }, null, 2))}`;

  return (
    <>
      <PageHeader title={t("settings.title")} subtitle={user.email ?? undefined} />
      <Section title={t("settings.profile")} id="prefs">
        <PreferencesForm profile={{ display_name: profile?.display_name ?? "", locale: profile?.locale ?? "en", timezone: tz, checkin_times: profile?.checkin_times ?? [], quiet_start: profile?.quiet_start ?? "21:30", quiet_end: profile?.quiet_end ?? "07:30", reminder_frequency: profile?.reminder_frequency ?? "normal", accessibility: (profile?.accessibility as Record<string, boolean>) ?? {}, limitations: profile?.limitations ?? "", care_notes: profile?.care_notes ?? "" }} />
      </Section>

      <Section title={t("settings.consents")} id="consents">
        <ConsentsForm consents={consentMap} />
      </Section>

      <Section title={t("settings.whatsapp")} id="wa">
        {!features.whatsapp() ? <p className="mb-2">{t("settings.waNotConfigured")}</p> : null}
        <p><span className="font-semibold">{t("settings.waStatus")}:</span> {binding ? (binding.status === "active" ? t("settings.waActive") : t("settings.waPaused")) : t("settings.waNotLinked")}</p>
        {binding?.last_inbound_at ? <p className="hint">{t("settings.waWindow", { time: fmtDateTime(binding.last_inbound_at, tz, locale) })}</p> : null}
        <p className="hint mt-1">{t("settings.waWindowNote")}</p>
        {features.whatsapp() ? <LinkCodeForm rebind={!!binding} /> : null}
        {binding ? <form action={unlinkWhatsApp} className="mt-2"><SubmitButton className="btn btn-danger">{t("settings.waUnlink")}</SubmitButton></form> : null}
      </Section>

      <Section title={t("settings.family")} id="family">
        <p className="mb-2">{t("settings.familyIntro")}</p>
        <p className="hint mb-3">{t("settings.familyNoAutoMessages")}</p>
        {(family ?? []).length === 0 ? <p className="hint mb-2">{t("settings.familyNone")}</p> : (
          <ul className="mb-3 flex flex-col gap-2">
            {(family ?? []).map((f) => (
              <li key={f.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line p-3">
                <span><span className="font-semibold">{f.invitee_label}</span> · {t(`settings.fam_${f.status === "invited" && new Date(f.expires_at) < new Date() ? "expired" : f.status}`)} · {f.scopes.map((s) => t(`settings.scope_${s}`)).join(", ")}</span>
                {f.status !== "revoked" ? (
                  <form action={revokeFamily}><input type="hidden" name="access_id" value={f.id} /><SubmitButton className="btn btn-danger">{t("settings.familyRevoke")}</SubmitButton></form>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        <FamilyInviteForm disabled={!consentMap.family_sharing} />
        <details className="mt-3">
          <summary className="cursor-pointer font-semibold">{t("settings.familyPreview")}</summary>
          <ul className="mt-2 text-sm">{preview.map((d) => <li key={d.date}>{fmtDate(d.date, locale)}: {t("progress.responded")} {d.responded} · {t("progress.completed")} {d.completed}</li>)}</ul>
          <a href={exportHref} download={`sukhi-summary-${ws}.json`} className="btn btn-secondary mt-2">{t("settings.familyExport")}</a>
        </details>
      </Section>

      <Section title={t("settings.memory")} id="memory">
        <p className="hint mb-2">{t("settings.memoryIntro")}</p>
        {(memory ?? []).length === 0 ? <p>{t("settings.memoryEmpty")}</p> : (
          <ul className="flex flex-col gap-2">
            {(memory ?? []).map((m) => (
              <li key={m.id} className="rounded-xl border border-line p-3">
                <p>{m.content}</p>
                <p className="hint">{t(`settings.mem_${m.status}`)} · {m.kind}</p>
                {m.status === "proposed" ? (
                  <form action={setMemoryStatus} className="mt-2 flex gap-2">
                    <input type="hidden" name="memory_id" value={m.id} />
                    <SubmitButton className="btn btn-secondary" name="status" value="confirmed">{t("settings.memConfirm")}</SubmitButton>
                    <SubmitButton className="btn btn-ghost underline" name="status" value="rejected">{t("settings.memReject")}</SubmitButton>
                  </form>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title={t("settings.services")} id="svc">
        <ul className="flex flex-col gap-1">
          <li>{t("settings.svcAi")}: {features.ai() ? t("settings.svcOn") : t("settings.svcOff")}</li>
          <li>{t("settings.svcVoice")}: {features.speech() ? t("settings.svcOn") : t("settings.svcOff")}</li>
          <li>{t("settings.svcWhatsapp")}: {features.whatsapp() ? t("settings.svcOn") : t("settings.svcOff")}</li>
        </ul>
        <p className="hint mt-2">{t("settings.latency")}</p>
      </Section>

      <Section title={t("app.deleteTitle")} id="delete">
        <DeleteAccount />
      </Section>

      <form action="/auth/signout" method="post"><button className="btn btn-secondary w-full">{t("common.signOut")}</button></form>
    </>
  );
}
