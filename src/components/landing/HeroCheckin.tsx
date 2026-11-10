"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Check } from "lucide-react";
import { DAY_LABELS, DEMO_CARD } from "./samples";

type Lang = keyof typeof DEMO_CARD;
const LANG_LABEL: Record<Lang, string> = { en: "EN", hi: "हिं", mr: "मरा" };
const BEFORE = [1, 1, 0, 1, 1, 0, 0]; // fictional week so far; index 5 is "today"
const TODAY = 5;

// Landing hero: a faithful, interactive preview of the Today screen.
export function HeroCheckin() {
  const t = useTranslations("landing");
  const [lang, setLang] = useState<Lang>("en");
  const [done, setDone] = useState(false);
  const c = DEMO_CARD[lang];
  const week = BEFORE.map((v, i) => (i === TODAY && done ? 1 : v));

  return (
    <div className="mx-auto w-full max-w-[392px] rounded-[28px] border border-line bg-surface p-5 shadow-[var(--shadow-lg)] sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-ink-soft">{t("demoLabel")}</p>
        <div role="radiogroup" aria-label={t("demoLanguage")} className="flex rounded-lg border border-line bg-surface-2 p-0.5">
          {(Object.keys(DEMO_CARD) as Lang[]).map((l) => (
            <button key={l} type="button" role="radio" aria-checked={lang === l} onClick={() => setLang(l)} className={`min-h-8 min-w-10 rounded-md px-2 text-sm font-semibold transition-colors ${lang === l ? "bg-surface text-ink shadow-[var(--shadow-sm)]" : "text-ink-soft hover:text-ink"}`}>
              {LANG_LABEL[l]}
            </button>
          ))}
        </div>
      </div>

      <p className="display mt-5 text-[1.6rem] font-semibold">{c.greeting}</p>

      <div className="mt-4 rounded-2xl border border-line p-4">
        <div className="flex items-baseline justify-between">
          <p className="text-sm font-semibold">{c.week}</p>
          <p className="text-sm tabular-nums text-ink-soft">{(done ? 23 : 18)} {c.points}</p>
        </div>
        <div className="mt-3 grid grid-cols-7 gap-1.5" aria-hidden="true">
          {week.map((on, i) => (
            <div key={i} className="flex flex-col items-center gap-1">
              <div className={`flex h-8 w-full items-center justify-center rounded-md transition-colors duration-300 ${on ? "bg-primary text-primary-ink" : i === TODAY ? "border border-dashed border-line-strong" : "bg-surface-2"}`}>{on ? <Check size={13} /> : null}</div>
              <span className={`text-[0.68rem] ${i === TODAY ? "font-semibold text-ink" : "text-ink-faint"}`}>{DAY_LABELS[lang][i]}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-3 rounded-2xl border border-line p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-primary">{c.time}</p>
            <p className="display text-lg font-semibold leading-snug">{c.item}</p>
            <p className="text-sm text-ink-soft">{c.detail}</p>
          </div>
        </div>
        {done ? (
          <p role="status" className="pop-in mt-4 flex items-center gap-2 rounded-lg bg-ok-bg px-3 py-2.5 text-[0.95rem] font-semibold text-ok-ink">
            <Check size={18} aria-hidden="true" />{c.recorded}
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
  );
}
