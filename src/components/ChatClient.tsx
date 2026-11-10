"use client";
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Alert } from "@/components/ui";
import { VoiceRecorder } from "@/components/VoiceRecorder";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "notice";
  channel: string;
  content: string;
  sources: { type: string; id: string; label: string }[];
  safety?: string | null;
  pending?: boolean;
}

export function ChatClient({ initial, voice, audioReplies }: { initial: ChatMessage[]; voice: { configured: boolean; consent: boolean }; audioReplies: boolean }) {
  const t = useTranslations("chat");
  const tc = useTranslations("common");
  const [messages, setMessages] = useState(initial);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [transcriptNote, setTranscriptNote] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // Block body: scrollIntoView returns a Promise in newer browsers, which must not become the effect cleanup.
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  async function send(e?: React.FormEvent) {
    e?.preventDefault();
    const body = text.trim();
    if (!body || busy) return;
    if (!navigator.onLine) return setError(tc("offline"));
    setBusy(true);
    setError(null);
    setTranscriptNote(null);
    const tempId = `tmp-${Date.now()}`;
    setMessages((m) => [...m, { id: tempId, role: "user", channel: "web", content: body, sources: [], pending: true }]);
    setText("");
    try {
      const res = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: body }) });
      const j = await res.json();
      if (!res.ok) {
        setMessages((m) => m.filter((x) => x.id !== tempId));
        setText(body);
        setError(res.status === 429 ? t("rateLimited") : tc("error"));
        return;
      }
      setMessages((m) => [...m.map((x) => (x.id === tempId ? { ...x, pending: false } : x)), { id: j.id ?? `a-${Date.now()}`, role: "assistant", channel: "web", content: j.text, sources: j.sources ?? [], safety: j.safety }]);
    } catch {
      setMessages((m) => m.filter((x) => x.id !== tempId));
      setText(body);
      setError(tc("error"));
    } finally {
      setBusy(false);
    }
  }

  async function play(content: string) {
    try {
      const res = await fetch("/api/voice/speak", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: content }) });
      if (!res.ok) return setError(t("voiceUnavailable"));
      const j = await res.json();
      await new Audio(j.audio).play();
    } catch {
      setError(t("voiceUnavailable"));
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="hint">{t("whatsappNote")}</p>
      <ol className="flex flex-col gap-3" aria-live="polite" aria-relevant="additions">
        {messages.length === 0 ? <li className="card hint">{t("empty")}</li> : null}
        {messages.map((m) => (
          <li key={m.id} className={`max-w-[88%] rounded-2xl px-4 py-3 ${m.role === "user" ? "self-end bg-primary text-primary-ink" : m.role === "notice" ? "self-center bg-surface-2 text-sm" : m.safety === "escalation" ? "border-2 border-danger-ink bg-danger-bg text-danger-ink" : "self-start border border-line bg-surface"}`}>
            {m.role === "notice" ? <span className="font-semibold">🔔 {t("notice")}: </span> : null}
            {m.safety === "escalation" ? <strong className="block">{t("escalation")}</strong> : null}
            <p className="whitespace-pre-wrap">{m.content}</p>
            {m.channel === "whatsapp" ? <p className="mt-1 text-xs opacity-80">{t("fromWhatsapp")}</p> : null}
            {m.sources.length ? (
              <p className="mt-2 text-xs opacity-80">{t("sources")}: {m.sources.map((s) => s.label).join(" · ")}</p>
            ) : null}
            {m.role === "assistant" && audioReplies && voice.configured && voice.consent ? (
              <button type="button" className="btn btn-ghost mt-1 min-h-10 px-2 text-sm underline" onClick={() => play(m.content)}>🔊 {t("play")}</button>
            ) : null}
          </li>
        ))}
      </ol>
      <div ref={endRef} />
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {transcriptNote ? <Alert tone="warn">{transcriptNote}</Alert> : null}
      <form onSubmit={send} className="sticky bottom-20 flex flex-col gap-2 rounded-2xl bg-bg/95 py-2 md:bottom-0">
        <label htmlFor="chat-input" className="sr-only">{t("placeholder")}</label>
        <textarea id="chat-input" className="input" rows={2} maxLength={2000} placeholder={t("placeholder")} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} />
        <div className="flex flex-wrap items-center gap-2">
          <button type="submit" className="btn btn-primary" disabled={busy || !text.trim()}>{busy ? t("sending") : t("send")}</button>
          <VoiceRecorder
            enabled={voice.configured && voice.consent}
            disabledReason={!voice.consent ? t("voiceConsent") : t("voiceUnavailable")}
            onTranscript={(tr, uncertain) => {
              setText(tr);
              setTranscriptNote(uncertain ? `${t("transcriptConfirm")} ${t("transcriptUncertain")}` : t("transcriptConfirm"));
              document.getElementById("chat-input")?.focus();
            }}
            onError={(m) => setError(m)}
          />
        </div>
      </form>
    </div>
  );
}
