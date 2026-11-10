"use client";
import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { completeOnboarding } from "@/app/actions";
import { Alert } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { TimesInput } from "@/components/TimesInput";

const ZONES = ["Asia/Kolkata", "Asia/Dubai", "Europe/London", "Europe/Berlin", "America/New_York", "America/Los_Angeles", "Asia/Singapore", "Australia/Sydney", "UTC"];

export function OnboardingForm({ defaults }: { defaults: { timezone: string; locale: string } }) {
  const t = useTranslations();
  const [state, action] = useActionState(completeOnboarding, null);
  const [step, setStep] = useState(0);
  const [tz, setTz] = useState(defaults.timezone);
  const total = 4;


  const zones = ZONES.includes(tz) ? ZONES : [tz, ...ZONES];
  const show = (n: number) => (step === n ? "" : "hidden");

  return (
    <form action={action} className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">{t("onboarding.title")}</h1>
      <p className="hint" aria-live="polite">{t("onboarding.step", { current: step + 1, total })}</p>
      {state?.error ? <Alert tone="danger">{t("common.error")}</Alert> : null}

      <fieldset className={`card flex flex-col gap-4 ${show(0)}`}>
        <legend className="text-lg font-bold">{t("onboarding.aboutYou")}</legend>
        <div className="field">
          <label htmlFor="display_name">{t("onboarding.name")}</label>
          <input id="display_name" name="display_name" className="input" maxLength={80} autoComplete="given-name" />
        </div>
        <div className="field">
          <label htmlFor="locale">{t("onboarding.language")}</label>
          <select id="locale" name="locale" className="input" defaultValue={defaults.locale}>
            <option value="en">English</option>
            <option value="hi">हिन्दी</option>
            <option value="mr">मराठी</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="timezone">{t("onboarding.timezone")}</label>
          <select id="timezone" name="timezone" className="input" value={tz} onChange={(e) => setTz(e.target.value)}>
            {zones.map((z) => <option key={z} value={z}>{z}</option>)}
          </select>
        </div>
        <TimesInput name="checkin_times" label={t("onboarding.checkinTimes")} initial={["09:00", "19:00"]} addLabel={t("onboarding.addTime")} removeLabel={(time) => t("onboarding.removeTime", { time })} />
        <fieldset className="flex flex-wrap gap-4">
          <legend className="label mb-1">{t("onboarding.quietHours")}</legend>
          <div className="field"><label htmlFor="quiet_start">{t("onboarding.quietStart")}</label><input id="quiet_start" name="quiet_start" type="time" defaultValue="21:30" className="input" required /></div>
          <div className="field"><label htmlFor="quiet_end">{t("onboarding.quietEnd")}</label><input id="quiet_end" name="quiet_end" type="time" defaultValue="07:30" className="input" required /></div>
        </fieldset>
      </fieldset>

      <fieldset className={`card flex flex-col gap-3 ${show(1)}`}>
        <legend className="text-lg font-bold">{t("onboarding.accessibility")}</legend>
        {(["large_text", "high_contrast", "reduce_motion", "audio_replies"] as const).map((k) => (
          <label key={k} className="flex min-h-12 items-center gap-3">
            <input type="checkbox" name={k} className="h-6 w-6" />
            {t(`onboarding.${k === "large_text" ? "largeText" : k === "high_contrast" ? "highContrast" : k === "reduce_motion" ? "reduceMotion" : "audioReplies"}`)}
          </label>
        ))}
        <h2 className="mt-2 font-bold">{t("onboarding.context")}</h2>
        <div className="field">
          <label htmlFor="limitations">{t("onboarding.limitations")}</label>
          <textarea id="limitations" name="limitations" className="input" rows={2} maxLength={1000} aria-describedby="lim-hint" />
          <span id="lim-hint" className="hint">{t("onboarding.limitationsHint")}</span>
        </div>
        <div className="field">
          <label htmlFor="care_notes">{t("onboarding.careNotes")}</label>
          <textarea id="care_notes" name="care_notes" className="input" rows={2} maxLength={2000} aria-describedby="care-hint" />
          <span id="care-hint" className="hint">{t("onboarding.careNotesHint")}</span>
        </div>
      </fieldset>

      <fieldset className={`card flex flex-col gap-3 ${show(2)}`}>
        <legend className="text-lg font-bold">{t("onboarding.permissions")}</legend>
        <p className="hint">{t("onboarding.permissionsIntro")}</p>
        {([
          ["ai_processing", "consentAi", true],
          ["reminders", "consentReminders", true],
          ["voice_processing", "consentVoice", false],
          ["whatsapp", "consentWhatsapp", false],
          ["family_sharing", "consentFamily", false],
        ] as const).map(([kind, key, def]) => (
          <label key={kind} className="flex items-start gap-3">
            <input type="checkbox" name={`consent_${kind}`} defaultChecked={def} className="mt-1 h-6 w-6 shrink-0" />
            <span>{t(`onboarding.${key}`)}</span>
          </label>
        ))}
        <p className="hint">{t("onboarding.whatsappLater")}</p>
      </fieldset>

      <fieldset className={`card flex flex-col gap-3 ${show(3)}`}>
        <legend className="text-lg font-bold">{t("onboarding.routine")}</legend>
        <p className="hint">{t("onboarding.routineIntro")}</p>
        {(["walk", "water", "stretch", "clinician", "none"] as const).map((k, i) => (
          <label key={k} className="card flex cursor-pointer items-start gap-3">
            <input type="radio" name="template" value={k} defaultChecked={i === 0} className="mt-1 h-5 w-5" />
            <span>
              <span className="block font-semibold">{k === "none" ? t("onboarding.skipRoutine") : t(`templates.${k}`)}</span>
              {k !== "none" ? <span className="hint">{t(`templates.${k}Desc`)}</span> : null}
            </span>
          </label>
        ))}
      </fieldset>

      <div className="flex justify-between gap-3">
        <button type="button" className="btn btn-secondary" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>{t("onboarding.previous")}</button>
        {step < total - 1 ? (
          <button type="button" className="btn btn-primary" onClick={() => setStep((s) => s + 1)}>{t("onboarding.next")}</button>
        ) : (
          <SubmitButton pendingLabel={t("common.saving")}>{t("onboarding.finish")}</SubmitButton>
        )}
      </div>
      <p className="hint">{t("common.disclaimer")}</p>
    </form>
  );
}
