/**
 * An in-app path to go to after sign-in, or the fallback. Only same-site paths pass:
 * "//evil.com", "/\evil.com" (browsers read "\" as "/") and control characters are refused,
 * and the path must resolve to this site.
 */
export function safeNext(next: string | null | undefined, fallback: string): string;
export function safeNext(next: string | null | undefined): string | undefined;
export function safeNext(next: string | null | undefined, fallback?: string): string | undefined {
  if (!next || next.length > 512 || !next.startsWith("/") || /[\\\u0000-\u001f\u007f]/.test(next) || next.startsWith("//")) return fallback;
  try {
    const base = "https://sukhi.invalid";
    const u = new URL(next, base);
    if (u.origin !== base) return fallback;
    return u.pathname + u.search + u.hash;
  } catch {
    return fallback;
  }
}
