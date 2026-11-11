"use client";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/browser";
import { authCallbackUrl, hardNavigate } from "@/lib/client-prefs";
import { Alert } from "@/components/ui";
import { PasswordField } from "./PasswordField";
import { authErrorKey } from "./authErrors";

export function SignupForm() {
  const t = useTranslations("auth");
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) return setError(t("weakPassword"));
    if (!agreed) return setError(t("agreeRequired"));
    setBusy(true);
    const { data, error: err } = await createClient().auth.signUp({ email, password, options: { emailRedirectTo: authCallbackUrl() } });
    if (err) {
      setBusy(false);
      return setError(t(authErrorKey(err)));
    }
    // Supabase returns a user with no identities when the email is already registered.
    if (data.user && data.user.identities?.length === 0) {
      setBusy(false);
      return setError(t("emailTaken"));
    }
    if (data.session) {
      hardNavigate("/onboarding");
    } else {
      router.push(`/check-email?email=${encodeURIComponent(email)}`);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-5" noValidate>
      <div aria-live="polite" className="empty:hidden">{error ? <Alert tone="danger">{error}</Alert> : null}</div>
      <div className="field">
        <label htmlFor="email">{t("email")}</label>
        <input id="email" type="email" autoComplete="email" required className="input" value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <PasswordField id="password" label={t("password")} value={password} onChange={setPassword} autoComplete="new-password" hint={t("passwordHint")} />
      <label className="flex items-start gap-3 text-[0.95rem]">
        <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-1 h-5 w-5 shrink-0 accent-[var(--primary)]" />
        <span>{t.rich("agree", { terms: (c) => <Link href="/terms" className="link" target="_blank">{c}</Link>, privacy: (c) => <Link href="/privacy" className="link" target="_blank">{c}</Link> })}</span>
      </label>
      <button type="submit" className="btn btn-primary btn-lg w-full" disabled={busy || !email || !password}>{busy ? t("creating") : t("createAccount")}</button>
      <p className="text-center text-ink-soft">{t("haveAccount")} <Link href="/login" className="link">{t("logInLink")}</Link></p>
    </form>
  );
}
