"use client";
// The two behavioural-preference questions, shared by onboarding (step 6) and Settings.
// Large, labelled, icon-based cards built on the app's existing tokens and lucide icons.
import { useTranslations } from "next-intl";
import { Check, Footprints, HandHeart, Heart, Hourglass, ListChecks, RotateCcw, Smile, Target } from "lucide-react";
import { COMMUNICATION_STYLES, RESTART_PREFERENCES, type CommunicationStyle, type RestartPreference } from "@/domain/behaviour";

const STYLE_ICON = { warm_gentle: Heart, fun_playful: Smile, motivating: Target, simple_practical: ListChecks } as const;
const RESTART_ICON = { encouragement: HandHeart, simpler_alternative: Footprints, gentle_push: RotateCcw, give_space: Hourglass } as const;

const card = (on: boolean) =>
  `flex min-h-[64px] w-full items-center gap-3 rounded-xl border px-4 py-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${on ? "border-primary bg-surface shadow-[var(--shadow-sm)]" : "border-line bg-surface hover:border-ink-soft"}`;

export function StyleQuestion({ value, onChange, id = "style-q" }: { value: CommunicationStyle[]; onChange: (v: CommunicationStyle[]) => void; id?: string }) {
  const t = useTranslations();
  const full = value.length >= 2;
  const toggle = (s: CommunicationStyle) => onChange(value.includes(s) ? value.filter((x) => x !== s) : full ? value : [...value, s]);
  return (
    <fieldset aria-describedby={`${id}-hint`}>
      <legend id={id} className="label mb-1">{t("onb.styleQTitle")}</legend>
      <p id={`${id}-hint`} className="hint mb-2">{t("onb.styleQHint")}</p>
      <div className="grid gap-2 sm:grid-cols-2">
        {COMMUNICATION_STYLES.map((s) => {
          const on = value.includes(s);
          const Icon = STYLE_ICON[s];
          return (
            <button key={s} type="button" aria-pressed={on} disabled={!on && full} onClick={() => toggle(s)} className={card(on)}>
              <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${on ? "bg-primary text-primary-ink" : "bg-primary-soft text-primary"}`}><Icon size={20} aria-hidden="true" /></span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold leading-tight">{t(`support.style_${s}`)}</span>
                <span className="text-sm text-ink-soft">{t(`support.style_${s}Desc`)}</span>
              </span>
              {on ? <Check size={18} className="shrink-0 text-primary" aria-hidden="true" /> : null}
            </button>
          );
        })}
      </div>
      <p className="mt-1.5 flex min-h-5 flex-wrap items-center gap-x-3 text-sm text-ink-soft" aria-live="polite">
        {full ? <span>{t("onb.styleMax")}</span> : null}
        {value.length ? <button type="button" className="link" onClick={() => onChange([])}>{t("onb.clearChoice")}</button> : null}
      </p>
    </fieldset>
  );
}

export function RestartQuestion({ value, onChange, id = "restart-q" }: { value: RestartPreference | null; onChange: (v: RestartPreference | null) => void; id?: string }) {
  const t = useTranslations();
  return (
    <fieldset aria-describedby={`${id}-hint`}>
      <legend id={id} className="label mb-1">{t("onb.restartQTitle")}</legend>
      <p id={`${id}-hint`} className="hint mb-2">{t("onb.restartQHint")}</p>
      <div role="radiogroup" aria-labelledby={id} className="grid gap-2 sm:grid-cols-2">
        {RESTART_PREFERENCES.map((r) => {
          const on = value === r;
          const Icon = RESTART_ICON[r];
          return (
            <button key={r} type="button" role="radio" aria-checked={on} onClick={() => onChange(on ? null : r)} className={card(on)}>
              <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${on ? "bg-primary text-primary-ink" : "bg-primary-soft text-primary"}`}><Icon size={20} aria-hidden="true" /></span>
              <span className="min-w-0 flex-1 font-semibold leading-tight">{t(`support.restart_${r}`)}</span>
              {on ? <Check size={18} className="shrink-0 text-primary" aria-hidden="true" /> : null}
            </button>
          );
        })}
      </div>
      {value ? <button type="button" className="link mt-1.5 text-sm" onClick={() => onChange(null)}>{t("onb.clearChoice")}</button> : null}
    </fieldset>
  );
}

/** Hidden inputs so the choices post with the surrounding form. */
export function SupportHiddenInputs({ styles, restart }: { styles: CommunicationStyle[]; restart: RestartPreference | null }) {
  return (
    <>
      {styles.map((s) => <input key={s} type="hidden" name="communication_styles" value={s} />)}
      {restart ? <input type="hidden" name="restart_preference" value={restart} /> : null}
    </>
  );
}
