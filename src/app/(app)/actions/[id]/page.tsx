import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { requireUser } from "@/lib/supabase/server";
import { displayStatus } from "@/domain/schedule";
import { EvidenceForm } from "@/components/EvidenceForm";
import { ReviewForm } from "@/components/ReviewForm";
import { PageHeader, Section, StatusBadge } from "@/components/ui";
import { fmtDateTime } from "@/lib/format";
import { createAdminClient } from "@/lib/supabase/admin";
import { challengeFor } from "@/server/proof";
import { ReadingFix } from "@/components/ReadingFix";
import { PROOF_MEDIA_RETENTION_DAYS } from "@/domain/proof";
import type { ReadingKind } from "@/domain/readings";

export default async function ActionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const { supabase, user } = await requireUser();
  const t = await getTranslations();
  const locale = await getLocale();
  const { data: occ } = await supabase.from("action_occurrences").select("*, plan_items!inner(title, instructions, category, evidence_hint, care_plans!inner(mode, clinician_verification))").eq("id", id).maybeSingle();
  if (!occ) notFound(); // RLS: other users' occurrences are invisible
  const item = occ.plan_items as unknown as { title: string; instructions: string | null; category: string; care_plans: { mode: string; clinician_verification: string } };
  const { data: profile } = await supabase.from("profiles").select("timezone, accessibility").eq("id", user.id).single();
  const tz = profile?.timezone ?? "UTC";
  const [{ data: checkIns }, { data: evidence }, { data: evaluations }, { data: readings }] = await Promise.all([
    supabase.from("check_ins").select("id, kind, reason, channel, created_at").eq("occurrence_id", id).order("created_at"),
    supabase.from("evidence").select("id, kind, text_content, transcript, channel, created_at").eq("occurrence_id", id).order("created_at"),
    supabase.from("evaluations").select("*").eq("occurrence_id", id).order("created_at", { ascending: false }),
    supabase.from("readings").select("id, evidence_id, kind, value, value2, pulse, unit, source").eq("occurrence_id", id),
  ]);
  const readingFor = (evidenceId: string | null) => {
    const r = (readings ?? []).find((x) => x.evidence_id === evidenceId);
    return r ? { ...r, kind: r.kind as ReadingKind, value: Number(r.value), value2: r.value2 === null ? null : Number(r.value2) } : null;
  };
  const status = displayStatus(occ);
  // Fresh-photo sign for today's proof (an old or borrowed photo can't contain it).
  const canProve = !["paused", "skipped", "unable", "missed"].includes(status);
  const challenge = canProve ? await challengeFor(createAdminClient(), user.id, id).catch(() => null) : null;

  return (
    <div className="mx-auto max-w-4xl">
      <Link href="/today" className="mb-4 inline-flex items-center gap-1 text-sm font-semibold text-ink-soft hover:text-ink"><ChevronLeft size={16} aria-hidden="true" />{t("nav.today")}</Link>
      <PageHeader title={item.title}><StatusBadge status={status} label={t(`status.${status}`)} /></PageHeader>
      <div className="panel mb-5 p-5">
        <p><span className="font-semibold">{t("action.dueAt")}:</span> {fmtDateTime(occ.due_at, tz, locale)} ({tz})</p>
        {item.instructions ? <p className="mt-1"><span className="font-semibold">{t("action.instructions")}:</span> {item.instructions}</p> : null}
        <p className="hint mt-1">{item.care_plans.mode === "clinician_instructions" ? (item.care_plans.clinician_verification === "clinician_verified" ? t("today.clinicianVerifiedTag") : t("today.clinicianTag")) : t("today.personalTag")}</p>
      </div>

      <div className="grid gap-5 lg:grid-cols-2 [&>section]:mb-0">
      <Section title={t("action.evidence")} id="ev">
        <p className="hint mb-3">{t("action.evidenceIntro")}</p>
        {challenge ? <p className="mb-3 rounded-xl bg-primary-soft px-3 py-2 text-sm"><span className="font-semibold">{t("action.challengeTitle")}</span> {challenge.kind === "fingers" ? t("action.challengeFingers", { n: challenge.value }) : t("action.challengeCode", { code: challenge.value })} <span className="hint block">{t("action.reviewerNote")} {t("action.photoDeleted", { days: PROOF_MEDIA_RETENTION_DAYS })}</span></p> : null}
        <EvidenceForm occurrenceId={id} canMarkDone={["pending", "due", "awaiting_response", "later", "no_response"].includes(status)} />
      </Section>

      <Section title={t("action.assessment")} id="assess">
        <p className="hint mb-2">{t("action.selfReportNote")}</p>
        {(evaluations ?? []).length === 0 ? <p>{t("action.noEvidence")}</p> : null}
        <ul className="flex flex-col gap-3">
          {(evaluations ?? []).map((e) => (
            <li key={e.id} className="rounded-xl border border-line p-3">
              <p className="font-semibold">{t(`action.outcome_${e.outcome}`)}</p>
              <p className="hint">{e.method === "manual_review" ? t("action.method_manual") : e.method === "model" ? t("action.method_model") : t("action.method_rule")}{e.proof_level ? ` · ${t(`action.proof_${e.proof_level}`)}` : ""} · {t("action.notProbability")}</p>
              {(() => { const r = e.method !== "manual_review" ? readingFor(e.evidence_id) : null; return r ? <div className="mt-2"><ReadingFix reading={r} occurrenceId={id} /></div> : null; })()}
              <p className="mt-2">{e.explanation}</p>
              {e.observed.length ? (<><h3 className="mt-2 font-semibold">{t("action.observed")}</h3><ul className="list-disc pl-6">{e.observed.map((o, i) => <li key={i}>{o}</li>)}</ul></>) : null}
              {e.cannot_confirm.length ? (<><h3 className="mt-2 font-semibold">{t("action.cannotConfirm")}</h3><ul className="list-disc pl-6">{e.cannot_confirm.map((o, i) => <li key={i}>{o}</li>)}</ul></>) : null}
              {e.method !== "manual_review" ? <ReviewForm occurrenceId={id} evaluationId={e.id} /> : null}
            </li>
          ))}
        </ul>
      </Section>

      </div>
      <div className="h-5" />
      <Section title={t("action.history")} id="hist">
        <ol className="flex flex-col gap-1">
          {(checkIns ?? []).map((c) => <li key={c.id}>{fmtDateTime(c.created_at, tz, locale)} · {t(`status.${c.kind === "done" ? "self_reported" : c.kind === "later" ? "later" : c.kind}`)}{c.reason ? ` (${c.reason})` : ""}{c.channel === "whatsapp" ? ` · ${t("chat.fromWhatsapp")}` : ""}</li>)}
          {(evidence ?? []).map((e) => <li key={e.id}>{fmtDateTime(e.created_at, tz, locale)} · {t(`action.${e.kind === "photo" ? "photo" : e.kind === "audio" ? "voice" : e.kind === "document" ? "document" : "note"}`)}{e.text_content ? `: ${e.text_content}` : ""}{e.transcript ? `: “${e.transcript}”` : ""}</li>)}
        </ol>
      </Section>
    </div>
  );
}
