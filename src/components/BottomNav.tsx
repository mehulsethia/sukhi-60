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
                <Link href={href} aria-current={active ? "page" : undefined} className={`relative flex min-h-12 items-center gap-3 rounded-xl px-3.5 text-[0.98rem] font-semibold transition-colors ${active ? "bg-primary-soft text-primary" : "text-ink-soft hover:bg-surface-2 hover:text-ink"}`}>
                  {active ? <span aria-hidden="true" className="absolute -left-4 top-2 h-8 w-1 rounded-r-full bg-primary" /> : null}
                  <Icon aria-hidden="true" size={20} strokeWidth={active ? 2.3 : 1.8} />
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
    <nav aria-label={t("main")} className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 shadow-[0_-8px_24px_-16px_rgb(14_23_38/0.25)] backdrop-blur-md">
      <ul className="mx-auto flex max-w-2xl justify-between px-2 pb-[env(safe-area-inset-bottom)]">
        {ITEMS.map(({ href, key, Icon }) => {
          const active = isActive(href);
          return (
            <li key={href} className="flex-1">
              <Link href={href} aria-current={active ? "page" : undefined} className={`flex min-h-[62px] flex-col items-center justify-center gap-1 text-[0.72rem] font-semibold ${active ? "text-primary" : "text-ink-soft"}`}>
                <span className={`flex h-8 w-14 items-center justify-center rounded-full transition-colors ${active ? "bg-primary-soft" : ""}`}>
                  <Icon aria-hidden="true" size={20} strokeWidth={active ? 2.2 : 1.8} />
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
