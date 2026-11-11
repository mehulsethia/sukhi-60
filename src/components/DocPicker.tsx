"use client";
// File input for plan documents: preview, rotate (sideways WhatsApp photos are common),
// photo tips and an optional "words you can read" hint. The prepared (rotated, sized) file
// is written back into the real <input>, so it works with native form posts and FormData.
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Camera, RotateCcw, RotateCw } from "lucide-react";
import { prepareImage } from "@/lib/client-image";

type Rot = 0 | 90 | 180 | 270;

export function DocPicker({ name = "file", hintName = "hint", id = "doc-file", required = false, onChange }: { name?: string; hintName?: string; id?: string; required?: boolean; onChange?: (hasFile: boolean) => void }) {
  const t = useTranslations();
  const input = useRef<HTMLInputElement>(null);
  const [original, setOriginal] = useState<File | null>(null);
  const [rot, setRot] = useState<Rot>(0);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  async function apply(file: File, r: Rot) {
    setBusy(true);
    const prepared = await prepareImage(file, { rotate: r });
    const dt = new DataTransfer();
    dt.items.add(prepared);
    if (input.current) input.current.files = dt.files;
    setPreview((old) => { if (old) URL.revokeObjectURL(old); return prepared.type.startsWith("image/") ? URL.createObjectURL(prepared) : null; });
    setBusy(false);
  }

  async function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.currentTarget.files?.[0] ?? null;
    setOriginal(f);
    setRot(0);
    onChange?.(!!f);
    if (f) await apply(f, 0);
    else setPreview(null);
  }

  async function rotate(delta: 90 | -90) {
    if (!original) return;
    const r = (((rot + delta) % 360) + 360) % 360 as Rot;
    setRot(r);
    await apply(original, r);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-xl bg-surface-2 p-3 text-sm text-ink-soft">
        <p className="flex items-center gap-2 font-semibold text-ink"><Camera size={16} aria-hidden="true" />{t("doc.tipsTitle")}</p>
        <ul className="mt-1 list-disc pl-5">
          <li>{t("doc.tip1")}</li>
          <li>{t("doc.tip2")}</li>
          <li>{t("doc.tip3")}</li>
        </ul>
      </div>
      <input ref={input} id={id} name={name} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" required={required} className="input py-2 text-sm" onChange={pick} />
      {preview ? (
        <div className="flex flex-col gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview} alt={t("doc.previewAlt")} className="max-h-72 w-full rounded-xl border border-line bg-surface object-contain" />
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-ink-soft">{t("doc.rotateHelp")}</span>
            <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => rotate(-90)} aria-label={t("doc.rotateLeft")}><RotateCcw size={18} aria-hidden="true" /></button>
            <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => rotate(90)} aria-label={t("doc.rotateRight")}><RotateCw size={18} aria-hidden="true" /></button>
          </div>
        </div>
      ) : null}
      <div className="field">
        <label htmlFor={`${id}-hint`} className="!text-sm">{t("doc.hintLabel")} <span className="hint">({t("common.optional")})</span></label>
        <textarea id={`${id}-hint`} name={hintName} rows={2} maxLength={600} className="input" placeholder={t("doc.hintPlaceholder")} />
      </div>
    </div>
  );
}
