"use client";
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Mic, Square, X } from "lucide-react";

// Push-to-record with visible state, stop and cancel. Picks a codec the browser supports
// (webm/opus on Chromium/Firefox, mp4/aac on Safari). Falls back to typing on any failure.
function pickMime(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  for (const m of ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"]) {
    if (MediaRecorder.isTypeSupported?.(m)) return m;
  }
  return undefined;
}

export function VoiceRecorder({ enabled, disabledReason, onTranscript, onError, compact = false, primary = false }: { enabled: boolean; disabledReason: string; onTranscript: (t: string, uncertain: boolean) => void; onError: (msg: string) => void; compact?: boolean; primary?: boolean }) {
  const t = useTranslations("chat");
  const [state, setState] = useState<"idle" | "recording" | "transcribing">("idle");
  const [seconds, setSeconds] = useState(0);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const cancelled = useRef(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => { if (timer.current) clearInterval(timer.current); recRef.current?.stream.getTracks().forEach((tr) => tr.stop()); }, []);

  const iconBtn = primary
    ? "flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary text-primary-ink shadow-[var(--shadow-md)] transition-colors hover:bg-[var(--primary-hover)]"
    : "flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink-soft transition-colors hover:bg-surface-2 hover:text-ink";
  if (!enabled) return compact ? <button type="button" className={`${iconBtn} cursor-not-allowed opacity-40`} aria-label={disabledReason} title={disabledReason} onClick={() => onError(disabledReason)}><Mic size={20} aria-hidden="true" /></button> : <p className="hint">{disabledReason}</p>;

  async function start() {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") return onError(t("micUnsupported"));
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      return onError(t("micDenied"));
    }
    const mime = pickMime();
    const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    chunks.current = [];
    cancelled.current = false;
    rec.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
    rec.onstop = async () => {
      stream.getTracks().forEach((tr) => tr.stop());
      if (timer.current) clearInterval(timer.current);
      if (cancelled.current) return setState("idle");
      setState("transcribing");
      const blob = new Blob(chunks.current, { type: (rec.mimeType || "audio/webm").split(";")[0] });
      const fd = new FormData();
      fd.append("audio", blob, "voice");
      try {
        const res = await fetch("/api/voice/transcribe", { method: "POST", body: fd });
        const j = await res.json();
        if (!res.ok || !j.transcript) onError(t("voiceUnavailable"));
        else onTranscript(j.transcript, !!j.uncertain);
      } catch {
        onError(t("voiceUnavailable"));
      } finally {
        setState("idle");
      }
    };
    recRef.current = rec;
    rec.start();
    setSeconds(0);
    timer.current = setInterval(() => setSeconds((s) => {
      if (s >= 59 && rec.state === "recording") rec.stop(); // REST transcription is for short notes
      return s + 1;
    }), 1000);
    setState("recording");
  }

  if (state === "recording" && compact) {
    return (
      <div className="flex items-center gap-1" role="group" aria-label={t("recording", { seconds })}>
        <span className="flex items-center gap-1.5 rounded-full bg-danger-bg px-3 py-1.5 text-sm font-semibold tabular-nums text-danger-ink" aria-live="assertive"><span aria-hidden="true" className="dot animate-pulse bg-danger-ink" />{seconds}s</span>
        <button type="button" className={iconBtn} aria-label={t("cancelRecording")} onClick={() => { cancelled.current = true; recRef.current?.stop(); }}><X size={18} aria-hidden="true" /></button>
        <button type="button" className="flex h-11 w-11 items-center justify-center rounded-full bg-danger-ink text-white" aria-label={t("stop")} onClick={() => recRef.current?.stop()}><Square size={15} aria-hidden="true" /></button>
      </div>
    );
  }
  if (state === "recording") {
    return (
      <div className="flex items-center gap-2" role="group" aria-label={t("recording", { seconds })}>
        <span className="chip bg-danger-bg text-danger-ink" aria-live="assertive"><span aria-hidden="true">●</span> {t("recording", { seconds })}</span>
        <button type="button" className="btn btn-primary" onClick={() => recRef.current?.stop()}>{t("stop")}</button>
        <button type="button" className="btn btn-secondary" onClick={() => { cancelled.current = true; recRef.current?.stop(); }}>{t("cancelRecording")}</button>
      </div>
    );
  }
  if (state === "transcribing") return <span className="chip min-h-10" role="status">{t("transcribing")}</span>;
  if (compact) return <button type="button" className={iconBtn} onClick={start} aria-label={t("record")} title={t("record")}><Mic size={20} aria-hidden="true" /></button>;
  return <button type="button" className="btn btn-secondary" onClick={start}>🎙 {t("record")}</button>;
}
