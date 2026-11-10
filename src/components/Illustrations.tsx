// Sukhi illustration set. Inline SVG drawn with theme tokens (works in light/dark, ~0 KB of
// network). Decorative: every scene is aria-hidden; meaning is always carried by text nearby.

type P = { className?: string };
const svg = (className?: string) => ({ viewBox: "0 0 320 240", className: className ?? "h-auto w-full", "aria-hidden": true as const, role: "presentation" });

function Backdrop({ tint = "var(--surface-2)" }: { tint?: string }) {
  return (
    <>
      <rect x="10" y="10" width="300" height="220" rx="36" fill={tint} />
      <circle cx="262" cy="56" r="20" fill="var(--sun)" opacity=".85" />
    </>
  );
}

function Plant({ x, y, s = 1, bloom = false }: { x: number; y: number; s?: number; bloom?: boolean }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <path d="M0 0 C0 -22 -1 -38 0 -54" stroke="var(--leaf)" strokeWidth="5" strokeLinecap="round" fill="none" />
      <path d="M0 -20 C-14 -21 -22 -31 -20 -40 C-9 -38 -1 -30 0 -20Z" fill="var(--leaf)" />
      <path d="M0 -32 C14 -33 22 -43 20 -52 C9 -50 1 -42 0 -32Z" fill="var(--leaf)" />
      {bloom ? (
        <g>
          {[0, 72, 144, 216, 288].map((a) => <circle key={a} cx={7 * Math.cos((a * Math.PI) / 180)} cy={-60 + 7 * Math.sin((a * Math.PI) / 180)} r="6" fill="var(--bloom)" />)}
          <circle cx="0" cy="-60" r="4.5" fill="var(--sun)" />
        </g>
      ) : null}
    </g>
  );
}

function Phone({ x, y, children }: { x: number; y: number; children?: React.ReactNode }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect width="120" height="200" rx="22" fill="var(--ink)" />
      <rect x="6" y="6" width="108" height="188" rx="17" fill="var(--surface)" />
      <rect x="44" y="12" width="32" height="5" rx="2.5" fill="var(--surface-3)" />
      {children}
    </g>
  );
}

export function SceneWelcome({ className }: P) {
  return (
    <svg {...svg(className)}>
      <Backdrop />
      <ellipse cx="96" cy="206" rx="70" ry="10" fill="#8a6a4a" opacity=".25" />
      <Plant x={96} y={204} s={1.5} bloom />
      <Phone x={170} y={30}>
        <rect x="16" y="34" width="88" height="12" rx="6" fill="var(--surface-3)" />
        <rect x="16" y="58" width="88" height="56" rx="12" fill="var(--surface-2)" />
        <rect x="26" y="70" width="50" height="8" rx="4" fill="var(--ink)" opacity=".75" />
        <rect x="26" y="84" width="36" height="6" rx="3" fill="var(--ink-soft)" opacity=".5" />
        <rect x="26" y="96" width="68" height="12" rx="6" fill="var(--primary)" />
        <rect x="16" y="124" width="88" height="40" rx="12" fill="var(--leaf-soft)" />
        <circle cx="34" cy="144" r="9" fill="var(--leaf)" />
        <path d="m29.5 144 3 3 6-6" stroke="#fff" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        <rect x="50" y="139" width="44" height="8" rx="4" fill="var(--leaf)" opacity=".6" />
      </Phone>
    </svg>
  );
}

export function SceneLanguages({ className }: P) {
  const bubbles = [
    { x: 30, y: 46, w: 132, text: "Hello", fill: "var(--surface)", ink: "var(--ink)" },
    { x: 130, y: 104, w: 150, text: "नमस्ते", fill: "var(--primary)", ink: "var(--primary-ink)" },
    { x: 46, y: 160, w: 150, text: "नमस्कार", fill: "var(--accent)", ink: "var(--accent-ink)" },
  ];
  return (
    <svg {...svg(className)}>
      <Backdrop />
      {bubbles.map((b) => (
        <g key={b.text}>
          <rect x={b.x} y={b.y} width={b.w} height="46" rx="23" fill={b.fill} stroke="var(--line)" />
          <text x={b.x + b.w / 2} y={b.y + 30} textAnchor="middle" fontSize="22" fontWeight="700" fill={b.ink} style={{ fontFamily: "var(--font-display)" }}>{b.text}</text>
        </g>
      ))}
    </svg>
  );
}

export function SceneReminder({ className }: P) {
  return (
    <svg {...svg(className)}>
      <Backdrop />
      <Phone x={100} y={28}>
        <rect x="14" y="40" width="92" height="44" rx="12" fill="var(--surface-2)" />
        <circle cx="30" cy="62" r="9" fill="var(--accent)" />
        <path d="M30 56v6l4 2" stroke="var(--accent-ink)" strokeWidth="2" fill="none" strokeLinecap="round" />
        <rect x="46" y="54" width="50" height="7" rx="3.5" fill="var(--ink)" opacity=".7" />
        <rect x="46" y="66" width="34" height="6" rx="3" fill="var(--ink-soft)" opacity=".5" />
        <rect x="14" y="94" width="70" height="30" rx="15" fill="#d9fdd3" />
        <rect x="24" y="105" width="44" height="7" rx="3.5" fill="#1f7a4d" opacity=".55" />
      </Phone>
      <g transform="translate(64 64)">
        <path d="M0 26a16 16 0 0 1 32 0v10l5 7H-5l5-7z" fill="var(--accent)" />
        <circle cx="16" cy="48" r="5" fill="var(--accent)" />
        <path d="M-12 14a26 26 0 0 1 8-14M44 14a26 26 0 0 0-8-14" stroke="var(--accent)" strokeWidth="3" strokeLinecap="round" fill="none" />
      </g>
    </svg>
  );
}

export function SceneCheckin({ className }: P) {
  return (
    <svg {...svg(className)}>
      <Backdrop />
      <rect x="52" y="56" width="216" height="128" rx="24" fill="var(--surface)" stroke="var(--line)" />
      <rect x="74" y="78" width="96" height="10" rx="5" fill="var(--ink)" opacity=".75" />
      <rect x="74" y="96" width="64" height="8" rx="4" fill="var(--ink-soft)" opacity=".45" />
      <rect x="74" y="124" width="104" height="38" rx="19" fill="var(--primary)" />
      <path d="m110 143 7 7 14-14" stroke="var(--primary-ink)" strokeWidth="4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="186" y="124" width="60" height="38" rx="19" fill="var(--surface-2)" />
      <g transform="translate(156 150)">
        <path d="M8 40 L8 8 a8 8 0 0 1 16 0 V26 l10 -2 a8 8 0 0 1 9 8 L41 52 H12 Z" fill="#f2c9a6" stroke="#c99a76" strokeWidth="2" strokeLinejoin="round" />
      </g>
      {[0, 1, 2].map((i) => <circle key={i} cx={238 + i * 14} cy={40 + (i % 2) * 10} r="4" fill="var(--bloom)" opacity=".8" />)}
    </svg>
  );
}

export function SceneGarden({ className }: P) {
  return (
    <svg {...svg(className)}>
      <Backdrop tint="var(--leaf-soft)" />
      <ellipse cx="160" cy="204" rx="130" ry="14" fill="#8a6a4a" opacity=".25" />
      <Plant x={70} y={200} s={0.6} />
      <Plant x={125} y={200} s={0.9} />
      <Plant x={185} y={200} s={1.2} bloom />
      <Plant x={248} y={200} s={1.5} bloom />
    </svg>
  );
}

export function SceneRhythm({ className }: P) {
  const pts = [
    { x: 60, y: 150 }, { x: 120, y: 92 }, { x: 200, y: 92 }, { x: 260, y: 150 },
  ];
  return (
    <svg {...svg(className)}>
      <rect x="10" y="10" width="300" height="220" rx="36" fill="var(--surface-2)" />
      <path d="M40 176 Q160 20 280 176" stroke="var(--line)" strokeWidth="3" strokeDasharray="6 8" fill="none" />
      <circle cx="160" cy="76" r="22" fill="var(--sun)" />
      {pts.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r="9" fill={i === 3 ? "var(--primary)" : "var(--accent)"} stroke="var(--surface)" strokeWidth="4" />)}
      <rect x="30" y="182" width="260" height="28" rx="14" fill="var(--ink)" opacity=".9" />
      <path d="M258 188a9 9 0 1 0 9 13 7 7 0 0 1-9-13z" fill="#f4c25e" />
      <rect x="46" y="193" width="120" height="6" rx="3" fill="#c3c9e0" opacity=".6" />
    </svg>
  );
}

export function SceneCare({ className }: P) {
  return (
    <svg {...svg(className)}>
      <Backdrop />
      <rect x="92" y="40" width="136" height="168" rx="18" fill="var(--surface)" stroke="var(--line)" />
      <rect x="132" y="30" width="56" height="22" rx="8" fill="var(--primary)" />
      {[0, 1, 2].map((i) => (
        <g key={i} transform={`translate(112 ${78 + i * 38})`}>
          <rect width="20" height="20" rx="6" fill={i < 2 ? "var(--leaf)" : "var(--surface-2)"} />
          {i < 2 ? <path d="m5 10 4 4 7-7" stroke="#fff" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round" /> : null}
          <rect x="30" y="4" width={i === 1 ? 60 : 76} height="9" rx="4.5" fill="var(--ink)" opacity=".55" />
        </g>
      ))}
      <path d="M246 168c-14-10-22-18-22-27a11 11 0 0 1 22-3 11 11 0 0 1 22 3c0 9-8 17-22 27z" fill="var(--bloom)" />
    </svg>
  );
}

export function SceneComfort({ className }: P) {
  return (
    <svg {...svg(className)}>
      <Backdrop />
      <text x="72" y="150" fontSize="96" fontWeight="800" fill="var(--primary)" style={{ fontFamily: "var(--font-display)" }}>Aa</text>
      <g transform="translate(206 92)">
        <path d="M0 18h14l18-16v52L14 38H0z" fill="var(--ink)" opacity=".85" />
        <path d="M42 14a20 20 0 0 1 0 28M52 4a34 34 0 0 1 0 48" stroke="var(--accent)" strokeWidth="5" strokeLinecap="round" fill="none" />
      </g>
      <rect x="64" y="178" width="192" height="12" rx="6" fill="var(--surface-3)" />
      <rect x="64" y="178" width="124" height="12" rx="6" fill="var(--leaf)" />
      <circle cx="188" cy="184" r="12" fill="var(--surface)" stroke="var(--leaf)" strokeWidth="4" />
    </svg>
  );
}

export function SceneShield({ className }: P) {
  return (
    <svg {...svg(className)}>
      <Backdrop />
      <path d="M160 36 L224 60 V116 C224 160 196 188 160 204 C124 188 96 160 96 116 V60 Z" fill="var(--primary)" />
      <path d="M160 52 L210 70 V116 C210 150 189 172 160 186 Z" fill="#fff" opacity=".1" />
      <rect x="136" y="108" width="48" height="40" rx="10" fill="var(--accent)" />
      <path d="M146 108v-10a14 14 0 0 1 28 0v10" stroke="var(--accent)" strokeWidth="7" fill="none" />
      <circle cx="160" cy="126" r="5" fill="var(--accent-ink)" />
      <rect x="157.5" y="128" width="5" height="10" rx="2" fill="var(--accent-ink)" />
    </svg>
  );
}

export function SceneFamily({ className }: P) {
  return (
    <svg {...svg(className)}>
      <Backdrop />
      <circle cx="118" cy="96" r="22" fill="#e9b48a" />
      <path d="M80 190c0-30 17-54 38-54s38 24 38 54z" fill="var(--primary)" />
      <circle cx="206" cy="104" r="19" fill="#c98d63" />
      <path d="M172 190c0-26 15-46 34-46s34 20 34 46z" fill="var(--leaf)" />
      <path d="M162 74c-9-7-14-12-14-18a7 7 0 0 1 14-2 7 7 0 0 1 14 2c0 6-5 11-14 18z" fill="var(--bloom)" />
    </svg>
  );
}

/** Phone mock-up showing a WhatsApp-style exchange (sample content passed in). */
export function WhatsAppPhone({ messages, title }: { messages: { from: "sukhi" | "me"; text: string; lang?: string }[]; title: string }) {
  return (
    <div className="relative mx-auto w-[300px] rounded-[44px] bg-[#18213f] p-3 shadow-[var(--shadow-lg)]" aria-hidden="true">
      <div className="overflow-hidden rounded-[34px] bg-[#efeae2]">
        <div className="flex items-center gap-3 bg-[#1f6b4f] px-4 pb-3 pt-6 text-white">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/20 text-sm font-bold">S</span>
          <span className="font-semibold">{title}</span>
        </div>
        <div className="flex min-h-[380px] flex-col gap-2 p-3">
          {messages.map((m, i) => (
            <p key={i} lang={m.lang} className={`max-w-[82%] rounded-2xl px-3 py-2 text-[0.92rem] leading-snug text-[#111b21] shadow-sm ${m.from === "me" ? "self-end rounded-tr-sm bg-[#d9fdd3]" : "self-start rounded-tl-sm bg-white"}`}>{m.text}</p>
          ))}
        </div>
      </div>
    </div>
  );
}
