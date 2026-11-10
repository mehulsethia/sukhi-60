import { redirect } from "next/navigation";
import { requireUser } from "@/lib/supabase/server";
import { OnboardingForm } from "./OnboardingForm";

export default async function OnboardingPage() {
  const { supabase, user } = await requireUser();
  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).single();
  if (profile?.onboarded_at) redirect("/today");
  return (
    <main className="mx-auto max-w-xl p-4 pb-16">
      <OnboardingForm defaults={{ timezone: profile?.timezone ?? "Asia/Kolkata", locale: profile?.locale ?? "en" }} />
    </main>
  );
}
