"use client";
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Check, Share2 } from "lucide-react";
import { createDoctorInviteAction } from "@/app/actions";
import { Alert } from "@/components/ui";

// Two taps on purpose: the first makes the link (after the patient has read what is shared),
// the second opens the share sheet (browsers only allow that straight from a tap).
export function DoctorInvite() {
  const t = useTranslations("people");
  const tc = useTranslations("common");
  const [link, setLink] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [copied, setCopied] = useState(false);
  const [pending, start] = useTransition();

  async function share(url: string) {
    const text = t("doctorShareText");
    try {
      if (navigator.share) { await navigator.share({ title: "Sukhi", text, url }); return; }
    } catch { /* cancelled: fall through to copy */ }
    try { await navigator.clipboard.writeText(`${text} ${url}`); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { window.open(`https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`, "_blank"); }
  }

  if (link) {
    return (
      <div className="flex flex-col gap-2">
        <button type="button" onClick={() => share(link)} className="btn btn-primary self-start">
          {copied ? <Check size={16} aria-hidden="true" /> : <Share2 size={16} aria-hidden="true" />}
          {copied ? t("copied") : t("doctorSend")}
        </button>
        <p className="hint text-sm">{t("doctorLinkNote")}</p>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <p className="hint text-sm">{t("doctorConsent")}</p>
      <button type="button" disabled={pending} className="btn btn-secondary self-start" onClick={() => start(async () => {
        const r = await createDoctorInviteAction();
        if (r.ok) setLink(r.link); else setError(true);
      })}>{t("doctorInvite")}</button>
      {error ? <Alert tone="danger">{tc("error")}</Alert> : null}
    </div>
  );
}
