"use client";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Globe } from "lucide-react";
import { setLocaleCookie } from "@/lib/client-prefs";

const OPTIONS = [
  { value: "en", label: "English" },
  { value: "hi", label: "हिन्दी" },
  { value: "mr", label: "मराठी" },
] as const;

/** Explicit locale choice only — the page never switches language on its own (spec §9). */
export function LanguageSelector({ className = "" }: { className?: string }) {
  const t = useTranslations("landing");
  const locale = useLocale();
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <label className={`relative inline-flex items-center ${className}`}>
      <span className="sr-only">{t("language")}</span>
      <Globe size={17} aria-hidden="true" className="pointer-events-none absolute left-3 text-ink-soft" />
      <select
        value={locale}
        disabled={pending}
        onChange={(e) => { setLocaleCookie(e.target.value); start(() => router.refresh()); }}
        className="min-h-11 cursor-pointer appearance-none rounded-[var(--r-md)] border border-line bg-surface py-2 pl-9 pr-3 text-[0.95rem] font-medium text-ink hover:border-line-strong"
      >
        {OPTIONS.map((o) => <option key={o.value} value={o.value} lang={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}
