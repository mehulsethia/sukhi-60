import { json } from "@/server/http";

export const dynamic = "force-dynamic";

// Public liveness only. Deliberately exposes no project ids, provider status or config.
export async function GET() {
  return json({ ok: true, service: "sukhi-60" });
}
