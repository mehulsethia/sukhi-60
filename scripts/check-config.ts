// Reports set / missing / invalid for every variable the app actually uses. Never prints values.
// Usage: pnpm check:config            (reads process env + .env.local if present)
//        pnpm check:config --strict   (exit 1 if any REQUIRED variable is not "set")
import { config } from "dotenv";
import { existsSync } from "node:fs";
import { configReport } from "../src/lib/config";

if (existsSync(".env.local")) config({ path: ".env.local", quiet: true });
const report = configReport();
const pad = (s: string, n: number) => s.padEnd(n);
console.log(`${pad("VARIABLE", 40)}${pad("GROUP", 11)}${pad("REQUIRED", 10)}${pad("SECRET", 8)}STATE`);
for (const r of report) console.log(`${pad(r.name, 40)}${pad(r.group, 11)}${pad(r.required ? "yes" : "no", 10)}${pad(r.secret ? "yes" : "no", 8)}${r.state}`);
const ai = report.filter((r) => r.group === "anthropic").every((r) => r.state === "set");
const speech = ["ELEVENLABS_API_KEY", "SARVAM_API_KEY"].some((n) => report.find((r) => r.name === n)!.state === "set");
const wa = ["WHATSAPP_ACCESS_TOKEN", "WHATSAPP_PHONE_NUMBER_ID", "WHATSAPP_APP_SECRET", "WHATSAPP_VERIFY_TOKEN"].every((n) => report.find((r) => r.name === n)!.state === "set");
console.log(`\nFeatures: AI assistant=${ai ? "ready" : "off"}  Voice=${speech ? "ready" : "off"}  WhatsApp=${wa ? "ready" : "off"}`);
const missing = report.filter((r) => r.required && r.state !== "set");
if (missing.length) console.log(`Required not ready: ${missing.map((m) => `${m.name} (${m.state})`).join(", ")}`);
if (process.argv.includes("--strict") && missing.length) process.exit(1);
