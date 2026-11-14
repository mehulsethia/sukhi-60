"use client";
// A screen failed to render. Right after a new release, a phone still running the old version
// can't find the old code or server actions: one quiet reload fixes that. Otherwise offer a retry.
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { RotateCw } from "lucide-react";

const STALE = /Failed to find Server Action|ChunkLoadError|Loading chunk|dynamically imported module|Load failed|Failed to fetch|NetworkError/i;
const KEY = "sukhi_auto_reload";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useTranslations("common");
  const router = useRouter();
  useEffect(() => {
    if (!STALE.test(`${error.name} ${error.message}`)) return;
    let last = 0;
    try { last = Number(sessionStorage.getItem(KEY) || 0); sessionStorage.setItem(KEY, String(Date.now())); } catch {}
    if (Date.now() - last > 15_000) window.location.reload();
  }, [error]);
  return (
    <div className="panel flex flex-col items-center px-6 py-10 text-center">
      <p className="max-w-sm text-ink-soft">{t("error")}</p>
      <button type="button" className="btn btn-primary mt-4" onClick={() => { reset(); router.refresh(); }}><RotateCw size={16} aria-hidden="true" />{t("retry")}</button>
    </div>
  );
}
