"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { DEMO_CARD } from "./samples";

type Lang = keyof typeof DEMO_CARD;
const LANG_LABEL: Record<Lang, string> = { en: "EN", hi: "हिं", mr: "मरा" };

// The landing page's one orchestrated moment: a real-feeling check-in that grows a plant.
export function HeroCheckin() {
  const t = useTranslations("landing");
  const [lang, setLang] = useState<Lang>("en");
  const [done, setDone] = useState(false);
  const c = DEMO_CARD[lang];
  const points = done ? 21 : 18;

  return (
    <div className="relative mx-auto w-full max-w-[400px]">
      {/* soft indigo halo */}
      <div aria-hidden="true" className="absolute -inset-6 rounded-[44px] bg-[radial-gradient(60%_60%_at_50%_40%,color-mix(in_srgb,var(--primary)_22%,transparent),transparent)]" />
      <div className="relative overflow-hidden rounded-[32px] border border-line bg-surface shadow-[var(--shadow-lg)]">
        <div className="flex items-center justify-between px-5 pt-5">
          <p className="text-sm font-semibold text-ink-soft">{t("demoLabel")}</p>
          <div role="radiogroup" aria-label={t("demoLanguage")} className="flex rounded-full bg-surface-2 p-1">
            {(Object.keys(DEMO_CARD) as Lang[]).map((l) => (
              <button key={l} type="button" role="radio" aria-checked={lang === l} onClick={() => setLang(l)} className={`min-h-9 min-w-11 rounded-full px-2.5 text-sm font-semibold transition-colors ${lang === l ? "bg-surface text-ink shadow-[var(--shadow-sm)]" : "text-ink-soft"}`}>
                {LANG_LABEL[l]}
              </button>
            ))}
          </div>
        </div>

        <div className="px-5 pb-2 pt-4">
          <p className="display text-2xl font-bold">{c.greeting}</p>
        </div>

        {/* Garden */}
        <div className="relative mx-5 h-44 overflow-hidden rounded-[22px] bg-[linear-gradient(180deg,var(--surface-2),var(--leaf-soft))]">
          <svg viewBox="0 0 320 176" className="absolute inset-0 h-full w-full" aria-hidden="true">
            <circle cx="262" cy="44" r="18" fill="var(--sun)" opacity="0.9" />
            <ellipse cx="160" cy="170" rx="150" ry="22" fill="#8a6a4a" opacity="0.28" />
            <path d="M160 162 C160 130 158 108 160 84" stroke="var(--leaf)" strokeWidth="6" strokeLinecap="round" fill="none" />
            <path d="M160 132 C140 130 128 116 130 104 C146 106 158 118 160 132Z" fill="var(--leaf)" />
            <path d="M160 116 C180 114 192 100 190 88 C174 90 162 102 160 116Z" fill="var(--leaf)" />
            {done ? (
              <g key={lang + "grow"}>
                <path className="grow-in" d="M160 96 C144 92 136 78 140 66 C154 70 162 82 160 96Z" fill="var(--leaf)" />
                <g className="grow-in" style={{ animationDelay: "180ms" }}>
                  {[0, 72, 144, 216, 288].map((a) => (
                    <circle key={a} cx={160 + 9 * Math.cos((a * Math.PI) / 180)} cy={76 + 9 * Math.sin((a * Math.PI) / 180)} r="7.5" fill="var(--bloom)" />
                  ))}
                  <circle cx="160" cy="76" r="6" fill="var(--sun)" />
                </g>
              </g>
            ) : null}
          </svg>
          <p className="absolute bottom-3 left-4 rounded-full bg-surface/90 px-3 py-1 text-sm font-semibold text-ink backdrop-blur" aria-live="polite">
            {points} {c.points}
          </p>
        </div>

        {/* Action */}
        <div className="p-5">
          <div className="rounded-[20px] border border-line p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-lg font-bold leading-tight">{c.item}</p>
                <p className="text-sm text-ink-soft">{c.detail}</p>
              </div>
              <span className="chip shrink-0 bg-accent-soft text-accent-ink">{c.time}</span>
            </div>
            {done ? (
              <p role="status" className="pop-in mt-4 flex items-center gap-2 rounded-2xl bg-ok-bg px-4 py-3 font-semibold text-ok-ink">
                <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="10" fill="var(--leaf)" /><path d="m6 10.5 2.6 2.5L14 7.5" stroke="#fff" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
                {c.recorded}
              </p>
            ) : (
              <div className="mt-4 grid grid-cols-[1fr_auto] gap-2">
                <button type="button" className="btn btn-primary" onClick={() => setDone(true)}>{c.done}</button>
                <button type="button" className="btn btn-secondary" disabled>{c.later}</button>
              </div>
            )}
          </div>
          <p className="mt-3 text-center text-sm text-ink-soft">
            {done ? <button type="button" className="link" onClick={() => setDone(false)}>{t("demoAgain")}</button> : t("demoHint")}
          </p>
        </div>
      </div>
    </div>
  );
}
