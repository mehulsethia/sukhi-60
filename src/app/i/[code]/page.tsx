import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { MessageCircle } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { features } from "@/lib/config";
import { inviteText, parseInviteCode, waLink } from "@/domain/wa-ui";
import { businessNumber } from "@/server/wa/data";
import { findFamilyInvite } from "@/server/wa/family";
import { findCareInvite } from "@/server/wa/care";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Invite", robots: { index: false } };

// One link for every invite: /i/DR-123456, /i/FAMILY-ABC234, /i/JOIN-12345, /i/CARE-ABC234.
// Shows who invited them, then opens WhatsApp with the code filled in (circles can also join on the web).
export default async function InvitePage({ params }: { params: Promise<{ code: string }> }) {
  const { code: raw } = await params;
  let decoded = raw;
  try { decoded = decodeURIComponent(raw); } catch { notFound(); } // a stray "%" in a pasted link
  const code = parseInviteCode(decoded.slice(0, 40));
  if (!code) notFound();
  const t = await getTranslations("invite");
  const admin = createAdminClient();

  let title: string | null = null;
  if (code.kind === "doctor") {
    const { data } = await admin.from("doctors").select("name").eq("code", code.code).maybeSingle();
    if (data) title = t("doctor", { name: data.name });
  } else if (code.kind === "family") {
    const inv = await findFamilyInvite(admin, code.code);
    if (inv) title = t("family", { name: inv.name || t("someone") });
  } else if (code.kind === "care") {
    const inv = await findCareInvite(admin, code.code);
    if (inv) title = t("care", { name: inv.name || t("someone") });
  } else {
    const { data } = await admin.from("circles").select("id").eq("invite_code", code.code).maybeSingle();
    if (data) title = t("circle");
  }

  const num = features.whatsapp() ? await businessNumber() : null;
  const wa = num ? waLink(num, inviteText(code)) : null;
  const web = code.kind === "circle" ? `/circle/join/${code.code}` : null;

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 px-4 py-10">
      <p className="text-[0.75rem] font-medium uppercase tracking-[0.08em] text-ink-faint">Sukhi</p>
      {title ? (
        <>
          <div>
            <h1 className="text-[1.5rem] leading-snug">{title}</h1>
            <p className="mt-2 text-ink-soft">{t(`${code.kind}_body`)}</p>
          </div>
          <div className="flex flex-col gap-2">
            {wa ? <a href={wa} className="btn btn-primary"><MessageCircle size={17} aria-hidden="true" />{t("openWhatsApp")}</a> : null}
            {web ? <Link href={web} className={wa ? "btn btn-ghost" : "btn btn-primary"}>{t("useWeb")}</Link> : null}
            {!wa && !web ? <p className="hint">{t("whatsappOnly", { code: inviteText(code) })}</p> : null}
          </div>
        </>
      ) : (
        <h1 className="text-[1.5rem] leading-snug">{t("expired")}</h1>
      )}
    </main>
  );
}
