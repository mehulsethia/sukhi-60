// Sukhi service worker — deliberately minimal and audited.
// Caches public, versioned static assets and the offline page. Also keeps the last copy of the
// five main tabs on this device so the Home Screen app opens instantly; the page then fetches
// fresh data by itself. That page cache is wiped on sign-out / sign-in (any visit to /login,
// /signup or /auth), when a session has ended, after 24 hours, and on every new app version.
// Never caches API responses, Supabase traffic, signed URLs, media or any other page.
const VERSION = "sukhi-v5";
const PAGES = "sukhi-pages";
const TABS = new Set(["/today", "/chat", "/plan", "/circle", "/progress"]);
const PAGE_MAX_AGE = 24 * 3600 * 1000;
const ACCOUNT_PATHS = /^\/(login|signup|auth)(\/|$)/;
const OFFLINE_URL = "/offline";
const PRECACHE = [OFFLINE_URL, "/manifest.webmanifest", "/icons/192", "/icons/512"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(VERSION).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return; // mutations always go to the network
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // Supabase, providers: never touched
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/auth/")) return;

  // Immutable build assets: cache-first.
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); }
        return res;
      })),
    );
    return;
  }

  // Page navigations: network only. iPhone Home Screen apps often drop the first request after
  // waking from the background, so retry once, then show our offline page (never the browser's
  // bare "couldn't load" screen).
  if (req.mode === "navigate") {
    if (ACCOUNT_PATHS.test(url.pathname)) event.waitUntil(caches.delete(PAGES));
    if (TABS.has(url.pathname) && !url.search) { event.respondWith(tabPage(event, req)); return; }
    event.respondWith(navigate(req).catch(offline));
  }
});

async function navigate(req) {
  try { return await fetch(req); } catch {}
  await new Promise((r) => setTimeout(r, 400));
  return fetch(req);
}

async function offline() {
  return (await caches.match(OFFLINE_URL)) ||
    new Response('<!doctype html><meta name="viewport" content="width=device-width"><body style="font-family:system-ui;padding:40px 24px;color:#1b2a28"><p>You seem to be offline.</p><button onclick="location.reload()">Try again</button>', { headers: { "Content-Type": "text/html; charset=utf-8" } });
}

// Stale-while-revalidate for the main tabs: show the last copy at once, refresh it behind.
async function tabPage(event, req) {
  const cache = await caches.open(PAGES);
  const hit = await cache.match(req.url);
  const fresh = navigate(req).then(async (res) => {
    const type = res.headers.get("content-type") || "";
    if (res.status === 200 && res.type === "basic" && !res.redirected && type.includes("text/html")) {
      const headers = new Headers(res.headers);
      headers.set("x-sukhi-saved", String(Date.now()));
      await cache.put(req.url, new Response(await res.clone().blob(), { status: 200, headers }));
    } else if (res.type === "opaqueredirect" || res.redirected || res.status === 401 || res.status === 403) {
      // Signed out, session ended or onboarding changed: forget every saved page.
      await caches.delete(PAGES);
    }
    return res;
  });
  if (hit && Date.now() - Number(hit.headers.get("x-sukhi-saved") || 0) < PAGE_MAX_AGE) {
    event.waitUntil(fresh.catch(() => undefined));
    return hit;
  }
  return fresh.catch(offline);
}

// Web push: short, lock-screen-safe notifications sent by the server (reminders, check-ins,
// refill and family alerts). Tapping opens (or focuses) the app at the given path.
self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { body: event.data ? event.data.text() : "" }; }
  const title = data.title || "Sukhi";
  event.waitUntil(self.registration.showNotification(title, {
    body: data.body || "",
    icon: "/icons/192",
    badge: "/icons/192",
    tag: data.tag || undefined,
    data: { url: typeof data.url === "string" && data.url.startsWith("/") ? data.url : "/today" },
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL((event.notification.data && event.notification.data.url) || "/today", self.location.origin).href;
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of all) {
      if (new URL(c.url).origin === self.location.origin) { await c.focus(); if ("navigate" in c) await c.navigate(target); return; }
    }
    await self.clients.openWindow(target);
  })());
});
