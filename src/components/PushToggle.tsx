"use client";
// Phone notifications for this device. Android/desktop: works in the browser or installed app.
// iPhone: only from the Home Screen app (iOS 16.4+), so we explain that first.
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { BellRing, X } from "lucide-react";
import { removePushSubscriptionAction, savePushSubscriptionAction, sendTestPushAction } from "@/app/actions";

type Status = "loading" | "unsupported" | "ios_install" | "denied" | "off" | "on";
const DISMISS = "sukhi_push_prompt_dismissed";

function keyBytes(base64url: string) {
  const pad = "=".repeat((4 - (base64url.length % 4)) % 4);
  const raw = atob((base64url + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

async function currentSubscription() {
  const reg = await navigator.serviceWorker.getRegistration();
  return reg ? reg.pushManager.getSubscription() : null;
}

function detect(): Promise<Status> {
  if (typeof window === "undefined") return Promise.resolve("loading");
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone;
  if (ios && !standalone) return Promise.resolve("ios_install");
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return Promise.resolve("unsupported");
  if (Notification.permission === "denied") return Promise.resolve("denied");
  return currentSubscription().then((s) => (s && Notification.permission === "granted" ? "on" : "off")).catch(() => "off" as const);
}

export function PushToggle({ publicKey, variant = "full" }: { publicKey: string | null; variant?: "full" | "prompt" }) {
  const t = useTranslations("push");
  const [status, setStatus] = useState<Status>("loading");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [hidden, setHidden] = useState(variant === "prompt");

  useEffect(() => {
    let alive = true;
    detect().then((s) => {
      if (!alive) return;
      setStatus(s);
      if (variant === "prompt") {
        let dismissed = false;
        try { dismissed = localStorage.getItem(DISMISS) === "1"; } catch {}
        setHidden(dismissed || s !== "off");
      }
    });
    return () => { alive = false; };
  }, [variant]);

  async function enable() {
    if (!publicKey) return;
    setBusy(true);
    setNote(null);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") { setStatus(perm === "denied" ? "denied" : "off"); return; }
      const reg = (await navigator.serviceWorker.getRegistration()) ?? (await navigator.serviceWorker.register("/sw.js", { scope: "/" }));
      await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) }));
      const json = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
      const r = await savePushSubscriptionAction({ endpoint: json.endpoint, p256dh: json.keys.p256dh, auth: json.keys.auth, userAgent: navigator.userAgent });
      if (!r.ok) throw new Error("save");
      setStatus("on");
      if (variant === "prompt") setHidden(true);
    } catch {
      setNote(t("error"));
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    try {
      const sub = await currentSubscription();
      if (sub) { await removePushSubscriptionAction(sub.endpoint); await sub.unsubscribe(); }
      setStatus("off");
    } finally {
      setBusy(false);
    }
  }

  async function test() {
    setBusy(true);
    const r = await sendTestPushAction();
    setBusy(false);
    setNote(r.sent > 0 ? t("testSent") : t("testFailed"));
  }

  if (variant === "prompt") {
    if (hidden || !publicKey) return null;
    const dismiss = () => { setHidden(true); try { localStorage.setItem(DISMISS, "1"); } catch {} };
    return (
      <div className="pop-in mb-5 flex items-center gap-3 rounded-2xl border border-line bg-surface p-3.5 shadow-[var(--shadow-sm)]">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary"><BellRing size={19} aria-hidden="true" /></span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold leading-tight">{t("promptTitle")}</p>
          <p className="text-sm text-ink-soft">{t("promptBody")}</p>
          {note ? <p className="text-sm text-danger-ink" role="alert">{note}</p> : null}
        </div>
        <button type="button" className="pill-btn pill-btn-primary" disabled={busy} onClick={enable}>{t("enable")}</button>
        <button type="button" onClick={dismiss} aria-label={t("dismiss")} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-ink-soft hover:bg-surface-2"><X size={17} aria-hidden="true" /></button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3" aria-live="polite">
      {!publicKey ? <p className="hint">{t("notConfigured")}</p> : null}
      {status === "ios_install" ? <p className="rounded-xl bg-sky p-3">{t("iosHint")}</p> : null}
      {status === "unsupported" ? <p className="hint">{t("unsupported")}</p> : null}
      {status === "denied" ? <p className="rounded-xl bg-warn-bg p-3 text-warn-ink">{t("denied")}</p> : null}
      {status === "on" ? <p className="font-semibold text-ok-ink">{t("enabled")}</p> : null}
      {publicKey && status === "off" ? <button type="button" className="btn btn-primary self-start" disabled={busy} onClick={enable}><BellRing size={17} aria-hidden="true" />{t("enable")}</button> : null}
      {status === "on" ? (
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn btn-secondary" disabled={busy} onClick={test}>{t("test")}</button>
          <button type="button" className="btn btn-ghost" disabled={busy} onClick={disable}>{t("disable")}</button>
        </div>
      ) : null}
      {note ? <p className="text-sm">{note}</p> : null}
      <p className="hint">{t("help")}</p>
    </div>
  );
}
