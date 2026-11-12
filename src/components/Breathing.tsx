"use client";
// Guided breathing: 4 s in, 4 s hold, 6 s out. A calm exercise, not a treatment.
// Respects "reduce motion" (text countdown only) and works without audio.
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Play, Square } from "lucide-react";

const PHASES = [
  { key: "in", secs: 4, scale: 1 },
  { key: "hold", secs: 4, scale: 1 },
  { key: "out", secs: 6, scale: 0.55 },
] as const;
const CYCLE = PHASES.reduce((a, p) => a + p.secs, 0);

export function Breathing() {
  const t = useTranslations("companion");
  const [minutes, setMinutes] = useState(1);
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const total = minutes * 60;

  // "active" is derived, so the timer simply stops when the session's time is up.
  const active = running && elapsed < total;
  useEffect(() => {
    if (!active) return;
    timer.current = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [active]);

  const inCycle = elapsed % CYCLE;
  let acc = 0;
  let phase: (typeof PHASES)[number] = PHASES[0];
  let left = PHASES[0].secs;
  for (const p of PHASES) {
    if (inCycle < acc + p.secs) { phase = p; left = acc + p.secs - inCycle; break; }
    acc += p.secs;
  }
  const finished = running && elapsed >= total;

  return (
    <div className="flex flex-col items-center gap-6 text-center">
      <div className="relative flex h-64 w-64 items-center justify-center" aria-hidden="true">
        <span
          className="absolute inset-0 rounded-full bg-primary-soft motion-safe:transition-transform motion-safe:ease-in-out"
          style={{ transform: `scale(${active ? phase.scale : 0.55})`, transitionDuration: `${active ? phase.secs : 0.6}s` }}
        />
        <span className="absolute inset-[30%] rounded-full bg-primary/80" />
      </div>
      <p className="text-2xl font-semibold" aria-live="polite">
        {finished ? t("breatheDone") : active ? `${t(`breathe_${phase.key}`)} · ${left}` : t("breatheReady")}
      </p>
      {!active ? (
        <div className="flex flex-col items-center gap-3">
          <div role="radiogroup" aria-label={t("breatheLength")} className="flex gap-2">
            {[1, 3, 5].map((m) => <button key={m} type="button" role="radio" aria-checked={minutes === m} onClick={() => setMinutes(m)} className={`pill-btn min-h-11 px-4 ${minutes === m ? "pill-btn-primary" : ""}`}>{t("minutes", { n: m })}</button>)}
          </div>
          <button type="button" className="btn btn-primary btn-lg" onClick={() => { setElapsed(0); setRunning(true); }}><Play size={18} aria-hidden="true" />{t("breatheStart")}</button>
        </div>
      ) : (
        <button type="button" className="btn btn-secondary" onClick={() => { setRunning(false); setElapsed(0); }}><Square size={16} aria-hidden="true" />{t("breatheStop")}</button>
      )}
    </div>
  );
}
