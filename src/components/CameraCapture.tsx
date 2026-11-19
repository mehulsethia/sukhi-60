"use client";
// Live in-page camera for proof. No file picker, so an old or downloaded picture can't be
// chosen: the photo or clip is captured right now from the camera stream.
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { RefreshCw, X } from "lucide-react";
import { VIDEO_MAX_SECONDS } from "@/lib/client-video";

type Mode = "photo" | "video";
type CamState = "starting" | "live" | "recording" | "blocked" | "none";

const VIDEO_TYPES = ["video/mp4;codecs=avc1", "video/mp4", "video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"];

/** True when this browser can show a live camera at all (needs HTTPS and getUserMedia). */
export function liveCameraSupported(mode: Mode) {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) return false;
  return mode === "photo" || typeof MediaRecorder !== "undefined";
}

export function CameraCapture({ mode, onCapture, onClose }: { mode: Mode; onCapture: (f: File) => void; onClose: () => void }) {
  const t = useTranslations("evidenceUi");
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const [facing, setFacing] = useState<"environment" | "user">("environment");
  const [state, setState] = useState<CamState>("starting");
  const [secs, setSecs] = useState(0);
  const [attempt, setAttempt] = useState(0);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((tr) => tr.stop());
    streamRef.current = null;
  }, []);

  // (Re)open the camera whenever the facing side changes or the person retries.
  useEffect(() => {
    let cancelled = false;
    stopStream();
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: { ideal: facing }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false })
      .then(async (stream) => {
        if (cancelled) return stream.getTracks().forEach((tr) => tr.stop());
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => undefined);
        }
        setState("live");
      })
      .catch((e: DOMException) => {
        if (!cancelled) setState(e?.name === "NotFoundError" || e?.name === "OverconstrainedError" ? "none" : "blocked");
      });
    return () => { cancelled = true; stopStream(); };
  }, [facing, attempt, stopStream]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Recording timer; stops itself at the limit.
  useEffect(() => {
    if (state !== "recording") return;
    const startedAt = Date.now();
    const id = setInterval(() => {
      const s = Math.floor((Date.now() - startedAt) / 1000);
      setSecs(s);
      if (s >= VIDEO_MAX_SECONDS) recRef.current?.stop();
    }, 250);
    return () => clearInterval(id);
  }, [state]);

  function snap() {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = v.videoWidth;
    canvas.height = v.videoHeight;
    const ctx = canvas.getContext("2d")!;
    if (facing === "user") { ctx.translate(canvas.width, 0); ctx.scale(-1, 1); } // match the mirrored preview
    ctx.drawImage(v, 0, 0);
    canvas.toBlob((b) => {
      if (!b) return;
      stopStream();
      onCapture(new File([b], `camera-${Date.now()}.jpg`, { type: "image/jpeg", lastModified: Date.now() }));
    }, "image/jpeg", 0.9);
  }

  function record() {
    const stream = streamRef.current;
    if (!stream) return;
    const type = VIDEO_TYPES.find((m) => MediaRecorder.isTypeSupported(m));
    const rec = new MediaRecorder(stream, { ...(type ? { mimeType: type } : {}), videoBitsPerSecond: 2_500_000 });
    chunks.current = [];
    rec.ondataavailable = (e) => { if (e.data.size) chunks.current.push(e.data); };
    rec.onstop = () => {
      const mime = (rec.mimeType || type || "video/webm").split(";")[0];
      const blob = new Blob(chunks.current, { type: mime });
      stopStream();
      if (blob.size) onCapture(new File([blob], `camera-${Date.now()}.${mime === "video/mp4" ? "mp4" : "webm"}`, { type: mime, lastModified: Date.now() }));
      else onClose();
    };
    recRef.current = rec;
    rec.start(1000);
    setSecs(0);
    setState("recording");
  }

  const live = state === "live" || state === "recording";
  const mmss = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black text-white" role="dialog" aria-modal="true" aria-label={mode === "photo" ? t("takePhoto") : t("video")}>
      <div className="relative min-h-0 flex-1">
        <video ref={videoRef} playsInline muted autoPlay className={`h-full w-full object-cover ${facing === "user" ? "-scale-x-100" : ""} ${live ? "" : "invisible"}`} />
        {state === "blocked" || state === "none" ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-8 text-center">
            <p className="text-[0.95rem]">{state === "blocked" ? t("camBlocked") : t("camNone")}</p>
            {state === "blocked" ? <button type="button" onClick={() => { setState("starting"); setAttempt((n) => n + 1); }} className="btn btn-secondary">{t("retry")}</button> : null}
          </div>
        ) : null}
        {state === "recording" ? <p className="absolute left-1/2 top-4 -translate-x-1/2 rounded-full bg-red-600 px-3 py-1 text-sm font-semibold tabular-nums" aria-live="polite">● {mmss} / {Math.floor(VIDEO_MAX_SECONDS / 60)}:{String(VIDEO_MAX_SECONDS % 60).padStart(2, "0")}</p> : null}
        <button type="button" onClick={onClose} aria-label={t("close")} className="absolute left-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-black/50"><X size={20} aria-hidden="true" /></button>
      </div>
      <div className="flex items-center justify-around px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-5">
        <span className="h-11 w-11" aria-hidden="true" />
        {mode === "photo" ? (
          <button type="button" onClick={snap} disabled={state !== "live"} aria-label={t("takePhoto")} className="h-[4.5rem] w-[4.5rem] rounded-full border-4 border-white bg-white/90 transition-transform active:scale-95 disabled:opacity-40" />
        ) : state === "recording" ? (
          <button type="button" onClick={() => recRef.current?.stop()} aria-label={t("stopRec")} className="flex h-[4.5rem] w-[4.5rem] items-center justify-center rounded-full border-4 border-white"><span className="h-7 w-7 rounded-md bg-red-600" /></button>
        ) : (
          <button type="button" onClick={record} disabled={state !== "live"} aria-label={t("startRec")} className="flex h-[4.5rem] w-[4.5rem] items-center justify-center rounded-full border-4 border-white disabled:opacity-40"><span className="h-14 w-14 rounded-full bg-red-600" /></button>
        )}
        <button type="button" onClick={() => { setState("starting"); setFacing((f) => (f === "environment" ? "user" : "environment")); }} disabled={state === "recording"} aria-label={t("flip")} className="flex h-11 w-11 items-center justify-center rounded-full bg-white/15 disabled:opacity-30"><RefreshCw size={20} aria-hidden="true" /></button>
      </div>
    </div>
  );
}
