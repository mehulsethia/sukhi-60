"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { CalendarCheck, MessageCircle, ClipboardList, Sprout, Settings } from "lucide-react";

const ITEMS = [
  { href: "/today", key: "today", Icon: CalendarCheck },
  { href: "/chat", key: "chat", Icon: MessageCircle },
  { href: "/plan", key: "plan", Icon: ClipboardList },
  { href: "/progress", key: "progress", Icon: Sprout },
  { href: "/settings", key: "settings", Icon: Settings },
] as const;

/** Bottom tab bar on mobile; vertical list in the desktop sidebar. */
export function BottomNav({ variant = "tabs" }: { variant?: "tabs" | "sidebar" }) {
  const t = useTranslations("nav");
  const path = usePathname();
  const isActive = (href: string) => path === href || path.startsWith(`${href}/`) || (href === "/today" && path.startsWith("/actions"));

  if (variant === "sidebar") {
    return (
      <nav aria-label={t("main")}>
        <ul className="flex flex-col gap-1">
          {ITEMS.map(({ href, key, Icon }) => {
            const active = isActive(href);
            return (
              <li key={href}>
                <Link href={href} aria-current={active ? "page" : undefined} className={`flex min-h-12 items-center gap-3 rounded-2xl px-4 font-semibold transition-colors ${active ? "bg-primary text-primary-ink shadow-[var(--shadow-sm)]" : "text-ink-soft hover:bg-surface-2 hover:text-ink"}`}>
                  <Icon aria-hidden="true" size={21} strokeWidth={active ? 2.4 : 2} />
                  {t(key)}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    );
  }

  return (
    <nav aria-label={t("main")} className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface/95 backdrop-blur-md">
      <ul className="mx-auto flex max-w-2xl justify-between px-2 pb-[env(safe-area-inset-bottom)]">
        {ITEMS.map(({ href, key, Icon }) => {
          const active = isActive(href);
          return (
            <li key={href} className="flex-1">
              <Link href={href} aria-current={active ? "page" : undefined} className={`flex min-h-[62px] flex-col items-center justify-center gap-1 text-[0.72rem] font-semibold ${active ? "text-primary" : "text-ink-soft"}`}>
                <span className={`flex h-8 w-14 items-center justify-center rounded-full transition-colors ${active ? "bg-surface-2" : ""}`}>
                  <Icon aria-hidden="true" size={22} strokeWidth={active ? 2.5 : 2} />
                </span>
                <span>{t(key)}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
