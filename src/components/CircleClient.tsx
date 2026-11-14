"use client";
import { useOptimistic, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Check, Link2, Share2 } from "lucide-react";
import { reactAction } from "@/app/actions";

/** Share the invite link: native share sheet (WhatsApp etc.) when available, else copy. */
export function InviteShare({ url, label, variant = "primary" }: { url: string; label: string; variant?: "primary" | "pill" }) {
  const t = useTranslations("circle");
  const [copied, setCopied] = useState(false);
  async function share() {
    const text = t("shareText");
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
