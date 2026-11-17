import Link from "next/link";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { AlertCircle, Leaf, Stethoscope } from "lucide-react";
import { requireUser } from "@/lib/supabase/server";
import { features } from "@/lib/config";
import { CreatePlanForm } from "@/components/PlanForms";
import { PackGrid } from "@/components/PackGrid";
import { QuickPlan } from "@/components/QuickPlan";
import { DoctorUpload } from "@/components/DoctorUpload";
import { CategoryIcon } from "@/components/CategoryIcon";
import { PACK_KEYS, packPlanNames } from "@/domain/templates";

export const metadata: Metadata = { title: "My plan" };

const eyebrow = "mb-2.5 text-[0.75rem] font-medium uppercase tracking-[0.08em] text-ink-faint";

export default async function PlanList({ searchParams }: { searchParams: Promise<{ new?: string }> }) {
  const sp = await searchParams;
  const { supabase, user } = await requireUser();
  const t = await getTranslations();
  const [{ data: plans }, { data: consents }] = await Promise.all([
    supabase
      .from("care_plans")
      .select("id, title, mode, status, clinician_verification, clinician_name, plan_items(id, status, title, times, category, schedule_kind, weekly_target)")
      .neq("status", "archived")
      .order("created_at"),
    supabase.from("consents").select("kind, granted").eq("user_id", user.id).eq("kind", "voice_processing").maybeSingle(),
  ]);
  const list = plans ?? [];
  // Packs already added (by their plan name) aren't offered again.
  const added = PACK_KEYS.filter((k) => list.some((p) => packPlanNames(k).includes(p.title) && p.status !== "archived"));
  return (
    <>
      <header className="mb-6 flex items-end justify-between gap-3">
        <h1 className="text-[1.6rem] sm:text-[2rem]">{t("plan.title")}</h1>
        <Link href="/visit" className="pill-btn text-sm"><Stethoscope size={15} aria-hidden="true" />{t("visit.link")}</Link>
      </header>

      {list.length ? (
        <ul className="mb-8 grid gap-3 md:grid-cols-2">
          {list.map((p) => {
            const items = (p.plan_items ?? []).filter((i) => i.status !== "retired");
            const drafts = items.filter((i) => i.status === "draft").length;
            const clinical = p.mode === "clinician_instructions";
            return (
              <li key={p.id}>
                <Link href={`/plan/${p.id}`} className="panel group flex h-full flex-col p-4 transition-colors hover:border-primary">
                  <div className="flex items-center gap-2.5">
                    {clinical ? <Stethoscope size={16} className="shrink-0 text-st-review" aria-hidden="true" /> : <Leaf size={16} className="shrink-0 text-primary" aria-hidden="true" />}
                    <p className="min-w-0 flex-1 truncate font-semibold group-hover:text-primary">{p.title}</p>
                    {p.status !== "active" ? <span className="chip">{t(`plan.status_${p.status}`)}</span> : null}
                    {drafts ? <span className="chip bg-warn-bg text-warn-ink"><AlertCircle size={13} aria-hidden="true" />{drafts}</span> : null}
                  </div>
                  <ul className="mt-3 flex flex-col gap-1.5">
                    {items.slice(0, 3).map((i) => (
                      <li key={i.id} className="flex items-center gap-2.5 text-[0.9rem]">
                        <CategoryIcon category={i.category} />
                        <span className="min-w-0 flex-1 truncate">{i.title}</span>
                        <span className="shrink-0 text-xs tabular-nums text-ink-faint">{i.schedule_kind === "weekly_target" ? t("planUi.perWeek", { n: i.weekly_target ?? 1 }) : i.times.slice(0, 2).join(", ")}</span>
                      </li>
                    ))}
                    {items.length > 3 ? <li className="text-xs text-ink-faint">{t("planUi.more", { n: items.length - 3 })}</li> : null}
                  </ul>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : null}

      <section aria-labelledby="quick" className="mb-7">
        <h2 id="quick" className={eyebrow}>{t("quickPlan.title")}</h2>
        <QuickPlan voiceEnabled={features.speech() && !!consents?.granted} />
      </section>

      {added.length < PACK_KEYS.length ? (
        <section aria-labelledby="packs" className="mb-7">
          <h2 id="packs" className={eyebrow}>{t("quickPlan.packs")}</h2>
          <PackGrid exclude={added} />
        </section>
      ) : null}

      <details className="mb-3 rounded-[var(--r-md)] border border-line bg-surface p-4">
        <summary className="flex cursor-pointer items-center gap-2 text-sm font-medium"><Stethoscope size={15} className="text-primary" aria-hidden="true" />{t("quickPlan.doctorCta")}</summary>
        <div className="mt-4"><DoctorUpload /></div>
      </details>

      <details className="mb-4 rounded-[var(--r-md)] border border-line bg-surface p-4" open={sp.new === "clinician"}>
        <summary className="cursor-pointer text-sm font-medium text-ink-soft">{t("quickPlan.manual")}</summary>
        <div className="mt-4"><CreatePlanForm defaultMode={sp.new === "clinician" ? "clinician_instructions" : "personal_goal"} /></div>
      </details>
    </>
  );
}
