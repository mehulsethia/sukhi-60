import { ImageResponse } from "next/og";

const SIZES = new Set([180, 192, 512]);

// Generated app icon (leaf on a warm circle). Public, cacheable.
export async function GET(_req: Request, ctx: { params: Promise<{ size: string }> }) {
  const n = Number((await ctx.params).size);
  const size = SIZES.has(n) ? n : 192;
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#2f5d50" }}>
        <svg width={size * 0.62} height={size * 0.62} viewBox="0 0 64 64">
          <circle cx="32" cy="32" r="30" fill="#fbf7f0" />
          <path d="M32 50 C32 38 32 30 32 24" stroke="#2f5d50" strokeWidth="4" strokeLinecap="round" fill="none" />
          <path d="M32 30 C22 30 16 22 16 14 C26 14 32 20 32 30 Z" fill="#4f8a5b" />
          <path d="M32 36 C42 36 48 28 48 20 C38 20 32 26 32 36 Z" fill="#4f8a5b" />
        </svg>
      </div>
    ),
    { width: size, height: size, headers: { "Cache-Control": "public, max-age=604800, immutable" } },
  );
}
