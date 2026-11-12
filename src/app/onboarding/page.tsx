import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/supabase/server";
import { OnboardingForm } from "./OnboardingForm";
import { features } from "@/lib/config";

export const metadata: Metadata = { title: "Welcome" };
// Finishing onboarding may read an uploaded prescription with the vision model.
export const maxDuration = 130;

export default async function OnboardingPage() {
  const { supabase, user } = await requireUser();
  const { data: profile } = await supabase.from("profiles").select("timezone, locale, onboarded_at").eq("id", user.id).single();
  if (profile?.onboarded_at) redirect("/today");
  return <OnboardingForm defaults={{ timezone: profile?.timezone ?? "Asia/Kolkata", locale: profile?.locale ?? "en" }} whatsappLaunched={features.whatsappLaunched()} />;
}
