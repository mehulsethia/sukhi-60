import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ChevronLeft, FileText, Leaf, ListPlus, ScanText, Stethoscope } from "lucide-react";
import { requireUser } from "@/lib/supabase/server";
import { setItemStatus, setPlanStatus } from "@/app/actions";
import { EditItemToggle, ExtractUpload, ItemForm, type EditableItem } from "@/components/PlanForms";
import { Alert, Section } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { CategoryIcon } from "@/components/CategoryIcon";
import { readingState } from "@/server/plan-reading";
import { ReadingStatus } from "@/components/ReadingStatus";
import { PauseUntilForm, StockForm } from "@/components/CompanionForms";
import { daysLeft } from "@/server/companion";
import { addDays, localDateOf } from "@/domain/schedule";

export const metadata: Metadata = { title: "Plan" };
// "Try again" reads the document in the background after this response.
export const maxDuration = 130;

export default async function PlanDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ from?: string; drafted?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const { supabase, user } = await requireUser();
  const t = await getTranslations();
  const { data: plan } = await supabase.from("care_plans").select("*").eq("id", id).maybeSingle();
  if (!plan) notFound();
  const [{ data: items }, { data: profile }] = await Promise.all([
    supabase.from("plan_items").select("*").eq("plan_id", id).neq("status", "retired").order("created_at"),
    supabase.from("profiles").select("timezone").eq("id", user.id).single(),
  ]);
  const clinical = plan.mode === "clinician_instructions";
  let sourceUrl: string | null = null;
  let reading: ReturnType<typeof readingState> = "none";
  if (plan.source_document_id) {
    const { data: doc } = await supabase.from("documents").select("bucket, storage_path, extraction_status, extraction").eq("id", plan.source_document_id).maybeSingle();
    if (doc) reading = readingState(doc.extraction_status, doc.extraction);
    if (doc) sourceUrl = (await supabase.storage.from(doc.bucket).createSignedUrl(doc.storage_path, 300)).data?.signedUrl ?? null; // short-lived
  }
  const tz = profile?.timezone ?? "UTC";
  const list = items ?? [];
  const drafts = list.filter((i) => i.status === "draft");
  const live = list.filter((i) => i.status !== "draft");

  const itemRow = (i: (typeof list)[number]) => (
    <li key={i.id} className={`panel p-4 sm:p-5 ${i.status === "draft" ? "border-[color-mix(in_srgb,var(--st-open)_45%,var(--line))]" : ""}`}>
      <div className="flex items-start gap-3">
        <CategoryIcon category={i.category} size={17} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <p className="text-[1.05rem] font-bold">{i.title}</p>
            {i.status !== "confirmed" ? <span className={`chip ${i.status === "draft" ? "bg-warn-bg text-warn-ink" : ""}`}>{t(`plan.item_${i.status}`)}</span> : null}
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-sm">
            <span className="chip">{t(`plan.sched_${i.schedule_kind}`)}{i.schedule_kind === "weekly_target" ? ` · ${i.weekly_target}×` : ""}</span>
            {i.schedule_kind === "weekdays" ? <span className="chip">{i.weekdays.map((d) => t(`weekday.${d}`)).join(" ")}</span> : null}
            {i.times.map((tm) => <span key={tm} className="chip bg-primary-soft font-bold tabular-nums text-primary">{tm}</span>)}
          </div>
          {i.instructions ? <p className="mt-2 text-[0.95rem]">{i.instructions}</p> : null}
          {i.source_snippet ? <p className="hint mt-1.5">{t("plan.source")}{i.source_page ? ` · ${t("plan.sourcePage", { page: i.source_page })}` : ""}: “{i.source_snippet}”</p> : null}
        </div>
      </div>
      {i.category === "medication" && i.status !== "draft" ? <StockForm itemId={i.id} stock={i.stock_count} perDose={i.units_per_dose} daysLeft={daysLeft(i)} /> : null}
      {i.unresolved_fields.length ? <div className="mt-3"><Alert tone="warn">{t("plan.unresolved")}: {i.unresolved_fields.join(", ")}</Alert></div> : null}
      <div className="mt-3 flex flex-wrap gap-2 sm:pl-10">
        <EditItemToggle planId={plan.id} clinical={clinical} item={i as unknown as EditableItem} />
        <form action={setItemStatus} className="flex flex-wrap gap-2">
          <input type="hidden" name="item_id" value={i.id} />
          <input type="hidden" name="plan_id" value={plan.id} />
          {i.status === "confirmed" ? <SubmitButton className="btn btn-secondary" name="status" value="paused">{t("plan.pauseItem")}</SubmitButton> : null}
          {i.status === "paused" ? <SubmitButton className="btn btn-secondary" name="status" value="confirmed">{t("plan.resumeItem")}</SubmitButton> : null}
          <SubmitButton className="btn btn-ghost text-sm" name="status" value="retired">{t("plan.retire")}</SubmitButton>
        </form>
      </div>
    </li>
  );

  return (
    <>
      <Link href="/plan" className="mb-4 inline-flex items-center gap-1 text-sm font-semibold text-ink-soft hover:text-ink"><ChevronLeft size={16} aria-hidden="true" />{t("plan.title")}</Link>
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-4">
          <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${clinical ? "bg-[color-mix(in_srgb,var(--st-review)_14%,var(--surface))] text-st-review" : "bg-primary-soft text-primary"}`}>{clinical ? <Stethoscope size={19} aria-hidden="true" /> : <Leaf size={19} aria-hidden="true" />}</span>
          <div className="min-w-0">
            <h1 className="text-[1.5rem] sm:text-[1.9rem]">{plan.title}</h1>
            <div className="mt-2 flex flex-wrap gap-2">
              {plan.status !== "active" ? <span className="chip">{t(`plan.status_${plan.status}`)}</span> : null}
              <span className="chip">{clinical ? (plan.clinician_name ? t("planUi.fromDoctor", { name: plan.clinician_name }) : t(`plan.verification_${plan.clinician_verification}`)) : t("today.personalTag")}</span>
              {plan.status === "paused" && plan.paused_until ? <span className="chip bg-warn-bg text-warn-ink">{t("companion.pausedUntil", { date: plan.paused_until })}{plan.pause_reason ? ` · ${t(`companion.reason_${plan.pause_reason}`)}` : ""}</span> : null}
            </div>
          </div>
        </div>
        <form action={setPlanStatus} className="flex flex-wrap gap-2">
          <input type="hidden" name="plan_id" value={plan.id} />
          {plan.status === "active" ? <SubmitButton className="btn btn-secondary" name="status" value="paused">{t("plan.pause")}</SubmitButton> : null}
          {plan.status !== "active" ? <SubmitButton className="btn btn-primary" name="status" value="active">{plan.status === "paused" ? t("plan.resume") : t("plan.activate")}</SubmitButton> : null}
          <SubmitButton className="btn btn-ghost" name="status" value="archived">{t("plan.archive")}</SubmitButton>
        </form>
        {plan.status === "active" ? <div className="w-full sm:w-auto"><PauseUntilForm planId={plan.id} minDate={addDays(localDateOf(new Date(), tz), 1)} maxDate={addDays(localDateOf(new Date(), tz), 90)} /></div> : null}
      </header>
      {plan.source_document_id && (reading === "pending" || reading === "failed" || reading === "stale") ? <ReadingStatus planId={plan.id} docId={plan.source_document_id} state={reading} /> : null}
      {sp.from === "onboarding" && reading !== "pending" && !drafts.length ? <div className="mb-5"><Alert tone={drafts.length ? "warn" : "info"}>{drafts.length ? t("onb.reviewDrafts") : t("onb.reviewNoDoc")}</Alert></div> : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0">
          {drafts.length ? (
            <section aria-labelledby="drafts-h" className="mb-6">
              <h2 id="drafts-h" className="mb-1 text-lg">{t("planUi.toCheck", { n: drafts.length })}</h2>
              <p className="mb-3 text-sm text-ink-soft">{t("planUi.toCheckHelp")}</p>
              <ul className="flex flex-col gap-3">{drafts.map(itemRow)}</ul>
            </section>
          ) : null}
          <section aria-labelledby="items" className="mb-6">
            <h2 id="items" className="mb-3 text-lg">{t("plan.items")} <span className="font-semibold text-ink-faint">· {live.length}</span></h2>
            {live.length === 0 ? <p className="panel p-5 text-ink-soft">{t("plan.noItems")}</p> : <ul className="flex flex-col gap-3">{live.map(itemRow)}</ul>}
          </section>
          <Section title={t("plan.addItem")} id="add" icon={<ListPlus size={20} aria-hidden="true" />}>
            <ItemForm planId={plan.id} clinical={clinical} />
          </Section>
        </div>

        <aside className="flex flex-col">
          {plan.source_description || sourceUrl ? (
            <Section title={t("plan.source")} id="src" icon={<FileText size={20} aria-hidden="true" />}>
              {plan.source_description ? <p className="text-[0.95rem]">{plan.source_description}</p> : null}
              {sourceUrl ? <a href={sourceUrl} target="_blank" rel="noopener noreferrer" className="btn btn-secondary mt-2 w-full">{t("plan.viewSource")}</a> : null}
            </Section>
          ) : null}
          <Section title={t("plan.upload")} id="upload" icon={<ScanText size={20} aria-hidden="true" />}>
            <ExtractUpload planId={plan.id} />
          </Section>
        </aside>
      </div>
    </>
  );
}
