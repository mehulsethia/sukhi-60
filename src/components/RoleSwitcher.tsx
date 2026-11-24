"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { Check, ChevronDown } from "lucide-react";
import type { SwitchOption } from "@/domain/care-for";

/** Header control to move between your own plan, people you care for, and the clinic. */
export function RoleSwitcher({ options }: { options: SwitchOption[] }) {
  const t = useTranslations("switcher");
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  if (options.length < 2) return null;
  const label = (o: SwitchOption) => (o.kind === "me" ? t("me") : o.kind === "clinic" ? t("clinic") : o.name || t("someone"));
  const current = options.find((o) => o.kind !== "me" && path.startsWith(o.href)) ?? options.find((o) => o.kind === "me") ?? options[0];

  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-haspopup="menu" aria-label={t("label")}
        className="flex h-8 max-w-[9.5rem] items-center gap-1 rounded-full border border-line bg-surface px-3 text-[0.8rem] font-semibold text-ink">
        <span className="truncate">{label(current)}</span>
        <ChevronDown size={14} aria-hidden="true" className="shrink-0 text-ink-soft" />
      </button>
      {open ? (
        <ul role="menu" className="absolute right-0 top-10 z-40 w-56 rounded-[var(--r-lg)] border border-line bg-surface p-1 shadow-lg">
          {options.map((o) => {
            const on = o === current;
            const sub = o.kind === "family" ? t("caringFor") : o.kind === "clinic" ? t("patients") : t("myPlan");
            const inner = (
              <>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{label(o)}</span>
                  <span className="block text-xs text-ink-soft">{sub}</span>
                </span>
                {on ? <Check size={16} aria-hidden="true" className="text-primary" /> : null}
              </>
            );
            const cls = `flex min-h-11 items-center gap-2 rounded-lg px-3 py-1.5 ${on ? "bg-sky" : "hover:bg-sky/60"}`;
            return (
              <li key={o.href} role="none">
                <Link role="menuitem" href={o.href} aria-current={on ? "page" : undefined} className={cls} onClick={() => setOpen(false)}>{inner}</Link>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
