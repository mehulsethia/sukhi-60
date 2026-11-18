import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// One-time login link that Sukhi sends on WhatsApp ("Open on the web"). Single use, 1 hour.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const token = url.searchParams.get("t") ?? "";
  if (token.length >= 20 && token.length <= 200) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type: "magiclink", token_hash: token });
    if (!error) return NextResponse.redirect(new URL("/today", url.origin));
  }
  return NextResponse.redirect(new URL("/login?error=link", url.origin));
}
