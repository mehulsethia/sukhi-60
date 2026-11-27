"use client";
// "Talk to Sukhi": one mic button on every screen. Tap once, then talk hands-free: Sukhi listens,
// answers out loud, reads back anything it is about to save, and keeps listening until the
// conversation ends or the person goes quiet twice.
//
// Speech: ElevenLabs on the server (transcribe + speak) when it's configured and the person
// allowed voice processing; otherwise the browser's own speech recognition and voice, so it
// also works in the keyless demo. Taps are always there as a fallback.
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Mic, X, Volume2, Loader2 } from "lucide-react";
import type { VoicePending, VoiceReply } from "@/domain/voice-intents";
import { vt } from "@/domain/voice-flow";

type Phase = "idle" | "listening" | "thinking" | "speaking";
type Handler = (text: string, pending: VoicePending | null) => Promise<VoiceReply>;

const LANG: Record<string, string> = { en: "en-IN", hi: "hi-IN", mr: "mr-IN" };
const MAX_LISTEN_MS = 10_000;
const NO_SPEECH_MS = 6_000;
const END_SILENCE_MS = 1_300;

// Minimal typing for the browser speech API (webkit-prefixed in Chrome and Safari).
interface Recognition { lang: string; interimResults: boolean; maxAlternatives: number; continuous: boolean; onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string; confidence: number }>> }) => void) | null; onerror: ((e: { error: string }) => void) | null; onend: (() => void) | null; start(): void; abort(): void }
function browserRecognition(): (new () => Recognition) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

function pickMime(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  return ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"].find((m) => MediaRecorder.isTypeSupported?.(m));
}

/**
 * Records from the mic until the person stops talking (or never starts), reporting the level for
 * the meter. Returns null if the mic can't be used.
 */
async function recordUntilSilence(onLevel: (l: number) => void, onStopper: (stop: () => void) => void): Promise<{ blob: Blob; spoke: boolean } | null> {
  let stream: MediaStream;
  try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }); } catch { return null; }
  const mime = pickMime();
  const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
  const ctx = new AudioContext();
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 1024;
  ctx.createMediaStreamSource(stream).connect(analyser);
  const buf = new Uint8Array(analyser.fftSize);
  let spoke = false;
  const started = performance.now();
  let lastLoud = started;
  const done = new Promise<void>((resolve) => { rec.onstop = () => resolve(); });
  let raf = 0;
  const stop = () => { if (rec.state === "recording") rec.stop(); };
  onStopper(stop);
  const tick = () => {
    analyser.getByteTimeDomainData(buf);
    let sum = 0;
    for (const v of buf) sum += (v - 128) * (v - 128);
    const rms = Math.sqrt(sum / buf.length) / 128;
    onLevel(Math.min(1, rms * 6));
    const now = performance.now();
    if (rms > 0.035) { lastLoud = now; spoke = true; }
    if ((spoke && now - lastLoud > END_SILENCE_MS) || (!spoke && now - started > NO_SPEECH_MS) || now - started > MAX_LISTEN_MS) return stop();
    raf = requestAnimationFrame(tick);
  };
  rec.start();
  raf = requestAnimationFrame(tick);
  await done;
  cancelAnimationFrame(raf);
  stream.getTracks().forEach((tr) => tr.stop());
  ctx.close().catch(() => undefined);
  onLevel(0);
  return { blob: new Blob(chunks, { type: (rec.mimeType || "audio/webm").split(";")[0] }), spoke };
}

export function TalkToSukhi({ locale, serverSpeech, handle, aboveNav = true }: { locale: string; serverSpeech: boolean; handle?: Handler; aboveNav?: boolean }) {
  const t = useTranslations("voice");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [heard, setHeard] = useState("");
  const [reply, setReply] = useState<VoiceReply | null>(null);
  const [level, setLevel] = useState(0);
  const pending = useRef<VoicePending | null>(null);
  const silences = useRef(0);
  const active = useRef(false); // false once the panel is closed: stops any queued listening
  const useServer = useRef(serverSpeech);
  const stopNow = useRef<() => void>(() => undefined);
  const audio = useRef<HTMLAudioElement | null>(null);
  const key = useRef<string | null>(null); // set on first use: one id per conversation

  useEffect(() => () => { active.current = false; stopNow.current(); audio.current?.pause(); if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel(); }, []);

  // ------------------------------------------------------------------ speaking
  async function speak(text: string) {
    const clean = text.replace(/[✓✔]/g, "").trim();
    if (!clean || !active.current) return;
    setPhase("speaking");
    if (useServer.current) {
      try {
        const res = await fetch("/api/voice/speak", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: clean }) });
        const j = await res.json();
        if (res.ok && j.audio) {
          await new Promise<void>((resolve) => {
            const a = new Audio(j.audio);
            audio.current = a;
            a.onended = a.onerror = () => resolve();
            a.play().catch(() => resolve());
          });
          return;
        }
      } catch { /* fall through to the browser voice */ }
    }
    if (typeof speechSynthesis === "undefined") return;
    await new Promise<void>((resolve) => {
      const u = new SpeechSynthesisUtterance(clean);
      u.lang = LANG[locale] ?? "en-IN";
      u.rate = 0.95;
      u.onend = u.onerror = () => resolve();
      speechSynthesis.cancel();
      speechSynthesis.speak(u);
    });
  }

  // ------------------------------------------------------------------ listening
  /** Browser path: the built-in recognizer (Chrome, Edge, Safari). No key needed. */
  function listenBrowser(): Promise<string | null> {
    const R = browserRecognition();
    if (!R) return Promise.resolve(null);
    return new Promise((resolve) => {
      const r = new R();
      r.lang = LANG[locale] ?? "en-IN";
      r.interimResults = false;
      r.continuous = false;
      r.maxAlternatives = 1;
      let result: string | null = "";
      r.onresult = (e) => { result = e.results[0]?.[0]?.transcript ?? ""; };
      r.onerror = (e) => { if (e.error !== "no-speech" && e.error !== "aborted") result = null; };
      r.onend = () => { setLevel(0); resolve(active.current ? result : ""); };
      stopNow.current = () => r.abort();
      setLevel(0.5);
      try { r.start(); } catch { resolve(null); }
    });
  }

  /** ElevenLabs path: record until the person stops talking, then transcribe on the server. */
  async function listenServer(): Promise<string | null> {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") return listenBrowser();
    const rec = await recordUntilSilence(setLevel, (stop) => { stopNow.current = stop; });
    if (!rec) return null;
    if (!rec.spoke || !active.current) return "";
    setPhase("thinking");
    const fd = new FormData();
    fd.append("audio", rec.blob, "voice");
    fd.append("language", "auto"); // people mix Hindi, Marathi and English in one sentence
    try {
      const res = await fetch("/api/voice/transcribe", { method: "POST", body: fd });
      if (res.status === 403 || res.status === 503) { useServer.current = false; return listenBrowser(); }
      const j = await res.json();
      return res.ok ? String(j.transcript ?? "") : null;
    } catch {
      return null;
    }
  }

  /** Listen, answer, speak; repeat until the conversation ends, the panel closes or it goes quiet. */
  async function turn(first?: string) {
    let spoken = first;
    key.current ??= `v${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    while (active.current) {
      let text = spoken ?? null;
      spoken = undefined;
      if (text === null) {
        setPhase("listening");
        text = useServer.current ? await listenServer() : await listenBrowser();
      }
      if (!active.current) return;
      if (text === null) {
        setReply({ say: t("micProblem") });
        return setPhase("idle");
      }
      const clean = text.trim();
      if (clean.length < 2) {
        // Silence or noise: ask once more, then stop and leave the tap buttons.
        silences.current += 1;
        const say = vt(locale, "not_heard");
        setReply((prev) => ({ say, choices: prev?.choices }));
        if (silences.current >= 2) return setPhase("idle");
        await speak(say);
        continue;
      }
      silences.current = 0;
      setHeard(clean);
      setPhase("thinking");
      let r: VoiceReply;
      try {
        if (handle) r = await handle(clean, pending.current);
        else {
          const res = await fetch("/api/voice/command", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: clean, pending: pending.current, key: key.current }) });
          r = res.ok ? await res.json() : { say: vt(locale, "failed") };
        }
      } catch {
        r = { say: vt(locale, "failed") };
      }
      pending.current = r.pending ?? null;
      setReply(r);
      if (r.refresh) router.refresh();
      if (r.navigate) router.push(r.navigate);
      await speak(r.say);
      if (r.end) return setPhase("idle");
    }
  }

  function start() {
    active.current = true;
    silences.current = 0;
    setOpen(true);
    setHeard("");
    setReply(null);
    pending.current = null;
    void turn();
  }
  function close() {
    active.current = false;
    stopNow.current();
    audio.current?.pause();
    if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel();
    setOpen(false);
    setPhase("idle");
    pending.current = null;
  }
  function tapChoice(text: string) {
    stopNow.current();
    audio.current?.pause();
    if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel();
    active.current = true;
    void turn(text);
  }

  /** The orb is the one control: tap to start, tap while listening to finish, tap while Sukhi talks to interrupt. */
  function tapOrb() {
    if (!open) return start();
    if (phase === "listening") return stopNow.current();
    if (phase === "speaking") {
      audio.current?.pause();
      audio.current?.dispatchEvent(new Event("ended"));
      if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel();
      return;
    }
    if (phase === "idle") { active.current = true; silences.current = 0; void turn(); }
  }

  const status = phase === "listening" ? t("listening") : phase === "thinking" ? t("thinking") : phase === "speaking" ? t("speaking") : t("tapToTalk");
  // Bottom centre, just above the middle tab ("My Plan") of the phone nav; bottom centre of the
  // content column on desktop, where there is no bottom nav.
  const orbPos = aboveNav
    ? "bottom-[calc(64px+env(safe-area-inset-bottom))] left-1/2 lg:bottom-8 lg:left-[calc(50%+132px)]"
    : "bottom-6 left-1/2";
  const panelPos = aboveNav
    ? "bottom-[calc(150px+env(safe-area-inset-bottom))] left-1/2 lg:bottom-[118px] lg:left-[calc(50%+132px)]"
    : "bottom-[110px] left-1/2";
  const scale = phase === "listening" ? 1 + level * 0.35 : 1;
  const spin = phase === "thinking" ? 1.2 : phase === "speaking" ? 2.5 : phase === "listening" ? 3 : 7;

  return (
    <>
      {open ? (
        <div role="dialog" aria-label={t("talk")} className={`fixed ${panelPos} z-40 w-[min(92vw,400px)] -translate-x-1/2 rounded-[1.4rem] border border-line bg-surface/95 p-4 shadow-xl backdrop-blur-md print:hidden`}>
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-primary" aria-live="polite">{status}</p>
            <button type="button" onClick={close} aria-label={t("close")} className="-mr-1 -mt-1 flex h-8 w-8 items-center justify-center rounded-full text-ink-soft hover:bg-surface-2"><X size={17} aria-hidden="true" /></button>
          </div>
          {heard ? <p className="mt-1 text-sm text-ink-soft">“{heard}”</p> : <p className="mt-1 text-sm text-ink-soft">{t("examples")}</p>}
          {reply ? <p className="mt-2 text-[1rem] font-medium leading-snug">{reply.say}</p> : null}
          {reply?.choices?.length ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {reply.choices.map((c) => <button key={c.text} type="button" onClick={() => tapChoice(c.text)} className="pill-btn min-h-10 px-4 text-sm">{c.label}</button>)}
            </div>
          ) : null}
        </div>
      ) : null}
      <button
        type="button"
        onClick={tapOrb}
        aria-label={open ? status : t("talk")}
        aria-pressed={open}
        className={`fixed ${orbPos} z-40 h-[62px] w-[62px] -translate-x-1/2 rounded-full print:hidden`}
      >
        {/* Soft glow, then three gradient layers turning at different speeds: the "Siri" orb. */}
        <span aria-hidden="true" className="pointer-events-none absolute inset-0 transition-transform duration-100" style={{ transform: `scale(${scale})` }}>
          {phase === "listening" || phase === "speaking" ? (
            <span className="absolute inset-0 rounded-full bg-[#2dd4bf]" style={{ animation: "sukhi-orb-ring 1.6s ease-out infinite" }} />
          ) : null}
          <span className="absolute -inset-2 rounded-full opacity-70 blur-lg" style={{ background: "conic-gradient(from 0deg, #0f766e, #22d3ee, #a78bfa, #34d399, #0f766e)", animation: `sukhi-orb-spin ${spin * 1.6}s linear infinite` }} />
          <span className="absolute inset-0 overflow-hidden rounded-full shadow-lg" style={{ animation: phase === "idle" || !open ? "sukhi-orb-breathe 3.2s ease-in-out infinite" : "none" }}>
            <span className="absolute -inset-1/4" style={{ background: "conic-gradient(from 90deg, #0b5f55, #14b8a6, #38bdf8, #0b5f55)", animation: `sukhi-orb-spin ${spin}s linear infinite` }} />
            <span className="absolute -inset-1/4 mix-blend-screen opacity-80" style={{ background: "conic-gradient(from 200deg, transparent, #a78bfa 25%, transparent 50%, #6ee7b7 75%, transparent)", animation: `sukhi-orb-spin ${spin * 0.7}s linear infinite reverse` }} />
            <span className="absolute inset-0 rounded-full" style={{ background: "radial-gradient(circle at 35% 28%, rgba(255,255,255,.65), rgba(255,255,255,0) 52%)" }} />
          </span>
        </span>
        <span aria-hidden="true" className="relative flex h-full w-full items-center justify-center text-white drop-shadow">
          {phase === "thinking" ? <Loader2 size={22} className="animate-spin" /> : phase === "speaking" ? <Volume2 size={22} /> : <Mic size={22} />}
        </span>
      </button>
    </>
  );
}
