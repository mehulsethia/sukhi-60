import { getAdminMetrics, requireAdmin } from "@/server/admin";

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
  const type = url.searchParams.get("type") === "users" ? "users" : "daily";
  const days = Math.min(90, Math.max(1, Number(url.searchParams.get("days")) || 30));
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
