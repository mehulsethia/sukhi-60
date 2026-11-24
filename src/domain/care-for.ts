// The "Caring for" view and the role switcher. Pure helpers; data loading lives in
// src/server/care-for.ts.
import { addDays } from "@/domain/schedule";
import type { Hat } from "@/domain/hats";

const DONE = new Set(["self_reported", "evidence_supported"]);

export type DayDots = { date: string; done: number; total: number };

/** The last seven local days ending today, with how much of each day's plan was done. */
export function weekStrip(rows: { local_date: string; status: string }[], today: string): DayDots[] {
  const days: DayDots[] = Array.from({ length: 7 }, (_, i) => ({ date: addDays(today, i - 6), done: 0, total: 0 }));
  const byDate = new Map(days.map((d) => [d.date, d]));
  for (const r of rows) {
    const d = byDate.get(r.local_date);
    if (!d || r.status === "paused") continue;
    d.total += 1;
    if (DONE.has(r.status)) d.done += 1;
  }
  return days;
}

/** Share of planned actions done across the strip, or null when nothing was planned. */
export function weekPct(days: DayDots[]): number | null {
  const total = days.reduce((n, d) => n + d.total, 0);
  return total ? Math.round((100 * days.reduce((n, d) => n + d.done, 0)) / total) : null;
}

export type SwitchOption =
  | { kind: "me"; href: string }
  | { kind: "family"; href: string; name: string; id: string }
  | { kind: "clinic"; href: string };

/**
 * Views this account can switch between. Only shown when there is more than one.
 * "me" is the person's own plan; one entry per person they follow; "clinic" for doctors.
 */
export function switchOptions(hats: Hat[], follows: { id: string; name: string }[]): SwitchOption[] {
  const out: SwitchOption[] = [];
  if (hats.includes("patient")) out.push({ kind: "me", href: "/today" });
  for (const f of follows) out.push({ kind: "family", href: `/family/${f.id}`, name: f.name, id: f.id });
  if (hats.includes("doctor")) out.push({ kind: "clinic", href: "/clinic" });
  return out;
}
