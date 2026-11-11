"use client";
import Link from "next/link";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Menu, X } from "lucide-react";
import { Logo } from "@/components/Logo";
import { LanguageSelector } from "./LanguageSelector";

const LINKS = [
  ["#how-it-works", "navHow"],
  ["#benefits", "navBenefits"],
  ["#features", "navFeatures"],
  ["#why-sukhi", "navWhy"],
  ["#faqs", "navFaq"],
] as const;

export function SiteHeader({ signedIn }: { signedIn: boolean }) {
  const t = useTranslations("landing");
  const [open, setOpen] = useState(false);
  // Anchors are relative to the landing page so the header also works on /privacy and /terms.
  const href = (h: string) => `/${h}`;
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-surface/95 backdrop-blur-md">
      <div className="mx-auto flex h-[72px] max-w-6xl items-center justify-between gap-4 px-4 sm:px-8">
        <Logo />
        <nav aria-label={t("menu")} className="hidden items-center gap-0.5 lg:flex">
          {LINKS.map(([h, key]) => (
            <a key={h} href={href(h)} className="rounded-[var(--r-md)] px-3 py-2.5 text-[0.98rem] font-medium text-ink-soft transition-colors hover:bg-sky hover:text-ink">{t(key)}</a>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <LanguageSelector className="hidden md:inline-flex" />
          {signedIn ? (
            <Link href="/today" className="btn btn-primary min-h-11">{t("openApp")}</Link>
          ) : (
            <>
              <Link href="/login" className="btn btn-ghost min-h-11 px-3 text-ink">{t("logIn")}</Link>
              <Link href="/signup" className="btn btn-primary hidden min-h-11 sm:inline-flex">{t("getStarted")}</Link>
            </>
          )}
          <button type="button" className="btn btn-ghost min-h-11 px-2.5 text-ink lg:hidden" aria-expanded={open} aria-controls="mobile-menu" onClick={() => setOpen((o) => !o)}>
            {open ? <X size={24} aria-hidden="true" /> : <Menu size={24} aria-hidden="true" />}
            <span className="sr-only">{t("menu")}</span>
          </button>
        </div>
      </div>
      {open ? (
        <nav id="mobile-menu" aria-label={t("menu")} className="border-t border-line bg-surface px-4 pb-5 lg:hidden">
          <ul className="flex flex-col py-2">
            {LINKS.map(([h, key]) => (
              <li key={h}><a href={href(h)} onClick={() => setOpen(false)} className="flex min-h-12 items-center rounded-[var(--r-md)] px-3 text-[1.05rem] font-medium hover:bg-sky">{t(key)}</a></li>
            ))}
          </ul>
          <div className="flex flex-col gap-3 border-t border-line pt-4">
            <LanguageSelector className="md:hidden [&>select]:w-full" />
            {!signedIn ? <Link href="/signup" className="btn btn-primary w-full">{t("getStarted")}</Link> : null}
          </div>
        </nav>
      ) : null}
    </header>
  );
}
