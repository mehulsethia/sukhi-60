// Diagnose slow "load" events: lists requests still pending after N seconds.
import { chromium } from "@playwright/test";
const url = process.argv[2] ?? "https://sukhi-60.vercel.app/demo";
const b = await chromium.launch();
const page = await b.newPage();
const pending = new Map<string, number>();
page.on("request", (r) => pending.set(r.url(), Date.now()));
page.on("requestfinished", (r) => pending.delete(r.url()));
page.on("requestfailed", (r) => { console.log("FAILED", r.url(), r.failure()?.errorText); pending.delete(r.url()); });
const t0 = Date.now();
await page.goto(url, { waitUntil: "domcontentloaded" });
console.log("DOMContentLoaded", Date.now() - t0, "ms");
const loaded = page.waitForLoadState("load").then(() => console.log("load", Date.now() - t0, "ms"));
await Promise.race([loaded, new Promise((r) => setTimeout(r, 12000))]);
for (const [u, t] of pending) console.log("PENDING", Math.round((Date.now() - t) / 1000) + "s", u.slice(0, 140));
await b.close();
