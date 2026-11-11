"use client";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";

/** Section name in the top bar on desktop (the page itself carries the big heading). */
export function TopTitle() {
  const t = useTranslations("nav");
  const p = usePathname();
  const key = p.startsWith("/chat") ? "chat" : p.startsWith("/plan") ? "plan" : p.startsWith("/progress") ? "progress" : p.startsWith("/settings") ? "settings" : "today";
  return <span className="hidden text-sm font-semibold text-ink-soft lg:inline">{t(key)}</span>;
}
