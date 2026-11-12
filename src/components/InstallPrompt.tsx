"use client";
// "Add to home screen" helper. Android/desktop Chrome: uses the browser's install prompt.
// iPhone Safari has no prompt API, so we show the two-step instruction instead.
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Download, Share, X } from "lucide-react";

type BIP = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
const KEY = "sukhi_install_dismissed";

export function InstallPrompt() {
  const t = useTranslations("install");
  const [evt, setEvt] = useState<BIP | null>(null);
  const [ios, setIos] = useState(false);
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone;
    let dismissed = false;
    try { dismissed = localStorage.getItem(KEY) === "1"; } catch {}
    if (standalone || dismissed) return;
    const onPrompt = (e: Event) => { e.preventDefault(); setEvt(e as BIP); setHidden(false); };
    window.addEventListener("beforeinstallprompt", onPrompt);
    const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent) && !/crios|fxios/i.test(navigator.userAgent);
    const h = isIos ? setTimeout(() => { setIos(true); setHidden(false); }, 0) : undefined;
    return () => { window.removeEventListener("beforeinstallprompt", onPrompt); if (h) clearTimeout(h); };
  }, []);

  if (hidden) return null;
  const dismiss = () => { setHidden(true); try { localStorage.setItem(KEY, "1"); } catch {} };
  return (
    <div className="pop-in relative mb-5 flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4 pr-12 shadow-[var(--shadow-sm)] sm:flex-row sm:items-center sm:pr-14">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">{ios ? <Share size={19} aria-hidden="true" /> : <Download size={19} aria-hidden="true" />}</span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold leading-snug">{t("title")}</p>
          <p className="text-sm text-ink-soft">{ios ? t("iosSteps") : t("body")}</p>
        </div>
      </div>
      {evt ? <button type="button" className="pill-btn pill-btn-primary w-full shrink-0 sm:w-auto" onClick={async () => { await evt.prompt(); await evt.userChoice.catch(() => null); dismiss(); }}>{t("button")}</button> : null}
      <button type="button" onClick={dismiss} aria-label={t("dismiss")} className="absolute right-2 top-2 flex h-10 w-10 items-center justify-center rounded-full text-ink-soft hover:bg-surface-2 sm:top-1/2 sm:-translate-y-1/2"><X size={17} aria-hidden="true" /></button>
    </div>
  );
}
