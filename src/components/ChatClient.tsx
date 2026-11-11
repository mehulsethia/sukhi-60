"use client";
import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArrowUp, Bell, Camera, Check, Clock, Copy, Leaf, Moon, Plus, SkipForward, Sparkles, Volume2, X } from "lucide-react";
import { Alert } from "@/components/ui";
import { VoiceRecorder } from "@/components/VoiceRecorder";
import { EvidenceCapture } from "@/components/EvidenceCapture";
import { chatQuickAction, markChatSeen } from "@/app/actions";

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
const HIDDEN_REFS = ["checkin", "occurrence", "evidence"];

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

/** Done / Later / Skip / Not well / Proof under a reminder or check-in, like WhatsApp quick replies. */
function QuickActions({ occ, onMessages, onProof }: { occ: TodayRef; onMessages: (m: ChatMessage[], status: string) => void; onProof: (id: string) => void }) {
  const t = useTranslations();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const keyRef = useRef(crypto.randomUUID());
  async function go(kind: "done" | "later" | "skipped" | "unable") {
    setBusy(true);
    setErr(null);
    const r = await chatQuickAction(occ.id, kind, keyRef.current);
    setBusy(false);
    if (!r.ok) return setErr(r.error === "not_yet_due" ? t("chatUi.notYetDue") : t("common.error"));
    keyRef.current = crypto.randomUUID();
    onMessages((r.messages ?? []).map((m) => ({ ...m, channel: "web", sources: [] })), kind === "done" ? "self_reported" : kind === "later" ? "later" : kind);
  }
  const btn = "pill-btn min-h-9 px-3 text-sm";
  return (
    <div className="mt-2.5">
      <div className="flex flex-wrap gap-1.5">
        <button type="button" disabled={busy} onClick={() => go("done")} className={`${btn} pill-btn-primary`}><Check size={15} aria-hidden="true" />{t("today.done")}</button>
        <button type="button" disabled={busy} onClick={() => go("later")} className={btn}><Clock size={14} aria-hidden="true" />{t("today.later")}</button>
        <button type="button" disabled={busy} onClick={() => go("skipped")} className={btn}><SkipForward size={14} aria-hidden="true" />{t("today.skip")}</button>
        <button type="button" disabled={busy} onClick={() => go("unable")} className={btn}><Moon size={14} aria-hidden="true" />{t("chatUi.unwellShort")}</button>
        <button type="button" onClick={() => onProof(occ.id)} className={btn}><Camera size={14} aria-hidden="true" />{t("chatUi.proof")}</button>
      </div>
      {err ? <p className="mt-1.5 text-sm text-danger-ink">{err}</p> : null}
    </div>
  );
}

export function ChatClient({ initial, voice, audioReplies, suggestions, name, autoSend, today }: { initial: ChatMessage[]; voice: { configured: boolean; consent: boolean }; audioReplies: boolean; suggestions: string[]; name: string | null; autoSend?: string; today: TodayRef[] }) {
  const t = useTranslations("chat");
  const tc = useTranslations("common");
  const tr = useTranslations();
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
  const openToday = today.filter((o) => OPEN.includes(statusById[o.id] ?? o.display));

  // Opening the chat clears its unread badge; new proactive messages arrive by refresh.
  useEffect(() => { void markChatSeen(); }, []);
  useEffect(() => {
    const h = setInterval(() => {
      if (document.visibilityState === "visible" && !input.current?.value && !document.querySelector("[data-attach-open]")) router.refresh();
    }, 45_000);
    return () => clearInterval(h);
  }, [router]);
  const addMessages = useCallback((m: ChatMessage[], occId?: string, status?: string) => {
    setMessages((cur) => [...cur, ...m]);
    if (occId && status) setStatusById((s) => ({ ...s, [occId]: status }));
  }, []);

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
      setReveal({ id, n: 0 });
    } catch {
      setMessages((m) => m.filter((x) => x.id !== tempId));
      setText(body);
      setError(tc("error"));
    } finally {
      setBusy(false);
      input.current?.focus();
    }
  }, [text, busy, t, tc]);

  // A suggestion tapped elsewhere (e.g. on Today) arrives as ?q= and is sent once.
  useEffect(() => {
    if (autoSend && !sentAuto.current) {
      sentAuto.current = true;
      router.replace("/chat");
      void send(autoSend);
    }
  }, [autoSend, router, send]);

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
  async function copy(m: ChatMessage) {
    try { await navigator.clipboard.writeText(m.content); setCopied(m.id); setTimeout(() => setCopied(null), 1500); } catch {}
  }

  const empty = messages.length === 0;

  return (
    <div className="-mx-4 -mb-32 -mt-6 flex h-[calc(100dvh-4rem-62px-env(safe-area-inset-bottom))] flex-col sm:-mx-6 lg:-mx-10 lg:-mb-14 lg:-mt-8 lg:h-[calc(100dvh-4rem)]">
      <div ref={scroller} className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-3xl px-4 pb-6 pt-6 sm:px-6">
          {empty ? (
            <div className="flex min-h-[52dvh] flex-col items-center justify-center text-center">
              <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,var(--hero-from),var(--hero-to))] text-white shadow-[var(--shadow-md)]"><Leaf size={26} aria-hidden="true" /></span>
              <h1 className="mt-5 text-[1.9rem] sm:text-[2.3rem]">{name ? t("helloName", { name }) : t("hello")}</h1>
              <p className="mt-2 max-w-md text-ink-soft">{t("empty")}</p>
              <p className="hint mt-1">{t("whatsappNote")}</p>
            </div>
          ) : (
            <>
              <h1 className="sr-only">{t("title")}</h1>
              <p className="hint mb-6 text-center">{t("whatsappNote")}</p>
            </>
          )}

          <ol className="flex flex-col gap-6" aria-live="polite" aria-relevant="additions">
            {messages.map((m) => {
              const isRevealing = revealing && reveal?.id === m.id;
              const shown = isRevealing ? m.content.slice(0, reveal!.n) : m.content;
              if (m.role === "user") {
                return (
                  <li key={m.id} className="flex flex-col items-end">
                    <div className={`max-w-[85%] rounded-[22px] rounded-br-md bg-surface-3 px-4 py-2.5 text-[1.02rem] ${m.pending ? "opacity-70" : ""}`}><p className="whitespace-pre-wrap">{m.content}</p></div>
                    {m.channel === "whatsapp" ? <p className="mt-1 text-xs text-ink-faint">{t("fromWhatsapp")}</p> : null}
                  </li>
                );
              }
              const occRef = m.sources.find((x) => x.type === "occurrence");
              const occ = occRef ? today.find((o) => o.id === occRef.id) : undefined;
              const actionable = !!occ && OPEN.includes(statusById[occ.id] ?? occ.display);
              const checkin = m.role === "assistant" && m.channel === "system";
              if (m.role === "notice") {
                return (
                  <li key={m.id} className="flex gap-3">
                    <span aria-hidden="true" className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-haldi-soft text-haldi-ink"><Bell size={15} /></span>
                    <div className="min-w-0 flex-1 rounded-2xl border border-[color-mix(in_srgb,var(--haldi)_40%,var(--line))] bg-surface px-4 py-3">
                      <p className="text-xs font-bold text-haldi-ink">{t("notice")}</p>
                      <p className="mt-0.5 text-[1.02rem]">{m.content}</p>
                      {occ && actionable ? <QuickActions occ={occ} onProof={setAttachFor} onMessages={(ms, st) => addMessages(ms, occ.id, st)} /> : occ ? <p className="mt-1 text-sm font-semibold text-st-done">{tr(`status.${statusById[occ.id] ?? occ.display}`)}</p> : null}
                    </div>
                  </li>
                );
              }
              return (
                <li key={m.id} className="group flex gap-3">
                  <span aria-hidden="true" className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary"><Leaf size={16} /></span>
                  <div className={`min-w-0 flex-1 text-[1.02rem] leading-relaxed ${m.safety === "escalation" ? "rounded-2xl border-2 border-danger-ink bg-danger-bg p-4 text-danger-ink" : ""}`}>
                    {m.safety === "escalation" ? <strong className="mb-1 block">{t("escalation")}</strong> : null}
                    {checkin ? <p className="mb-1 flex items-center gap-1.5 text-xs font-bold text-primary"><Sparkles size={13} aria-hidden="true" />{t("checkinLabel")}</p> : null}
                    <Rich text={shown} />
                    {checkin && !isRevealing ? m.sources.filter((x) => x.type === "occurrence").map((x) => today.find((o) => o.id === x.id)).filter((o): o is TodayRef => !!o && OPEN.includes(statusById[o.id] ?? o.display)).slice(0, 2).map((o) => (
                      <div key={o.id} className="mt-2 rounded-2xl border border-line bg-surface p-3">
                        <p className="text-sm font-semibold">{o.title}{o.time ? <span className="font-normal text-ink-soft"> · {o.time}</span> : null}</p>
                        <QuickActions occ={o} onProof={setAttachFor} onMessages={(ms, st) => addMessages(ms, o.id, st)} />
                      </div>
                    )) : null}
                    {m.channel === "whatsapp" ? <p className="mt-1 text-xs text-ink-faint">{t("fromWhatsapp")}</p> : null}
                    {!isRevealing && m.sources.some((x) => !HIDDEN_REFS.includes(x.type)) ? <p className="mt-2 flex flex-wrap gap-1.5">{m.sources.filter((x) => !HIDDEN_REFS.includes(x.type)).map((s) => <span key={`${s.type}-${s.id}`} className="chip">{s.label}</span>)}</p> : null}
                    {!isRevealing ? (
                      <div className="mt-1.5 flex gap-1 text-ink-faint opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100">
                        <button type="button" onClick={() => copy(m)} className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-surface-2 hover:text-ink" aria-label={t("copy")}>{copied === m.id ? <Check size={15} /> : <Copy size={15} />}</button>
                        {audioReplies && voice.configured && voice.consent ? <button type="button" onClick={() => play(m.content)} className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-surface-2 hover:text-ink" aria-label={t("play")}><Volume2 size={15} /></button> : null}
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
                <button key={s} type="button" onClick={() => send(s)} className={`rounded-2xl border border-line bg-surface text-left transition-colors hover:border-primary hover:bg-primary-soft ${empty ? "px-4 py-3 text-[0.96rem]" : "shrink-0 whitespace-nowrap px-3.5 py-2 text-sm"}`}>{s}</button>
              ))}
            </div>
          ) : null}
          <form onSubmit={(e) => { e.preventDefault(); send(); }} className="flex items-end gap-1.5 rounded-[26px] border border-line-strong bg-surface p-2 shadow-[var(--shadow-md)] focus-within:border-primary">
            <button type="button" disabled={today.length === 0} title={today.length === 0 ? t("noActionsForProof") : undefined} onClick={() => setAttachFor((a) => (a ? null : (openToday[0] ?? today[0])?.id ?? null))} aria-label={t("attachProof")} aria-expanded={!!attachFor} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink-soft transition-colors hover:bg-surface-2 hover:text-ink disabled:opacity-30"><Plus size={22} aria-hidden="true" /></button>
            <label htmlFor="chat-input" className="sr-only">{t("placeholder")}</label>
            <textarea ref={input} id="chat-input" rows={1} maxLength={2000} placeholder={t("placeholder")} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); } }} className="max-h-[200px] min-h-[44px] flex-1 resize-none bg-transparent px-1 py-2.5 text-[1.02rem] outline-none placeholder:text-ink-faint" />
            <VoiceRecorder
              compact
              enabled={voice.configured && voice.consent}
              disabledReason={!voice.consent ? t("voiceConsent") : t("voiceUnavailable")}
              onTranscript={(tr, uncertain) => {
                setText(tr);
                setTranscriptNote(uncertain ? `${t("transcriptConfirm")} ${t("transcriptUncertain")}` : t("transcriptConfirm"));
                input.current?.focus();
              }}
              onError={(m) => setError(m)}
            />
            <button type="submit" aria-label={t("send")} disabled={busy || !text.trim()} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary text-primary-ink transition-opacity disabled:opacity-30"><ArrowUp size={20} aria-hidden="true" /></button>
          </form>
          <p className="mt-2 text-center text-xs text-ink-faint">{t("disclaimer")}</p>
        </div>
      </div>
    </div>
  );
}
