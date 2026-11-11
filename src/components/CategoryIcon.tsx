import { Activity, CalendarDays, Gauge, Moon, Pill, Salad, Sparkles } from "lucide-react";

const MAP = { medication: Pill, activity: Activity, measurement: Gauge, nutrition: Salad, appointment: CalendarDays, rest: Moon, other: Sparkles } as const;

export function CategoryIcon({ category, size = 16 }: { category: string; size?: number }) {
  const Icon = MAP[category as keyof typeof MAP] ?? Sparkles;
  return <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-ink-soft"><Icon size={size} aria-hidden="true" /></span>;
}
