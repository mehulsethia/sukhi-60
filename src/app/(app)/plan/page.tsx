import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { requireUser } from "@/lib/supabase/server";
import { addTemplate } from "@/app/actions";
import { CreatePlanForm } from "@/components/PlanForms";
import { PageHeader, Section } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";

export default async function PlanList({ searchParams }: { searchParams: Promise<{ new?: string }> }) {
  const sp = await searchParams;
  const { supabase } = await requireUser();
  const t = await getTranslations();
  const { data: plans } = await supabase.from("care_plans").select("id, title, mode, status, clinician_verification, plan_items(id, status)").neq("status", "archived").order("created_at");
  return (
    <>
      <PageHeader title={t("plan.title")} />
      {(plans ?? []).length === 0 ? <p className="card mb-4">{t("plan.empty")}</p> : null}
      <ul className="mb-4 flex flex-col gap-3">
        {(plans ?? []).map((p) => (
          <li key={p.id}>
            <Link href={`/plan/${p.id}`} className="card block hover:border-primary">
              <span className="text-lg font-bold">{p.title}</span>
              <span className="mt-1 flex flex-wrap gap-2">
                <span className="chip">{t(`plan.status_${p.status}`)}</span>
                <span className="chip">{p.mode === "personal_goal" ? t("plan.personalBadge") : t(`plan.verification_${p.clinician_verification}`)}</span>
                <span className="chip">{t("plan.items")}: {(p.plan_items ?? []).filter((i) => i.status !== "retired").length}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <Section title={t("plan.newPlan")} id="new-plan">
        <CreatePlanForm defaultMode={sp.new === "clinician" ? "clinician_instructions" : "personal_goal"} />
      </Section>
      <Section title={t("plan.useTemplate")} id="tpl">
        <p className="hint mb-2">{t("onboarding.routineIntro")}</p>
        <div className="flex flex-col gap-2">
          {(["walk", "water", "stretch"] as const).map((k) => (
            <form key={k} action={addTemplate} className="flex items-center justify-between gap-3 rounded-xl border border-line p-3">
              <input type="hidden" name="template" value={k} />
              <span><span className="block font-semibold">{t(`templates.${k}`)}</span><span className="hint">{t(`templates.${k}Desc`)}</span></span>
              <SubmitButton className="btn btn-secondary" pendingLabel={t("common.saving")}>+</SubmitButton>
            </form>
          ))}
        </div>
      </Section>
    </>
  );
}
