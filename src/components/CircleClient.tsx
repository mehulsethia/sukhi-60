"use client";
import { useOptimistic, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Check, Copy, Link2, Plus, Share2, Users } from "lucide-react";
import { createCircleAction, joinCircleAction, reactAction } from "@/app/actions";
import { SubmitButton } from "@/components/SubmitButton";

/** Share the invite link: native share sheet (WhatsApp etc.) when available, else copy. */
export function InviteShare({ url, code, label, variant = "primary" }: { url: string; code: string; label: string; variant?: "primary" | "pill" }) {
  const t = useTranslations("circle");
  const [copied, setCopied] = useState(false);
  async function share() {
    const text = t("shareText", { code });
    try {
      if (navigator.share) { await navigator.share({ title: "Sukhi", text, url }); return; }
    } catch { /* cancelled: fall through to copy */ }
    try { await navigator.clipboard.writeText(`${text} ${url}`); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { window.open(`https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`, "_blank"); }
  }
  return (
    <button type="button" onClick={share} className={variant === "primary" ? "btn btn-primary" : "pill-btn text-sm"}>
      {copied ? <Check size={16} aria-hidden="true" /> : variant === "primary" ? <Share2 size={16} aria-hidden="true" /> : <Link2 size={15} aria-hidden="true" />}
      {copied ? t("copied") : label}
    </button>
  );
}

const EMOJI = { cheer: "👏", fire: "🔥", hug: "🤗", nudge: "👋" } as const;
type Kind = keyof typeof EMOJI;

export function Reactions({ postId, counts, mine, canNudge }: { postId: string; counts: Record<Kind, number>; mine: Kind[]; canNudge: boolean }) {
  const t = useTranslations("circle");
  const [pending, start] = useTransition();
  const [state, apply] = useOptimistic({ counts, mine }, (s, k: Kind) => {
    const on = s.mine.includes(k);
    if (on && k === "nudge") return s;
    return { counts: { ...s.counts, [k]: Math.max(0, s.counts[k] + (on ? -1 : 1)) }, mine: on ? s.mine.filter((x) => x !== k) : [...s.mine, k] };
  });
  const tap = (k: Kind) => start(async () => { apply(k); await reactAction(postId, k); });
  const kinds: Kind[] = canNudge ? ["nudge", "hug"] : ["cheer", "fire", "hug"];
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {kinds.map((k) => {
        const on = state.mine.includes(k);
        return (
          <button key={k} type="button" disabled={pending && k === "nudge"} onClick={() => tap(k)} aria-pressed={on} aria-label={t(k)} className={`flex h-8 items-center gap-1 rounded-full border px-2.5 text-[0.8rem] transition-colors ${on ? "border-primary bg-primary-soft text-primary" : "border-line bg-surface text-ink-soft hover:border-ink-soft"}`}>
            <span aria-hidden="true">{EMOJI[k]}</span>
            {k === "nudge" ? <span>{on ? t("nudged") : t("nudge")}</span> : state.counts[k] ? <span className="tabular-nums">{state.counts[k]}</span> : null}
          </button>
        );
      })}
    </div>
  );
}

/** The circle's join code, big enough to read out, with a one-tap copy. */
export function CodeCopy({ code }: { code: string }) {
  const t = useTranslations("circle");
  const [copied, setCopied] = useState(false);
  async function copy() {
    try { await navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { /* no clipboard: the code is on screen */ }
  }
  return (
    <button type="button" onClick={copy} className="pill-btn text-sm" aria-label={`${t("copy")} ${code}`}>
      {copied ? <Check size={15} aria-hidden="true" /> : <Copy size={15} aria-hidden="true" />}
      {copied ? t("copiedCode") : t("copy")}
    </button>
  );
}

/** "Join with a code" and "New circle": one small inline form at a time. */
export function CircleActions({ canCreate }: { canCreate: boolean }) {
  const t = useTranslations("circle");
  const [open, setOpen] = useState<"join" | "new" | null>(null);
  const toggle = (k: "join" | "new") => setOpen((o) => (o === k ? null : k));
  return (
    <div className="mb-5">
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => toggle("join")} aria-expanded={open === "join"} className="pill-btn text-sm"><Users size={15} aria-hidden="true" />{t("joinWithCode")}</button>
        {canCreate ? <button type="button" onClick={() => toggle("new")} aria-expanded={open === "new"} className="pill-btn text-sm"><Plus size={15} aria-hidden="true" />{t("newCircle")}</button> : null}
      </div>
      {open === "join" ? (
        <form action={joinCircleAction} className="mt-3 flex gap-2">
          <input name="code" required inputMode="numeric" autoComplete="off" pattern="\d{5}|[A-Za-z0-9]{8}" maxLength={8} placeholder={t("codePlaceholder")} aria-label={t("joinWithCode")} className="input w-40 text-center text-lg tracking-[0.3em] tabular-nums" autoFocus />
          <SubmitButton className="btn btn-primary">{t("join")}</SubmitButton>
        </form>
      ) : null}
      {open === "new" ? (
        <form action={createCircleAction} className="mt-3 flex gap-2">
          <input name="name" maxLength={40} placeholder={t("namePlaceholder")} aria-label={t("newCircle")} className="input min-w-0 flex-1" autoFocus />
          <SubmitButton className="btn btn-primary">{t("create")}</SubmitButton>
        </form>
      ) : null}
    </div>
  );
}
