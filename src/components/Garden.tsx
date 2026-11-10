import type { GardenState } from "@/domain/rewards";

// A calm, accessible SVG garden. Growth is bounded by stage; flowers mark milestones and
// extra leaves mark successful returns. It never shrinks.
export function Garden({ state, label, size = 220 }: { state: GardenState; label: string; size?: number }) {
  const s = state.stageIndex; // 0..6
  const stemH = [0, 18, 40, 62, 80, 92, 100][s];
  const leaves = Math.min(6, Math.max(0, s - 1) + Math.min(2, state.leaves));
  const flowers = s >= 4 ? Math.min(5, 1 + state.flowers) : 0;
  return (
    <svg role="img" aria-label={label} viewBox="0 0 200 200" width={size} height={size} className="mx-auto block">
      <defs>
        <radialGradient id="sky" cx="50%" cy="30%" r="70%">
          <stop offset="0%" stopColor="var(--surface)" />
          <stop offset="100%" stopColor="var(--surface-2)" />
        </radialGradient>
      </defs>
      <circle cx="100" cy="100" r="96" fill="url(#sky)" />
      <circle cx="152" cy="50" r="14" fill="var(--sun)" opacity="0.85" />
      <ellipse cx="100" cy="168" rx="70" ry="14" fill="#8a6a4a" opacity="0.85" />
      {s === 0 ? <ellipse cx="100" cy="160" rx="7" ry="5" fill="#6b4a2b" /> : null}
      {s > 0 ? <path d={`M100 162 C100 ${162 - stemH / 2} 98 ${162 - stemH} 100 ${162 - stemH}`} stroke="var(--leaf)" strokeWidth="5" strokeLinecap="round" fill="none" /> : null}
      {Array.from({ length: leaves }).map((_, i) => {
        const y = 156 - (i + 1) * (stemH / (leaves + 1));
        const left = i % 2 === 0;
        return <path key={i} d={left ? `M100 ${y} C86 ${y - 2} 80 ${y - 12} 82 ${y - 18} C92 ${y - 16} 99 ${y - 9} 100 ${y}` : `M100 ${y} C114 ${y - 2} 120 ${y - 12} 118 ${y - 18} C108 ${y - 16} 101 ${y - 9} 100 ${y}`} fill="var(--leaf)" />;
      })}
      {Array.from({ length: flowers }).map((_, i) => {
        const cx = i === 0 ? 100 : 100 + (i % 2 === 0 ? 1 : -1) * (14 + i * 6);
        const cy = i === 0 ? 162 - stemH - 6 : 162 - stemH + 10 + i * 8;
        return (
          <g key={i}>
            {[0, 72, 144, 216, 288].map((a) => (
              <circle key={a} cx={cx + 6 * Math.cos((a * Math.PI) / 180)} cy={cy + 6 * Math.sin((a * Math.PI) / 180)} r="5" fill="var(--accent)" opacity="0.9" />
            ))}
            <circle cx={cx} cy={cy} r="4" fill="var(--sun)" />
          </g>
        );
      })}
    </svg>
  );
}
