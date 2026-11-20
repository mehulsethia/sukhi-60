"use client";
import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArrowUp, Check, Copy, Leaf, Plus, Keyboard, Square, AudioLines, Volume2, X } from "lucide-react";
import { Alert } from "@/components/ui";
import { VoiceRecorder } from "@/components/VoiceRecorder";
import { EvidenceCapture } from "@/components/EvidenceCapture";
import { decideChatProposal, markChatSeen, setChatVoiceMode } from "@/app/actions";
import { SupportFlow } from "@/components/SupportFlow";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "notice";
  channel: string;
  content: string;
  sources: { type: string; id: string; label: string }[];
  safety?: string | null;
  pending?: boolean;
}

export interface TodayRef { id: string; title: string; time: string | null; display: string }
const OPEN = ["pending", "due", "awaiting_response", "later", "no_response"];
// Internal references that drive cards/buttons; not shown as "based on" chips.

/** Minimal, safe formatting for assistant text: paragraphs, bullet/numbered lists, **bold**. */
function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) => (part.startsWith("**") && part.endsWith("**") ? <strong key={i}>{part.slice(2, -2)}</strong> : <Fragment key={i}>{part}</Fragment>));
}
function Rich({ text }: { text: string }) {
  const blocks = text.trim().split(/\n{2,}/);
  return (
    <>
      {blocks.map((b, i) => {
        const lines = b.split("\n");
        if (lines.every((l) => /^\s*([-*•]|\d+[.)])\s+/.test(l))) {
          const ordered = /^\s*\d/.test(lines[0]);
          const items = lines.map((l, j) => <li key={j}>{inline(l.replace(/^\s*([-*•]|\d+[.)])\s+/, ""))}</li>);
          return ordered ? <ol key={i} className="my-2 list-decimal space-y-1 pl-6">{items}</ol> : <ul key={i} className="my-2 list-disc space-y-1 pl-6">{items}</ul>;
        }
        return <p key={i} className="my-2 whitespace-pre-wrap first:mt-0 last:mb-0">{inline(b)}</p>;
      })}
    </>
  );
}

export function ChatClient({ initial, voice, audioReplies, suggestions, name, autoSend, today, openNudges = [], openProposals = [], whatsappLaunched = false }: { initial: ChatMessage[]; openProposals?: string[]; voice: { configured: boolean; consent: boolean }; audioReplies: boolean; suggestions: string[]; name: string | null; autoSend?: string; today: TodayRef[]; openNudges?: string[]; whatsappLaunched?: boolean }) {
  const t = useTranslations("chat");
  const tc = useTranslations("common");
  const router = useRouter();
  const [messages, setMessages] = useState(initial);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [transcriptNote, setTranscriptNote] = useState<string | null>(null);
  const [reveal, setReveal] = useState<{ id: string; n: number } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const sentAuto = useRef(false);
  const [statusById, setStatusById] = useState<Record<string, string>>(() => Object.fromEntries(today.map((o) => [o.id, o.display])));
  const [attachFor, setAttachFor] = useState<string | null>(null);
  const [proposals, setProposals] = useState<string[]>(openProposals);
  const openToday = today.filter((o) => OPEN.includes(statusById[o.id] ?? o.display));

  // Opening the chat clears its unread badge; new proactive messages arrive by refresh.
  useEffect(() => { void markChatSeen(); }, []);
  const lastId = messages.at(-1)?.id ?? null;
  useEffect(() => {
    // Cheap check for new messages; re-render the page only when there is one.
    const h = setInterval(async () => {
      if (document.visibilityState !== "visible" || input.current?.value || document.querySelector("[data-attach-open]")) return;
      try {
        const r = await fetch("/api/chat/latest", { cache: "no-store" });
        const j = (await r.json()) as { id: string | null };
        if (j.id && j.id !== lastId) router.refresh();
      } catch { /* offline */ }
    }, 45_000);
    return () => clearInterval(h);
  }, [router, lastId]);

  const toBottom = useCallback((smooth = true) => {
    const el = scroller.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
  }, []);
  useLayoutEffect(() => { toBottom(false); }, [toBottom]);
  useEffect(() => { toBottom(); }, [messages.length, busy, toBottom]);

  // Reveal a new reply progressively, the way chat assistants type.
  const revealMsg = reveal ? messages.find((m) => m.id === reveal.id) : undefined;
  const revealing = !!(reveal && revealMsg && reveal.n < revealMsg.content.length);
  useEffect(() => {
    if (!reveal || !revealing) return;
    const msg = messages.find((m) => m.id === reveal.id);
    if (!msg) return;
    const step = Math.max(3, Math.ceil(msg.content.length / 90));
    const h = setTimeout(() => { setReveal({ id: reveal.id, n: reveal.n + step }); toBottom(false); }, 16);
    return () => clearTimeout(h);
  }, [reveal, revealing, messages, toBottom]);

  // Auto-grow the composer.
  useEffect(() => {
    const el = input.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [text]);

  const [speaking, setSpeaking] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  // Only one reply speaks at a time. Each call takes a ticket; a fetch that resolves after a newer call
  // (e.g. the auto read-aloud still loading when the speaker button is tapped) is dropped, not played on top.
  const playTicket = useRef(0);
  const playingText = useRef<string | null>(null);
  const stopSpeaking = useCallback(() => {
    playTicket.current++;
    audioRef.current?.pause();
    audioRef.current = null;
    playingText.current = null;
    setSpeaking(false);
  }, []);
  const play = useCallback(async (content: string, quiet = false) => {
    // Tapping the speaker on the reply that is already loading/speaking stops it instead of starting it twice.
    if (playingText.current === content && !quiet) return stopSpeaking();
    const ticket = ++playTicket.current;
    audioRef.current?.pause();
    audioRef.current = null;
    playingText.current = content;
    setSpeaking(true);
    const done = () => { if (ticket === playTicket.current) { playingText.current = null; setSpeaking(false); } };
    try {
      const res = await fetch("/api/voice/speak", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: content }) });
      if (ticket !== playTicket.current) return;
      if (!res.ok) { done(); if (!quiet) setError(t("voiceUnavailable")); return; }
      const j = await res.json();
      if (ticket !== playTicket.current) return;
      const audio = new Audio(j.audio);
      audio.onended = done;
      audioRef.current = audio;
      await audio.play();
    } catch {
      if (!quiet && ticket === playTicket.current) setError(t("voiceUnavailable"));
      done();
    }
  }, [t, stopSpeaking]);
  // Two chat modes, like other assistants: Text (read replies yourself, tap the speaker to hear one)
  // and Voice (every reply is read aloud). The choice is saved to the profile.
  const canSpeak = voice.configured && voice.consent;
  const [voiceMode, setVoiceMode] = useState(audioReplies && canSpeak);
  function chooseMode(on: boolean) {
    if (on === voiceMode) return;
    setVoiceMode(on);
    if (!on) stopSpeaking();
    void setChatVoiceMode(on).catch(() => {});
  }

  const send = useCallback(async (raw?: string) => {
    const body = (raw ?? text).trim();
    if (!body || busy) return;
    if (!navigator.onLine) return setError(tc("offline"));
    setBusy(true);
    setError(null);
    setTranscriptNote(null);
    const tempId = `tmp-${Date.now()}`;
    setMessages((m) => [...m, { id: tempId, role: "user", channel: "web", content: body, sources: [], pending: true }]);
    setText("");
    try {
      const res = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: body }), signal: AbortSignal.timeout(60_000) });
      const j = await res.json();
      if (!res.ok) {
        setMessages((m) => m.filter((x) => x.id !== tempId));
        setText(body);
        setError(res.status === 429 ? t("rateLimited") : tc("error"));
        return;
      }
      const id = j.id ?? `a-${Date.now()}`;
      setMessages((m) => [...m.map((x) => (x.id === tempId ? { ...x, pending: false } : x)), { id, role: "assistant", channel: "web", content: j.text, sources: j.sources ?? [], safety: j.safety }]);
      if (j.proposal?.code) setProposals((p) => [...p, j.proposal.code]);
      setReveal({ id, n: 0 });
      // Voice mode: read the answer aloud right after the person sends (a user gesture, so autoplay is allowed).
      if (voiceMode && j.text) void play(j.text, true);
    } catch {
      setMessages((m) => m.filter((x) => x.id !== tempId));
      setText(body);
      setError(tc("error"));
    } finally {
      setBusy(false);
      input.current?.focus();
    }
  }, [text, busy, t, tc, voiceMode, play]);

  // A suggestion tapped elsewhere (e.g. on Today) arrives as ?q= and is sent once.
  useEffect(() => {
    if (autoSend && !sentAuto.current) {
      sentAuto.current = true;
      router.replace("/chat");
      void send(autoSend);
    }
  }, [autoSend, router, send]);

  async function decide(code: string, accept: boolean) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = await decideChatProposal(code, accept);
      setProposals((p) => p.filter((x) => x !== code));
      setMessages((m) => [...m, { id: r.id ?? `a-${Date.now()}`, role: "assistant", channel: "web", content: r.text, sources: [] }]);
      router.refresh();
    } catch {
      setError(tc("error"));
    } finally {
      setBusy(false);
    }
  }

  async function copy(m: ChatMessage) {
    try { await navigator.clipboard.writeText(m.content); setCopied(m.id); setTimeout(() => setCopied(null), 1500); } catch {}
  }

  const empty = messages.length === 0;

  return (
    <div className="-mx-4 -mb-32 -mt-6 flex h-[calc(100dvh-3.5rem-57px-env(safe-area-inset-bottom))] flex-col sm:-mx-6 lg:-mx-10 lg:-mb-14 lg:-mt-8 lg:h-[calc(100dvh-3.5rem)]">
      <div ref={scroller} className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-3xl px-4 pb-6 pt-6 sm:px-6">
          {empty ? (
            <div className="flex min-h-[52dvh] flex-col items-center justify-center text-center">
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-primary-soft text-primary"><Leaf size={20} aria-hidden="true" /></span>
              <h1 className="mt-4 text-[1.5rem] sm:text-[1.9rem]">{name ? t("helloName", { name }) : t("hello")}</h1>
              <p className="mt-2 max-w-md text-ink-soft">{t("empty")}</p>
              {whatsappLaunched ? <p className="hint mt-1">{t("whatsappNote")}</p> : null}
            </div>
          ) : (
            <>
              <h1 className="sr-only">{t("title")}</h1>
              {whatsappLaunched ? <p className="hint mb-6 text-center">{t("whatsappNote")}</p> : null}
            </>
          )}

          <ol className="flex flex-col gap-6" aria-live="polite" aria-relevant="additions">
            {messages.map((m) => {
              const isRevealing = revealing && reveal?.id === m.id;
              const shown = isRevealing ? m.content.slice(0, reveal!.n) : m.content;
              if (m.role === "user") {
                return (
                  <li key={m.id} className="flex flex-col items-end">
                    <div className={`max-w-[85%] rounded-[22px] rounded-br-md bg-surface-3 px-4 py-2 text-[0.97rem] ${m.pending ? "opacity-70" : ""}`}><p className="whitespace-pre-wrap">{m.content}</p></div>
                    {m.channel === "whatsapp" ? <p className="mt-1 text-xs text-ink-faint">{t("fromWhatsapp")}</p> : null}
                  </li>
                );
              }
              const checkin = m.role === "assistant" && m.channel === "system";
              return (
                <li key={m.id} className="group flex gap-3">
                  <span aria-hidden="true" className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary"><Leaf size={16} /></span>
                  <div className={`min-w-0 flex-1 text-[0.97rem] leading-relaxed ${m.safety === "escalation" ? "rounded-2xl border-2 border-danger-ink bg-danger-bg p-4 text-danger-ink" : ""}`}>
                    {m.safety === "escalation" ? <strong className="mb-1 block">{t("escalation")}</strong> : null}
                    <Rich text={shown} />
                    {checkin && !isRevealing ? m.sources.filter((x) => x.type === "restart").slice(0, 1).map((x) => {
                      const nudge = m.sources.find((y) => y.type === "nudge");
                      if (!nudge || !openNudges.includes(nudge.id)) return null;
                      // Unknown status (no reply) offers "I did it": silence is never treated as a miss.
                      return <SupportFlow key={x.id} occurrenceId={x.id} title={x.label} nudgeId={nudge?.id ?? null} allowDidIt={nudge?.label === "no_response"} />;
                    }) : null}
                    {!isRevealing ? m.sources.filter((x) => x.type === "proposal").slice(0, 1).map((x) => (
                      <div key={x.id} className="mt-3 rounded-2xl border border-line bg-surface p-3">
                        <ul className="space-y-0.5 text-[0.92rem]">{x.label.split("\n").map((l, j) => <li key={j}>{l}</li>)}</ul>
                        {proposals.includes(x.id) ? (
                          <div className="mt-3 flex gap-2">
                            <button type="button" disabled={busy} onClick={() => decide(x.id, true)} className="btn btn-primary min-h-10 px-4 text-sm">{t("apply")}</button>
                            <button type="button" disabled={busy} onClick={() => decide(x.id, false)} className="btn btn-secondary min-h-10 px-4 text-sm">{t("keep")}</button>
                          </div>
                        ) : null}
                      </div>
                    )) : null}
                    {m.channel === "whatsapp" ? <p className="mt-1 text-xs text-ink-faint">{t("fromWhatsapp")}</p> : null}
                    {!isRevealing ? (
                      <div className="mt-1.5 flex gap-1 text-ink-faint opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100">
                        <button type="button" onClick={() => copy(m)} className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-surface-2 hover:text-ink" aria-label={t("copy")}>{copied === m.id ? <Check size={15} /> : <Copy size={15} />}</button>
                        {voiceMode ? <button type="button" onClick={() => play(m.content)} className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-surface-2 hover:text-ink" aria-label={t("play")}><Volume2 size={15} /></button> : null}
                      </div>
                    ) : null}
                  </div>
                </li>
              );
            })}
            {busy ? (
              <li className="flex gap-3" aria-label={t("sending")}>
                <span aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary"><Leaf size={16} /></span>
                <span className="typing flex items-center gap-1 pt-2" aria-hidden="true"><span className="h-2 w-2 rounded-full bg-ink-faint" /><span className="h-2 w-2 rounded-full bg-ink-faint" /><span className="h-2 w-2 rounded-full bg-ink-faint" /></span>
              </li>
            ) : null}
          </ol>
        </div>
      </div>

      <div className="border-t border-line bg-bg/95 backdrop-blur-md lg:border-0 lg:bg-transparent">
        <div className="mx-auto w-full max-w-3xl px-4 pb-3 pt-3 sm:px-6 lg:pb-6">
          {error ? <div className="mb-2"><Alert tone="danger">{error}</Alert></div> : null}
          {transcriptNote ? <div className="mb-2"><Alert tone="warn">{transcriptNote}</Alert></div> : null}
          {attachFor ? (
            <div data-attach-open className="pop-in mb-3 rounded-2xl border border-line bg-surface p-3 shadow-[var(--shadow-md)]">
              <div className="mb-3 flex items-center gap-2">
                <label htmlFor="attach-for" className="shrink-0 text-sm font-semibold">{t("proofFor")}</label>
                <select id="attach-for" className="input min-h-10 py-1.5" value={attachFor} onChange={(e) => setAttachFor(e.target.value)}>
                  {today.map((o) => <option key={o.id} value={o.id}>{o.title}{o.time ? ` · ${o.time}` : ""}</option>)}
                </select>
                <button type="button" onClick={() => setAttachFor(null)} aria-label={tc("close")} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full hover:bg-surface-2"><X size={18} aria-hidden="true" /></button>
              </div>
              <EvidenceCapture key={attachFor} compact via="chat" occurrenceId={attachFor} canMarkDone={OPEN.includes(statusById[attachFor] ?? "")} onDone={(r) => { if (r.ok) { setStatusById((s) => ({ ...s, [attachFor]: "self_reported" })); setAttachFor(null); router.refresh(); } }} />
            </div>
          ) : null}
          {suggestions.length && !busy && !attachFor ? (
            <div className={`no-scrollbar mb-3 ${empty ? "grid gap-2 sm:grid-cols-2" : "flex gap-2 overflow-x-auto"}`}>
              {suggestions.map((s) => (
                <button key={s} type="button" onClick={() => send(s)} className={`rounded-2xl border border-line bg-surface text-left transition-colors hover:border-primary hover:bg-primary-soft ${empty ? "px-4 py-3 text-[0.92rem]" : "shrink-0 whitespace-nowrap px-3.5 py-1.5 text-[0.85rem]"}`}>{s}</button>
              ))}
            </div>
          ) : null}
          {canSpeak ? (
            <div className="mb-2 flex items-center justify-between gap-2">
              <div role="radiogroup" aria-label={t("modeLabel")} className="inline-flex rounded-full bg-surface-2 p-0.5 text-[0.8rem]">
                {([[false, "modeText", Keyboard], [true, "modeVoice", AudioLines]] as const).map(([on, key, Icon]) => (
                  <button key={key} type="button" role="radio" aria-checked={voiceMode === on} onClick={() => chooseMode(on)} className={`flex min-h-8 items-center gap-1.5 rounded-full px-3 font-medium transition-colors ${voiceMode === on ? "bg-surface text-ink shadow-[var(--shadow-sm)]" : "text-ink-faint hover:text-ink"}`}>
                    <Icon size={14} aria-hidden="true" />{t(key)}
                  </button>
                ))}
              </div>
              {speaking ? (
                <button type="button" onClick={stopSpeaking} className="flex min-h-8 items-center gap-1.5 rounded-full border border-line bg-surface px-3 text-[0.8rem] font-medium text-ink hover:bg-surface-2">
                  <Square size={13} aria-hidden="true" className="fill-current" />{t("stopSpeaking")}
                </button>
              ) : voiceMode ? <span className="text-xs text-ink-faint">{t("voiceModeHint")}</span> : null}
            </div>
          ) : null}
          <form onSubmit={(e) => { e.preventDefault(); send(); }} className="flex items-end gap-1 rounded-[24px] border border-line bg-surface p-1.5 shadow-[var(--shadow-sm)] focus-within:border-line-strong">
            <button type="button" disabled={today.length === 0} title={today.length === 0 ? t("noActionsForProof") : undefined} onClick={() => setAttachFor((a) => (a ? null : (openToday[0] ?? today[0])?.id ?? null))} aria-label={t("attachProof")} aria-expanded={!!attachFor} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-ink-faint transition-colors hover:bg-surface-2 hover:text-ink disabled:opacity-30"><Plus size={20} aria-hidden="true" /></button>
            <label htmlFor="chat-input" className="sr-only">{t("placeholder")}</label>
            <textarea ref={input} id="chat-input" rows={1} maxLength={2000} placeholder={t("placeholder")} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); } }} className="max-h-[200px] min-h-[40px] flex-1 resize-none bg-transparent px-1 py-2 text-[0.97rem] outline-none placeholder:text-ink-faint" />
            {text.trim() ? (
              <button type="submit" aria-label={t("send")} disabled={busy} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-ink transition-opacity disabled:opacity-30"><ArrowUp size={19} aria-hidden="true" /></button>
            ) : (
              // Voice first: with an empty box the main button records a voice message.
              <VoiceRecorder
                compact
                primary
                enabled={voice.configured && voice.consent}
                disabledReason={!voice.consent ? t("voiceConsent") : t("voiceUnavailable")}
                onTranscript={(tr, uncertain) => {
                  if (!uncertain && tr.trim()) { void send(tr); return; }
                  setText(tr);
                  setTranscriptNote(`${t("transcriptConfirm")} ${t("transcriptUncertain")}`);
                  input.current?.focus();
                }}
                onError={(m) => setError(m)}
              />
            )}
          </form>
          <p className="mt-2 text-center text-xs text-ink-faint">{t("disclaimer")}</p>
        </div>
      </div>
    </div>
  );
}
