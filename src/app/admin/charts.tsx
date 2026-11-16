// Small server-rendered SVG charts for the operator dashboard. One hue per single-series
// chart (the brand primary), labels in ink tokens, native <title> tooltips on every mark.
import type { ReactNode } from "react";

const fmtDay = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short" });

export function Stat({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: "good" | "warn" }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      <p className="text-sm font-semibold text-ink-soft">{label}</p>
      <p className={`mt-1 text-3xl font-bold tabular-nums ${tone === "good" ? "text-primary" : tone === "warn" ? "text-warn-ink" : "text-ink"}`}>{value}</p>
      {sub ? <p className="mt-1 text-xs text-ink-faint">{sub}</p> : null}
    </div>
  );
}

export function Card({ title, sub, children, className = "" }: { title: string; sub?: string; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-xl border border-line bg-surface p-4 ${className}`}>
      <h2 className="text-base font-bold">{title}</h2>
      {sub ? <p className="mt-0.5 text-xs text-ink-soft">{sub}</p> : null}
      <div className="mt-3">{children}</div>
    </section>
  );
}

/** Vertical bar series over days. `max` fixes the scale (e.g. 100 for percentages). */
export function DayBars({ data, max, unit = "", empty = "No data yet" }: { data: { day: string; v: number | null }[]; max?: number; unit?: string; empty?: string }) {
  const vals = data.map((d) => d.v ?? 0);
  const top = max ?? Math.max(1, ...vals);
  if (!data.length || vals.every((v) => v === 0)) return <p className="text-sm text-ink-faint">{empty}</p>;
  const W = 600, H = 150, pad = 18, bw = (W - pad) / data.length;
  return (
    <svg viewBox={`0 0 ${W} ${H + 22}`} className="h-auto w-full" role="img">
      {[0.5, 1].map((f) => (
        <g key={f}>
          <line x1={pad} x2={W} y1={H - H * f + 4} y2={H - H * f + 4} stroke="var(--line)" strokeWidth={1} />
          <text x={0} y={H - H * f + 8} fontSize={10} fill="var(--ink-faint)">{Math.round(top * f)}</text>
        </g>
      ))}
      {data.map((d, i) => {
        const v = d.v ?? 0;
        const h = Math.max(v > 0 ? 3 : 0, (v / top) * (H - 8));
        const x = pad + i * bw + 2;
        return (
          <g key={d.day}>
            <rect x={pad + i * bw} y={0} width={bw} height={H + 4} fill="transparent"><title>{`${fmtDay(d.day)}: ${d.v ?? "–"}${unit}`}</title></rect>
            <rect x={x} y={H + 4 - h} width={Math.max(2, bw - 4)} height={h} rx={3} fill={d.v === null ? "var(--line)" : "var(--primary)"} pointerEvents="none" />
            {(i === 0 || i === data.length - 1 || data.length <= 10 || i % Math.ceil(data.length / 7) === 0) ? (
              <text x={x + (bw - 4) / 2} y={H + 18} fontSize={10} textAnchor="middle" fill="var(--ink-faint)">{fmtDay(d.day)}</text>
            ) : null}
          </g>
        );
      })}
    </svg>
  );
}

/** Horizontal bars with labels and values; widths relative to `max` (default: largest). */
export function HBars({ rows, max, suffix = "", empty = "No data yet" }: { rows: { label: string; v: number | null; note?: string }[]; max?: number; suffix?: string; empty?: string }) {
  if (!rows.length) return <p className="text-sm text-ink-faint">{empty}</p>;
  const top = max ?? Math.max(1, ...rows.map((r) => r.v ?? 0));
  return (
    <ul className="flex flex-col gap-2">
      {rows.map((r) => (
        <li key={r.label} title={`${r.label}: ${r.v ?? "–"}${suffix}${r.note ? ` (${r.note})` : ""}`}>
          <div className="flex items-baseline justify-between gap-2 text-sm">
            <span className="font-semibold">{r.label}</span>
            <span className="tabular-nums text-ink-soft">{r.v ?? "–"}{r.v !== null ? suffix : ""}{r.note ? <span className="ml-1 text-xs text-ink-faint">{r.note}</span> : null}</span>
          </div>
          <div className="mt-1 h-2.5 rounded-full bg-surface-2">
            <div className="h-2.5 rounded-full bg-primary" style={{ width: `${Math.min(100, ((r.v ?? 0) / top) * 100)}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Retention heat cell: one hue, opacity by share. */
export function HeatCell({ n, size }: { n: number | null; size: number }) {
  if (n === null) return <td className="px-2 py-1.5 text-center text-xs text-ink-faint">-</td>;
  const pct = size ? Math.round((100 * n) / size) : 0;
  return (
    <td className="px-2 py-1.5 text-center text-sm tabular-nums" title={`${n} of ${size}`}>
      <span className="inline-block min-w-14 rounded-md px-2 py-1" style={{ background: `color-mix(in srgb, var(--primary) ${Math.max(6, pct)}%, transparent)`, color: pct > 55 ? "var(--primary-ink)" : "var(--ink)" }}>{pct}%</span>
    </td>
  );
}

export function HourBars({ data }: { data: { hour: number; n: number }[] }) {
  const by = new Map(data.map((d) => [d.hour, d.n]));
  const vals = Array.from({ length: 24 }, (_, h) => by.get(h) ?? 0);
  const top = Math.max(1, ...vals);
  if (vals.every((v) => v === 0)) return <p className="text-sm text-ink-faint">No check-ins yet</p>;
  const W = 480, H = 90, bw = W / 24;
  return (
    <svg viewBox={`0 0 ${W} ${H + 16}`} className="h-auto w-full" role="img">
      {vals.map((v, h) => {
        const bh = Math.max(v ? 2 : 0, (v / top) * H);
        return (
          <g key={h}>
            <rect x={h * bw} y={0} width={bw} height={H} fill="transparent"><title>{`${h}:00–${h}:59 IST: ${v} check-ins`}</title></rect>
            <rect x={h * bw + 1} y={H - bh} width={bw - 2} height={bh} rx={2} fill="var(--primary)" pointerEvents="none" />
            {h % 3 === 0 ? <text x={h * bw + bw / 2} y={H + 13} fontSize={9} textAnchor="middle" fill="var(--ink-faint)">{h}</text> : null}
          </g>
        );
      })}
    </svg>
  );
}
