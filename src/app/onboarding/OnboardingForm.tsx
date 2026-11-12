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
import { DocPicker } from "@/components/DocPicker";
import { RestartQuestion, StyleQuestion, SupportHiddenInputs } from "@/components/SupportChoices";
import { MOTIVATION_MAX, type CommunicationStyle, type RestartPreference } from "@/domain/behaviour";

const ZONES = ["Asia/Kolkata", "Asia/Dubai", "Asia/Singapore", "Europe/London", "Europe/Berlin", "America/New_York", "America/Los_Angeles", "Australia/Sydney", "UTC"];
const PRESETS = [
  { key: "morning", time: "08:00", Icon: Sunrise },
  { key: "midday", time: "13:00", Icon: Sun },
  { key: "evening", time: "18:30", Icon: Sunset },
  { key: "night", time: "21:00", Icon: Moon },
] as const;
const SITUATIONS = ["discharge", "new_plan", "existing"] as const;
const CONDITIONS = ["diabetes", "bp", "heart", "thyroid", "skin_hair", "post_surgery", "respiratory", "joints", "kidney", "mental", "pregnancy", "other"] as const;
const RELATIONS = ["parent", "spouse", "child", "grandparent", "sibling", "other"] as const;
const CONSENTS = [
  { kind: "ai_processing", title: "perm_ai", body: "consentAi", def: true, Icon: Bot },
  { kind: "reminders", title: "perm_reminders", body: "consentReminders", def: true, Icon: Bell },
  // Voice-first: most users are older adults, so speaking and listening are on by default.
  { kind: "voice_processing", title: "perm_voice", body: "consentVoice", def: true, Icon: Mic },
  { kind: "whatsapp", title: "perm_whatsapp", body: "consentWhatsapp", def: false, Icon: MessageCircle },
  { kind: "family_sharing", title: "perm_family", body: "consentFamily", def: false, Icon: Users },
] as const;
type TemplateKey = "walk" | "water" | "stretch" | "clinician" | "none";

const SCENES = [VLanguages, VCheckin, VReminder, VRhythm, VContext, VComfort, VPrivacy, VProgress];
const TOTAL = SCENES.length;

// Deterministic on purpose: Node and browsers format Intl times differently ("8:00 AM" vs
// "8:00 am"), which broke hydration of this server-rendered client component.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function fmt(time: string, _locale: string) {
  const [h, m] = time.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "am" : "pm"}`;
}

export function OnboardingForm({ defaults, whatsappLaunched = false }: { defaults: { timezone: string; locale: string }; whatsappLaunched?: boolean }) {
  const t = useTranslations();
  const router = useRouter();
  const [state, action] = useActionState(completeOnboarding, null);
  const [step, setStep] = useState(0);
  const [locale, setLocale] = useState(defaults.locale);
  const [tz, setTz] = useState(defaults.timezone);
  const [times, setTimes] = useState<string[]>(["08:00", "18:30"]);
  const [custom, setCustom] = useState("");
  const [quiet, setQuiet] = useState({ start: "21:30", end: "07:30" });
  const [situation, setSituation] = useState<string>("");
  const [setupFor, setSetupFor] = useState<"self" | "caregiver" | "">("");
  const [relation, setRelation] = useState<string>("parent");
  const [health, setHealth] = useState<"diagnosed" | "wellness" | "prefer_not" | "">("");
  const [conditions, setConditions] = useState<string[]>([]);
  const [a11y, setA11y] = useState({ large_text: false, high_contrast: false, reduce_motion: false, audio_replies: true });
  const [style, setStyle] = useState<"normal" | "gentle">("normal");
  const [consents, setConsents] = useState<Record<string, boolean>>(Object.fromEntries(CONSENTS.map((c) => [c.kind, c.def])));
  const [template, setTemplate] = useState<TemplateKey>("walk");
  const [hasFile, setHasFile] = useState(false);
  // Behavioural preferences: both optional; defaults apply when skipped.
  const [commStyles, setCommStyles] = useState<CommunicationStyle[]>([]);
  const [restartPref, setRestartPref] = useState<RestartPreference | null>(null);
  const [confidence, setConfidence] = useState<number | null>(null);

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

  const intakeDone = !!setupFor && !!health;
  const clinicalFirst = health === "diagnosed";
  const routineOptions: TemplateKey[] = clinicalFirst ? ["clinician", "walk", "water", "stretch", "none"] : ["walk", "water", "stretch", "clinician", "none"];
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
          <input type="hidden" name="situation" value={health === "diagnosed" ? situation : ""} />
          <input type="hidden" name="setup_for" value={setupFor} />
          {setupFor === "caregiver" ? <input type="hidden" name="care_recipient_relation" value={relation} /> : null}
          <input type="hidden" name="health_context" value={health} />
          {health === "diagnosed" ? conditions.map((c) => <input key={c} type="hidden" name="conditions" value={c} />) : null}
          <input type="hidden" name="reminder_frequency" value={style} />
          <input type="hidden" name="template" value={template} />
          <SupportHiddenInputs styles={commStyles} restart={restartPref} />
          {confidence !== null && template !== "none" ? <input type="hidden" name="habit_confidence" value={confidence} /> : null}
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
              <fieldset className="mt-4 rounded-xl border border-line bg-sky px-4 py-3 text-ink">
                <legend className="sr-only">{t("onb.quietTitle")}</legend>
                <p className="flex items-center gap-2 text-lg font-semibold"><Moon size={20} aria-hidden="true" />{t("onb.quietTitle")}</p>
                <p className="mt-1 text-ink-soft">{t("onb.quietBody")}</p>
                <div className="mt-2 flex flex-wrap gap-4">
                  <div className="field"><label htmlFor="quiet_start" className="!text-sm">{t("onboarding.quietStart")}</label><input id="quiet_start" type="time" className="input w-36" value={quiet.start} onChange={(e) => setQuiet((q) => ({ ...q, start: e.target.value }))} required /></div>
                  <div className="field"><label htmlFor="quiet_end" className="!text-sm">{t("onboarding.quietEnd")}</label><input id="quiet_end" type="time" className="input w-36" value={quiet.end} onChange={(e) => setQuiet((q) => ({ ...q, end: e.target.value }))} required /></div>
                </div>
              </fieldset>
              <p className="mt-4 rounded-xl bg-primary-soft px-4 py-2.5 text-[0.95rem] text-ink" aria-live="polite">
                {sortedTimes.length
                  ? t("onb.rhythmPreview", { times: sortedTimes.map((x) => fmt(x, locale)).join(", "), start: fmt(quiet.start || "21:30", locale), end: fmt(quiet.end || "07:30", locale) })
                  : t("onb.rhythmPreviewNone", { start: fmt(quiet.start || "21:30", locale), end: fmt(quiet.end || "07:30", locale) })}
              </p>
            </section>

            {/* 4 About this plan */}
            <section className={show(4)} aria-labelledby="s4">
              <h1 id="s4" className="text-[1.7rem] sm:text-[2rem]">{t("intake.title")}</h1>
              <p className="mt-2 text-[1.02rem] text-ink-soft">{t("intake.body")}</p>

              <fieldset className="mt-5">
                <legend className="label mb-2">{t("intake.whoQ")}</legend>
                <div role="radiogroup" className="grid gap-2 sm:grid-cols-2">
                  {(["self", "caregiver"] as const).map((k) => (
                    <button key={k} type="button" role="radio" aria-checked={setupFor === k} onClick={() => setSetupFor(k)} className={`flex min-h-14 items-center justify-between gap-3 rounded-xl border px-4 py-2.5 text-left font-semibold transition-colors ${setupFor === k ? "border-primary bg-surface shadow-[var(--shadow-sm)]" : "border-line bg-surface hover:border-ink-soft"}`}>
                      <span><span className="block">{t(`intake.who_${k}`)}</span><span className="text-sm font-normal text-ink-soft">{t(`intake.who_${k}Help`)}</span></span>
                      <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${setupFor === k ? "bg-primary text-primary-ink" : "border border-line"}`}>{setupFor === k ? <Check size={16} aria-hidden="true" /> : null}</span>
                    </button>
                  ))}
                </div>
                {setupFor === "caregiver" ? (
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <div className="field">
                      <label htmlFor="care_relation" className="!text-sm">{t("intake.relationQ")}</label>
                      <select id="care_relation" className="input" value={relation} onChange={(e) => setRelation(e.target.value)}>
                        {RELATIONS.map((r) => <option key={r} value={r}>{t(`intake.rel_${r}`)}</option>)}
                      </select>
                    </div>
                    <div className="field">
                      <label htmlFor="care_recipient_name" className="!text-sm">{t("intake.recipientName")}</label>
                      <input id="care_recipient_name" name="care_recipient_name" className="input" maxLength={80} />
                    </div>
                  </div>
                ) : null}
              </fieldset>

              <fieldset className="mt-6">
                <legend className="label mb-2">{setupFor === "caregiver" ? t("intake.healthQOther") : t("intake.healthQ")}</legend>
                <div role="radiogroup" className="grid gap-2">
                  {(["diagnosed", "wellness", "prefer_not"] as const).map((k) => (
                    <button key={k} type="button" role="radio" aria-checked={health === k} onClick={() => { setHealth(k); setTemplate(k === "diagnosed" ? "clinician" : "walk"); }} className={`flex min-h-14 items-center justify-between gap-3 rounded-xl border px-4 py-2.5 text-left font-semibold transition-colors ${health === k ? "border-primary bg-surface shadow-[var(--shadow-sm)]" : "border-line bg-surface hover:border-ink-soft"}`}>
                      <span><span className="block">{t(`intake.health_${k}`)}</span><span className="text-sm font-normal text-ink-soft">{t(`intake.health_${k}Help`)}</span></span>
                      <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${health === k ? "bg-primary text-primary-ink" : "border border-line"}`}>{health === k ? <Check size={16} aria-hidden="true" /> : null}</span>
                    </button>
                  ))}
                </div>
              </fieldset>

              {health === "diagnosed" ? (
                <div className="mt-4 flex flex-col gap-4 rounded-xl border border-line bg-surface p-4">
                  <fieldset>
                    <legend className="label mb-2">{t("intake.conditionsQ")} <span className="hint">({t("common.optional")})</span></legend>
                    <div className="flex flex-wrap gap-2">
                      {CONDITIONS.map((c) => {
                        const on = conditions.includes(c);
                        return <button key={c} type="button" aria-pressed={on} onClick={() => setConditions((cs) => (on ? cs.filter((x) => x !== c) : [...cs, c]))} className={`chip min-h-10 cursor-pointer ${on ? "bg-primary text-primary-ink" : ""}`}>{on ? <Check size={14} aria-hidden="true" /> : null}{t(`intake.cond_${c}`)}</button>;
                      })}
                    </div>
                  </fieldset>
                  <fieldset>
                    <legend className="label mb-2">{t("intake.situationQ")}</legend>
                    <div className="grid gap-2">
                      {SITUATIONS.map((r) => (
                        <label key={r} className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border px-4 py-2 ${situation === r ? "border-primary" : "border-line"}`}>
                          <input type="radio" name="situation-ui" checked={situation === r} onChange={() => setSituation(r)} className="h-5 w-5 accent-[var(--primary)]" />
                          {t(`onb.reason_${r}`)}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                  <p className="rounded-lg bg-primary-soft px-3 py-2 text-sm text-ink">{t("intake.noAdvice")}</p>
                </div>
              ) : null}

              <div className="field mt-5">
                <label htmlFor="personal_motivation">{t("onb.motivationLabel")} <span className="hint">({t("common.optional")})</span></label>
                <textarea id="personal_motivation" name="personal_motivation" className="input" rows={2} maxLength={MOTIVATION_MAX} aria-describedby="motivation-hint" />
                <span id="motivation-hint" className="hint text-xs">{t("onb.motivationHint")}</span>
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
              <div className="mt-6 flex flex-col gap-6 border-t border-line pt-5">
                <StyleQuestion value={commStyles} onChange={setCommStyles} id="onb-style-q" />
                <RestartQuestion value={restartPref} onChange={setRestartPref} id="onb-restart-q" />
              </div>
            </section>

            {/* 6 Permissions */}
            <section className={show(6)} aria-labelledby="s6">
              <h1 id="s6" className="text-[1.7rem] sm:text-[2rem]">{t("onb.permTitle")}</h1>
              <p className="mt-2 text-[1.02rem] text-ink-soft">{t("onb.permBody")}</p>
              <div className="mt-5 grid gap-2 xl:grid-cols-2">
                {CONSENTS.map(({ kind, title, body, Icon }) => kind === "whatsapp" && !whatsappLaunched ? (
                  <div key={kind} className="flex items-start gap-3 rounded-xl border border-line bg-surface p-3 text-ink-soft">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-surface-2"><Icon size={21} aria-hidden="true" /></span>
                    <span className="flex-1"><span className="block font-bold text-ink">{t(`onb.${title}`)}</span><span className="text-sm leading-snug">{t("settings.waComingSoon")}</span></span>
                    <span className="chip mt-1 shrink-0 bg-primary-soft text-primary">{t("common.comingSoon")}</span>
                  </div>
                ) : (
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

            {/* 7 First plan */}
            <section className={show(7)} aria-labelledby="s7">
              <h1 id="s7" className="text-[1.7rem] sm:text-[2rem]">{clinicalFirst ? t("intake.planTitleClinical") : t("onb.routineTitle")}</h1>
              <p className="mt-2 text-[1.02rem] text-ink-soft">{clinicalFirst ? t("intake.planBodyClinical") : t("intake.planBodyWellness")}</p>
              <div role="radiogroup" aria-labelledby="s7" className="mt-5 grid gap-2 sm:grid-cols-2">
                {routineOptions.map((k) => (
                  <label key={k} className={`flex cursor-pointer flex-col gap-0.5 rounded-xl border p-3 transition-colors ${template === k ? "border-primary bg-surface shadow-[var(--shadow-sm)]" : "border-line bg-surface hover:border-ink-soft"} ${k === "none" || (k === "clinician" && clinicalFirst) ? "sm:col-span-2" : ""}`}>
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
                  <p className="mt-2 rounded-lg bg-primary-soft px-3 py-2 text-sm text-ink">{t("intake.noAdvice")}</p>
                  <input type="hidden" name="plan_title" value={t("onb.clinicianPlanTitle")} />
                  <div className="mt-3 flex flex-col gap-3">
                    <div className="field"><label htmlFor="clinician_name" className="!text-sm">{t("plan.clinicianName")} <span className="hint">({t("common.optional")})</span></label><input id="clinician_name" name="clinician_name" className="input" maxLength={120} /></div>
                    <div className="field">
                      <label htmlFor="plan_file" className="!text-sm">{t("onb.uploadFile")}</label>
                      <DocPicker id="plan_file" name="plan_file" hintName="plan_hint" onChange={setHasFile} />
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
                <p className="hint mt-3">{t("intake.wellnessNote")}</p>
              </div>
              )}
              {template !== "none" ? (
                <fieldset className="mt-4 rounded-xl border border-line bg-surface p-4" aria-describedby="conf-hint">
                  <legend className="sr-only">{t("onb.confidenceTitle")}</legend>
                  <p className="font-semibold" aria-hidden="true">{t("onb.confidenceTitle")} <span className="hint font-normal">({t("common.optional")})</span></p>
                  <p id="conf-hint" className="hint mt-0.5">{t("onb.confidenceHint")}</p>
                  <div role="radiogroup" aria-label={t("onb.confidenceTitle")} className="mt-3 grid grid-cols-5 gap-1.5 sm:grid-cols-10">
                    {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                      <button key={n} type="button" role="radio" aria-checked={confidence === n} aria-label={t("onb.confidenceValue", { n })} onClick={() => setConfidence(confidence === n ? null : n)} className={`flex min-h-12 items-center justify-center rounded-lg border text-lg font-semibold tabular-nums transition-colors ${confidence === n ? "border-primary bg-primary text-primary-ink" : "border-line bg-surface hover:border-ink-soft"}`}>{n}</button>
                    ))}
                  </div>
                  {confidence !== null ? <button type="button" className="link mt-2 text-sm" onClick={() => setConfidence(null)}>{t("onb.clearChoice")}</button> : null}
                </fieldset>
              ) : null}
            </section>
          </div>

          {/* Navigation */}
          <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-bg/95 px-5 py-3 backdrop-blur-md lg:static lg:border-t lg:bg-transparent lg:px-0 lg:py-5">
            <div className="mx-auto flex max-w-xl items-center justify-between gap-3">
              <button type="button" className={`btn btn-ghost ${step === 0 ? "invisible" : ""}`} onClick={() => go(-1)}><ChevronLeft size={20} aria-hidden="true" />{t("onb.back")}</button>
              {step < TOTAL - 1 ? (
                <span className="flex flex-col items-end gap-1">
                  <button type="button" className="btn btn-primary btn-lg min-w-36" disabled={step === 4 && !intakeDone} onClick={() => go(1)}>{t("onb.next")}</button>
                  {step === 4 && !intakeDone ? <span className="text-xs text-ink-soft">{t("intake.required")}</span> : null}
                </span>
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
