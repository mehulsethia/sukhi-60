import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PREFIXES = ["/login", "/signup", "/forgot-password", "/reset-password", "/check-email", "/privacy", "/terms", "/auth", "/demo", "/api/whatsapp", "/api/worker", "/api/health", "/family/accept", "/offline", "/admin"];

// Refreshes the Supabase session cookie and redirects unauthenticated users away from
// app pages. Authorization is still enforced again in every server handler and by RLS.
export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;

  // Production: send page visits on any other alias (e.g. the protected team URL) to the
  // canonical public domain, so sessions, cookies and auth links all live on one origin.
  const canonical = process.env.VERCEL_ENV === "production" ? process.env.NEXT_PUBLIC_APP_URL : undefined;
  if (canonical && request.method === "GET" && !path.startsWith("/api/")) {
    const target = new URL(canonical);
    if (request.nextUrl.host !== target.host) {
      const url = new URL(request.nextUrl.pathname + request.nextUrl.search, target);
      return NextResponse.redirect(url, 308);
    }
  }

  let response = NextResponse.next({ request });
  // Machine endpoints authenticate themselves (signature / bearer secret); no session work.
  if (path.startsWith("/api/whatsapp") || path.startsWith("/api/worker") || path.startsWith("/api/health")) {
    return response;
  }

  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (toSet) => {
        toSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        toSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  // getClaims refreshes an expired session and verifies the JWT (locally when the project
  // uses asymmetric signing keys), so most requests skip a round trip to Supabase Auth.
  // Pages and server actions still verify the user with getUser() before touching data.
  const { data } = await supabase.auth.getClaims();
  const signedIn = !!data?.claims?.sub;
  const isPublic = path === "/" || PUBLIC_PREFIXES.some((p) => path.startsWith(p));
  if (!signedIn && !isPublic) {
    if (path.startsWith("/api/")) {
      return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
    }
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", path);
    return NextResponse.redirect(url);
  }
  // Authenticated pages must never be cached by shared caches or the service worker.
  if (!isPublic || path.startsWith("/api/")) response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|icons/|manifest.webmanifest|sw.js|robots.txt).*)"],
};
