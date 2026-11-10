import { ImageResponse } from "next/og";

const SIZES = new Set([180, 192, 512]);

// Generated app icon (leaf on teal). Public, cacheable.
export async function GET(_req: Request, ctx: { params: Promise<{ size: string }> }) {
  const n = Number((await ctx.params).size);
  const size = SIZES.has(n) ? n : 192;
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#0b6e5f" }}>
        <svg width={size * 0.6} height={size * 0.6} viewBox="0 0 32 32">
          <path d="M8 24c0-8.6 5.8-14.4 15-15-.4 9.5-6.2 15.1-15 15Z" fill="#ffffff" />
          <path d="M8 24 16.5 15.5" stroke="#0b6e5f" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      </div>
    ),
    { width: size, height: size, headers: { "Cache-Control": "public, max-age=604800, immutable" } },
  );
}
