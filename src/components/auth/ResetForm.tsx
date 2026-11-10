"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/browser";
import { Alert } from "@/components/ui";
import { PasswordField } from "./PasswordField";
import { authErrorKey } from "./authErrors";

export function ResetForm() {
  const t = useTranslations("auth");
  const router = useRouter();
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "danger"; text: string } | null>(null);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pw.length < 8) return setMsg({ tone: "danger", text: t("weakPassword") });
    if (pw !== pw2) return setMsg({ tone: "danger", text: t("mismatch") });
    setBusy(true);
    const { error } = await createClient().auth.updateUser({ password: pw });
    if (error) {
      setBusy(false);
      return setMsg({ tone: "danger", text: t(authErrorKey(error)) });
    }
    setMsg({ tone: "ok", text: t("resetDone") });
    router.replace("/today");
    router.refresh();
  }
  return (
    <form onSubmit={submit} className="flex flex-col gap-5" noValidate>
      <div aria-live="polite" className="empty:hidden">{msg ? <Alert tone={msg.tone}>{msg.text}</Alert> : null}</div>
      <PasswordField id="new-password" label={t("newPassword")} value={pw} onChange={setPw} autoComplete="new-password" hint={t("passwordHint")} />
      <PasswordField id="confirm-password" label={t("confirmPassword")} value={pw2} onChange={setPw2} autoComplete="new-password" />
      <button type="submit" className="btn btn-primary btn-lg w-full" disabled={busy || !pw || !pw2}>{t("savePassword")}</button>
    </form>
  );
}
