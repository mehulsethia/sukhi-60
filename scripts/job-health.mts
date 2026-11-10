// Operator view of durable work: job states, expired leases, dead letters, uncertain sends.
// Usage: pnpm jobs:health   (uses NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SECRET_KEY from env/.env.local)
import { config } from "dotenv";
import { existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

if (existsSync(".env.local")) config({ path: ".env.local", quiet: true });
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;
if (!url || !key) {
  console.error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY must be set");
  process.exit(1);
}
const db = createClient(url, key, { auth: { persistSession: false } });
const { data: health, error } = await db.from("job_health").select("*").order("kind");
if (error) throw error;
console.table(health);
const since = new Date(Date.now() - 24 * 3600_000).toISOString();
const [dead, uncertain, failed, backlog] = await Promise.all([
  db.from("jobs").select("id, kind, last_error, updated_at").eq("status", "dead").gte("updated_at", since).limit(20),
  db.from("outbound_messages").select("id, created_at, error_code").eq("status", "uncertain").limit(20),
  db.from("outbound_messages").select("id", { count: "exact", head: true }).eq("status", "failed").gte("updated_at", since),
  db.from("jobs").select("id", { count: "exact", head: true }).eq("status", "queued").lt("run_at", new Date(Date.now() - 5 * 60_000).toISOString()),
]);
console.log(`Dead-lettered jobs (24h): ${dead.data?.length ?? 0}`);
dead.data?.forEach((d) => console.log(`  ${d.kind} ${d.id} ${d.last_error}`));
console.log(`Uncertain WhatsApp sends needing reconciliation: ${uncertain.data?.length ?? 0} (never auto-resent)`);
console.log(`Failed WhatsApp sends (24h): ${failed.count ?? 0}`);
console.log(`Queued jobs overdue by >5 min (scheduler not running?): ${backlog.count ?? 0}`);
