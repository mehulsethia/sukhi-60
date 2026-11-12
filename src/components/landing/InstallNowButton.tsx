"use client";
// One-tap install where the browser supports it (Android Chrome, desktop Chrome/Edge).
// Elsewhere (iPhone Safari) this renders nothing and the written steps apply.
import { useEffect, useState } from "react";
import { Download } from "lucide-react";

type BIP = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

export function InstallNowButton({ label, done }: { label: string; done: string }) {
  const [evt, setEvt] = useState<BIP | null>(null);
  const [installed, setInstalled] = useState(false);
  useEffect(() => {
    const onPrompt = (e: Event) => { e.preventDefault(); setEvt(e as BIP); };
    const onInstalled = () => { setInstalled(true); setEvt(null); };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => { window.removeEventListener("beforeinstallprompt", onPrompt); window.removeEventListener("appinstalled", onInstalled); };
  }, []);
  if (installed) return <p className="mt-4 font-semibold text-ok-ink" role="status">{done}</p>;
  if (!evt) return null;
  return (
    <button type="button" className="btn btn-primary mt-4" onClick={async () => { await evt.prompt(); const c = await evt.userChoice.catch(() => null); if (c?.outcome === "accepted") setInstalled(true); setEvt(null); }}>
      <Download size={18} aria-hidden="true" />{label}
    </button>
  );
}
