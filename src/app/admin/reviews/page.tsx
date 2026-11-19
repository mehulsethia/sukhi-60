import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { currentAdmin } from "@/server/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { reviewQueue, reviewStats, type ReviewFilter } from "@/server/review";
import { decideReviewAction } from "../actions";
import { AdminLogin } from "../AdminLogin";

export const metadata: Metadata = { title: "Proof reviews", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const SOURCE: Record<string, string> = { appeal: "Appeal", flag: "Flagged", evaluator: "AI unsure", user: "Patient asked", assistant: "From chat", safety: "Safety", audit: "Random audit" };
const FLAG: Record<string, string> = {
  reused_photo: "Reused photo", shared_photo: "Same photo on another account", old_photo: "Photo over a day old", screen_photo: "Screen / edited",
  label_mismatch: "Label doesn't match", similar_photo: "Looks similar to an earlier photo", challenge_missed: "Fresh-photo sign missing", blister_count_down: "Blister count went down",
};
const LEVEL: Record<string, string> = { photo_ai: "Photo, AI-checked", photo_fresh: "Fresh photo", video_action: "Video shows act", human_verified: "Human-verified", flagged: "Flagged" };
const OUTCOME: Record<string, string> = { supports: "Supports", partially_supports: "Partly supports", does_not_support: "Doesn't support", unclear: "Unclear", not_applicable: "N/A" };
const when = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "-");

export default async function ReviewsPage({ searchParams }: { searchParams: Promise<{ f?: string; done?: string }> }) {
  const email = await currentAdmin();
  if (!email) return <AdminLogin />;
  const sp = await searchParams;
  const filter: ReviewFilter = sp.f === "waiting" || sp.f === "decided" ? sp.f : "open";
  const admin = createAdminClient();
  const [items, s] = await Promise.all([reviewQueue(admin, filter), reviewStats(admin)]);
  const tab = (f: ReviewFilter, label: string) => (
    <Link href={`?f=${f}`} className={`rounded-lg border px-3 py-1.5 text-sm font-semibold ${filter === f ? "border-primary bg-primary-soft text-primary" : "border-line text-ink-soft hover:text-ink"}`}>{label}</Link>
  );
  const accuracy = s.auditDecided ? Math.round((100 * s.auditAgreed) / s.auditDecided) : null;
  return (
    <div className="min-h-dvh bg-bg">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <div className="min-w-0">
            <Link href="/admin" className="inline-flex items-center gap-1 text-sm font-semibold text-ink-soft hover:text-ink"><ChevronLeft size={16} aria-hidden="true" />Dashboard</Link>
            <h1 className="mt-1 text-xl font-bold">Proof reviews</h1>
            <p className="text-xs text-ink-soft">{s.open} open ({s.appeals} appeals · {s.flags} flagged or unclear · {s.audits} audits) · {s.waiting} waiting for a new photo · signed in as {email}</p>
          </div>
          <div className="rounded-xl border border-line px-3 py-2 text-sm">
            <p className="font-semibold">AI accuracy {accuracy === null ? "-" : `${accuracy}%`}</p>
            <p className="text-xs text-ink-soft">{s.auditDecided ? `Reviewers agreed with ${s.auditAgreed} of ${s.auditDecided} sampled AI decisions` : "No audits decided yet"}</p>
          </div>
        </div>
        <nav className="mx-auto flex max-w-5xl gap-2 px-4 pb-3 sm:px-6" aria-label="Review filters">
          {tab("open", `Open (${s.open})`)}{tab("waiting", `Waiting (${s.waiting})`)}{tab("decided", "Decided")}
        </nav>
      </header>

      <main className="mx-auto flex max-w-5xl flex-col gap-4 px-4 py-6 sm:px-6">
        {sp.done ? <p className="rounded-xl bg-primary-soft px-3 py-2 text-sm font-semibold text-primary">Saved. The person has been told.</p> : null}
        {items.length === 0 ? <p className="text-ink-soft">Nothing here.</p> : null}
        {items.map(({ req, name, item, occ, ev, evidence, earlier, reused }) => (
          <article key={req.id} className="rounded-2xl border border-line bg-surface p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-base font-semibold">{name} · {item?.title ?? "Task"}</h2>
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${req.source === "appeal" ? "bg-warn-bg text-warn-ink" : req.source === "audit" ? "bg-surface-2 text-ink-soft" : "bg-primary-soft text-primary"}`}>{SOURCE[req.source] ?? req.source}</span>
            </div>
            <p className="text-xs text-ink-soft">Task on {occ?.local_date ?? "-"}{occ?.local_time ? ` at ${occ.local_time}` : ""} · sent {when(evidence?.createdAt ?? req.created_at)}{evidence?.takenAt ? ` · photo taken ${when(evidence.takenAt)}` : ""}</p>

            <div className="mt-3 grid gap-4 md:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
              <div className="flex flex-col gap-2">
                {evidence?.url && evidence.mime?.startsWith("image/") ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <a href={evidence.url} target="_blank" rel="noopener noreferrer"><img src={evidence.url} alt={`Proof for ${item?.title ?? "task"}`} className="max-h-80 w-full rounded-xl border border-line object-contain" /></a>
                ) : evidence?.url ? <a href={evidence.url} target="_blank" rel="noopener noreferrer" className="text-primary underline">Open {evidence.kind}</a> : <p className="text-sm text-ink-soft">No photo attached.</p>}
                {reused?.url ? (
                  <div className="rounded-xl border border-warn-ink/40 p-2">
                    <p className="text-xs font-semibold text-warn-ink">Earlier photo it resembles ({when(reused.createdAt)})</p>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={reused.url} alt="Earlier matching photo" className="mt-1 max-h-40 w-full rounded-lg object-contain" />
                  </div>
                ) : null}
                {earlier.length ? (
                  <div>
                    <p className="text-xs font-semibold text-ink-soft">Earlier photos of this task</p>
                    <div className="mt-1 grid grid-cols-4 gap-1.5">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      {earlier.map((e) => (e.url ? <a key={e.id} href={e.url} target="_blank" rel="noopener noreferrer" title={when(e.createdAt)}><img src={e.url} alt={`Earlier, ${when(e.createdAt)}`} className="aspect-square w-full rounded-md border border-line object-cover" /></a> : null))}
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="flex min-w-0 flex-col gap-2 text-sm">
                {item?.instructions ? <p><span className="font-semibold">Plan says:</span> {item.instructions}</p> : null}
                {ev ? (
                  <>
                    <p><span className="font-semibold">AI:</span> {OUTCOME[ev.outcome] ?? ev.outcome}{ev.proof_level ? ` · ${LEVEL[ev.proof_level] ?? ev.proof_level}` : ""}{ev.method === "manual_review" ? ` · decided by ${ev.reviewer}` : ""}</p>
                    {ev.flags?.length ? <div className="flex flex-wrap gap-1.5">{ev.flags.map((f: string) => <span key={f} className="rounded-full bg-warn-bg px-2 py-0.5 text-xs font-semibold text-warn-ink">{FLAG[f] ?? f}</span>)}</div> : null}
                    <p className="text-ink-soft">{ev.explanation}</p>
                    {ev.observed?.length ? <p><span className="font-semibold">Seen:</span> {ev.observed.join("; ")}</p> : null}
                    <p className="text-xs text-ink-soft">
                      {(() => { const c = (ev.flag_detail as { challenge?: { kind: string; value: string } } | null)?.challenge; return c ? `Fresh-photo sign asked: ${c.kind === "fingers" ? `${c.value} fingers` : `"${c.value}" on paper`} · ${ev.challenge_met === true ? "seen" : ev.challenge_met === false ? "not seen" : "not checked"}` : "No fresh-photo sign asked"; })()}
                      {ev.label_match ? ` · label ${ev.label_match.replace("_", " ")}` : ""}
                      {ev.blister_empty !== null && ev.blister_empty !== undefined ? ` · ${ev.blister_empty} empty blister slots` : ""}
                      {ev.model_id ? ` · ${ev.model_id}` : ""}
                    </p>
                  </>
                ) : <p className="text-ink-soft">{req.reason}</p>}
                {req.patient_note ? <p className="rounded-lg bg-surface-2 px-3 py-2"><span className="font-semibold">Patient says:</span> {req.patient_note}</p> : null}

                {req.status === "open" || req.status === "waiting_patient" ? (
                  <form action={decideReviewAction} className="mt-2 flex flex-col gap-2">
                    <input type="hidden" name="id" value={req.id} />
                    <label className="sr-only" htmlFor={`note-${req.id}`}>Note to the patient</label>
                    <textarea id={`note-${req.id}`} name="note" rows={2} maxLength={500} className="input text-sm" placeholder="Optional note to the patient (they will see it)" />
                    <div className="flex flex-wrap gap-2">
                      <button name="decision" value="verified" className="btn btn-primary min-h-10">Verify</button>
                      <button name="decision" value="rejected" className="btn btn-secondary min-h-10">Can&apos;t confirm</button>
                      <button name="decision" value="more_photo" className="btn btn-secondary min-h-10">Ask for a new photo</button>
                      {!evidence ? <button name="decision" value="dismissed" className="btn btn-ghost min-h-10">Dismiss</button> : null}
                    </div>
                  </form>
                ) : (
                  <p className="text-xs text-ink-soft">Decision: <span className="font-semibold">{req.decision}</span> by {req.decided_by} · {when(req.decided_at)}{req.decision_note ? ` · "${req.decision_note}"` : ""}</p>
                )}
              </div>
            </div>
          </article>
        ))}
      </main>
    </div>
  );
}
