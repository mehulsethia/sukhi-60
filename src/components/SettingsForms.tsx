"use client";
import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { createFamilyInvite, createLinkCode, saveConsents, savePreferences } from "@/app/actions";
import { Alert } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { TimesInput } from "@/components/TimesInput";

interface Prefs {
  display_name: string; locale: string; timezone: string; checkin_times: string[]; quiet_start: string; quiet_end: string; reminder_frequency: string;
  accessibility: Record<string, boolean>; limitations: string; care_notes: string;
}

export function PreferencesForm({ profile }: { profile: Prefs }) {
  const t = useTranslations();
  const [state, action] = useActionState(savePreferences, null);
  return (
    <form action={action} className="flex flex-col gap-5">
      <div className="grid gap-4 sm:grid-cols-2">
      <div className="field sm:col-span-2"><label htmlFor="pf-name">{t("onboarding.name")}</label><input id="pf-name" name="display_name" defaultValue={profile.display_name} className="input" maxLength={80} /></div>
        <div className="field"><label htmlFor="pf-locale">{t("onboarding.language")}</label>
          <select id="pf-locale" name="locale" defaultValue={profile.locale} className="input"><option value="en">English</option><option value="hi">हिन्दी</option><option value="mr">मराठी</option></select>
        </div>
        <div className="field"><label htmlFor="pf-tz">{t("onboarding.timezone")}</label><input id="pf-tz" name="timezone" defaultValue={profile.timezone} className="input" maxLength={64} /></div>
      </div>
      <div className="rounded-2xl bg-surface-2 p-4">
      <p className="mb-3 font-bold">{t("settingsUi.reminders")}</p>
      <div className="flex flex-col gap-4">
      <TimesInput name="checkin_times" label={t("onboarding.checkinTimes")} initial={profile.checkin_times} addLabel={t("onboarding.addTime")} removeLabel={(time) => t("onboarding.removeTime", { time })} />
      <fieldset className="flex flex-wrap gap-4"><legend className="label mb-1">{t("onboarding.quietHours")}</legend>
        <div className="field"><label htmlFor="pf-qs">{t("onboarding.quietStart")}</label><input id="pf-qs" name="quiet_start" type="time" defaultValue={profile.quiet_start} className="input" /></div>
        <div className="field"><label htmlFor="pf-qe">{t("onboarding.quietEnd")}</label><input id="pf-qe" name="quiet_end" type="time" defaultValue={profile.quiet_end} className="input" /></div>
      </fieldset>
      <div className="field"><label htmlFor="pf-freq">{t("settings.frequency")}</label>
        <select id="pf-freq" name="reminder_frequency" defaultValue={profile.reminder_frequency} className="input">{["normal", "gentle", "off"].map((f) => <option key={f} value={f}>{t(`settings.freq_${f}`)}</option>)}</select>
      </div>
      </div>
      </div>
      <fieldset><legend className="label mb-2">{t("onboarding.accessibility")}</legend>
        <div className="grid gap-2 sm:grid-cols-2">
        {([["large_text", "largeText"], ["high_contrast", "highContrast"], ["reduce_motion", "reduceMotion"]] as const).map(([k, l]) => (
          <label key={k} className="flex min-h-14 cursor-pointer items-center justify-between gap-3 rounded-2xl border border-line px-4"><span className="font-semibold">{t(`onboarding.${l}`)}</span><input type="checkbox" role="switch" name={k} defaultChecked={!!profile.accessibility[k]} className="h-6 w-6 accent-[var(--primary)]" /></label>
        ))}
        </div>
      </fieldset>
      <div className="grid gap-4 sm:grid-cols-2">
      <div className="field"><label htmlFor="pf-lim">{t("onboarding.limitations")}</label><textarea id="pf-lim" name="limitations" defaultValue={profile.limitations} rows={2} maxLength={1000} className="input" /></div>
      <div className="field"><label htmlFor="pf-care">{t("onboarding.careNotes")}</label><textarea id="pf-care" name="care_notes" defaultValue={profile.care_notes} rows={2} maxLength={2000} className="input" /></div>
      </div>
      <div aria-live="polite">{state?.ok ? <Alert tone="ok">{t("common.saved")}</Alert> : state?.error ? <Alert tone="danger">{t("common.error")}</Alert> : null}</div>
      <SubmitButton className="btn btn-primary self-start px-6" pendingLabel={t("common.saving")}>{t("common.save")}</SubmitButton>
    </form>
  );
}

export function ConsentsForm({ consents, whatsappLaunched = false }: { consents: Record<string, boolean>; whatsappLaunched?: boolean }) {
  const t = useTranslations();
  const [state, action] = useActionState(saveConsents, null);
  const rows = [["ai_processing", "consentAi"], ["reminders", "consentReminders"], ["voice_processing", "consentVoice"], ["whatsapp", "consentWhatsapp"], ["family_sharing", "consentFamily"]] as const;
  return (
    <form action={action} className="flex flex-col gap-3">
      {rows.map(([k, l]) => (k === "whatsapp" && !whatsappLaunched ? (
        // Not launched yet: keep the stored choice unchanged, but don't show it.
        consents[k] ? <input key={k} type="hidden" name={`consent_${k}`} value="on" /> : null
      ) : (
        <label key={k} className="flex cursor-pointer items-start justify-between gap-4 rounded-2xl border border-line p-4"><span className="text-[0.95rem]">{t(`onboarding.${l}`)}</span><input type="checkbox" role="switch" name={`consent_${k}`} defaultChecked={!!consents[k]} className="mt-0.5 h-6 w-6 shrink-0 accent-[var(--primary)]" /></label>
      )))}
      <div aria-live="polite">{state?.ok ? <Alert tone="ok">{t("common.saved")}</Alert> : state?.error ? <Alert tone="danger">{t("common.error")}</Alert> : null}</div>
      <SubmitButton className="btn btn-primary self-start px-6" pendingLabel={t("common.saving")}>{t("common.save")}</SubmitButton>
    </form>
  );
}

export function LinkCodeForm({ rebind }: { rebind: boolean }) {
  const t = useTranslations();
  const [state, action] = useActionState(createLinkCode, null);
  const data = state?.data as { message: string; expires_at: string } | undefined;
  return (
    <form action={action} className="mt-3 flex flex-col gap-2">
      <p className="hint">{t("settings.waLinkIntro")}</p>
      <input type="hidden" name="purpose" value={rebind ? "rebind" : "link"} />
      <SubmitButton className="btn btn-secondary self-start" pendingLabel={t("common.saving")}>{rebind ? t("settings.waCreateRebind") : t("settings.waCreateCode")}</SubmitButton>
      <div aria-live="polite">
        {data ? (
          <Alert tone="ok">
            {t("settings.waSend")} <code className="ml-1 rounded bg-surface px-2 py-1 font-mono text-lg font-bold" data-testid="link-code">{data.message}</code>
            <span className="block text-sm">{t("settings.waExpires", { time: new Date(data.expires_at).toLocaleTimeString() })}</span>
          </Alert>
        ) : null}
        {state?.error ? <Alert tone="danger">{t("common.error")}</Alert> : null}
      </div>
    </form>
  );
}

export function FamilyInviteForm({ disabled }: { disabled: boolean }) {
  const t = useTranslations();
  const [state, action] = useActionState(createFamilyInvite, null);
  const link = (state?.data as { link?: string } | undefined)?.link;
  if (disabled) return <p className="hint">{t("onboarding.consentFamily")}</p>;
  return (
    <form action={action} className="flex flex-col gap-2">
      <div className="field"><label htmlFor="fam-label">{t("settings.familyLabel")}</label><input id="fam-label" name="label" className="input" required maxLength={80} /></div>
      <fieldset><legend className="label mb-1">{t("settings.familyScopes")}</legend>
        {["weekly_summary", "garden"].map((s) => <label key={s} className="flex min-h-10 items-center gap-3"><input type="checkbox" name="scopes" value={s} defaultChecked={s === "weekly_summary"} className="h-5 w-5" />{t(`settings.scope_${s}`)}</label>)}
        <label className="flex min-h-10 items-start gap-3 py-1"><input type="checkbox" name="scopes" value="alerts" className="mt-0.5 h-5 w-5" /><span>{t("settings.scope_alerts")}<span className="hint block text-sm">{t("companion.alertsScopeHelp")}</span></span></label>
      </fieldset>
      <SubmitButton className="btn btn-secondary self-start" pendingLabel={t("common.saving")}>{t("settings.familyInvite")}</SubmitButton>
      <div aria-live="polite">
        {link ? <Alert tone="ok">{t("settings.familyLink")}<code className="mt-1 block break-all text-sm" data-testid="family-link">{link}</code></Alert> : null}
        {state?.error ? <Alert tone="danger">{t("common.error")}</Alert> : null}
      </div>
    </form>
  );
}
