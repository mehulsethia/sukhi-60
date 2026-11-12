// Sukhi service worker — deliberately minimal and audited.
// Caches ONLY public, versioned static assets and the offline page.
// Never caches HTML of authenticated pages, API responses, Supabase traffic, signed URLs or media.
const VERSION = "sukhi-v3";
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

  // Page navigations: network only; show the static offline page if the network fails.
  if (req.mode === "navigate") {
    event.respondWith(fetch(req).catch(() => caches.match(OFFLINE_URL)));
  }
});

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
