"use client";
import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { addExtractedDrafts, createPlan, saveItem } from "@/app/actions";
import { Alert } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import type { DraftItem } from "@/domain/extraction";
import { DocPicker } from "@/components/DocPicker";
import { Leaf, Plus, Stethoscope, X } from "lucide-react";

export function CreatePlanForm({ defaultMode }: { defaultMode: "clinician_instructions" | "personal_goal" }) {
  const t = useTranslations();
  const [state, action] = useActionState(createPlan, null);
  const [mode, setMode] = useState(defaultMode);
  return (
    <form action={action} className="flex flex-col gap-3">
      {state?.error ? <Alert tone="danger">{t("common.error")}</Alert> : null}
      <fieldset className="flex flex-col gap-2">
        <legend className="label mb-2">{t("plan.mode")}</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {(["personal_goal", "clinician_instructions"] as const).map((m) => (
            <label key={m} className={`flex cursor-pointer items-start gap-3 rounded-2xl border p-4 transition-colors ${mode === m ? "border-primary bg-primary-soft/60 shadow-[var(--shadow-sm)]" : "border-line hover:border-ink-faint"}`}>
              <input type="radio" name="mode" value={m} checked={mode === m} onChange={() => setMode(m)} className="mt-1 h-5 w-5 accent-[var(--primary)]" />
              <span className="flex-1">
                <span className="flex items-center gap-2 font-semibold">{m === "personal_goal" ? <Leaf size={17} className="text-primary" aria-hidden="true" /> : <Stethoscope size={17} className="text-st-review" aria-hidden="true" />}{t(m === "personal_goal" ? "plan.modePersonal" : "plan.modeClinician")}</span>
                <span className="mt-1 block text-sm text-ink-soft">{t(m === "personal_goal" ? "plan.modePersonalHelp" : "plan.modeClinicianHelp")}</span>
              </span>
            </label>
          ))}
        </div>
        {mode === "clinician_instructions" ? <p className="rounded-xl bg-primary-soft px-3 py-2 text-sm text-ink">{t("intake.noAdvice")}</p> : null}
      </fieldset>
      <div className="field"><label htmlFor="plan-title">{t("plan.planTitle")}</label><input id="plan-title" name="title" className="input" required maxLength={120} /></div>
      {mode === "clinician_instructions" ? (
        <>
          <div className="field"><label htmlFor="clin">{t("plan.clinicianName")} <span className="hint">({t("common.optional")})</span></label><input id="clin" name="clinician_name" className="input" maxLength={120} /></div>
          <div className="field"><label htmlFor="src">{t("plan.sourceDescription")}</label><input id="src" name="source_description" className="input" maxLength={500} placeholder={t("plan.sourceHint")} /></div>
        </>
      ) : null}
      <SubmitButton className="btn btn-primary self-start px-6" pendingLabel={t("common.saving")}>{t("plan.create")}</SubmitButton>
    </form>
  );
}

export interface EditableItem {
  id?: string;
  title: string;
  instructions: string | null;
  category: string;
  schedule_kind: string;
  times: string[];
  weekdays: number[];
  weekly_target: number | null;
  once_date: string | null;
  window_minutes: number;
  evidence_hint: string;
  allowed_alternatives: string | null;
  status?: string;
  unresolved_fields?: string[];
}

const BLANK: EditableItem = { title: "", instructions: "", category: "activity", schedule_kind: "daily", times: ["09:00"], weekdays: [], weekly_target: 3, once_date: null, window_minutes: 180, evidence_hint: "none", allowed_alternatives: "" };

export function ItemForm({ planId, item, clinical, onDone }: { planId: string; item?: EditableItem; clinical: boolean; onDone?: () => void }) {
  const t = useTranslations();
  const [state, action] = useActionState(async (prev: Awaited<ReturnType<typeof saveItem>>, fd: FormData) => {
    // A dropped connection (common on a phone waking up) must not blank the whole screen.
    let r: Awaited<ReturnType<typeof saveItem>>;
    try { r = await saveItem(prev, fd); } catch { r = { error: "network" }; }
    if (r?.ok) onDone?.();
    return r;
  }, null);
  const v = item ?? BLANK;
  const [kind, setKind] = useState(v.schedule_kind);
  const unresolved = v.unresolved_fields ?? [];
  const p = `if-${v.id ?? "new"}`;
  return (
    // Enter / the keyboard's Go key would submit with the first button ("Save as draft"):
    // only the buttons save, so a half-typed edit never silently lands as a draft.
    <form action={action} className="flex flex-col gap-3" onKeyDown={(e) => { if (e.key === "Enter" && (e.target as HTMLElement).tagName === "INPUT") e.preventDefault(); }}>
      <input type="hidden" name="plan_id" value={planId} />
      {v.id ? <input type="hidden" name="item_id" value={v.id} /> : null}
      {v.status === "confirmed" ? <Alert tone="warn">{t("plan.editConfirmedWarning")}</Alert> : null}
      {clinical && v.id ? <Alert tone="warn">{t("plan.clinicalEditWarning")}</Alert> : null}
      {unresolved.length ? (
        <Alert tone="warn">
          <strong className="block">{t("plan.unresolved")}</strong>
          {t("plan.unresolvedHelp")}
          <ul className="mt-1 list-disc pl-6">{unresolved.map((f) => <li key={f}>{t("plan.unresolvedField", { field: f })}</li>)}</ul>
        </Alert>
      ) : null}
      {state?.error ? <Alert tone="danger">{itemError(t, state.error)}</Alert> : null}
      {state?.ok ? <Alert tone="ok">{t("common.saved")}</Alert> : null}
      <div className="field"><label htmlFor={`${p}-title`}>{t("plan.itemTitle")}</label><input id={`${p}-title`} name="title" defaultValue={v.title} required maxLength={120} className="input" /></div>
      <div className="field"><label htmlFor={`${p}-ins`}>{t("plan.itemInstructions")}</label><textarea id={`${p}-ins`} name="instructions" defaultValue={v.instructions ?? ""} maxLength={1000} rows={2} className="input" /></div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="field"><label htmlFor={`${p}-cat`}>{t("plan.category")}</label>
          <select id={`${p}-cat`} name="category" defaultValue={v.category} className="input">
            {["medication", "activity", "measurement", "nutrition", "appointment", "rest", "other"].map((c) => <option key={c} value={c}>{t(`plan.cat_${c}`)}</option>)}
          </select>
        </div>
        <div className="field"><label htmlFor={`${p}-sk`}>{t("plan.schedule")}</label>
          <select id={`${p}-sk`} name="schedule_kind" value={kind} onChange={(e) => setKind(e.target.value)} className="input">
            {["daily", "weekdays", "weekly_target", "once"].map((s) => <option key={s} value={s}>{t(`plan.sched_${s}`)}</option>)}
          </select>
        </div>
      </div>
      {kind !== "weekly_target" ? (
        <TimesField id={`${p}-times`} initial={v.times} />
      ) : (
        <div className="field"><label htmlFor={`${p}-wt`}>{t("plan.weeklyTarget")}</label><input id={`${p}-wt`} name="weekly_target" type="number" min={1} max={7} defaultValue={v.weekly_target ?? 3} className="input w-32" /></div>
      )}
      {kind === "weekdays" ? (
        <fieldset><legend className="label mb-1">{t("plan.weekdays")}</legend>
          <div className="flex flex-wrap gap-2">{[1, 2, 3, 4, 5, 6, 7].map((d) => <label key={d} className="chip min-h-10 cursor-pointer"><input type="checkbox" name="weekdays" value={d} defaultChecked={v.weekdays.includes(d)} className="h-5 w-5" />{t(`weekday.${d}`)}</label>)}</div>
        </fieldset>
      ) : null}
      {kind === "once" ? <div className="field"><label htmlFor={`${p}-od`}>{t("plan.onceDate")}</label><input id={`${p}-od`} name="once_date" type="date" defaultValue={v.once_date ?? ""} className="input w-48" required /></div> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="field"><label htmlFor={`${p}-win`}>{t("plan.window")}</label><input id={`${p}-win`} name="window_minutes" type="number" min={15} max={1440} defaultValue={v.window_minutes} className="input" /></div>
        <div className="field"><label htmlFor={`${p}-ev`}>{t("plan.evidenceHint")}</label>
          <select id={`${p}-ev`} name="evidence_hint" defaultValue={v.evidence_hint} className="input">{["none", "photo", "text", "any"].map((e) => <option key={e} value={e}>{t(`plan.ev_${e}`)}</option>)}</select>
        </div>
      </div>
      {clinical ? <div className="field"><label htmlFor={`${p}-alt`}>{t("plan.alternatives")}</label><input id={`${p}-alt`} name="allowed_alternatives" defaultValue={v.allowed_alternatives ?? ""} maxLength={500} className="input" aria-describedby={`${p}-ah`} /><span id={`${p}-ah`} className="hint">{t("plan.alternativesHint")}</span></div> : null}
      {unresolved.length ? <label className="flex items-start gap-3"><input type="checkbox" name="resolved" className="mt-1 h-6 w-6" required />{t("plan.markResolved")}</label> : null}
      <p className="hint">{t("plan.confirmHelp")}</p>
      <div className="flex flex-wrap gap-2">
        <SubmitButton className="btn btn-secondary" name="intent" value="draft" pendingLabel={t("common.saving")}>{t("plan.saveDraft")}</SubmitButton>
        <SubmitButton name="intent" value="confirm" pendingLabel={t("common.saving")}>{t("plan.confirm")}</SubmitButton>
      </div>
    </form>
  );
}

const ITEM_ERRORS = ["times_required", "invalid_time", "weekdays_required", "weekly_target_required", "date_required", "network"];
function itemError(t: ReturnType<typeof useTranslations>, code: string) {
  if (code === "unresolved_fields") return t("plan.unresolvedHelp");
  return ITEM_ERRORS.includes(code) ? t(`plan.err_${code}`) : t("common.error");
}

/** Reminder times as native clock pickers (one row per time), sent as the comma list the server expects. */
function TimesField({ id, initial }: { id: string; initial: string[] }) {
  const t = useTranslations();
  const [times, setTimes] = useState<string[]>(initial.length ? initial : ["09:00"]);
  const set = (i: number, val: string) => setTimes((ts) => ts.map((x, j) => (j === i ? val : x)));
  return (
    <fieldset className="field">
      <legend className="label mb-1">{t("plan.times")}</legend>
      <input type="hidden" name="times" value={times.filter(Boolean).join(",")} />
      <div className="flex flex-col gap-2">
        {times.map((tm, i) => (
          <div key={i} className="flex items-center gap-2">
            <input id={i === 0 ? id : undefined} type="time" value={tm} onChange={(e) => set(i, e.target.value)} required aria-label={i === 0 ? t("plan.times") : `${t("plan.times")} ${i + 1}`} className="input w-36 tabular-nums" />
            {times.length > 1 ? <button type="button" className="btn btn-ghost px-3 text-ink-soft" aria-label={t("plan.removeTime")} onClick={() => setTimes((ts) => ts.filter((_, j) => j !== i))}><X size={16} aria-hidden="true" /></button> : null}
          </div>
        ))}
      </div>
      {times.length < 8 ? <button type="button" className="btn btn-ghost mt-1 self-start px-2 text-sm text-primary" onClick={() => setTimes((ts) => [...ts, ""])}><Plus size={15} aria-hidden="true" />{t("plan.addTime")}</button> : null}
    </fieldset>
  );
}

export function EditItemToggle({ planId, item, clinical }: { planId: string; item: EditableItem; clinical: boolean }) {
  const t = useTranslations();
  // Collapsed by default: eight open forms at once was overwhelming. Drafts get a primary button instead.
  const [open, setOpen] = useState(false);
  return open ? (
    <div className="mt-3 rounded-xl border border-line p-3"><ItemForm planId={planId} item={item} clinical={clinical} onDone={() => setOpen(false)} /></div>
  ) : (
    <button type="button" className={`btn ${item.status === "draft" ? "btn-primary" : "btn-secondary"}`} onClick={() => setOpen(true)}>{t("plan.edit")}</button>
  );
}

/** Readable list of unresolved field names. */
function fieldList(t: ReturnType<typeof useTranslations>, fields: string[]) {
  const known = ["title", "instructions", "frequency", "times", "dose", "unit", "schedule"];
  return fields.map((f) => (known.includes(f) ? t(`doc.field_${f}`) : f)).join(", ");
}

export function DraftPreview({ d }: { d: DraftItem }) {
  const t = useTranslations();
  const conf = d.confidence;
  return (
    <span className="flex flex-col gap-1">
      <span className="flex flex-wrap items-center gap-2">
        <span className="font-semibold">{d.title}</span>
        {conf ? <span className={`chip ${conf === "high" ? "" : "bg-warn-bg text-warn-ink"}`}>{t(`doc.conf_${conf}`)}</span> : null}
      </span>
      {d.alternatives?.length ? <span className="hint">{t("doc.couldBe", { names: d.alternatives.join(" / ") })}</span> : null}
      {d.instructions ? <span>{d.instructions}</span> : null}
      {d.times.length ? <span className="hint">{d.suggested_times ? t("doc.suggestedTimes", { times: d.times.join(", ") }) : d.times.join(", ")}</span> : null}
      <span className="hint">{t("plan.source")}{d.source_page ? ` · ${t("plan.sourcePage", { page: d.source_page })}` : ""}: “{d.source_snippet}”</span>
      {d.unresolved_fields.length ? <span className="chip mt-1 self-start bg-warn-bg text-warn-ink">{t("doc.checkFields", { fields: fieldList(t, d.unresolved_fields) })}</span> : null}
    </span>
  );
}

export function ExtractUpload({ planId }: { planId: string }) {
  const t = useTranslations();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<{ document_id: string; drafts: DraftItem[]; injection: boolean; warnings?: string[] } | null>(null);
  const [state, addAction] = useActionState(addExtractedDrafts, null);

  async function upload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setBusy(true);
    setErr(null);
    setResult(null);
    try {
      const res = await fetch("/api/plan/extract", { method: "POST", body: fd, signal: AbortSignal.timeout(125_000) });
      const j = await res.json();
      if (!res.ok) setErr(t("plan.extractFailed"));
      else if (!j.ok) setErr(j.error === "unconfigured" ? t("plan.extractUnavailable") : j.error === "no_consent" ? t("plan.extractNoConsent") : t("plan.extractFailed"));
      else setResult(j);
    } catch {
      setErr(t("plan.extractFailed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <form onSubmit={upload} className="flex flex-col gap-2">
        <label htmlFor="src-file" className="sr-only">{t("plan.upload")}</label>
        <DocPicker id="src-file" required />
        <span id="src-help" className="hint">{t("plan.uploadHelp")}</span>
        <button className="btn btn-secondary self-start" disabled={busy}>{busy ? t("doc.reading") : t("doc.read")}</button>
      </form>
      <div aria-live="polite">{err ? <Alert tone="warn">{err}</Alert> : null}</div>
      {result ? (
        <form action={addAction} className="flex flex-col gap-2">
          <input type="hidden" name="plan_id" value={planId} />
          <input type="hidden" name="document_id" value={result.document_id} />
          <h3 className="font-bold">{t("plan.drafts")}</h3>
          <p className="hint">{t("doc.reviewNote")}</p>
          {result.injection ? <Alert tone="danger">{t("plan.injectionWarning")}</Alert> : null}
          {result.drafts.length === 0 ? <p>{t("plan.extractFailed")}</p> : null}
          {result.drafts.map((d, i) => (
            <label key={i} className="flex items-start gap-3 rounded-xl border border-line p-3">
              <input type="checkbox" name="pick" value={i} defaultChecked className="mt-1 h-5 w-5" />
              <DraftPreview d={d} />
            </label>
          ))}
          {state?.ok ? <Alert tone="ok">{t("common.saved")}</Alert> : null}
          {state?.error ? <Alert tone="danger">{t("common.error")}</Alert> : null}
          {result.drafts.length ? <SubmitButton pendingLabel={t("common.saving")}>{t("plan.addDrafts")}</SubmitButton> : null}
        </form>
      ) : null}
    </div>
  );
}
