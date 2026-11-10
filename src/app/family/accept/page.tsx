import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/supabase/server";
import { AcceptInvite } from "@/components/AcceptInvite";

export default async function AcceptPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  const t = await getTranslations("family");
  const { user } = await getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/family/accept?token=${token ?? ""}`)}`);
  return (
    <main className="mx-auto max-w-md p-6">
      <h1 className="mb-4 text-2xl font-bold">{t("acceptTitle")}</h1>
      {token && /^[0-9a-f]{64}$/.test(token) ? <AcceptInvite token={token} /> : <p>{t("invalid")}</p>}
    </main>
  );
}
