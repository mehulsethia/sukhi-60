"use client";
import { useActionState, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Check, Share2 } from "lucide-react";
import { clinicApproveAction, clinicNoteAction, clinicProofAction, clinicRedeemAction, clinicRewardAction } from "@/app/clinic/actions";

/** Share the clinic link (share sheet on phones, copy on computers). */
export function ShareCode({ link }: { link: string }) {
  const t = useTranslations("clinic");
  const [copied, setCopied] = useState(false);
  async function share() {
    const text = t("shareText");
    try { if (navigator.share) { await navigator.share({ title: "Sukhi", text, url: link }); return; } } catch { /* cancelled */ }
    try { await navigator.clipboard.writeText(`${text} ${link}`); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { /* no clipboard */ }
  }
  return (
    <button type="button" onClick={share} className="btn btn-secondary gap-2">
      {copied ? <Check size={16} aria-hidden="true" /> : <Share2 size={16} aria-hidden="true" />}
      {copied ? t("copied") : t("shareLink")}
    </button>
  );
}

export function RewardForm({ current }: { current: string | null }) {
  const t = useTranslations("clinic");
  const [state, action, pending] = useActionState(clinicRewardAction, null);
  const [value, setValue] = useState(current ?? "");
  const presets = [t("reward10"), t("rewardFree")];
  return (
    <form action={action} className="flex flex-col gap-2">
      <label htmlFor="reward" className="text-sm font-semibold">{t("rewardLabel")}</label>
      <input id="reward" name="reward" value={value} onChange={(e) => setValue(e.target.value)} maxLength={160} placeholder={t("rewardPlaceholder")} className="input" />
      <div className="flex flex-wrap gap-2">
        {presets.map((p) => <button key={p} type="button" onClick={() => setValue(p)} className="rounded-full border border-line px-3 py-1 text-xs text-ink-soft hover:bg-sky">{p}</button>)}
      </div>
      <div className="mt-1 flex items-center gap-3">
        <button disabled={pending} className="btn btn-primary">{t("save")}</button>
        {current ? <button type="submit" name="remove" value="1" disabled={pending} onClick={() => setValue("")} className="link text-sm">{t("rewardRemove")}</button> : null}
        <span role="status" className="text-sm text-ink-soft">{state?.ok ? t("saved") : state?.error ? t("error") : ""}</span>
      </div>
    </form>
  );
}

export function RedeemForm() {
  const t = useTranslations("clinic");
  const [state, action, pending] = useActionState(clinicRedeemAction, null);
  return (
    <form action={action} className="flex flex-col gap-2">
      <label htmlFor="code" className="text-sm font-semibold">{t("redeemLabel")}</label>
      <div className="flex gap-2">
        <input id="code" name="code" required autoComplete="off" autoCapitalize="characters" placeholder="ABC234" className="input min-w-0 flex-1 uppercase" />
        <button disabled={pending} className="btn btn-secondary">{t("redeem")}</button>
      </div>
      <p role="status" className="min-h-5 text-sm">
        {state?.kind === "ok" ? <span className="font-semibold text-primary">{t("redeemOk", { name: state.name, reward: state.reward, pct: state.pct })}</span>
          : state?.kind === "used" ? t("redeemUsed")
          : state?.kind === "bad" ? t("redeemBad") : ""}
      </p>
    </form>
  );
}

export function NoteForm({ linkId, name, review = false }: { linkId: string; name: string; review?: boolean }) {
  const t = useTranslations("clinic");
  const [state, action, pending] = useActionState(clinicNoteAction, null);
  const [key, setKey] = useState(0);
  return (
    <form key={key} action={async (fd) => { await action(fd); }} className="flex flex-col gap-2">
      <input type="hidden" name="linkId" value={linkId} />
      {review ? <input type="hidden" name="review" value="1" /> : null}
      <label htmlFor={`note-${review ? "r" : "n"}`} className="text-sm font-semibold">{review ? t("changeLabel", { name }) : t("noteLabel", { name })}</label>
      <textarea id={`note-${review ? "r" : "n"}`} name="text" required maxLength={1500} rows={3} className="input" placeholder={review ? t("changePlaceholder") : t("notePlaceholder")} />
      <div className="flex items-center gap-3">
        <button disabled={pending} className="btn btn-primary">{t("send")}</button>
        <span role="status" className="text-sm text-ink-soft">
          {state?.ok ? (state.sent ? t("noteSent", { name }) : t("noteQueued", { name })) : state?.error ? t("error") : ""}
        </span>
        {state?.ok ? <button type="button" className="link text-sm" onClick={() => setKey((k) => k + 1)}>{t("another")}</button> : null}
      </div>
    </form>
  );
}

export function ApproveButton({ linkId, planId }: { linkId: string; planId: string }) {
  const t = useTranslations("clinic");
  const [pending, start] = useTransition();
  const [failed, setFailed] = useState(false);
  return (
    <>
      <button type="button" disabled={pending} className="btn btn-primary gap-2" onClick={() => start(async () => { const r = await clinicApproveAction(linkId, planId); setFailed(!r.ok); })}>
        <Check size={16} aria-hidden="true" />{t("looksRight")}
      </button>
      {failed ? <span role="alert" className="text-sm text-ink-soft">{t("error")}</span> : null}
    </>
  );
}

export function ProofToggle({ linkId, itemId, on, title }: { linkId: string; itemId: string; on: boolean; title: string }) {
  const t = useTranslations("clinic");
  const [value, setValue] = useState(on);
  const [pending, start] = useTransition();
  const flip = () => {
    const next = !value;
    setValue(next);
    start(async () => { const r = await clinicProofAction(linkId, itemId, next); if (!r.ok) setValue(!next); });
  };
  return (
    <button type="button" role="switch" aria-checked={value} aria-label={t("photoFor", { title })} disabled={pending} onClick={flip}
      className="flex shrink-0 items-center gap-2 text-xs text-ink-soft">
      <span className={`relative h-5 w-9 rounded-full transition-colors ${value ? "bg-primary" : "bg-line"}`}>
        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-surface shadow transition-all ${value ? "left-[1.125rem]" : "left-0.5"}`} />
      </span>
      {t("photo")}
    </button>
  );
}
