import QRCode from "qrcode";
import { createAdminClient } from "@/lib/supabase/admin";
import { waLink } from "@/domain/wa-ui";
import { businessNumber } from "@/server/wa/data";

export const runtime = "nodejs";

// Clinic QR for a doctor's code: opens WhatsApp with "DR-123456" ready to send.
// Public (Meta fetches it when the image is sent), only for codes that exist.
export async function GET(_req: Request, ctx: { params: Promise<{ code: string }> }) {
  const code = (await ctx.params).code;
  if (!/^\d{6}$/.test(code)) return new Response("not found", { status: 404 });
  const { data: doc } = await createAdminClient().from("doctors").select("code").eq("code", code).maybeSingle();
  const num = await businessNumber();
  if (!doc || !num) return new Response("not found", { status: 404 });
  const png = await QRCode.toBuffer(waLink(num, `DR-${code}`), { type: "png", width: 720, margin: 2, errorCorrectionLevel: "M", color: { dark: "#0B3B34", light: "#FFFFFF" } });
  return new Response(new Uint8Array(png), { headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=86400" } });
}
