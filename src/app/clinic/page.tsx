import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { ChevronRight } from "lucide-react";
import { requireUser } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fmtAgo } from "@/lib/format";
import { features } from "@/lib/config";
import { waLink } from "@/domain/wa-ui";
import { businessNumber } from "@/server/wa/data";
import { clinicPatients, getDoctor } from "@/server/clinic";
import { RedeemForm, RewardForm, ShareCode } from "@/components/ClinicForms";

export const dynamic = "force-dynamic";

const pct = (p: number | null) => (p === null ? "–" : `${p}%`);

export default async function ClinicPage() {
  const { user } = await requireUser();
  const admin = createAdminClient();
  const [doc, patients, t, locale, num, { data: me }] = await Promise.all([
    getDoctor(admin, user.id),
    clinicPatients(admin, user.id, { extras: true }),
    getTranslations("clinic"),
    getLocale(),
    features.whatsapp() ? businessNumber() : Promise.resolve(null),
    admin.from("profiles").select("primary_role").eq("id", user.id).maybeSingle(),
  ]);
  if (!doc) return null; // the layout redirects
  const link = num ? waLink(num, `DR-${doc.code}`) : null;
  const toCheck = patients.filter((p) => p.toCheck).length;

  return (
    <>
      <h1 className="text-xl font-bold">{doc.name}</h1>
      {doc.clinic ? <p className="text-sm text-ink-soft">{doc.clinic}</p> : null}

      <section aria-labelledby="pt" className="mt-6">
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="pt" className="text-sm font-semibold text-ink-soft">{t("patients")}{patients.length ? ` · ${patients.length}` : ""}</h2>
          {toCheck ? <span className="rounded-full bg-primary-soft px-2.5 py-0.5 text-xs font-semibold text-primary">{t("toCheckCount", { n: toCheck })}</span> : null}
        </div>
        {patients.length === 0 ? (
          <p className="card mt-2 text-ink-soft">{t("none")}</p>
        ) : (
          <ul className="card mt-2 divide-y divide-line !p-0">
            {patients.map((p) => (
              <li key={p.linkId}>
                <Link href={`/clinic/p/${p.linkId}`} className="flex items-center gap-3 px-4 py-3 hover:bg-sky/50">
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate font-semibold">{p.name}</span>
                      {p.toCheck ? <span className="shrink-0 rounded-full bg-primary-soft px-2 py-0.5 text-[0.65rem] font-semibold text-primary">{t("toCheck")}</span> : null}
                    </span>
                    <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-sky" aria-hidden="true">
                      <span className="block h-full rounded-full bg-primary" style={{ width: `${p.pct ?? 0}%` }} />
                    </span>
                    <span className="mt-1 block truncate text-xs text-ink-soft">
                      {[
                        p.today.total ? t("todayCount", { done: p.today.done, total: p.today.total }) : null,
                        p.photoPct !== null ? t("photoPct", { pct: p.photoPct }) : null,
                        p.lastCheckIn ? t("active", { when: fmtAgo(p.lastCheckIn, locale) }) : t("noCheckIn"),
                      ].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                  <span className="text-right">
                    <span className="block text-lg font-bold">{pct(p.pct)}</span>
                    <span className="block text-[0.65rem] text-ink-soft">{t("sevenDays")}</span>
                  </span>
                  <ChevronRight size={16} aria-hidden="true" className="shrink-0 text-ink-faint" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <section aria-labelledby="ad" className="card">
          <h2 id="ad" className="font-semibold">{t("addTitle")}</h2>
          <p className="mt-1 text-sm text-ink-soft">{t("addHelp")}</p>
          <p className="mt-3 font-mono text-2xl font-bold tracking-wider">DR-{doc.code}</p>
          {link ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api/whatsapp/qr/${doc.code}`} alt={t("qrAlt")} width={160} height={160} className="mt-3 rounded-lg border border-line" />
              <div className="mt-3"><ShareCode link={link} /></div>
            </>
          ) : null}
        </section>

        <section aria-labelledby="rw" className="card flex flex-col gap-5">
          <div>
            <h2 id="rw" className="font-semibold">{t("rewardTitle")}</h2>
            <p className="mt-1 text-sm text-ink-soft">{t("rewardHelp", { pct: doc.reward_target_pct, days: doc.reward_days })}</p>
            <div className="mt-3"><RewardForm current={doc.reward_text} /></div>
          </div>
          <div className="border-t border-line pt-4"><RedeemForm /></div>
        </section>
      </div>

      {me?.primary_role === "doctor" ? <p className="mt-8 text-sm"><Link href="/onboarding" className="link">{t("ownPlan")}</Link></p> : null}
    </>
  );
}
