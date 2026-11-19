"use client";
// Proof capture: a photo or clip taken live with the camera (no gallery, so old or borrowed
// pictures can't be picked), or a note. Used on the action page and inside the chat.
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Camera, PenLine, Video, X } from "lucide-react";
import { Alert } from "@/components/ui";
import { shrinkImage } from "@/lib/client-image";
import { CameraCapture, liveCameraSupported } from "@/components/CameraCapture";
import type { Reading } from "@/domain/readings";
import { formatReading } from "@/domain/readings";
import { removeUpload, uploadVideo, videoFrames, VIDEO_MAX_BYTES, VIDEO_MAX_SECONDS } from "@/lib/client-video";

export type EvidenceResult = { ok: true; outcome: string; explanation: string; points: number; needsReview: boolean; reading: Reading | null; hours: number } | { ok: false; error: string };

/** Send one piece of evidence through the same pipeline WhatsApp media uses. */
export async function submitEvidence(o: { occurrenceId: string; file?: File | null; text?: string; markDone: boolean; via: "chat" | "action"; key: string }): Promise<EvidenceResult> {
  const fd = new FormData();
  fd.set("occurrence_id", o.occurrenceId);
  fd.set("idempotency_key", o.key);
  fd.set("via", o.via);
  if (o.markDone) fd.set("mark_done", "true");
  if (o.text) fd.set("text", o.text);
  const f = o.file;
  if (!f) fd.set("kind", "text");
  let uploadedPath: string | null = null;
  if (!f) { /* text only */ } else if (f.type.startsWith("video/")) {
    if (f.size > VIDEO_MAX_BYTES) return { ok: false, error: "video_too_large" };
    const { duration, frames } = await videoFrames(f);
    if (duration > VIDEO_MAX_SECONDS + 1) return { ok: false, error: "video_too_long" };
    let path: string;
    try { path = await uploadVideo(f, o.occurrenceId); } catch { return { ok: false, error: "upload_failed" }; }
    uploadedPath = path;
    fd.set("kind", "video");
    fd.set("video_path", path);
    frames.forEach((b, i) => fd.append("frames", new File([b], `frame-${i}.jpg`, { type: "image/jpeg" })));
  } else {
    fd.set("kind", "photo");
    fd.set("file", await shrinkImage(f), "photo.jpg");
  }
  try {
    const res = await fetch("/api/evidence", { method: "POST", body: fd, signal: AbortSignal.timeout(90_000) });
    const j = await res.json();
    // Rejected before anything was saved (validation, missing occurrence, rate limit): delete the
    // uploaded clip now. Other failures may already reference it; the hourly sweep is the backstop.
    if (uploadedPath && [400, 404, 429].includes(res.status)) void removeUpload(uploadedPath);
    if (res.status === 409 && j.error === "duplicate_evidence") return { ok: false, error: "duplicate" };
    if (res.status === 429) return { ok: false, error: "rate_limited" };
    if (!res.ok) return { ok: false, error: "error" };
    const points = ((j.check_in?.rewards ?? []) as { points: number }[]).reduce((a, r) => a + r.points, 0);
    return { ok: true, outcome: j.evaluation.outcome, explanation: j.evaluation.explanation, points, needsReview: !!j.evaluation.needs_review, reading: j.evaluation.reading ?? null, hours: Number(j.review_hours) || 12 };
  } catch {
    return { ok: false, error: "error" };
  }
}

export function EvidenceCapture({ occurrenceId, canMarkDone, via, onDone, compact = false }: { occurrenceId: string; canMarkDone: boolean; via: "chat" | "action"; onDone?: (r: EvidenceResult) => void; compact?: boolean }) {
  const t = useTranslations();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [noteOnly, setNoteOnly] = useState(false);
  const [text, setText] = useState("");
  const [markDone, setMarkDone] = useState(canMarkDone);
  const [busy, setBusy] = useState(false);
  const [cam, setCam] = useState<"photo" | "video" | null>(null);
  const [msg, setMsg] = useState<{ tone: "ok" | "danger" | "info"; text: string } | null>(null);
  const keyRef = useRef(crypto.randomUUID());
  const id = `ev-${occurrenceId.slice(0, 8)}-${via}`;

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  function take(f: File) {
    setCam(null);
    setMsg(null);
    setNoteOnly(false);
    setFile(f);
    setPreview((old) => { if (old) URL.revokeObjectURL(old); return URL.createObjectURL(f); });
  }
  /** Fallback for browsers without a live camera API: the OS camera via the capture attribute. */
  function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.currentTarget.files?.[0] ?? null;
    e.currentTarget.value = "";
    if (f) take(f);
  }
  function open(mode: "photo" | "video") {
    if (liveCameraSupported(mode)) setCam(mode);
    else document.getElementById(`${id}-${mode === "photo" ? "cam" : "vid"}`)?.click();
  }
  function clear() {
    setFile(null);
    setPreview(null);
    setNoteOnly(false);
  }

  async function send() {
    if (!navigator.onLine) return setMsg({ tone: "danger", text: t("common.offline") });
    if (!file && !text.trim()) return;
    setBusy(true);
    setMsg(null);
    const r = await submitEvidence({ occurrenceId, file, text: text.trim() || undefined, markDone: markDone && canMarkDone, via, key: keyRef.current });
    setBusy(false);
    if (r.ok) {
      keyRef.current = crypto.randomUUID();
      setMsg({ tone: "ok", text: [t(`action.outcome_${r.outcome}`), r.reading ? `${t("action.reading")}: ${formatReading(r.reading, t("action.readingPulse"))}` : null, r.needsReview ? t("action.reviewPending", { hours: r.hours }) : null].filter(Boolean).join(" · ") });
      setText("");
      clear();
    } else {
      setMsg({ tone: r.error === "duplicate" ? "info" : "danger", text: r.error === "duplicate" ? t("action.duplicate") : t.has(`evidenceUi.err_${r.error}`) ? t(`evidenceUi.err_${r.error}`) : t("common.error") });
    }
    onDone?.(r);
  }

  const isVideo = !!file?.type.startsWith("video/");
  const tile = "flex flex-col items-center justify-center gap-1.5 rounded-2xl border border-line bg-surface px-2 py-3 text-sm font-semibold transition-colors hover:border-primary hover:bg-primary-soft cursor-pointer";

  return (
    <div className="flex flex-col gap-3">
      {!file && !noteOnly ? (
        <>
          <div className="grid grid-cols-3 gap-2">
            <button type="button" onClick={() => open("photo")} className={tile}><Camera size={22} className="text-primary" aria-hidden="true" />{t("evidenceUi.camera")}</button>
            <button type="button" onClick={() => open("video")} className={tile}><Video size={22} className="text-primary" aria-hidden="true" />{t("evidenceUi.video")}</button>
            <button type="button" onClick={() => setNoteOnly(true)} className={tile}><PenLine size={22} className="text-primary" aria-hidden="true" />{t("action.note")}</button>
          </div>
          <input id={`${id}-cam`} type="file" accept="image/*" capture="environment" className="sr-only" tabIndex={-1} aria-hidden="true" onChange={pick} />
          <input id={`${id}-vid`} type="file" accept="video/*" capture="environment" className="sr-only" tabIndex={-1} aria-hidden="true" onChange={pick} />
          {!compact ? <p className="hint">{t("evidenceUi.help")}</p> : null}
        </>
      ) : (
        <div className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-3">
          {file && preview ? (
            <div className="relative">
              {isVideo
                ? <video src={preview} controls playsInline className="max-h-72 w-full rounded-xl bg-black object-contain" />
                // eslint-disable-next-line @next/next/no-img-element
                : <img src={preview} alt={t("evidenceUi.previewAlt")} className="max-h-72 w-full rounded-xl bg-surface-2 object-contain" />}
              <button type="button" onClick={() => { const m = isVideo ? "video" : "photo"; clear(); open(m); }} className="absolute bottom-2 left-2 rounded-full bg-ink/70 px-3 py-1.5 text-sm font-semibold text-white">{t("evidenceUi.retake")}</button>
              <button type="button" onClick={clear} aria-label={t("evidenceUi.remove")} className="absolute right-2 top-2 flex h-9 w-9 items-center justify-center rounded-full bg-ink/70 text-white"><X size={18} aria-hidden="true" /></button>
            </div>
          ) : (
            <div className="flex items-center justify-between"><p className="font-semibold">{t("action.note")}</p><button type="button" onClick={clear} aria-label={t("evidenceUi.remove")} className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-surface-2"><X size={16} aria-hidden="true" /></button></div>
          )}
          <div className="field">
            <label htmlFor={`${id}-text`} className="!text-sm">{t("action.noteLabel")}</label>
            <textarea id={`${id}-text`} value={text} onChange={(e) => setText(e.target.value)} rows={2} maxLength={2000} className="input" />
          </div>
          {canMarkDone ? <label className="flex items-center gap-3 text-[0.95rem]"><input type="checkbox" checked={markDone} onChange={(e) => setMarkDone(e.target.checked)} className="h-5 w-5 accent-[var(--primary)]" />{t("action.markDone")}</label> : null}
          <button type="button" className="btn btn-primary" disabled={busy || (!file && !text.trim())} onClick={send}>{busy ? (isVideo ? t("evidenceUi.uploadingVideo") : t("action.submitting")) : t("action.submit")}</button>
        </div>
      )}
      {cam ? <CameraCapture mode={cam} onCapture={take} onClose={() => setCam(null)} /> : null}
      <div aria-live="polite">{msg ? <Alert tone={msg.tone}>{msg.text}</Alert> : null}</div>
    </div>
  );
}
