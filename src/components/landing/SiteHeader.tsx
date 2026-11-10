"use client";
import Link from "next/link";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Menu, X } from "lucide-react";
import { Logo } from "@/components/Logo";

const LINKS = [
  ["#how", "navHow"],
  ["#features", "navFeatures"],
  ["#safety", "navSafety"],
  ["#families", "navFamilies"],
  ["#faq", "navFaq"],
] as const;

export function SiteHeader({ signedIn }: { signedIn: boolean }) {
  const t = useTranslations("landing");
  const [open, setOpen] = useState(false);
  return (
    <header className="sticky top-0 z-30 border-b border-line/70 bg-bg/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Logo />
        <nav aria-label={t("menu")} className="hidden items-center gap-1 lg:flex">
          {LINKS.map(([href, key]) => (
            <a key={href} href={href} className="rounded-full px-3 py-2 text-[0.95rem] font-medium text-ink-soft hover:bg-surface-2 hover:text-ink">{t(key)}</a>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          {signedIn ? (
            <Link href="/today" className="btn btn-primary min-h-11">{t("openApp")}</Link>
          ) : (
            <>
              <Link href="/login" className="btn btn-ghost hidden min-h-11 sm:inline-flex">{t("logIn")}</Link>
              <Link href="/signup" className="btn btn-primary min-h-11">{t("getStarted")}</Link>
            </>
          )}
          <button type="button" className="btn btn-ghost min-h-11 px-3 lg:hidden" aria-expanded={open} aria-controls="mobile-menu" onClick={() => setOpen((o) => !o)}>
            {open ? <X size={22} aria-hidden="true" /> : <Menu size={22} aria-hidden="true" />}
            <span className="sr-only">{t("menu")}</span>
          </button>
        </div>
      </div>
      {open ? (
        <nav id="mobile-menu" aria-label={t("menu")} className="border-t border-line bg-bg px-4 pb-4 lg:hidden">
          <ul className="flex flex-col py-2">
            {LINKS.map(([href, key]) => (
              <li key={href}><a href={href} onClick={() => setOpen(false)} className="block rounded-xl px-3 py-3 text-lg font-medium hover:bg-surface-2">{t(key)}</a></li>
            ))}
          </ul>
          {!signedIn ? <Link href="/login" className="btn btn-secondary w-full">{t("logIn")}</Link> : null}
        </nav>
      ) : null}
    </header>
  );
}
