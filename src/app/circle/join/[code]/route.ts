import { NextResponse } from "next/server";
import { getUser } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { cleanCode, joinCircle } from "@/server/circle";
import { INVITE_COOKIE } from "@/lib/invite";

export const dynamic = "force-dynamic";

// Invite link: /circle/join/48213 (or a legacy /circle/join/ABCD2345). Signed-in and set up → join now. Otherwise remember
// the code and send them to sign up; onboarding finishes the join.
export async function GET(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const clean = cleanCode(decodeURIComponent(code).slice(0, 40)) ?? "";
  const origin = new URL(req.url).origin;
  const { supabase, user } = await getUser();
  const remember = (to: string) => {
    const res = NextResponse.redirect(new URL(to, origin));
    if (clean) res.cookies.set(INVITE_COOKIE, clean, { path: "/", sameSite: "lax", httpOnly: true, secure: process.env.NODE_ENV === "production", maxAge: 60 * 60 * 24 * 14 });
    return res;
  };
  if (!user) return remember("/signup");
  const { data: profile } = await supabase.from("profiles").select("onboarded_at").eq("id", user.id).single();
  if (!profile?.onboarded_at) return remember("/onboarding");
  const admin = createAdminClient();
  const r = await joinCircle(admin, user.id, clean).catch(() => "invalid" as const);
  const { data: c } = r === "joined" || r === "already" ? await admin.from("circles").select("id").eq("invite_code", clean).maybeSingle() : { data: null };
  const res = NextResponse.redirect(new URL(`/circle?r=${r}${c ? `&c=${c.id}` : ""}`, origin));
  res.cookies.delete(INVITE_COOKIE);
  return res;
}
