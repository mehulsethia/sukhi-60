"use client";
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Heart } from "lucide-react";
import { cheerAction } from "@/app/actions";

export function CheerButton({ accessId, name }: { accessId: string; name: string }) {
  const t = useTranslations("caring");
  const [pending, start] = useTransition();
  const [result, setResult] = useState<null | "sent" | "unreached" | "error">(null);
  const tap = () => start(async () => {
    try {
      const r = await cheerAction(accessId);
      setResult(!r.ok ? "error" : r.reached ? "sent" : "unreached");
    } catch { setResult("error"); }
  });
  const done = result === "sent" || result === "unreached";
  return (
    <div>
      <button type="button" onClick={tap} disabled={pending || done} className="btn btn-primary w-full gap-2">
        <Heart size={18} aria-hidden="true" fill={done ? "currentColor" : "none"} />
        {done ? t("cheerSent") : t("cheer", { name })}
      </button>
      <p role="status" className="hint mt-2 min-h-5 text-center text-sm">
        {result === "sent" ? t("cheerReached", { name }) : result === "unreached" ? t("cheerUnreached", { name }) : result === "error" ? t("cheerError") : ""}
      </p>
    </div>
  );
}
