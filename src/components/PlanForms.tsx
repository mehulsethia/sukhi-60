"use client";
import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { addExtractedDrafts, createPlan, saveItem } from "@/app/actions";
import { Alert } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import type { DraftItem } from "@/domain/extraction";
import { shrinkImage } from "@/lib/client-image";

export function CreatePlanForm({ defaultMode }: { defaultMode: "clinician_instructions" | "personal_goal" }) {
  const t = useTranslations();
  const [state, action] = useActionState(createPlan, null);
  const [mode, setMode] = useState(defaultMode);
  return (
    <form action={action} className="flex flex-col gap-3">
      {state?.error ? <Alert tone="danger">{t("common.error")}</Alert> : null}
      <fieldset className="flex flex-col gap-2">
        <legend className="label mb-1">{t("plan.mode")}</legend>
        {(["personal_goal", "clinician_instructions"] as const).map((m) => (
          <label key={m} className="flex items-start gap-3 rounded-xl border border-line p-3">
            <input type="radio" name="mode" value={m} checked={mode === m} onChange={() => setMode(m)} className="mt-1 h-5 w-5" />
            <span><span className="block font-semibold">{t(m === "personal_goal" ? "plan.modePersonal" : "plan.modeClinician")}</span><span className="hint">{t(m === "personal_goal" ? "plan.modePersonalHelp" : "plan.modeClinicianHelp")}</span></span>
          </label>
        ))}
      </fieldset>
      <div className="field"><label htmlFor="plan-title">{t("plan.planTitle")}</label><input id="plan-title" name="title" className="input" required maxLength={120} /></div>
      {mode === "clinician_instructions" ? (
        <>
          <div className="field"><label htmlFor="clin">{t("plan.clinicianName")} <span className="hint">({t("common.optional")})</span></label><input id="clin" name="clinician_name" className="input" maxLength={120} /></div>
          <div className="field"><label htmlFor="src">{t("plan.sourceDescription")}</label><input id="src" name="source_description" className="input" maxLength={500} placeholder={t("plan.sourceHint")} /></div>
        </>
      ) : null}
      <SubmitButton pendingLabel={t("common.saving")}>{t("plan.create")}</SubmitButton>
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
    const r = await saveItem(prev, fd);
    if (r?.ok) onDone?.();
    return r;
  }, null);
  const v = item ?? BLANK;
  const [kind, setKind] = useState(v.schedule_kind);
  const unresolved = v.unresolved_fields ?? [];
  const p = `if-${v.id ?? "new"}`;
  return (
    <form action={action} className="flex flex-col gap-3">
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
      {state?.error ? <Alert tone="danger">{state.error === "unresolved_fields" ? t("plan.unresolvedHelp") : t("common.error")}</Alert> : null}
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
        <div className="field"><label htmlFor={`${p}-times`}>{t("plan.times")}</label><input id={`${p}-times`} name="times" defaultValue={v.times.join(", ")} className="input" aria-describedby={`${p}-th`} pattern="^\s*([01]\d|2[0-3]):[0-5]\d(\s*,\s*([01]\d|2[0-3]):[0-5]\d)*\s*$" /><span id={`${p}-th`} className="hint">{t("plan.timesHint")}</span></div>
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

export function EditItemToggle({ planId, item, clinical }: { planId: string; item: EditableItem; clinical: boolean }) {
  const t = useTranslations();
  const [open, setOpen] = useState(item.status === "draft" && (item.unresolved_fields?.length ?? 0) > 0);
  return open ? (
    <div className="mt-3 rounded-xl border border-line p-3"><ItemForm planId={planId} item={item} clinical={clinical} onDone={() => setOpen(false)} /></div>
  ) : (
    <button type="button" className="btn btn-secondary" onClick={() => setOpen(true)}>{t("plan.edit")}</button>
  );
}

export function ExtractUpload({ planId }: { planId: string }) {
  const t = useTranslations();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<{ document_id: string; drafts: DraftItem[]; injection: boolean } | null>(null);
  const [state, addAction] = useActionState(addExtractedDrafts, null);

  async function upload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setBusy(true);
    setErr(null);
    setResult(null);
    try {
      const file = fd.get("file");
      if (file instanceof File && file.size > 0) fd.set("file", await shrinkImage(file));
      const res = await fetch("/api/plan/extract", { method: "POST", body: fd, signal: AbortSignal.timeout(90_000) });
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
        <label htmlFor="src-file" className="label">{t("plan.upload")}</label>
        <input id="src-file" name="file" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" required className="input" aria-describedby="src-help" />
        <span id="src-help" className="hint">{t("plan.uploadHelp")}</span>
        <button className="btn btn-secondary self-start" disabled={busy}>{busy ? t("plan.uploading") : t("common.save")}</button>
      </form>
      <div aria-live="polite">{err ? <Alert tone="warn">{err}</Alert> : null}</div>
      {result ? (
        <form action={addAction} className="flex flex-col gap-2">
          <input type="hidden" name="plan_id" value={planId} />
          <input type="hidden" name="document_id" value={result.document_id} />
          <h3 className="font-bold">{t("plan.drafts")}</h3>
          {result.injection ? <Alert tone="danger">{t("plan.injectionWarning")}</Alert> : null}
          {result.drafts.length === 0 ? <p>{t("plan.extractFailed")}</p> : null}
          {result.drafts.map((d, i) => (
            <label key={i} className="flex items-start gap-3 rounded-xl border border-line p-3">
              <input type="checkbox" name="pick" value={i} defaultChecked className="mt-1 h-5 w-5" />
              <span>
                <span className="block font-semibold">{d.title}</span>
                {d.instructions ? <span className="block">{d.instructions}</span> : null}
                <span className="hint block">{t("plan.source")}{d.source_page ? ` · ${t("plan.sourcePage", { page: d.source_page })}` : ""}: “{d.source_snippet}”</span>
                {d.unresolved_fields.length ? <span className="chip mt-1 bg-warn-bg text-warn-ink">{t("plan.unresolved")}: {d.unresolved_fields.join(", ")}</span> : null}
              </span>
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
