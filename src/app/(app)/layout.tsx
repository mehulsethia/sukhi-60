import { redirect } from "next/navigation";
import { requireUser } from "@/lib/supabase/server";
import { BottomNav } from "@/components/BottomNav";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { supabase, user } = await requireUser();
  const { data: profile } = await supabase.from("profiles").select("onboarded_at").eq("id", user.id).single();
  if (!profile?.onboarded_at) redirect("/onboarding");
  return (
    <div className="mx-auto max-w-2xl px-4 pb-28 pt-4 md:pb-8">
      <div className="mb-4 hidden md:block"><BottomNav /></div>
      <main id="main">{children}</main>
      <div className="md:hidden"><BottomNav /></div>
    </div>
  );
}
