"use client";
import Link from "next/link";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/browser";
import { hardNavigate } from "@/lib/client-prefs";
import { Alert } from "@/components/ui";
import { PasswordField } from "./PasswordField";
import { authErrorKey } from "./authErrors";

export function LoginForm({ next, initialError }: { next: string; initialError: string | null }) {
  const t = useTranslations("auth");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(initialError);
  const [info, setInfo] = useState<string | null>(null);
  const [unconfirmed, setUnconfirmed] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setInfo(null);
    const { error: err } = await createClient().auth.signInWithPassword({ email, password });
    if (err) {
      const key = authErrorKey(err);
      setUnconfirmed(key === "unconfirmed");
      setError(t(key));
      setBusy(false);
      return;
    }
    // Full navigation so the new session cookie is used by the very next server render.
    hardNavigate(next);
  }

  async function magic() {
    if (!email) return;
    setBusy(true);
    setError(null);
    const { error: err } = await createClient().auth.signInWithOtp({ email, options: { shouldCreateUser: false, emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}` } });
    setBusy(false);
    if (err) setError(t(authErrorKey(err)));
    else setInfo(t("magicSent", { email }));
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-5" noValidate>
      <div aria-live="polite" className="empty:hidden">
        {error ? <Alert tone="danger">{error}{unconfirmed ? <> <Link className="link" href={`/check-email?email=${encodeURIComponent(email)}`}>{t("resend")}</Link></> : null}</Alert> : null}
        {info ? <Alert tone="ok">{info}</Alert> : null}
      </div>
      <div className="field">
        <label htmlFor="email">{t("email")}</label>
        <input id="email" type="email" autoComplete="email" required className="input" value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <div>
        <PasswordField id="password" label={t("password")} value={password} onChange={setPassword} autoComplete="current-password" />
        <div className="mt-2 text-right"><Link href="/forgot-password" className="link text-sm">{t("forgot")}</Link></div>
      </div>
      <button type="submit" className="btn btn-primary btn-lg w-full" disabled={busy || !email || !password}>{busy ? t("loggingIn") : t("logIn")}</button>
      <div className="flex items-center gap-3 text-sm text-ink-soft" aria-hidden="true"><span className="h-px flex-1 bg-line" />{t("or")}<span className="h-px flex-1 bg-line" /></div>
      <button type="button" className="btn btn-secondary w-full" onClick={magic} disabled={busy || !email}>{t("magic")}</button>
      <p className="text-center text-ink-soft">{t("noAccount")} <Link href="/signup" className="link">{t("signUpLink")}</Link></p>
    </form>
  );
}
