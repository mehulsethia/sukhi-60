import { redirect } from "next/navigation";
import { requireUser } from "@/lib/supabase/server";
import { OnboardingForm } from "./OnboardingForm";
import { Logo } from "@/components/Logo";

export default async function OnboardingPage() {
  const { supabase, user } = await requireUser();
  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).single();
  if (profile?.onboarded_at) redirect("/today");
  return (
    <main id="main" className="mx-auto max-w-xl px-4 pb-16 pt-6">
      <div className="mb-8"><Logo /></div>
      <OnboardingForm defaults={{ timezone: profile?.timezone ?? "Asia/Kolkata", locale: profile?.locale ?? "en" }} />
    </main>
  );
}
