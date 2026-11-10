"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/browser";
import { Alert } from "@/components/ui";

export function LoginForm({ next, initialError }: { next: string; initialError: string | null }) {
  const t = useTranslations("login");
  const router = useRouter();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(initialError);
  const [info, setInfo] = useState<string | null>(null);

  const callback = () => `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setInfo(null);
    const supabase = createClient();
    const res = mode === "signin"
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({ email, password, options: { emailRedirectTo: callback() } });
    setBusy(false);
    if (res.error) return setError(t("failed"));
    if (mode === "signup" && !res.data.session) return setInfo(t("magicSent"));
    router.replace(next);
    router.refresh();
  }

  async function magic() {
    if (!email) return;
    setBusy(true);
    const { error } = await createClient().auth.signInWithOtp({ email, options: { emailRedirectTo: callback() } });
    setBusy(false);
    if (error) setError(t("failed"));
    else setInfo(t("magicSent"));
  }

  return (
    <form onSubmit={submit} className="card flex flex-col gap-4" noValidate>
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {info ? <Alert tone="ok">{info}</Alert> : null}
      <div className="field">
        <label htmlFor="email">{t("email")}</label>
        <input id="email" name="email" type="email" autoComplete="email" required className="input" value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="password">{t("password")}</label>
        <input id="password" name="password" type="password" minLength={8} autoComplete={mode === "signin" ? "current-password" : "new-password"} required className="input" aria-describedby="pw-hint" value={password} onChange={(e) => setPassword(e.target.value)} />
        <span id="pw-hint" className="hint">{t("passwordHint")}</span>
      </div>
      <button type="submit" className="btn btn-primary" disabled={busy}>{mode === "signin" ? t("signIn") : t("signUp")}</button>
      <button type="button" className="btn btn-secondary" onClick={magic} disabled={busy || !email}>{t("magic")}</button>
      <button type="button" className="btn btn-ghost underline" onClick={() => setMode(mode === "signin" ? "signup" : "signin")}>
        {mode === "signin" ? t("toggleSignUp") : t("toggleSignIn")}
      </button>
    </form>
  );
}
