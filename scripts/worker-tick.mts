// Manual, authenticated worker trigger for development/operations.
// Usage: pnpm worker:tick [baseUrl]   (default NEXT_PUBLIC_APP_URL; requires WORKER_SECRET)
import { config } from "dotenv";
import { existsSync } from "node:fs";

if (existsSync(".env.local")) config({ path: ".env.local", quiet: true });
const base = (process.argv[2] ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
const secret = process.env.WORKER_SECRET;
if (!secret) throw new Error("WORKER_SECRET is not set");
const res = await fetch(`${base}/api/worker/tick`, { method: "POST", headers: { Authorization: `Bearer ${secret}` } });
console.log(res.status, await res.text());
