"use client";
// Gentle Restart flow: one short "what got in the way?" question with tappable reasons, a
// supportive reply in the person's chosen style, and, for personal goals only, an offer
// they must explicitly accept. Nothing changes in the plan until they tap "Save".
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Check, ShieldAlert } from "lucide-react";
import { chatQuickAction, decideSuggestionAction, reportBarrierAction, respondToNudgeAction } from "@/app/actions";
import { BARRIER_CODES, type BarrierCode } from "@/domain/behaviour";
import type { SupportResult } from "@/server/support";

interface Props {
  occurrenceId: string;
  title: string;
  /** set when this flow answers a proactive follow-up (records acknowledgement) */
  nudgeId?: string | null;
  /** offer "I did it" (used when the status is unknown: silence is never assumed to be a miss) */
  allowDidIt?: boolean;
  /** a result already computed (e.g. a reason chosen while skipping on the Today card) */
  initial?: SupportResult | null;
}

export function SupportFlow({ occurrenceId, title, nudgeId, allowDidIt, initial }: Props) {
  const t = useTranslations();
  const router = useRouter();
  const [result, setResult] = useState<SupportResult | null>(initial ?? null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [closed, setClosed] = useState(false);
  const [time, setTime] = useState(initial?.suggestion?.proposedTime ?? initial?.suggestion?.fromTime ?? "");
  const [decided, setDecided] = useState(false);
  const keyRef = useRef(crypto.randomUUID());

  async function pick(code: BarrierCode) {
    setBusy(true);
    setNote(null);
    const r = await reportBarrierAction({ occurrence_id: occurrenceId, code, key: keyRef.current, nudge_id: nudgeId ?? null });
    setBusy(false);
    if (!r.ok) return setNote(t("common.error"));
    setResult(r.support);
    setTime(r.support.suggestion?.proposedTime ?? r.support.suggestion?.fromTime ?? "");
  }

  async function didIt() {
    setBusy(true);
    const r = await chatQuickAction(occurrenceId, "done", keyRef.current);
    if (nudgeId) await respondToNudgeAction(nudgeId, "did_it");
    setBusy(false);
    if (!r.ok) return setNote(t("common.error"));
    setNote(r.messages?.find((m) => m.role === "assistant")?.content ?? t("common.saved"));
    setClosed(true);
    router.refresh();
  }

  async function notNow() {
    if (nudgeId) await respondToNudgeAction(nudgeId, "dismissed");
    setClosed(true);
  }

  async function decide(decision: "accept" | "decline") {
    const s = result?.suggestion;
    if (!s) return;
    setBusy(true);
    const r = await decideSuggestionAction({ suggestion_id: s.id, decision, time: decision === "accept" && s.kind === "time_change" ? time : null });
    setBusy(false);
    setDecided(true);
    if (!r.ok) return setNote(r.result === "invalid" ? t("common.error") : t("support.suggestionExpired"));
    if (r.result === "declined" || r.result === "kept") return setNote(s.kind === "time_change" ? t("support.timeKept") : null);
    if (s.kind === "smaller_action" && r.planId) return router.push(`/plan/${r.planId}`);
    setNote(t("support.timeSaved", { title, time: r.newTime ?? time }));
    router.refresh();
  }

  if (closed) return note ? <p className="mt-2 text-sm text-ink-soft" role="status">{note}</p> : null;

  if (!result) {
    return (
      <div className="mt-3 rounded-2xl border border-line bg-surface p-3">
        <p className="font-semibold" id={`bq-${occurrenceId}`}>{t("support.barrierQ")}</p>
        <p className="hint text-sm">{t("support.barrierHint")}</p>
        <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-labelledby={`bq-${occurrenceId}`}>
          {allowDidIt ? <button type="button" disabled={busy} onClick={didIt} className="pill-btn pill-btn-primary min-h-11 px-3 text-sm"><Check size={15} aria-hidden="true" />{t("support.didIt")}</button> : null}
          {BARRIER_CODES.map((c) => (
            <button key={c} type="button" disabled={busy} onClick={() => pick(c)} className="pill-btn min-h-11 px-3 text-sm">{t(`support.barrier_${c}`)}</button>
          ))}
          <button type="button" disabled={busy} onClick={notNow} className="pill-btn min-h-11 border-transparent bg-transparent px-3 text-sm text-ink-soft">{t("support.notNow")}</button>
        </div>
        {note ? <p className="mt-1.5 text-sm text-danger-ink" role="alert">{note}</p> : null}
      </div>
    );
  }

  const s = result.suggestion;
  const safety = result.strategy === "safety_first";
  return (
    <div className={`mt-3 rounded-2xl border p-3 ${safety ? "border-danger-ink bg-danger-bg" : "border-line bg-sky"}`}>
      <p role="status" className={`flex items-start gap-2 ${safety ? "font-semibold text-danger-ink" : ""}`}>
        {safety ? <ShieldAlert size={18} className="mt-0.5 shrink-0" aria-hidden="true" /> : null}
        <span>{result.text}</span>
      </p>
      {result.motivation ? <p className="mt-2 text-sm italic text-ink-soft">{t("support.yourWhy", { text: result.motivation })}</p> : null}
      {s && !decided && s.kind === "time_change" ? (
        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="field">
            <label htmlFor={`nt-${s.id}`} className="!text-sm">{t("support.newTimeLabel")}</label>
            <input id={`nt-${s.id}`} type="time" className="input w-40" value={time} onChange={(e) => setTime(e.target.value)} aria-describedby={s.proposedTime ? `nth-${s.id}` : undefined} />
            {s.proposedTime ? <span id={`nth-${s.id}`} className="hint text-xs">{t("support.suggestedTime", { time: s.proposedTime })}</span> : null}
          </div>
          <button type="button" className="pill-btn pill-btn-primary min-h-11" disabled={busy || !time || time === s.fromTime} onClick={() => decide("accept")}>{t("support.saveTime")}</button>
          <button type="button" className="pill-btn min-h-11" disabled={busy} onClick={() => decide("decline")}>{t("support.keepTime")}</button>
        </div>
      ) : null}
      {s && !decided && s.kind === "smaller_action" ? (
        <div className="mt-3">
          <p className="hint text-sm">{t("support.editHint")}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" className="pill-btn pill-btn-primary min-h-11" disabled={busy} onClick={() => decide("accept")}>{t("support.editRoutine")}</button>
            <button type="button" className="pill-btn min-h-11" disabled={busy} onClick={() => decide("decline")}>{t("support.notNow")}</button>
          </div>
        </div>
      ) : null}
      {note ? <p className="mt-2 text-sm" role="status">{note}</p> : null}
    </div>
  );
}
