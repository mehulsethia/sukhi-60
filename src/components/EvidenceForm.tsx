"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Alert } from "@/components/ui";

type Kind = "photo" | "text";

/** Downscale photos in the browser (max 1600px JPEG) so uploads stay well under server limits. */
async function shrinkImage(file: File): Promise<Blob> {
  if (!file.type.startsWith("image/") || file.size < 900_000) return file;
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((res) => canvas.toBlob((b) => res(b ?? file), "image/jpeg", 0.82));
  } catch {
    return file;
  }
}

export function EvidenceForm({ occurrenceId, canMarkDone }: { occurrenceId: string; canMarkDone: boolean }) {
  const t = useTranslations();
  const router = useRouter();
  const [kind, setKind] = useState<Kind>("photo");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "danger" | "info"; text: string } | null>(null);
  const keyRef = useRef(crypto.randomUUID());

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!navigator.onLine) return setMsg({ tone: "danger", text: t("common.offline") });
    const fd = new FormData(e.currentTarget);
    fd.set("occurrence_id", occurrenceId);
    fd.set("kind", kind);
    fd.set("idempotency_key", keyRef.current);
    const f = fd.get("file");
    if (f instanceof File && f.size > 0) fd.set("file", await shrinkImage(f), "photo.jpg");
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/evidence", { method: "POST", body: fd });
      const j = await res.json();
      if (res.status === 409 && j.error === "duplicate_evidence") setMsg({ tone: "info", text: t("action.duplicate") });
      else if (!res.ok) setMsg({ tone: "danger", text: t("common.error") });
      else {
        setMsg({ tone: "ok", text: t(`action.outcome_${j.evaluation.outcome}`) });
        keyRef.current = crypto.randomUUID();
        (e.target as HTMLFormElement).reset();
        router.refresh();
      }
    } catch {
      setMsg({ tone: "danger", text: t("common.error") });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3" encType="multipart/form-data">
      <div role="radiogroup" aria-label={t("action.evidence")} className="flex gap-2">
        {(["photo", "text"] as const).map((k) => (
          <button key={k} type="button" role="radio" aria-checked={kind === k} className={`btn ${kind === k ? "btn-primary" : "btn-secondary"}`} onClick={() => setKind(k)}>
            {t(k === "photo" ? "action.photo" : "action.note")}
          </button>
        ))}
      </div>
      {kind === "photo" ? (
        <div className="field">
          <label htmlFor="ev-file">{t("action.choosePhoto")}</label>
          <input id="ev-file" name="file" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" required className="input" />
        </div>
      ) : null}
      <div className="field">
        <label htmlFor="ev-text">{t("action.noteLabel")}</label>
        <textarea id="ev-text" name="text" className="input" rows={2} maxLength={2000} required={kind === "text"} />
      </div>
      {canMarkDone ? (
        <label className="flex items-center gap-3"><input type="checkbox" name="mark_done" value="true" className="h-6 w-6" />{t("action.markDone")}</label>
      ) : null}
      <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? t("action.submitting") : t("action.submit")}</button>
      <div aria-live="polite">{msg ? <Alert tone={msg.tone}>{msg.text}</Alert> : null}</div>
    </form>
  );
}
