import "server-only";
import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";

export function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: { "Cache-Control": "private, no-store" } });
}

export function errorJson(code: string, status: number) {
  return json({ error: code }, status);
}

/** Constant-time bearer check for machine endpoints. */
export function bearerMatches(header: string | null, secret: string | undefined): boolean {
  if (!secret || secret.length < 32 || !header?.startsWith("Bearer ")) return false;
  const a = Buffer.from(header.slice(7));
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}
