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
                <Link href={href} aria-current={active ? "page" : undefined} className={`flex min-h-11 items-center gap-3 rounded-lg px-3 text-[0.95rem] font-medium transition-colors ${active ? "bg-primary-soft text-primary" : "text-ink-soft hover:bg-surface-2 hover:text-ink"}`}>
                  <Icon aria-hidden="true" size={19} strokeWidth={active ? 2.2 : 1.8} />
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
                <span className={`flex h-7 w-12 items-center justify-center rounded-md transition-colors ${active ? "bg-primary-soft" : ""}`}>
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
