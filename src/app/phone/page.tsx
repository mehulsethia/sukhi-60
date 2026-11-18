import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { requireUser } from "@/lib/supabase/server";
import { AuthShell } from "@/components/auth/AuthShell";
import { PhoneForm } from "@/components/SettingsForms";
import { dialForTimezone } from "@/domain/wa-ui";

export const metadata: Metadata = { title: "Your phone number" };

// One required step for accounts made before phone numbers were asked for (and to change it).
export default async function PhonePage({ searchParams }: { searchParams: Promise<{ change?: string }> }) {
  const { change } = await searchParams;
  const { supabase, user } = await requireUser();
  const { data: p } = await supabase.from("profiles").select("phone, onboarded_at, timezone").eq("id", user.id).single();
  if (!p?.onboarded_at) redirect("/onboarding");
  if (p.phone && !change) redirect("/today");
  const t = await getTranslations("settings");
  return (
    <AuthShell title={t("phoneTitle")}>
      <PhoneForm current={p.phone ?? null} defaultDial={dialForTimezone(p.timezone)} next={change ? "/settings#wa" : "/today"} />
    </AuthShell>
  );
}
