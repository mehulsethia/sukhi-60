import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { ChevronLeft, FileText, History, Leaf, ListPlus, ScanText, Stethoscope } from "lucide-react";
import { requireUser } from "@/lib/supabase/server";
import { setItemStatus, setPlanStatus } from "@/app/actions";
import { EditItemToggle, ExtractUpload, ItemForm, type EditableItem } from "@/components/PlanForms";
import { Alert, Section } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { CategoryIcon } from "@/components/CategoryIcon";
import { fmtDateTime } from "@/lib/format";
import { readingState } from "@/server/plan-reading";
import { ReadingStatus } from "@/components/ReadingStatus";

export const metadata: Metadata = { title: "Plan" };
// "Try again" reads the document in the background after this response.
export const maxDuration = 130;

export default async function PlanDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ from?: string; drafted?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const { supabase, user } = await requireUser();
  const t = await getTranslations();
  const locale = await getLocale();
  const { data: plan } = await supabase.from("care_plans").select("*").eq("id", id).maybeSingle();
  if (!plan) notFound();
  const [{ data: items }, { data: versions }, { data: profile }] = await Promise.all([
    supabase.from("plan_items").select("*").eq("plan_id", id).neq("status", "retired").order("created_at"),
    supabase.from("plan_item_versions").select("id, item_id, version, change_kind, changed_via, created_at, snapshot, plan_items!inner(plan_id)").eq("plan_items.plan_id", id).order("created_at", { ascending: false }).limit(30),
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
            <span className={`chip ${i.status === "draft" ? "bg-warn-bg text-warn-ink" : i.status === "confirmed" ? "bg-ok-bg text-ok-ink" : ""}`}>{t(`plan.item_${i.status}`)} · {t("plan.version", { v: i.version })}</span>
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-sm">
            <span className="chip">{t(`plan.cat_${i.category}`)}</span>
            <span className="chip">{t(`plan.sched_${i.schedule_kind}`)}{i.schedule_kind === "weekly_target" ? ` · ${i.weekly_target}×` : ""}</span>
            {i.schedule_kind === "weekdays" ? <span className="chip">{i.weekdays.map((d) => t(`weekday.${d}`)).join(" ")}</span> : null}
            {i.times.map((tm) => <span key={tm} className="chip bg-primary-soft font-bold tabular-nums text-primary">{tm}</span>)}
          </div>
          {i.instructions ? <p className="mt-2 text-[0.95rem]">{i.instructions}</p> : null}
          {i.source_snippet ? <p className="hint mt-1.5">{t("plan.source")}{i.source_page ? ` · ${t("plan.sourcePage", { page: i.source_page })}` : ""}: “{i.source_snippet}”</p> : null}
        </div>
      </div>
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
          <span className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl ${clinical ? "bg-[color-mix(in_srgb,var(--st-review)_14%,var(--surface))] text-st-review" : "bg-primary-soft text-primary"}`}>{clinical ? <Stethoscope size={26} aria-hidden="true" /> : <Leaf size={26} aria-hidden="true" />}</span>
          <div className="min-w-0">
            <h1 className="text-[1.9rem] sm:text-[2.4rem]">{plan.title}</h1>
            <div className="mt-2 flex flex-wrap gap-2">
              <span className={`chip ${plan.status === "active" ? "bg-ok-bg text-ok-ink" : ""}`}>{t(`plan.status_${plan.status}`)}</span>
              <span className="chip">{clinical ? t(`plan.verification_${plan.clinician_verification}`) : t("plan.personalBadge")}</span>
              {plan.clinician_name ? <span className="chip">{t("plan.clinicianName")}: {plan.clinician_name}</span> : null}
            </div>
          </div>
        </div>
        <form action={setPlanStatus} className="flex flex-wrap gap-2">
          <input type="hidden" name="plan_id" value={plan.id} />
          {plan.status === "active" ? <SubmitButton className="btn btn-secondary" name="status" value="paused">{t("plan.pause")}</SubmitButton> : null}
          {plan.status !== "active" ? <SubmitButton className="btn btn-primary" name="status" value="active">{plan.status === "paused" ? t("plan.resume") : t("plan.activate")}</SubmitButton> : null}
          <SubmitButton className="btn btn-ghost" name="status" value="archived">{t("plan.archive")}</SubmitButton>
        </form>
      </header>
      {plan.source_document_id && (reading === "pending" || reading === "failed" || reading === "stale") ? <ReadingStatus planId={plan.id} docId={plan.source_document_id} state={reading} /> : null}
      {sp.from === "onboarding" && reading !== "pending" ? <div className="mb-5"><Alert tone={drafts.length ? "warn" : "info"}>{drafts.length ? t("onb.reviewDrafts") : t("onb.reviewNoDoc")}</Alert></div> : null}

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
          <Section title={t("plan.history")} id="history" icon={<History size={20} aria-hidden="true" />}>
            {(versions ?? []).length === 0 ? <p className="hint">—</p> : (
              <ol className="relative flex flex-col gap-3 border-l border-line pl-4 text-sm">
                {(versions ?? []).map((v) => (
                  <li key={v.id} className="relative">
                    <span aria-hidden="true" className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-surface bg-primary" />
                    <p className="font-semibold">{(v.snapshot as { title?: string }).title}</p>
                    <p className="text-ink-soft">{t(`plan.change_${v.change_kind}`)} · {t("plan.version", { v: v.version })} · {fmtDateTime(v.created_at, tz, locale)}</p>
                  </li>
                ))}
              </ol>
            )}
          </Section>
        </aside>
      </div>
    </>
  );
}
