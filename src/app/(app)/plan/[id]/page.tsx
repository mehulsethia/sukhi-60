import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { requireUser } from "@/lib/supabase/server";
import { setItemStatus, setPlanStatus } from "@/app/actions";
import { EditItemToggle, ExtractUpload, ItemForm, type EditableItem } from "@/components/PlanForms";
import { Alert, PageHeader, Section } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { fmtDateTime } from "@/lib/format";

export default async function PlanDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const { supabase, user } = await requireUser();
  const t = await getTranslations();
  const locale = await getLocale();
  const { data: plan } = await supabase.from("care_plans").select("*").eq("id", id).maybeSingle();
  if (!plan) notFound();
  const [{ data: items }, { data: versions }, { data: profile }] = await Promise.all([
    supabase.from("plan_items").select("*").eq("plan_id", id).neq("status", "retired").order("created_at"),
    supabase.from("plan_item_versions").select("id, item_id, version, change_kind, changed_via, created_at, snapshot").in("item_id", (await supabase.from("plan_items").select("id").eq("plan_id", id)).data?.map((i) => i.id) ?? ["00000000-0000-0000-0000-000000000000"]).order("created_at", { ascending: false }).limit(30),
    supabase.from("profiles").select("timezone").eq("id", user.id).single(),
  ]);
  const clinical = plan.mode === "clinician_instructions";
  let sourceUrl: string | null = null;
  if (plan.source_document_id) {
    const { data: doc } = await supabase.from("documents").select("bucket, storage_path").eq("id", plan.source_document_id).maybeSingle();
    if (doc) sourceUrl = (await supabase.storage.from(doc.bucket).createSignedUrl(doc.storage_path, 300)).data?.signedUrl ?? null; // short-lived
  }
  const tz = profile?.timezone ?? "UTC";

  return (
    <>
      <PageHeader title={plan.title}>
        <span className="chip">{t(`plan.status_${plan.status}`)}</span>
      </PageHeader>
      <div className="card mb-4 flex flex-col gap-2">
        <p className="font-semibold">{clinical ? t(`plan.verification_${plan.clinician_verification}`) : t("plan.personalBadge")}</p>
        {plan.clinician_name ? <p>{t("plan.clinicianName")}: {plan.clinician_name}</p> : null}
        {plan.source_description ? <p>{t("plan.source")}: {plan.source_description}</p> : null}
        {sourceUrl ? <a href={sourceUrl} target="_blank" rel="noopener noreferrer" className="font-semibold text-primary underline">{t("plan.viewSource")}</a> : null}
        <form action={setPlanStatus} className="flex flex-wrap gap-2">
          <input type="hidden" name="plan_id" value={plan.id} />
          {plan.status === "active" ? <SubmitButton className="btn btn-secondary" name="status" value="paused">{t("plan.pause")}</SubmitButton> : null}
          {plan.status !== "active" ? <SubmitButton className="btn btn-primary" name="status" value="active">{plan.status === "paused" ? t("plan.resume") : t("plan.activate")}</SubmitButton> : null}
          <SubmitButton className="btn btn-ghost underline" name="status" value="archived">{t("plan.archive")}</SubmitButton>
        </form>
      </div>

      <Section title={t("plan.items")} id="items">
        {(items ?? []).length === 0 ? <p className="mb-2">{t("plan.noItems")}</p> : null}
        <ul className="flex flex-col gap-3">
          {(items ?? []).map((i) => (
            <li key={i.id} className="rounded-xl border border-line p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-bold">{i.title}</p>
                  <p className="hint">{t(`plan.cat_${i.category}`)} · {t(`plan.sched_${i.schedule_kind}`)}{i.times.length ? ` · ${i.times.join(", ")}` : ""}{i.schedule_kind === "weekdays" ? ` · ${i.weekdays.map((d) => t(`weekday.${d}`)).join(" ")}` : ""}{i.schedule_kind === "weekly_target" ? ` · ${i.weekly_target}×` : ""}</p>
                  {i.instructions ? <p className="mt-1">{i.instructions}</p> : null}
                  {i.source_snippet ? <p className="hint mt-1">{t("plan.source")}{i.source_page ? ` · ${t("plan.sourcePage", { page: i.source_page })}` : ""}: “{i.source_snippet}”</p> : null}
                </div>
                <span className={`chip ${i.status === "draft" ? "bg-warn-bg text-warn-ink" : ""}`}>{t(`plan.item_${i.status}`)} · {t("plan.version", { v: i.version })}</span>
              </div>
              {i.unresolved_fields.length ? <Alert tone="warn">{t("plan.unresolved")}: {i.unresolved_fields.join(", ")}</Alert> : null}
              <div className="mt-2 flex flex-wrap gap-2">
                <EditItemToggle planId={plan.id} clinical={clinical} item={i as unknown as EditableItem} />
                <form action={setItemStatus} className="flex flex-wrap gap-2">
                  <input type="hidden" name="item_id" value={i.id} />
                  <input type="hidden" name="plan_id" value={plan.id} />
                  {i.status === "confirmed" ? <SubmitButton className="btn btn-secondary" name="status" value="paused">{t("plan.pauseItem")}</SubmitButton> : null}
                  {i.status === "paused" ? <SubmitButton className="btn btn-secondary" name="status" value="confirmed">{t("plan.resumeItem")}</SubmitButton> : null}
                  <SubmitButton className="btn btn-ghost underline" name="status" value="retired">{t("plan.retire")}</SubmitButton>
                </form>
              </div>
            </li>
          ))}
        </ul>
      </Section>

      <Section title={t("plan.addItem")} id="add">
        <ItemForm planId={plan.id} clinical={clinical} />
      </Section>

      <Section title={t("plan.upload")} id="upload">
        <ExtractUpload planId={plan.id} />
      </Section>

      <Section title={t("plan.history")} id="history">
        <ol className="flex flex-col gap-1 text-sm">
          {(versions ?? []).map((v) => (
            <li key={v.id}>{fmtDateTime(v.created_at, tz, locale)} — {(v.snapshot as { title?: string }).title} · {t(`plan.change_${v.change_kind}`)} · {t("plan.version", { v: v.version })}</li>
          ))}
        </ol>
      </Section>
    </>
  );
}
