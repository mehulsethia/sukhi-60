"use client";
import Link from "next/link";
import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { Annoyed, Frown, HeartHandshake, Laugh, Meh, Package, Smile, Wind } from "lucide-react";
import { pausePlanUntil, saveMood, setStock, shareNotWellAction } from "@/app/actions";
import { Alert } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";

// ---------------------------------------------------------------------------
// Medicine stock: a count only. Never changes the schedule or dose.
// ---------------------------------------------------------------------------
export function StockForm({ itemId, stock, perDose, daysLeft }: { itemId: string; stock: number | null; perDose: number; daysLeft: number | null }) {
  const t = useTranslations("companion");
  const tc = useTranslations("common");
  const [state, action] = useActionState(setStock, null);
  const [open, setOpen] = useState(false);
  const low = daysLeft !== null && daysLeft <= 5;
  return (
    <div className="mt-3 rounded-xl border border-line bg-surface-2 p-3 sm:ml-10">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-semibold"><Package size={16} aria-hidden="true" />
          {stock === null ? t("stockNone") : t("stockLeft", { n: stock })}
          {daysLeft !== null ? <span className={`chip ${low ? "bg-warn-bg text-warn-ink" : ""}`}>{t("stockDays", { days: daysLeft })}</span> : null}
        </p>
        <button type="button" className="link text-sm" aria-expanded={open} onClick={() => setOpen((v) => !v)}>{stock === null ? t("stockTrack") : t("stockUpdate")}</button>
      </div>
      {open ? (
        <form action={action} className="mt-3 flex flex-wrap items-end gap-3">
          <input type="hidden" name="item_id" value={itemId} />
          <div className="field"><label htmlFor={`sc-${itemId}`} className="!text-sm">{t("stockCount")}</label><input id={`sc-${itemId}`} name="count" type="number" min={0} max={10000} inputMode="numeric" defaultValue={stock ?? ""} className="input w-28" required /></div>
          <div className="field"><label htmlFor={`pd-${itemId}`} className="!text-sm">{t("stockPerDose")}</label><input id={`pd-${itemId}`} name="units_per_dose" type="number" min={1} max={20} inputMode="numeric" defaultValue={perDose} className="input w-24" /></div>
          <SubmitButton className="btn btn-secondary" name="mode" value="set" pendingLabel={tc("saving")}>{t("stockSet")}</SubmitButton>
          <SubmitButton className="btn btn-ghost" name="mode" value="add" pendingLabel={tc("saving")}>{t("stockAdd")}</SubmitButton>
          {stock !== null ? <SubmitButton className="btn btn-ghost text-sm" name="mode" value="clear" pendingLabel={tc("saving")}>{t("stockStop")}</SubmitButton> : null}
          <p className="hint w-full text-xs">{t("stockHint")}</p>
        </form>
      ) : null}
      <div aria-live="polite">{state?.error ? <Alert tone="danger">{tc("error")}</Alert> : null}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pause a plan until a date
// ---------------------------------------------------------------------------
export function PauseUntilForm({ planId, minDate, maxDate }: { planId: string; minDate: string; maxDate: string }) {
  const t = useTranslations("companion");
  const tc = useTranslations("common");
  const [state, action] = useActionState(pausePlanUntil, null);
  const [open, setOpen] = useState(false);
  if (!open) return <button type="button" className="btn btn-secondary" onClick={() => setOpen(true)}>{t("pauseUntil")}</button>;
  return (
    <form action={action} className="flex w-full flex-wrap items-end gap-3 rounded-xl border border-line bg-surface p-3">
      <input type="hidden" name="plan_id" value={planId} />
      <div className="field"><label htmlFor={`pu-${planId}`} className="!text-sm">{t("pauseDate")}</label><input id={`pu-${planId}`} name="until" type="date" min={minDate} max={maxDate} required className="input" /></div>
      <div className="field"><label htmlFor={`pr-${planId}`} className="!text-sm">{t("pauseReason")}</label>
        <select id={`pr-${planId}`} name="reason" className="input" defaultValue="travel">{["travel", "festival", "fasting", "unwell", "other"].map((r) => <option key={r} value={r}>{t(`reason_${r}`)}</option>)}</select>
      </div>
      <SubmitButton className="btn btn-primary" pendingLabel={tc("saving")}>{t("pauseSave")}</SubmitButton>
      <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>{tc("cancel")}</button>
      <p className="hint w-full text-xs">{t("pauseHint")}</p>
      {state?.error ? <div className="w-full"><Alert tone="danger">{state.error === "invalid_date" ? t("pauseBadDate") : tc("error")}</Alert></div> : null}
    </form>
  );
}

// ---------------------------------------------------------------------------
// Mood, stress and sleep: one quick, optional check-in per day
// ---------------------------------------------------------------------------
const FACES = [Frown, Annoyed, Meh, Smile, Laugh];

export function MoodCard({ today }: { today: { mood: number; stress: number | null; sleep_quality: number | null; sleep_hours: number | null } | null }) {
  const t = useTranslations("companion");
  const tc = useTranslations("common");
  const [state, action] = useActionState(saveMood, null);
  const [editing, setEditing] = useState(!today);
  const [mood, setMood] = useState<number | null>(today?.mood ?? null);
  const [stress, setStress] = useState<number | null>(today?.stress ?? null);
  const [sleep, setSleep] = useState<number | null>(today?.sleep_quality ?? null);
  const low = (state?.ok && state.data?.low) || (!state && today && (today.mood <= 2 || today.stress === 3));
  const chip = (on: boolean) => `pill-btn min-h-10 px-3 text-sm ${on ? "pill-btn-primary" : ""}`;

  return (
    <div className="panel p-5">
      <p className="font-bold">{t("moodTitle")}</p>
      {!editing && today ? (
        <div className="mt-2">
          <p className="flex items-center gap-2">{(() => { const F = FACES[today.mood - 1]; return <F size={22} className="text-primary" aria-hidden="true" />; })()}{t(`mood_${today.mood}`)}{today.sleep_quality ? ` · ${t(`sleep_${today.sleep_quality}`)}` : ""}</p>
          <button type="button" className="link mt-1 text-sm" onClick={() => setEditing(true)}>{t("moodEdit")}</button>
        </div>
      ) : (
        <form action={async (fd) => { await action(fd); setEditing(false); }} className="mt-3 flex flex-col gap-3">
          <div role="radiogroup" aria-label={t("moodTitle")} className="flex justify-between gap-1">
            {FACES.map((F, i) => (
              <button key={i} type="button" role="radio" aria-checked={mood === i + 1} aria-label={t(`mood_${i + 1}`)} onClick={() => setMood(i + 1)} className={`flex h-12 w-12 items-center justify-center rounded-full border transition-colors ${mood === i + 1 ? "border-primary bg-primary text-primary-ink" : "border-line bg-surface text-ink-soft hover:border-ink-soft"}`}><F size={24} aria-hidden="true" /></button>
            ))}
          </div>
          {mood ? <input type="hidden" name="mood" value={mood} /> : null}
          <fieldset><legend className="label mb-1 !text-sm">{t("stressQ")} <span className="hint font-normal">({tc("optional")})</span></legend>
            <div className="flex flex-wrap gap-1.5">{[1, 2, 3].map((n) => <button key={n} type="button" aria-pressed={stress === n} onClick={() => setStress(stress === n ? null : n)} className={chip(stress === n)}>{t(`stress_${n}`)}</button>)}</div>
            {stress ? <input type="hidden" name="stress" value={stress} /> : null}
          </fieldset>
          <fieldset><legend className="label mb-1 !text-sm">{t("sleepQ")} <span className="hint font-normal">({tc("optional")})</span></legend>
            <div className="flex flex-wrap items-center gap-1.5">
              {[1, 2, 3].map((n) => <button key={n} type="button" aria-pressed={sleep === n} onClick={() => setSleep(sleep === n ? null : n)} className={chip(sleep === n)}>{t(`sleep_${n}`)}</button>)}
              <label className="sr-only" htmlFor="sleep-hours">{t("sleepHours")}</label>
              <select id="sleep-hours" name="sleep_hours" defaultValue={today?.sleep_hours ?? ""} className="input min-h-10 w-auto py-1 text-sm">
                <option value="">{t("sleepHours")}</option>
                {Array.from({ length: 25 }, (_, i) => i / 2 + 2).map((h) => <option key={h} value={h}>{t("hours", { n: h })}</option>)}
              </select>
            </div>
            {sleep ? <input type="hidden" name="sleep_quality" value={sleep} /> : null}
          </fieldset>
          <SubmitButton className="btn btn-primary self-start" pendingLabel={tc("saving")} disabled={!mood}>{tc("save")}</SubmitButton>
          {state?.error ? <Alert tone="danger">{tc("error")}</Alert> : null}
        </form>
      )}
      {low ? (
        <div className="mt-3 rounded-xl bg-sky p-3 text-sm">
          <p>{t("lowMood")}</p>
          <Link href="/breathe" className="pill-btn pill-btn-primary mt-2 min-h-10"><Wind size={16} aria-hidden="true" />{t("breatheCta")}</Link>
          <p className="hint mt-2 text-xs">{t("helpline")}</p>
        </div>
      ) : (
        <Link href="/breathe" className="link mt-3 inline-flex items-center gap-1.5 text-sm"><Wind size={15} aria-hidden="true" />{t("breatheCta")}</Link>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// "Let my family know" after telling Sukhi you're not well (patient-initiated, per event)
// ---------------------------------------------------------------------------
export function TellFamilyButton() {
  const t = useTranslations("companion");
  const [state, setState] = useState<"idle" | "busy" | "sent" | "none">("idle");
  if (state === "sent") return <p className="mt-2 text-sm font-semibold text-ok-ink" role="status">{t("familyTold")}</p>;
  if (state === "none") return <p className="mt-2 text-sm text-ink-soft" role="status">{t("familyNone")}</p>;
  return (
    <button type="button" className="pill-btn mt-2 min-h-10" disabled={state === "busy"} onClick={async () => { setState("busy"); const r = await shareNotWellAction(); setState(r.sent > 0 ? "sent" : "none"); }}>
      <HeartHandshake size={16} aria-hidden="true" />{t("familyTell")}
    </button>
  );
}
