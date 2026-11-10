"use client";
import Link from "next/link";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/browser";
import { Alert } from "@/components/ui";
import { authErrorKey } from "./authErrors";

export function ForgotForm() {
  const t = useTranslations("auth");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error: err } = await createClient().auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/auth/callback?next=/reset-password` });
    setBusy(false);
    // Same message whether or not the account exists (no account enumeration).
    if (err && authErrorKey(err) === "rateLimited") setError(t("rateLimited"));
    else setSent(true);
  }
  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      <div aria-live="polite" className="empty:hidden">
        {sent ? <Alert tone="ok">{t("resetSent", { email })}</Alert> : null}
        {error ? <Alert tone="danger">{error}</Alert> : null}
      </div>
      <div className="field">
        <label htmlFor="email">{t("email")}</label>
        <input id="email" type="email" autoComplete="email" required className="input" value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <button type="submit" className="btn btn-primary btn-lg w-full" disabled={busy || !email}>{t("sendReset")}</button>
      <Link href="/login" className="btn btn-ghost w-full">{t("backToLogin")}</Link>
    </form>
  );
}
