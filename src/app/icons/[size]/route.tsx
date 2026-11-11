import { ImageResponse } from "next/og";

const SIZES = new Set([180, 192, 512]);

// Generated app icon (leaf on teal). Public, cacheable.
export async function GET(_req: Request, ctx: { params: Promise<{ size: string }> }) {
  const n = Number((await ctx.params).size);
  const size = SIZES.has(n) ? n : 192;
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#0B6E5F" }}>
        <svg width={size * 0.6} height={size * 0.6} viewBox="0 0 32 32">
          <path d="M9 23.5C9 15.4 14.4 9.8 23 9c-.3 8.7-5.7 14.3-14 14.5Z" fill="#ffffff" />
          <path d="M9.6 22.9c3.2-3.4 6-6 9.6-8.6" stroke="#0B6E5F" strokeWidth="1.6" strokeLinecap="round" fill="none" />
        </svg>
      </div>
    ),
    { width: size, height: size, headers: { "Cache-Control": "public, max-age=604800, immutable" } },
  );
}
