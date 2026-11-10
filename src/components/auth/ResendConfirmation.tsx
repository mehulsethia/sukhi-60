"use client";
import Link from "next/link";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { MailCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/browser";
import { Alert } from "@/components/ui";
import { authErrorKey } from "./authErrors";

export function ResendConfirmation({ email }: { email: string }) {
  const t = useTranslations("auth");
  const [state, setState] = useState<"idle" | "busy" | "sent" | string>("idle");
  async function resend() {
    setState("busy");
    const { error } = await createClient().auth.resend({ type: "signup", email, options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=/onboarding` } });
    setState(error ? t(authErrorKey(error)) : "sent");
  }
  return (
    <div className="flex flex-col gap-5">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-leaf-soft text-leaf"><MailCheck size={30} aria-hidden="true" /></div>
      <p className="text-ink-soft">{t("checkEmailTip")}</p>
      <div aria-live="polite" className="empty:hidden">
        {state === "sent" ? <Alert tone="ok">{t("resent")}</Alert> : null}
        {state !== "idle" && state !== "busy" && state !== "sent" ? <Alert tone="danger">{state}</Alert> : null}
      </div>
      {email ? <button type="button" className="btn btn-secondary w-full" onClick={resend} disabled={state === "busy"}>{t("resend")}</button> : null}
      <Link href="/login" className="btn btn-ghost w-full">{t("backToLogin")}</Link>
    </div>
  );
}
