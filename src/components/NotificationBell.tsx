"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Award, Bell, CalendarClock, ClipboardCheck, Image as ImageIcon, MessageCircle, Sparkles, Users, Wind } from "lucide-react";
import { markNotificationsRead } from "@/app/actions";

export interface BellItem { id: string; kind: string; text: string; href: string; when: string; unread: boolean }

const ICONS: Record<string, typeof Bell> = { checkin: Sparkles, due: CalendarClock, reminder: CalendarClock, drafts: ClipboardCheck, assessment: ImageIcon, milestone: Award, proposal: Sparkles, missed: Wind, whatsapp: MessageCircle, family: Users };
const TONE: Record<string, string> = { checkin: "var(--primary)", due: "var(--st-open)", missed: "var(--st-skipped)", drafts: "var(--st-review)", assessment: "var(--st-evidence)", milestone: "var(--haldi)", proposal: "var(--st-unable)", whatsapp: "var(--st-done)", family: "var(--st-done)", reminder: "var(--st-open)" };

export function NotificationBell() {
  const t = useTranslations("notif");
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<BellItem[]>([]);
  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/notifications", { cache: "no-store" });
      if (r.ok) setItems(((await r.json()) as { items: BellItem[] }).items);
    } catch { /* offline: keep what we have */ }
  }, []);
  // Loaded after render (never blocks a page), refreshed on open and every 2 minutes.
  useEffect(() => {
    const first = setTimeout(load, 0);
    const h = setInterval(() => { if (document.visibilityState === "visible") void load(); }, 120_000);
    return () => { clearTimeout(first); clearInterval(h); };
  }, [load]);
  const [, start] = useTransition();
  const router = useRouter();
  const ref = useRef<HTMLDivElement>(null);
  const unread = items.filter((i) => i.unread).length;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  const markRead = () => start(async () => { await markNotificationsRead(); setItems((xs) => xs.map((x) => (x.kind === "due" ? x : { ...x, unread: false }))); router.refresh(); });

  return (
    <div ref={ref} className="relative">
      <button type="button" aria-label={unread ? t("bellUnread", { n: unread }) : t("bell")} aria-expanded={open} onClick={() => { setOpen((o) => !o); if (!open) void load(); }} className="relative flex h-10 w-10 items-center justify-center rounded-full text-ink-soft transition-colors hover:bg-surface-2 hover:text-ink">
        <Bell size={20} aria-hidden="true" />
        {unread ? <span className="absolute right-1 top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-st-missed px-1 text-[0.68rem] font-bold leading-none text-white">{unread > 9 ? "9+" : unread}</span> : null}
      </button>
      {open ? (
        <div role="dialog" aria-label={t("title")} className="pop-in fixed inset-x-3 top-16 z-50 overflow-hidden rounded-2xl border border-line bg-surface shadow-[var(--shadow-lg)] sm:absolute sm:inset-x-auto sm:right-0 sm:top-12 sm:w-[380px]">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <p className="font-bold">{t("title")}</p>
            {unread ? <button type="button" onClick={markRead} className="text-sm font-semibold text-primary hover:underline">{t("markRead")}</button> : null}
          </div>
          {items.length === 0 ? (
            <div className="px-6 py-10 text-center">
              <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-primary-soft text-primary"><Bell size={20} aria-hidden="true" /></span>
              <p className="mt-3 font-semibold">{t("emptyTitle")}</p>
              <p className="mt-1 text-sm text-ink-soft">{t("emptyBody")}</p>
            </div>
          ) : (
            <ul className="max-h-[min(70dvh,460px)] overflow-y-auto">
              {items.map((n) => {
                const Icon = ICONS[n.kind] ?? Bell;
                return (
                  <li key={n.id}>
                    <Link href={n.href} onClick={() => setOpen(false)} className={`flex gap-3 border-b border-line px-4 py-3 last:border-0 hover:bg-surface-2 ${n.unread ? "" : "opacity-75"}`}>
                      <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full" style={{ background: `color-mix(in srgb, ${TONE[n.kind] ?? "var(--primary)"} 16%, var(--surface))`, color: `color-mix(in srgb, ${TONE[n.kind] ?? "var(--primary)"} 75%, var(--ink))` }}><Icon size={17} aria-hidden="true" /></span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[0.95rem] leading-snug">{n.text}</span>
                        <span className="mt-0.5 block text-xs text-ink-faint">{n.when}</span>
                      </span>
                      {n.unread ? <span className="dot mt-2 bg-primary" aria-label={t("unread")} /> : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
