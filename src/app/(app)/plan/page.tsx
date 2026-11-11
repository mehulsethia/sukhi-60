import Link from "next/link";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { AlertCircle, Droplets, Footprints, Leaf, Plus, Stethoscope, StretchHorizontal } from "lucide-react";
import { requireUser } from "@/lib/supabase/server";
import { addTemplate } from "@/app/actions";
import { CreatePlanForm } from "@/components/PlanForms";
import { PageHeader, Section } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { CategoryIcon } from "@/components/CategoryIcon";

export const metadata: Metadata = { title: "My plan" };

const TPL_ICON = { walk: Footprints, water: Droplets, stretch: StretchHorizontal } as const;

export default async function PlanList({ searchParams }: { searchParams: Promise<{ new?: string }> }) {
  const sp = await searchParams;
  const { supabase } = await requireUser();
  const t = await getTranslations();
  const { data: plans } = await supabase
    .from("care_plans")
    .select("id, title, mode, status, clinician_verification, clinician_name, plan_items(id, status, title, times, category, schedule_kind, weekly_target)")
    .neq("status", "archived")
    .order("created_at");
  return (
    <>
      <PageHeader title={t("plan.title")} subtitle={t("planUi.subtitle")}>
        <a href="#new-plan" className="btn btn-primary"><Plus size={18} aria-hidden="true" />{t("plan.newPlan")}</a>
      </PageHeader>

      {(plans ?? []).length === 0 ? (
        <div className="panel mb-6 flex flex-col items-center px-6 py-12 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-soft text-primary"><Leaf size={26} aria-hidden="true" /></span>
          <p className="mt-4 text-xl font-semibold">{t("plan.empty")}</p>
          <p className="mt-1 max-w-md text-ink-soft">{t("planUi.emptyBody")}</p>
        </div>
      ) : (
        <ul className="mb-8 grid gap-4 md:grid-cols-2">
          {(plans ?? []).map((p) => {
            const items = (p.plan_items ?? []).filter((i) => i.status !== "retired");
            const drafts = items.filter((i) => i.status === "draft").length;
            const clinical = p.mode === "clinician_instructions";
            return (
              <li key={p.id}>
                <Link href={`/plan/${p.id}`} className="panel group flex h-full flex-col p-5 transition-colors hover:border-primary">
                  <div className="flex items-start gap-3">
                    <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${clinical ? "bg-[color-mix(in_srgb,var(--st-review)_14%,var(--surface))] text-st-review" : "bg-primary-soft text-primary"}`}>{clinical ? <Stethoscope size={21} aria-hidden="true" /> : <Leaf size={21} aria-hidden="true" />}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-lg font-bold group-hover:text-primary">{p.title}</p>
                      <p className="text-sm text-ink-soft">{clinical ? (p.clinician_name ? t("planUi.fromDoctor", { name: p.clinician_name }) : t(`plan.verification_${p.clinician_verification}`)) : t("plan.personalBadge")}</p>
                    </div>
                    <span className={`chip ${p.status === "active" ? "bg-ok-bg text-ok-ink" : ""}`}>{t(`plan.status_${p.status}`)}</span>
                  </div>
                  <ul className="mt-4 flex flex-1 flex-col gap-2">
                    {items.slice(0, 4).map((i) => (
                      <li key={i.id} className="flex items-center gap-2.5 text-[0.95rem]">
                        <CategoryIcon category={i.category} />
                        <span className="min-w-0 flex-1 truncate">{i.title}</span>
                        <span className="shrink-0 text-xs font-semibold tabular-nums text-ink-soft">{i.schedule_kind === "weekly_target" ? t("planUi.perWeek", { n: i.weekly_target ?? 1 }) : i.times.slice(0, 2).join(", ")}</span>
                      </li>
                    ))}
                    {items.length === 0 ? <li className="text-sm text-ink-soft">{t("plan.noItems")}</li> : null}
                    {items.length > 4 ? <li className="text-sm font-semibold text-ink-soft">{t("planUi.more", { n: items.length - 4 })}</li> : null}
                  </ul>
                  <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-3 text-sm">
                    <span className="font-semibold">{t("plan.items")}: {items.length}</span>
                    {drafts ? <span className="chip ml-auto bg-warn-bg text-warn-ink"><AlertCircle size={13} aria-hidden="true" />{t("planUi.draftsToCheck", { n: drafts })}</span> : null}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <Section title={t("plan.newPlan")} id="new-plan" description={t("planUi.newPlanHelp")} icon={<Plus size={20} aria-hidden="true" />}>
          <CreatePlanForm defaultMode={sp.new === "clinician" ? "clinician_instructions" : "personal_goal"} />
        </Section>
        <Section title={t("plan.useTemplate")} id="tpl" description={t("onboarding.routineIntro")} icon={<Leaf size={20} aria-hidden="true" />}>
          <div className="flex flex-col gap-2.5">
            {(["walk", "water", "stretch"] as const).map((k) => {
              const Icon = TPL_ICON[k];
              return (
                <form key={k} action={addTemplate} className="flex items-center gap-3 rounded-2xl border border-line p-3.5">
                  <input type="hidden" name="template" value={k} />
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-primary"><Icon size={19} aria-hidden="true" /></span>
                  <span className="min-w-0 flex-1"><span className="block font-semibold">{t(`templates.${k}`)}</span><span className="text-sm text-ink-soft">{t(`templates.${k}Desc`)}</span></span>
                  <SubmitButton className="pill-btn" pendingLabel={t("common.saving")}><Plus size={16} aria-hidden="true" /><span className="sr-only sm:not-sr-only">{t("planUi.add")}</span></SubmitButton>
                </form>
              );
            })}
          </div>
        </Section>
      </div>
    </>
  );
}
