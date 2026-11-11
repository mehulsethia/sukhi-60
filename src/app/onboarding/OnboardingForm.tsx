"use client";
import { useActionState, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Bell, Bot, Check, ChevronLeft, Globe2, Mic, MessageCircle, Moon, Sun, Sunrise, Sunset, TrendingUp, Users, ListChecks } from "lucide-react";
import { completeOnboarding } from "@/app/actions";
import { Alert } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { Logo } from "@/components/Logo";
import { VCheckin, VComfort, VContext, VLanguages, VPrivacy, VProgress, VReminder, VRhythm } from "@/components/Vignettes";
import { TEMPLATES } from "@/domain/templates";
import { setLocaleCookie } from "@/lib/client-prefs";
import { shrinkInputFile } from "@/lib/client-image";

const ZONES = ["Asia/Kolkata", "Asia/Dubai", "Asia/Singapore", "Europe/London", "Europe/Berlin", "America/New_York", "America/Los_Angeles", "Australia/Sydney", "UTC"];
const PRESETS = [
  { key: "morning", time: "08:00", Icon: Sunrise },
  { key: "midday", time: "13:00", Icon: Sun },
  { key: "evening", time: "18:30", Icon: Sunset },
  { key: "night", time: "21:00", Icon: Moon },
] as const;
const REASONS = ["discharge", "new_plan", "existing", "wellbeing"] as const;
const CONSENTS = [
  { kind: "ai_processing", title: "perm_ai", body: "consentAi", def: true, Icon: Bot },
  { kind: "reminders", title: "perm_reminders", body: "consentReminders", def: true, Icon: Bell },
  { kind: "voice_processing", title: "perm_voice", body: "consentVoice", def: false, Icon: Mic },
  { kind: "whatsapp", title: "perm_whatsapp", body: "consentWhatsapp", def: false, Icon: MessageCircle },
  { kind: "family_sharing", title: "perm_family", body: "consentFamily", def: false, Icon: Users },
] as const;
type TemplateKey = "walk" | "water" | "stretch" | "clinician" | "none";

const SCENES = [VLanguages, VCheckin, VReminder, VRhythm, VContext, VComfort, VPrivacy, VProgress];
const TOTAL = SCENES.length;

function fmt(time: string, locale: string) {
  const [h, m] = time.split(":").map(Number);
  return new Intl.DateTimeFormat(locale === "en" ? "en-IN" : `${locale}-IN`, { hour: "numeric", minute: "2-digit", timeZone: "UTC" }).format(new Date(Date.UTC(2026, 0, 1, h, m)));
}

export function OnboardingForm({ defaults }: { defaults: { timezone: string; locale: string } }) {
  const t = useTranslations();
  const router = useRouter();
  const [state, action] = useActionState(completeOnboarding, null);
  const [step, setStep] = useState(0);
  const [locale, setLocale] = useState(defaults.locale);
  const [tz, setTz] = useState(defaults.timezone);
  const [times, setTimes] = useState<string[]>(["08:00", "18:30"]);
  const [custom, setCustom] = useState("");
  const [quiet, setQuiet] = useState({ start: "21:30", end: "07:30" });
  const [reason, setReason] = useState<string>("");
  const [a11y, setA11y] = useState({ large_text: false, high_contrast: false, reduce_motion: false, audio_replies: false });
  const [style, setStyle] = useState<"normal" | "gentle">("normal");
  const [consents, setConsents] = useState<Record<string, boolean>>(Object.fromEntries(CONSENTS.map((c) => [c.kind, c.def])));
  const [template, setTemplate] = useState<TemplateKey>("walk");
  const [hasFile, setHasFile] = useState(false);

  const zones = ZONES.includes(tz) ? ZONES : [tz, ...ZONES];
  const Scene = SCENES[step];
  const sortedTimes = useMemo(() => [...new Set(times)].sort(), [times]);

  function chooseLocale(l: string) {
    setLocale(l);
    // Switch the interface language immediately; the profile is saved on finish.
    setLocaleCookie(l);
    router.refresh();
  }
  const toggleTime = (time: string) => setTimes((ts) => (ts.includes(time) ? ts.filter((x) => x !== time) : [...ts, time].slice(0, 6)));
  const go = (d: number) => {
    setStep((s) => Math.min(TOTAL - 1, Math.max(0, s + d)));
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const show = (n: number) => (step === n ? "" : "hidden");

  const firstDay = template in TEMPLATES ? TEMPLATES[template as keyof typeof TEMPLATES].items : [];

  return (
    <div className="grid min-h-dvh lg:h-dvh lg:grid-cols-[0.9fr_1.1fr] lg:overflow-hidden">
      {/* Illustration panel */}
      <aside className="relative hidden border-r border-line bg-surface-2 lg:sticky lg:top-0 lg:flex lg:h-dvh lg:flex-col lg:justify-between lg:p-12">
        <Logo />
        <div key={step} className="pop-in mx-auto w-full max-w-sm">
          <Scene />
          <p className="display mt-10 text-center text-[1.7rem] font-semibold">{t(`onb.side${step}`)}</p>
        </div>
        <p className="text-sm text-ink-soft">{t("common.disclaimer")}</p>
      </aside>

      <main id="main" className="flex flex-col px-5 pb-28 pt-6 sm:px-10 lg:h-dvh lg:pb-0 lg:pt-0">
        <div className="lg:hidden"><Logo /></div>
        <form action={action} className="mx-auto flex w-full max-w-xl flex-1 flex-col pt-6 lg:min-h-0 lg:pt-8">
          {/* Submitted state */}
          <input type="hidden" name="locale" value={locale} />
          <input type="hidden" name="timezone" value={tz} />
          {sortedTimes.map((x) => <input key={x} type="hidden" name="checkin_times" value={x} />)}
          <input type="hidden" name="quiet_start" value={quiet.start} />
          <input type="hidden" name="quiet_end" value={quiet.end} />
          <input type="hidden" name="reason" value={reason} />
          <input type="hidden" name="reminder_frequency" value={style} />
          <input type="hidden" name="template" value={template} />
          {Object.entries(a11y).map(([k, v]) => (v ? <input key={k} type="hidden" name={k} value="on" /> : null))}
          {Object.entries(consents).map(([k, v]) => (v ? <input key={k} type="hidden" name={`consent_${k}`} value="on" /> : null))}

          <div>
            <p className="mb-2 text-sm font-semibold text-ink-soft" aria-live="polite">{t("onb.stepOf", { current: step + 1, total: TOTAL })}</p>
            <div className="flex gap-1.5" aria-hidden="true">
              {Array.from({ length: TOTAL }).map((_, i) => <span key={i} className={`h-1.5 flex-1 rounded-full transition-colors duration-300 ${i <= step ? "bg-primary" : "bg-surface-3"}`} />)}
            </div>
          </div>

          <div key={`m${step}`} className="pop-in mx-auto mt-6 w-full max-w-xs lg:hidden"><Scene /></div>

          {state?.error ? <div className="mt-6"><Alert tone="danger">{t("common.error")}</Alert></div> : null}

          <div className="mt-5 flex-1 lg:min-h-0 lg:overflow-y-auto lg:pb-2">
            {/* 0 Language */}
            <section className={show(0)} aria-labelledby="s0">
              <h1 id="s0" className="text-[1.7rem] sm:text-[2rem]">{t("onb.langTitle")}</h1>
              <p className="mt-2 text-[1.02rem] text-ink-soft">{t("onb.langBody")}</p>
              <div role="radiogroup" aria-labelledby="s0" className="mt-5 grid gap-2">
                {([["en", "English", "Hello"], ["hi", "हिन्दी", "नमस्ते"], ["mr", "मराठी", "नमस्कार"]] as const).map(([code, name, hello]) => (
                  <button key={code} type="button" role="radio" aria-checked={locale === code} onClick={() => chooseLocale(code)} className={`flex min-h-[68px] items-center justify-between rounded-xl border px-5 text-left transition-colors ${locale === code ? "border-primary bg-surface shadow-[var(--shadow-md)]" : "border-line bg-surface hover:border-ink-soft"}`}>
                    <span lang={code}>
                      <span className="display block text-xl font-semibold">{name}</span>
                      <span className="text-ink-soft">{hello}</span>
                    </span>
                    <span className={`flex h-8 w-8 items-center justify-center rounded-full ${locale === code ? "bg-primary text-primary-ink" : "border border-line"}`}>{locale === code ? <Check size={18} aria-hidden="true" /> : null}</span>
                  </button>
                ))}
              </div>
            </section>

            {/* 1 Tour */}
            <section className={show(1)} aria-labelledby="s1">
              <h1 id="s1" className="text-[1.7rem] sm:text-[2rem]">{t("onb.tourTitle")}</h1>
              <p className="mt-2 text-[1.02rem] text-ink-soft">{t("onb.tourBody")}</p>
              <ul className="mt-5 grid gap-2">
                {([[Bell, "tour1"], [ListChecks, "tour2"], [TrendingUp, "tour3"]] as const).map(([Icon, k]) => (
                  <li key={k} className="flex items-start gap-4 rounded-xl border border-line bg-surface p-4">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary"><Icon size={22} aria-hidden="true" /></span>
                    <div>
                      <h2 className="text-lg">{t(`onb.${k}Title`)}</h2>
                      <p className="mt-1 text-ink-soft">{t(`onb.${k}Body`)}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </section>

            {/* 2 About you */}
            <section className={show(2)} aria-labelledby="s2">
              <h1 id="s2" className="text-[1.7rem] sm:text-[2rem]">{t("onb.aboutTitle")}</h1>
              <p className="mt-2 text-[1.02rem] text-ink-soft">{t("onb.aboutBody")}</p>
              <div className="mt-6 flex flex-col gap-5">
                <div className="field">
                  <label htmlFor="display_name">{t("onboarding.name")}</label>
                  <input id="display_name" name="display_name" className="input text-lg" maxLength={80} autoComplete="given-name" />
                </div>
                <div className="field">
                  <label htmlFor="timezone">{t("onboarding.timezone")}</label>
                  <select id="timezone" className="input" value={tz} onChange={(e) => setTz(e.target.value)}>
                    {zones.map((z) => <option key={z} value={z}>{z.replace("_", " ")}</option>)}
                  </select>
                  <button type="button" className="link mt-1 inline-flex items-center gap-1.5 self-start text-sm" onClick={() => { try { setTz(Intl.DateTimeFormat().resolvedOptions().timeZone || tz); } catch {} }}>
                    <Globe2 size={16} aria-hidden="true" />{t("onb.useDeviceZone")}
                  </button>
                </div>
              </div>
            </section>

            {/* 3 Rhythm */}
            <section className={show(3)} aria-labelledby="s3">
              <h1 id="s3" className="text-[1.7rem] sm:text-[2rem]">{t("onb.rhythmTitle")}</h1>
              <p className="mt-2 text-[1.02rem] text-ink-soft">{t("onb.rhythmBody")}</p>
              <fieldset className="mt-5">
                <legend className="sr-only">{t("onboarding.checkinTimes")}</legend>
                <div className="grid grid-cols-2 gap-2 xl:grid-cols-4">
                  {PRESETS.map(({ key, time, Icon }) => {
                    const on = times.includes(time);
                    return (
                      <button key={key} type="button" aria-pressed={on} onClick={() => toggleTime(time)} className={`flex min-h-[72px] flex-col items-start justify-between gap-2 rounded-xl border p-3 text-left transition-colors ${on ? "border-primary bg-surface shadow-[var(--shadow-sm)]" : "border-line bg-surface hover:border-ink-soft"}`}>
                        <Icon size={22} className={on ? "text-primary" : "text-ink-faint"} aria-hidden="true" />
                        <span className="flex flex-col"><span className="font-semibold leading-tight">{t(`onb.${key}`)}</span><span className="text-sm tabular-nums text-ink-soft">{fmt(time, locale)}</span></span>
                      </button>
                    );
                  })}
                </div>
                <div className="mt-3 flex flex-wrap items-end gap-2">
                  <div className="field">
                    <label htmlFor="custom-time" className="!text-sm">{t("onb.customTimes")}</label>
                    <input id="custom-time" type="time" className="input w-40" value={custom} onChange={(e) => setCustom(e.target.value)} />
                  </div>
                  <button type="button" className="btn btn-secondary" disabled={!custom} onClick={() => { toggleTime(custom); setCustom(""); }}>{t("onboarding.addTime")}</button>
                  {sortedTimes.filter((x) => !PRESETS.some((p) => p.time === x)).map((x) => (
                    <button key={x} type="button" className="chip min-h-10" onClick={() => toggleTime(x)} aria-label={t("onboarding.removeTime", { time: x })}>{fmt(x, locale)} ✕</button>
                  ))}
                </div>
              </fieldset>
              <fieldset className="mt-4 rounded-xl bg-ink px-4 py-3 text-surface">
                <legend className="sr-only">{t("onb.quietTitle")}</legend>
                <p className="flex items-center gap-2 text-lg font-semibold"><Moon size={20} aria-hidden="true" />{t("onb.quietTitle")}</p>
                <p className="mt-1 opacity-75">{t("onb.quietBody")}</p>
                <div className="mt-2 flex flex-wrap gap-4">
                  <div className="field"><label htmlFor="quiet_start" className="!text-sm !text-surface opacity-80">{t("onboarding.quietStart")}</label><input id="quiet_start" type="time" className="input w-36" value={quiet.start} onChange={(e) => setQuiet((q) => ({ ...q, start: e.target.value }))} required /></div>
                  <div className="field"><label htmlFor="quiet_end" className="!text-sm !text-surface opacity-80">{t("onboarding.quietEnd")}</label><input id="quiet_end" type="time" className="input w-36" value={quiet.end} onChange={(e) => setQuiet((q) => ({ ...q, end: e.target.value }))} required /></div>
                </div>
              </fieldset>
              <p className="mt-4 rounded-xl bg-primary-soft px-4 py-2.5 text-[0.95rem] text-ink" aria-live="polite">
                {sortedTimes.length
                  ? t("onb.rhythmPreview", { times: sortedTimes.map((x) => fmt(x, locale)).join(", "), start: fmt(quiet.start || "21:30", locale), end: fmt(quiet.end || "07:30", locale) })
                  : t("onb.rhythmPreviewNone", { start: fmt(quiet.start || "21:30", locale), end: fmt(quiet.end || "07:30", locale) })}
              </p>
            </section>

            {/* 4 Reason */}
            <section className={show(4)} aria-labelledby="s4">
              <h1 id="s4" className="text-[1.7rem] sm:text-[2rem]">{t("onb.reasonTitle")}</h1>
              <p className="mt-2 text-[1.02rem] text-ink-soft">{t("onb.reasonBody")}</p>
              <div role="radiogroup" aria-labelledby="s4" className="mt-5 grid gap-2 lg:grid-cols-2">
                {REASONS.map((r) => (
                  <button key={r} type="button" role="radio" aria-checked={reason === r} onClick={() => setReason(reason === r ? "" : r)} className={`flex min-h-14 items-center justify-between gap-3 rounded-xl border px-4 py-2.5 text-left font-semibold transition-colors ${reason === r ? "border-primary bg-surface shadow-[var(--shadow-sm)]" : "border-line bg-surface hover:border-ink-soft"}`}>
                    {t(`onb.reason_${r}`)}
                    <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${reason === r ? "bg-primary text-primary-ink" : "border border-line"}`}>{reason === r ? <Check size={16} aria-hidden="true" /> : null}</span>
                  </button>
                ))}
              </div>
              <details className="mt-4 rounded-xl border border-line bg-surface p-4">
                <summary className="cursor-pointer font-semibold">{t("onb.detailsToggle")}</summary>
                <div className="mt-3 grid gap-3 lg:grid-cols-2">
                  <div className="field">
                    <label htmlFor="care_notes">{t("onboarding.careNotes")}</label>
                    <textarea id="care_notes" name="care_notes" className="input" rows={2} maxLength={2000} aria-describedby="care-hint" />
                    <span id="care-hint" className="hint text-xs">{t("onboarding.careNotesHint")}</span>
                  </div>
                  <div className="field">
                    <label htmlFor="limitations">{t("onboarding.limitations")}</label>
                    <textarea id="limitations" name="limitations" className="input" rows={2} maxLength={1000} aria-describedby="lim-hint" />
                    <span id="lim-hint" className="hint text-xs">{t("onboarding.limitationsHint")}</span>
                  </div>
                </div>
              </details>
            </section>

            {/* 5 Comfort */}
            <section className={show(5)} aria-labelledby="s5">
              <h1 id="s5" className="text-[1.7rem] sm:text-[2rem]">{t("onb.comfortTitle")}</h1>
              <p className="mt-2 text-[1.02rem] text-ink-soft">{t("onb.comfortBody")}</p>
              <div aria-hidden="true" className={`mt-5 rounded-xl border p-4 transition-all ${a11y.high_contrast ? "border-ink bg-surface" : "border-line bg-surface"}`} style={{ fontSize: a11y.large_text ? "1.2rem" : "1rem" }}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-bold" style={{ fontSize: "1.25em" }}>{t("onb.previewTitle")}</p>
                    <p className={a11y.high_contrast ? "text-ink" : "text-ink-soft"}>{t("onb.previewBody")}</p>
                  </div>
                  <span className="chip bg-accent-soft text-accent-ink">{t("onb.previewTime")}</span>
                </div>
                <div className="mt-4 grid grid-cols-[1fr_auto] gap-2"><span className="btn btn-primary">✓ {t("today.done")}</span><span className="btn btn-secondary">{t("today.later")}</span></div>
              </div>
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                {([["large_text", "largeText"], ["high_contrast", "highContrast"], ["reduce_motion", "reduceMotion"], ["audio_replies", "audioReplies"]] as const).map(([k, l]) => (
                  <label key={k} className="flex min-h-14 cursor-pointer items-center justify-between gap-3 rounded-2xl border border-line bg-surface px-4">
                    <span className="font-semibold">{t(`onboarding.${l}`)}</span>
                    <input type="checkbox" role="switch" checked={a11y[k]} onChange={(e) => setA11y((s) => ({ ...s, [k]: e.target.checked }))} className="h-6 w-6 accent-[var(--primary)]" />
                  </label>
                ))}
              </div>
              <fieldset className="mt-4">
                <legend className="label mb-2">{t("onb.styleTitle")}</legend>
                <div className="grid gap-2 sm:grid-cols-2">
                  {(["normal", "gentle"] as const).map((s) => (
                    <label key={s} className={`flex min-h-14 cursor-pointer items-center gap-3 rounded-2xl border px-4 py-3 ${style === s ? "border-primary bg-surface" : "border-line bg-surface"}`}>
                      <input type="radio" name="style-ui" checked={style === s} onChange={() => setStyle(s)} className="h-5 w-5 accent-[var(--primary)]" />
                      {t(`onb.style_${s}`)}
                    </label>
                  ))}
                </div>
              </fieldset>
            </section>

            {/* 6 Permissions */}
            <section className={show(6)} aria-labelledby="s6">
              <h1 id="s6" className="text-[1.7rem] sm:text-[2rem]">{t("onb.permTitle")}</h1>
              <p className="mt-2 text-[1.02rem] text-ink-soft">{t("onb.permBody")}</p>
              <div className="mt-5 grid gap-2 xl:grid-cols-2">
                {CONSENTS.map(({ kind, title, body, Icon }) => (
                  <label key={kind} className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors ${consents[kind] ? "border-primary bg-surface" : "border-line bg-surface"}`}>
                    <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${consents[kind] ? "bg-primary text-primary-ink" : "bg-surface-2 text-ink-soft"}`}><Icon size={21} aria-hidden="true" /></span>
                    <span className="flex-1">
                      <span className="block font-bold">{t(`onb.${title}`)}</span>
                      <span className="text-sm leading-snug text-ink-soft">{t(`onboarding.${body}`)}</span>
                    </span>
                    <input type="checkbox" role="switch" checked={consents[kind]} onChange={(e) => setConsents((c) => ({ ...c, [kind]: e.target.checked }))} className="mt-1 h-6 w-6 shrink-0 accent-[var(--primary)]" />
                  </label>
                ))}
              </div>
            </section>

            {/* 7 First routine */}
            <section className={show(7)} aria-labelledby="s7">
              <h1 id="s7" className="text-[1.7rem] sm:text-[2rem]">{t("onb.routineTitle")}</h1>
              <p className="mt-2 text-[1.02rem] text-ink-soft">{t("onb.routineBody")}</p>
              <div role="radiogroup" aria-labelledby="s7" className="mt-5 grid gap-2 sm:grid-cols-2">
                {(["walk", "water", "stretch", "clinician", "none"] as const).map((k) => (
                  <label key={k} className={`flex cursor-pointer flex-col gap-0.5 rounded-xl border p-3 transition-colors ${template === k ? "border-primary bg-surface shadow-[var(--shadow-sm)]" : "border-line bg-surface hover:border-ink-soft"} ${k === "none" ? "sm:col-span-2" : ""}`}>
                    <span className="flex items-center gap-3">
                      <input type="radio" name="template-ui" checked={template === k} onChange={() => setTemplate(k)} className="h-5 w-5 accent-[var(--primary)]" />
                      <span className="font-bold">{k === "none" ? t("onboarding.skipRoutine") : t(`templates.${k}`)}</span>
                    </span>
                    {k !== "none" ? <span className="pl-8 text-sm text-ink-soft">{t(`templates.${k}Desc`)}</span> : null}
                  </label>
                ))}
              </div>
              {template === "clinician" ? (
                <div className="mt-4 rounded-xl border border-primary bg-surface p-4">
                  <p className="font-semibold">{t("onb.uploadTitle")}</p>
                  <p className="hint mt-0.5">{t("onb.uploadBody")}</p>
                  <input type="hidden" name="plan_title" value={t("onb.clinicianPlanTitle")} />
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <div className="field"><label htmlFor="clinician_name" className="!text-sm">{t("plan.clinicianName")}</label><input id="clinician_name" name="clinician_name" className="input" maxLength={120} /></div>
                    <div className="field">
                      <label htmlFor="plan_file" className="!text-sm">{t("onb.uploadFile")}</label>
                      <input id="plan_file" name="plan_file" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="input py-2 text-sm" onChange={async (e) => { const input = e.currentTarget; await shrinkInputFile(input); setHasFile(!!input.files?.length); }} />
                    </div>
                  </div>
                </div>
              ) : (
              <div className="mt-4 rounded-xl border border-line bg-surface p-4">
                <p className="font-semibold">{t("onb.firstDay")}</p>
                {firstDay.length === 0 ? <p className="mt-1 text-ink-soft">{t("onb.firstDayEmpty")}</p> : (
                  <ul className="mt-3 flex flex-col gap-2">
                    {firstDay.flatMap((it) => (it.schedule_kind === "weekly_target" ? [{ label: it.title, when: t("onb.firstDayWeekly", { n: it.weekly_target ?? 3 }) }] : it.times.map((tm) => ({ label: it.title, when: fmt(tm, locale) })))).map((r, i) => (
                      <li key={i} className="flex items-center gap-3 rounded-lg bg-surface-2 px-4 py-3"><span className="display w-20 shrink-0 font-bold text-primary">{r.when}</span>{r.label}</li>
                    ))}
                  </ul>
                )}
              </div>
              )}
            </section>
          </div>

          {/* Navigation */}
          <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-bg/95 px-5 py-3 backdrop-blur-md lg:static lg:border-t lg:bg-transparent lg:px-0 lg:py-5">
            <div className="mx-auto flex max-w-xl items-center justify-between gap-3">
              <button type="button" className={`btn btn-ghost ${step === 0 ? "invisible" : ""}`} onClick={() => go(-1)}><ChevronLeft size={20} aria-hidden="true" />{t("onb.back")}</button>
              {step < TOTAL - 1 ? (
                <button type="button" className="btn btn-primary btn-lg min-w-36" onClick={() => go(1)}>{t("onb.next")}</button>
              ) : (
                <SubmitButton className="btn btn-primary btn-lg" pendingLabel={template === "clinician" && hasFile ? t("onb.uploadReading") : t("common.saving")}>{t("onb.finish")}</SubmitButton>
              )}
            </div>
          </div>
        </form>
      </main>
    </div>
  );
}
