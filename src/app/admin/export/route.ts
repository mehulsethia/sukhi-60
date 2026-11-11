import { getAdminMetrics, getBehaviourMetrics, requireAdmin } from "@/server/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function csv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return "";
  const cols = Object.keys(rows[0]);
  const cell = (v: unknown) => {
    const s = v === null || v === undefined ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(","), ...rows.map((r) => cols.map((c) => cell(r[c])).join(","))].join("\n");
}

// CSV exports for the pitch deck / spreadsheet analysis. Admin only.
export async function GET(req: Request) {
  await requireAdmin();
  const url = new URL(req.url);
  const t = url.searchParams.get("type");
  const type = t === "users" ? "users" : t === "support" ? "support" : "daily";
  const days = Math.min(90, Math.max(1, Number(url.searchParams.get("days")) || 30));
  if (type === "support") {
    // Aggregates only: one row per metric/key. No per-user rows, no free text.
    const b = await getBehaviourMetrics(days, url.searchParams.get("internal") === "1");
    const rows: Record<string, unknown>[] = [
      ...Object.entries(b.completion).map(([k, v]) => ({ section: "completion", key: k, value: v })),
      ...Object.entries(b.recovery).map(([k, v]) => ({ section: "recovery", key: k, value: v })),
      ...Object.entries(b.onboarding).map(([k, v]) => ({ section: "onboarding", key: k, value: v })),
      ...(["proactive_delivered", "proactive_acknowledged", "proactive_dismissed", "engagement_rate", "replies_to_user", "llm_worded"] as const).map((k) => ({ section: "nudges", key: k, value: b.nudges[k] })),
      ...(["shown", "accepted", "declined", "expired_or_stale", "acceptance_rate"] as const).map((k) => ({ section: "suggestions", key: k, value: b.suggestions[k] })),
      ...b.barriers.map((r) => ({ section: "barrier", key: r.key, value: r.n })),
      ...b.preferences.styles.map((r) => ({ section: "style", key: r.key, value: r.n })),
      ...b.preferences.restart.map((r) => ({ section: "restart", key: r.key, value: r.n })),
      ...b.weekly.map((w) => ({ section: "weekly_rate", key: w.week, value: w.rate })),
    ];
    return new Response(csv(rows), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="sukhi-support-${b.range.to}.csv"`, "Cache-Control": "private, no-store" } });
  }
  const m = await getAdminMetrics(days, url.searchParams.get("internal") === "1");
  const body = type === "users" ? csv(m.users as unknown as Record<string, unknown>[]) : csv(m.daily as unknown as Record<string, unknown>[]);
  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="sukhi-${type}-${m.range.to}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
