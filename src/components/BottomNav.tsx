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

export function BottomNav() {
  const t = useTranslations("nav");
  const path = usePathname();
  return (
    <nav aria-label={t("main")} className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface/95 backdrop-blur md:static md:border-0 md:bg-transparent">
      <ul className="mx-auto flex max-w-2xl justify-between px-2 pb-[env(safe-area-inset-bottom)] md:justify-start md:gap-2">
        {ITEMS.map(({ href, key, Icon }) => {
          const active = path === href || path.startsWith(`${href}/`);
          return (
            <li key={href} className="flex-1 md:flex-none">
              <Link href={href} aria-current={active ? "page" : undefined} className={`flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-xl px-2 py-1 text-xs font-semibold md:flex-row md:gap-2 md:text-sm ${active ? "text-primary" : "text-ink-soft"}`}>
                <Icon aria-hidden="true" size={22} strokeWidth={active ? 2.6 : 2} />
                <span>{t(key)}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
