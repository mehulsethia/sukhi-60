// Server-rendered progress charts. Colors come from the shared status mapping; every mark
// has a native tooltip and the page also offers a table, so color is never the only cue.
import { BUCKET_COLOR, type Bucket } from "@/lib/status";

export interface DayStack { label: string; full: string; counts: Partial<Record<Bucket, number>>; total: number; today?: boolean }

const ORDER: Bucket[] = ["evidence", "done", "review", "unable", "skipped", "missed", "noreply", "open"];

export function StackedBars({ data, labels }: { data: DayStack[]; labels: Record<Bucket, string> }) {
  const max = Math.max(1, ...data.map((d) => d.total));
  const W = 720, H = 190, padL = 26, bw = (W - padL) / Math.max(1, data.length), barW = Math.max(4, Math.min(34, bw - (data.length > 40 ? 2 : 6)));
  const every = data.length > 16 ? Math.ceil(data.length / 8) : 1;
  return (
    <svg viewBox={`0 0 ${W} ${H + 26}`} className="h-auto w-full" role="img" aria-label={labels.done}>
      {(max >= 4 ? [0.5, 1] : [1]).map((f) => (
        <g key={f}>
          <line x1={padL} x2={W} y1={H - (H - 6) * f} y2={H - (H - 6) * f} stroke="var(--line)" strokeDasharray="3 4" />
          <text x={0} y={H - (H - 6) * f + 4} fontSize={11} fill="var(--ink-faint)">{Math.round(max * f)}</text>
        </g>
      ))}
      <line x1={padL} x2={W} y1={H} y2={H} stroke="var(--line-strong)" />
      {data.map((d, i) => {
        const x = padL + i * bw + (bw - barW) / 2;
        let y = H;
        const segs = ORDER.filter((b) => d.counts[b]).map((b) => {
          const h = ((d.counts[b] ?? 0) / max) * (H - 6);
          y -= h;
          return { b, y, h };
        });
        const tip = `${d.full}: ` + (d.total ? ORDER.filter((b) => d.counts[b]).map((b) => `${labels[b]} ${d.counts[b]}`).join(", ") : "-");
        return (
          <g key={i}>
            <title>{tip}</title>
            <rect x={padL + i * bw} y={0} width={bw} height={H} fill="transparent" />
            {segs.map((s, j) => (
              <rect key={s.b} x={x} y={s.y + (j < segs.length - 1 ? 1 : 0)} width={barW} height={Math.max(0, s.h - (j < segs.length - 1 ? 1 : 0))} rx={j === segs.length - 1 ? Math.min(4, barW / 2) : 0} fill={s.b === "open" ? "var(--surface-3)" : BUCKET_COLOR[s.b]} />
            ))}
            {d.total === 0 ? <rect x={x} y={H - 3} width={barW} height={3} rx={1.5} fill="var(--surface-3)" /> : null}
            {i % every === 0 || i === data.length - 1 ? <text x={x + barW / 2} y={H + 17} fontSize={11} textAnchor="middle" fill={d.today ? "var(--ink)" : "var(--ink-faint)"} fontWeight={d.today ? 700 : 400}>{d.label}</text> : null}
          </g>
        );
      })}
    </svg>
  );
}

export function Legend({ buckets, labels, counts }: { buckets: Bucket[]; labels: Record<Bucket, string>; counts?: Partial<Record<Bucket, number>> }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-sm">
      {buckets.map((b) => (
        <li key={b} className="flex items-center gap-1.5">
          <span className="dot" style={{ background: b === "open" ? "var(--surface-3)" : BUCKET_COLOR[b] }} />
          <span className="text-ink-soft">{labels[b]}</span>
          {counts ? <span className="font-semibold tabular-nums">{counts[b] ?? 0}</span> : null}
        </li>
      ))}
    </ul>
  );
}

/** Calendar heatmap: one column per week, one row per weekday, teal by share completed. */
export function Heatmap({ days, weekdayLabels, noneLabel }: { days: { date: string; ratio: number | null; label: string }[]; weekdayLabels: string[]; noneLabel: string }) {
  if (!days.length) return null;
  const first = new Date(`${days[0].date}T00:00:00Z`);
  const lead = (first.getUTCDay() + 6) % 7; // Monday-first
  const cells: ({ date: string; ratio: number | null; label: string } | null)[] = [...Array(lead).fill(null), ...days];
  const weeks = Math.ceil(cells.length / 7);
  return (
    <div className="flex gap-2">
      <div className="grid grid-rows-7 gap-1 pt-0 text-[0.68rem] text-ink-faint">{weekdayLabels.map((w, i) => <span key={i} className="flex h-4 items-center sm:h-5">{i % 2 === 0 ? w : ""}</span>)}</div>
      <div className="no-scrollbar overflow-x-auto">
        <div className="grid grid-flow-col grid-rows-7 gap-1" style={{ gridTemplateColumns: `repeat(${weeks}, minmax(0, 1fr))` }}>
          {cells.map((c, i) => c ? (
            <span key={i} title={c.label} className="h-4 w-4 rounded-[4px] sm:h-5 sm:w-5" style={{ background: c.ratio === null ? "var(--surface-2)" : c.ratio === 0 ? "color-mix(in srgb, var(--st-missed) 22%, var(--surface-2))" : `color-mix(in srgb, var(--st-done) ${Math.round(25 + c.ratio * 75)}%, var(--surface-2))` }} />
          ) : <span key={i} className="h-4 w-4 sm:h-5 sm:w-5" aria-hidden="true" />)}
        </div>
      </div>
      <span className="sr-only">{noneLabel}</span>
    </div>
  );
}

/** Thin segmented bar for one action's breakdown. */
export function SegBar({ counts, total }: { counts: Partial<Record<Bucket, number>>; total: number }) {
  return (
    <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-surface-2">
      {ORDER.filter((b) => counts[b] && b !== "open").map((b) => <span key={b} style={{ width: `${((counts[b] ?? 0) / Math.max(1, total)) * 100}%`, background: BUCKET_COLOR[b] }} className="h-full border-r-2 border-surface last:border-0" />)}
    </div>
  );
}
