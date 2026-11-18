"use client";
// Three taps to a ready plan: you → what you want → how Sukhi talks.
// Everything else (time zone, check-in times, quiet hours, permissions) is set for the person
// with sensible defaults and stays editable in Settings.
import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Check, ChevronLeft, Footprints, Heart, ListChecks, Moon, Smile, Sparkles, Stethoscope, Target, Wind, Zap } from "lucide-react";
import { completeOnboarding } from "@/app/actions";
import { Alert } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { Logo } from "@/components/Logo";
import { DocPicker } from "@/components/DocPicker";
import { FEATURED_PACKS, packMotivation, type PackKey } from "@/domain/templates";
import { COMMUNICATION_STYLES, type CommunicationStyle } from "@/domain/behaviour";
import { setLocaleCookie } from "@/lib/client-prefs";
import { normalizePhone } from "@/domain/wa-ui";

const PACK_ICON: Record<string, typeof Sparkles> = { glow: Sparkles, sleep: Moon, active: Footprints, calm: Wind, energy: Zap };
const TONE_ICON = { warm_gentle: Heart, fun_playful: Smile, motivating: Target, simple_practical: ListChecks } as const;
const LANGS = [["en", "English"], ["hi", "हिन्दी"], ["mr", "मराठी"]] as const;
const TOTAL = 3;
const MAX_PACKS = 3;

export function OnboardingForm({ defaults }: { defaults: { timezone: string; locale: string } }) {
  const t = useTranslations();
  const router = useRouter();
  const [state, action] = useActionState(completeOnboarding, null);
  const [step, setStep] = useState(0);
  const [locale, setLocale] = useState(defaults.locale);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const phoneOk = !!normalizePhone(phone);
  const [packs, setPacks] = useState<PackKey[]>([]);
  const [doctor, setDoctor] = useState(false);
  const [hasFile, setHasFile] = useState(false);
  const [tone, setTone] = useState<CommunicationStyle>("warm_gentle");

  function chooseLocale(l: string) {
    setLocale(l);
    setLocaleCookie(l);
    router.refresh();
  }
  const togglePack = (k: PackKey) => setPacks((ps) => (ps.includes(k) ? ps.filter((x) => x !== k) : ps.length >= MAX_PACKS ? ps : [...ps, k]));
  const go = (d: number) => {
    setStep((s) => Math.min(TOTAL - 1, Math.max(0, s + d)));
    if (typeof window !== "undefined") window.scrollTo({ top: 0 }); // instant: Android drops taps made during a smooth scroll
  };
  const show = (n: number) => (step === n ? "" : "hidden");
  const motivation = packMotivation(packs, locale);
  // Selected = filled tint + primary border + a solid check badge, clear at a glance on a phone.
  const card = (on: boolean) => `relative flex touch-manipulation select-none items-center gap-3 rounded-[var(--r-md)] border px-3.5 py-3 text-left transition-colors ${on ? "border-primary bg-primary-soft ring-1 ring-primary" : "border-line bg-surface hover:border-ink-soft"}`;

  return (
    <main id="main" className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-5 pb-28 pt-6">
      <div className="flex items-center justify-between">
        <Logo />
        <div role="radiogroup" aria-label={t("onb.langTitle")} className="flex gap-1 text-[0.8rem]">
          {LANGS.map(([code, label]) => (
            <button key={code} type="button" role="radio" aria-checked={locale === code} onClick={() => chooseLocale(code)} lang={code} className={`rounded-full px-2.5 py-1 transition-colors ${locale === code ? "bg-primary text-primary-ink" : "text-ink-soft hover:bg-surface-2"}`}>{label}</button>
          ))}
        </div>
      </div>

      {/* Done for you: the device's time zone is filled in as the form is sent. */}
      <form action={action} onSubmit={(e) => { const el = e.currentTarget.elements.namedItem("timezone") as HTMLInputElement | null; try { const z = Intl.DateTimeFormat().resolvedOptions().timeZone; if (el && z) el.value = z; } catch { /* keep the default */ } }} className="mt-8 flex flex-1 flex-col">
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="timezone" defaultValue={defaults.timezone} />
        <input type="hidden" name="display_name" value={name} />
        <input type="hidden" name="phone" value={phone} />
        {["08:30", "20:00"].map((x) => <input key={x} type="hidden" name="checkin_times" value={x} />)}
        <input type="hidden" name="quiet_start" value="23:00" />
        <input type="hidden" name="quiet_end" value="07:00" />
        <input type="hidden" name="setup_for" value="self" />
        <input type="hidden" name="health_context" value={doctor ? "diagnosed" : "wellness"} />
        <input type="hidden" name="communication_styles" value={tone} />
        {motivation ? <input type="hidden" name="personal_motivation" value={motivation} /> : null}
        {packs.map((k) => <input key={k} type="hidden" name="packs" value={k} />)}
        <input type="hidden" name="template" value={doctor ? "clinician" : "none"} />
        {["ai_processing", "reminders", "voice_processing"].map((k) => <input key={k} type="hidden" name={`consent_${k}`} value="on" />)}

        <p className="sr-only" aria-live="polite">{t("onb.stepOf", { current: step + 1, total: TOTAL })}</p>
        <div className="flex gap-1.5" aria-hidden="true">
          {Array.from({ length: TOTAL }).map((_, i) => <span key={i} className={`h-1 flex-1 rounded-full transition-colors duration-300 ${i <= step ? "bg-primary" : "bg-surface-3"}`} />)}
        </div>

        {state?.error ? <div className="mt-5"><Alert tone="danger">{state.error === "invalid_phone" ? t("settings.phoneInvalid") : state.error === "phone_taken" ? t("settings.phoneTaken") : t("common.error")}</Alert></div> : null}

        <div className="mt-8 flex-1">
          {/* 1. You */}
          <section className={`pop-in ${show(0)}`} aria-labelledby="s0">
            <h1 id="s0" className="text-[1.5rem] leading-tight">{t("onb.nameTitle")}</h1>
            <label htmlFor="name" className="sr-only">{t("onboarding.name")}</label>
            <input id="name" className="input mt-6 text-lg" maxLength={80} autoComplete="given-name" placeholder={t("onb.namePlaceholder")} value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); if (phoneOk) go(1); } }} />
            <label htmlFor="phone" className="label mt-5 block">{t("settings.phoneLabel")}</label>
            <input id="phone" type="tel" inputMode="tel" className="input mt-1.5 text-lg" maxLength={20} autoComplete="tel" placeholder="98200 01234" value={phone} onChange={(e) => setPhone(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); if (phoneOk) go(1); } }} />
            <p className="hint mt-1.5 text-sm">{t("settings.phoneHint")}</p>
          </section>

          {/* 2. What you want */}
          <section className={`pop-in ${show(1)}`} aria-labelledby="s1">
            <h1 id="s1" className="text-[1.5rem] leading-tight">{name.trim() ? t("onb.goalTitleName", { name: name.trim().split(/\s+/)[0] }) : t("onb.goalTitle")}</h1>
            <p className="mt-1.5 text-sm text-ink-soft">{t("onb.goalPickHint")}</p>
            <div className="mt-5 grid grid-cols-2 gap-2">
              {FEATURED_PACKS.map((k) => {
                const on = packs.includes(k);
                const Icon = PACK_ICON[k] ?? Sparkles;
                return (
                  <button key={k} type="button" aria-pressed={on} onClick={() => togglePack(k)} disabled={!on && packs.length >= MAX_PACKS} className={`${card(on)} min-h-[64px] disabled:opacity-40`}>
                    <Icon size={18} className={on ? "text-primary" : "text-ink-faint"} aria-hidden="true" />
                    <span className="text-[0.95rem] font-medium leading-tight">{t(`packs.${k}`)}</span>
                    {on ? <span aria-hidden="true" className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-ink"><Check size={12} strokeWidth={3} /></span> : null}
                  </button>
                );
              })}
              <button type="button" aria-pressed={doctor} onClick={() => setDoctor((d) => !d)} className={`${card(doctor)} min-h-[64px]`}>
                <Stethoscope size={18} className={doctor ? "text-primary" : "text-ink-faint"} aria-hidden="true" />
                <span className="text-[0.95rem] font-medium leading-tight">{t("packs.doctor")}</span>
                {doctor ? <span aria-hidden="true" className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-ink"><Check size={12} strokeWidth={3} /></span> : null}
              </button>
            </div>
            {doctor ? (
              <div className="pop-in mt-4">
                <input type="hidden" name="plan_title" value={t("onb.clinicianPlanTitle")} />
                <label htmlFor="plan_file" className="label mb-2 block">{t("onb.uploadShort")}</label>
                <DocPicker id="plan_file" name="plan_file" hintName="plan_hint" onChange={setHasFile} />
              </div>
            ) : null}
          </section>

          {/* 3. How Sukhi talks */}
          <section className={`pop-in ${show(2)}`} aria-labelledby="s2">
            <h1 id="s2" className="text-[1.5rem] leading-tight">{t("onb.toneTitle")}</h1>
            <div role="radiogroup" aria-labelledby="s2" className="mt-6 flex flex-col gap-2">
              {COMMUNICATION_STYLES.map((k) => {
                const on = tone === k;
                const Icon = TONE_ICON[k];
                return (
                  <button key={k} type="button" role="radio" aria-checked={on} onClick={() => setTone(k)} className={card(on)}>
                    <Icon size={18} className={`shrink-0 ${on ? "text-primary" : "text-ink-faint"}`} aria-hidden="true" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[0.95rem] font-medium">{t(`support.style_${k}`)}</span>
                      <span className="block text-[0.82rem] italic text-ink-soft">“{t(`onb.toneSample_${k}`)}”</span>
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="mt-6 text-[0.75rem] leading-snug text-ink-faint">{t("onb.consentLine")}</p>
          </section>
        </div>

        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-bg/95 px-5 py-3 backdrop-blur-md">
          <div className="mx-auto flex max-w-md items-center justify-between gap-3">
            <button type="button" className={`btn btn-ghost ${step === 0 ? "invisible" : ""}`} onClick={() => go(-1)} aria-label={t("onb.back")}><ChevronLeft size={20} aria-hidden="true" /></button>
            {step < TOTAL - 1 ? (
              <button type="button" className="btn btn-primary min-w-36" disabled={step === 0 && !phoneOk} onClick={() => go(1)}>{step === 1 && packs.length === 0 && !doctor ? t("onb.skipForNow") : t("onb.next")}</button>
            ) : (
              <SubmitButton className="btn btn-primary min-w-36" pendingLabel={doctor && hasFile ? t("onb.uploadReading") : t("common.saving")}>{t("onb.finish")}</SubmitButton>
            )}
          </div>
        </div>
      </form>
    </main>
  );
}
