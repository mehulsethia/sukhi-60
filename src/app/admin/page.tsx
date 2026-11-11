import type { Metadata } from "next";
import Link from "next/link";
import { currentAdmin, getAdminMetrics, type AdminMetrics } from "@/server/admin";
import { adminLogout, setInternal } from "./actions";
import { AdminLogin } from "./AdminLogin";
import { Card, DayBars, HBars, HeatCell, HourBars, Stat } from "./charts";

export const metadata: Metadata = { title: "Admin", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const LABELS: Record<string, string> = {
  clinician_instructions: "Doctor's plan", personal_goal: "Wellness goal",
  self: "Self", caregiver: "Caregiver", unknown: "Not answered",
  diagnosed: "Doctor's plan", wellness: "Wellness", prefer_not: "Prefer not to say",
  en: "English", hi: "Hindi", mr: "Marathi",
  web: "Web app", whatsapp: "WhatsApp", assistant: "Assistant chat", system: "System",
  done: "Done", later: "Later", skipped: "Skipped", unable: "Unable", missed: "Missed", note: "Note",
  diabetes: "Diabetes", bp: "Blood pressure", heart: "Heart", thyroid: "Thyroid", skin_hair: "Skin / hair", post_surgery: "After surgery",
  respiratory: "Breathing", joints: "Joints", kidney: "Kidney", mental: "Mental health", pregnancy: "Pregnancy", other: "Other",
  photo: "Photo", audio: "Voice note", text: "Text note", document: "Document",
  model: "AI answer", fallback: "Fallback", quick_action: "Quick action", blocked: "Blocked", confirmation: "Confirmation", escalation: "Escalation",
  supports: "Supports", partially_supports: "Partly supports", does_not_support: "Doesn't support", unclear: "Unclear", not_applicable: "N/A",
};
const L = (k: string | null | undefined) => (k ? LABELS[k] ?? k : "—");
const pct = (v: number | null | undefined) => (v === null || v === undefined ? "—" : `${v}%`);
const share = (a: number, b: number) => (b ? Math.round((100 * a) / b) : 0);

function pitchLines(m: AdminMetrics): string[] {
  const o = m.overview;
  const lines: string[] = [];
  const active2 = m.funnel.find((f) => f.step === "Active on 2+ days")?.n ?? 0;
  const active5 = m.funnel.find((f) => f.step === "Active on 5+ days")?.n ?? 0;
  if (o.users) lines.push(`${o.users} people signed up; ${share(o.activated, o.users)}% set up at least one daily action.`);
  if (o.adherence_all !== null) lines.push(`${o.adherence_all}% of scheduled actions were completed (${o.actions_completed} actions in total). WHO puts average adherence to long-term therapy at about 50%.`);
  if (o.response_rate_7d !== null) lines.push(`${o.response_rate_7d}% of reminders got an honest answer in the last 7 days, including "not today".`);
  if (o.users && active2) lines.push(`${share(active2, o.users)}% came back on a second day; ${share(active5, o.users)}% were active on 5 or more days.`);
  if (o.median_min_to_done !== null) lines.push(`The median action is completed ${o.median_min_to_done} minutes after its scheduled time.`);
  const cg = m.segments.setup_for.find((s) => s.key === "caregiver");
  if (cg?.users && share(cg.users, o.users) > 0) lines.push(`${share(cg.users, o.users)}% of accounts are run by a family caregiver for someone else.`);
  const nonEn = m.segments.locale.filter((s) => s.key !== "en").reduce((a, s) => a + (s.users ?? 0), 0);
  if (nonEn) lines.push(`${share(nonEn, o.users)}% use Sukhi in Hindi or Marathi.`);
  if (m.ai.extract_done) lines.push(`${m.ai.extract_done} prescriptions read automatically into ${m.ai.items_extracted} draft actions; ${share(m.ai.items_extracted_confirmed, m.ai.items_extracted)}% were confirmed by the user.`);
  if (m.reminders.returns_after_gap) lines.push(`${m.reminders.returns_after_gap} times, a user came back after missing a day.`);
  return lines;
}

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ days?: string; internal?: string }> }) {
  const email = await currentAdmin();
  if (!email) return <AdminLogin />;
  const sp = await searchParams;
  const days = [7, 14, 30].includes(Number(sp.days)) ? Number(sp.days) : 14;
  const internal = sp.internal === "1";
  const m = await getAdminMetrics(days, internal);
  const o = m.overview;
  const q = (p: Record<string, string | number>) => `?${new URLSearchParams({ days: String(days), internal: internal ? "1" : "0", ...Object.fromEntries(Object.entries(p).map(([k, v]) => [k, String(v)])) })}`;
  const funnelTop = m.funnel[0]?.n ?? 0;
  const today = m.range.to;
  const segRows = (rows: AdminMetrics["segments"]["setup_for"]) => rows.filter((r) => r.due > 0 || (r.users ?? 0) > 0).map((r) => ({ label: L(r.key), v: r.rate, note: `${r.users !== undefined ? `${r.users} users · ` : ""}${r.done}/${r.due}` }));

  return (
    <div className="min-h-dvh bg-bg">
      <header className="sticky top-0 z-10 border-b border-line bg-surface/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div>
            <h1 className="text-xl font-bold">Sukhi pilot dashboard</h1>
            <p className="text-xs text-ink-soft">Updated {new Date(m.generated_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} IST · {m.range.from} → {m.range.to} · signed in as {email}</p>
          </div>
          <nav className="flex flex-wrap items-center gap-2 text-sm">
            {[7, 14, 30].map((d) => <Link key={d} href={`?days=${d}&internal=${internal ? 1 : 0}`} className={`rounded-lg border px-3 py-1.5 font-semibold ${d === days ? "border-primary bg-primary-soft text-primary" : "border-line"}`}>{d} days</Link>)}
            <Link href={`?days=${days}&internal=${internal ? 0 : 1}`} className="rounded-lg border border-line px-3 py-1.5">{internal ? "Including team accounts" : "Excluding team accounts"}</Link>
            <Link href={q({})} className="rounded-lg border border-line px-3 py-1.5">Refresh</Link>
            <a href={`/admin/export${q({ type: "daily", days: 30 })}`} className="rounded-lg border border-line px-3 py-1.5">Daily CSV</a>
            <a href={`/admin/export${q({ type: "users" })}`} className="rounded-lg border border-line px-3 py-1.5">Users CSV</a>
            <form action={adminLogout}><button className="rounded-lg border border-line px-3 py-1.5">Sign out</button></form>
          </nav>
        </div>
      </header>

      <main className="mx-auto flex max-w-7xl flex-col gap-5 px-4 py-6">
        {/* Headline numbers */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
          <Stat label="Users" value={o.users} sub={`${o.onboarded} onboarded · ${o.activated} with a plan`} />
          <Stat label="Active today" value={o.dau_today} sub={`avg ${o.avg_dau_7d ?? 0}/day over 7 days`} />
          <Stat label="Active this week" value={o.wau} sub={`stickiness ${o.wau ? Math.round((100 * (o.avg_dau_7d ?? 0)) / o.wau) : 0}% (avg daily ÷ weekly)`} />
          <Stat label="Adherence (7d)" value={pct(o.adherence_7d)} sub={`all time ${pct(o.adherence_all)}`} tone="good" />
          <Stat label="Honest answers (7d)" value={pct(o.response_rate_7d)} sub={`silent ${pct(o.silence_rate_7d)}`} />
          <Stat label="Actions completed" value={o.actions_completed} sub={`${o.checkins_total} check-ins`} tone="good" />
          <Stat label="Minutes to done" value={o.median_min_to_done ?? "—"} sub="median, from scheduled time" />
          <Stat label="Active days / user" value={o.avg_active_days ?? "—"} sub="average" />
        </div>

        {/* Pitch lines */}
        <Card title="Lines for the pitch" sub="Generated from the live numbers above. Copy them into the deck once the numbers settle.">
          {pitchLines(m).length ? (
            <ul className="flex list-disc flex-col gap-1.5 pl-5 text-[0.95rem]">{pitchLines(m).map((l) => <li key={l}>{l}</li>)}</ul>
          ) : <p className="text-sm text-ink-faint">Lines appear once users start checking in.</p>}
        </Card>

        <div className="grid gap-5 lg:grid-cols-2">
          <Card title="Daily active users" sub="Opened the app, checked in, sent a message or evidence (web or WhatsApp)">
            <DayBars data={m.daily.map((d) => ({ day: d.day, v: d.dau }))} />
          </Card>
          <Card title="Daily adherence" sub="Completed ÷ scheduled actions whose window has closed (or already done), %">
            <DayBars data={m.daily.map((d) => ({ day: d.day, v: d.adherence }))} max={100} unit="%" />
          </Card>
          <Card title="Check-ins per day" sub="Every answer counts: done, later, skipped, unable">
            <DayBars data={m.daily.map((d) => ({ day: d.day, v: d.checkins }))} />
          </Card>
          <Card title="New sign-ups per day">
            <DayBars data={m.daily.map((d) => ({ day: d.day, v: d.new_users }))} />
          </Card>
        </div>

        <div className="grid gap-5 lg:grid-cols-3">
          <Card title="Activation funnel" sub="Share of everyone who signed up">
            <HBars rows={m.funnel.map((f) => ({ label: f.step, v: f.n, note: `${share(f.n, funnelTop)}%` }))} max={Math.max(1, funnelTop)} />
          </Card>
          <Card title="Retention by sign-up day" sub="Share active exactly N days after signing up" className="lg:col-span-2">
            {m.retention.length ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead><tr className="text-xs text-ink-soft"><th className="px-2 py-1">Cohort</th><th className="px-2 py-1 text-right">Users</th><th className="px-2 py-1 text-center">Day 1</th><th className="px-2 py-1 text-center">Day 3</th><th className="px-2 py-1 text-center">Day 7</th></tr></thead>
                  <tbody>
                    {m.retention.map((r) => (
                      <tr key={r.cohort} className="border-t border-line">
                        <td className="px-2 py-1.5 text-sm font-semibold">{r.cohort}</td>
                        <td className="px-2 py-1.5 text-right text-sm tabular-nums">{r.size}</td>
                        <HeatCell n={r.d1} size={r.size} /><HeatCell n={r.d3} size={r.size} /><HeatCell n={r.d7} size={r.size} />
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <p className="text-sm text-ink-faint">No sign-ups in this range.</p>}
          </Card>
        </div>

        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          <Card title="Adherence: doctor's plan vs wellness" sub="By plan type, %">
            <HBars rows={m.segments.plan_mode.map((r) => ({ label: L(r.key), v: r.rate, note: `${r.done}/${r.due}` }))} max={100} suffix="%" />
          </Card>
          <Card title="Adherence: self vs caregiver" sub="Who set up the plan, %">
            <HBars rows={segRows(m.segments.setup_for)} max={100} suffix="%" />
          </Card>
          <Card title="Adherence by health context" sub="From the onboarding question, %">
            <HBars rows={segRows(m.segments.health_context)} max={100} suffix="%" />
          </Card>
          <Card title="Adherence by language" sub="%">
            <HBars rows={segRows(m.segments.locale)} max={100} suffix="%" />
          </Card>
        </div>

        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          <Card title="When people check in" sub="Hour of day, IST" className="xl:col-span-2">
            <HourBars data={m.segments.checkin_hour} />
          </Card>
          <Card title="Check-in channel">
            <HBars rows={m.segments.checkin_channel.map((r) => ({ label: L(r.key), v: r.n }))} />
          </Card>
          <Card title="Check-in answers">
            <HBars rows={m.segments.checkin_kind.map((r) => ({ label: L(r.key), v: r.n }))} />
          </Card>
        </div>

        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          <Card title="Prescription reading (AI)">
            <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
              <dt className="text-ink-soft">Documents uploaded</dt><dd className="text-right font-semibold tabular-nums">{m.ai.documents}</dd>
              <dt className="text-ink-soft">Read successfully</dt><dd className="text-right font-semibold tabular-nums">{m.ai.extract_done} <span className="text-ink-faint">({share(m.ai.extract_done, m.ai.extract_done + m.ai.extract_failed)}%)</span></dd>
              <dt className="text-ink-soft">Avg reading time</dt><dd className="text-right font-semibold tabular-nums">{m.ai.extract_avg_ms ? `${(m.ai.extract_avg_ms / 1000).toFixed(1)} s` : "—"}</dd>
              <dt className="text-ink-soft">Draft actions created</dt><dd className="text-right font-semibold tabular-nums">{m.ai.items_extracted}</dd>
              <dt className="text-ink-soft">Confirmed by user</dt><dd className="text-right font-semibold tabular-nums">{m.ai.items_extracted_confirmed} <span className="text-ink-faint">({share(m.ai.items_extracted_confirmed, m.ai.items_extracted)}%)</span></dd>
              <dt className="text-ink-soft">Edited before confirming</dt><dd className="text-right font-semibold tabular-nums">{m.ai.items_extracted_edited}</dd>
              <dt className="text-ink-soft">Typed / template actions</dt><dd className="text-right font-semibold tabular-nums">{m.ai.items_manual} / {m.ai.items_template}</dd>
            </dl>
          </Card>
          <Card title="Assistant">
            <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
              <dt className="text-ink-soft">Conversations</dt><dd className="text-right font-semibold tabular-nums">{m.ai.assistant_runs}</dd>
              <dt className="text-ink-soft">Users who chatted</dt><dd className="text-right font-semibold tabular-nums">{m.ai.assistant_users} <span className="text-ink-faint">({share(m.ai.assistant_users, o.users)}%)</span></dd>
              <dt className="text-ink-soft">Response time p50</dt><dd className="text-right font-semibold tabular-nums">{m.ai.assistant_p50_ms !== null ? `${(m.ai.assistant_p50_ms / 1000).toFixed(1)} s` : "—"}</dd>
              <dt className="text-ink-soft">Response time p95</dt><dd className="text-right font-semibold tabular-nums">{m.ai.assistant_p95_ms !== null ? `${(m.ai.assistant_p95_ms / 1000).toFixed(1)} s` : "—"}</dd>
              <dt className="text-ink-soft">Error rate</dt><dd className="text-right font-semibold tabular-nums">{pct(m.ai.assistant_error_rate)}</dd>
            </dl>
            <div className="mt-3"><HBars rows={m.ai.assistant_routes.map((r) => ({ label: L(r.key), v: r.n }))} /></div>
          </Card>
          <Card title="Evidence shared">
            <HBars rows={m.ai.evidence.map((r) => ({ label: L(r.key), v: r.n }))} empty="No evidence yet" />
            {m.ai.evaluation_outcomes.length ? <><p className="mb-2 mt-4 text-xs font-semibold text-ink-soft">AI photo assessments</p><HBars rows={m.ai.evaluation_outcomes.map((r) => ({ label: L(r.key), v: r.n }))} /></> : null}
          </Card>
          <Card title="Reminders & safety">
            <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
              <dt className="text-ink-soft">WhatsApp linked</dt><dd className="text-right font-semibold tabular-nums">{m.reminders.whatsapp_linked} <span className="text-ink-faint">({share(m.reminders.whatsapp_linked, o.users)}%)</span></dd>
              <dt className="text-ink-soft">Reminders sent</dt><dd className="text-right font-semibold tabular-nums">{m.reminders.reminder_jobs_done}</dd>
              <dt className="text-ink-soft">Done within window</dt><dd className="text-right font-semibold tabular-nums">{pct(m.reminders.done_within_window)}</dd>
              <dt className="text-ink-soft">Came back after a miss</dt><dd className="text-right font-semibold tabular-nums">{m.reminders.returns_after_gap}</dd>
              <dt className="text-ink-soft">Urgent-symptom handoffs</dt><dd className="text-right font-semibold tabular-nums">{m.safety.escalations}</dd>
              <dt className="text-ink-soft">Unsafe requests blocked</dt><dd className="text-right font-semibold tabular-nums">{m.safety.blocked_runs + m.safety.injection_blocked}</dd>
              <dt className="text-ink-soft">Review requests</dt><dd className="text-right font-semibold tabular-nums">{m.safety.review_requests}</dd>
            </dl>
            {m.reminders.outbound.length ? <><p className="mb-2 mt-4 text-xs font-semibold text-ink-soft">WhatsApp message status</p><HBars rows={m.reminders.outbound.map((r) => ({ label: r.key, v: r.n }))} /></> : null}
          </Card>
        </div>

        {m.segments.conditions.length ? (
          <Card title="What doctor's plans are for" sub="User-reported at onboarding">
            <HBars rows={m.segments.conditions.map((r) => ({ label: L(r.key), v: r.users }))} />
          </Card>
        ) : null}

        <div className="grid gap-5 xl:grid-cols-3">
          <Card title={`Users (${m.users.length})`} sub="Sorted by last active. Amber = no activity for 2+ days: worth a nudge. Mark team/test accounts as internal to exclude them." className="xl:col-span-2">
            <div className="max-h-[560px] overflow-auto">
              <table className="w-full min-w-[820px] text-left text-sm">
                <thead className="sticky top-0 bg-surface text-xs text-ink-soft">
                  <tr><th className="px-2 py-1.5">User</th><th className="px-2 py-1.5">Joined</th><th className="px-2 py-1.5">Last active</th><th className="px-2 py-1.5 text-right">Days</th><th className="px-2 py-1.5 text-right">Streak</th><th className="px-2 py-1.5 text-right">Actions</th><th className="px-2 py-1.5 text-right">Check-ins</th><th className="px-2 py-1.5 text-right">Adherence</th><th className="px-2 py-1.5">Profile</th><th className="px-2 py-1.5"></th></tr>
                </thead>
                <tbody>
                  {m.users.map((u) => {
                    const stale = !u.last_active || (new Date(today).getTime() - new Date(u.last_active).getTime()) / 86_400_000 >= 2;
                    return (
                      <tr key={u.id} className={`border-t border-line ${u.internal ? "opacity-50" : ""}`}>
                        <td className="px-2 py-1.5"><span className="block font-semibold">{u.name || "—"}</span><span className="text-xs text-ink-soft">{u.email}</span></td>
                        <td className="px-2 py-1.5 text-xs">{u.joined.slice(0, 10)}{u.onboarded ? "" : <span className="ml-1 rounded bg-warn-bg px-1 text-warn-ink">not onboarded</span>}</td>
                        <td className="px-2 py-1.5 text-xs"><span className={stale ? "rounded bg-warn-bg px-1.5 py-0.5 text-warn-ink" : ""}>{u.last_active ?? "never"}</span></td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{u.active_days}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{u.streak}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{u.items}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{u.checkins}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{pct(u.adherence)}</td>
                        <td className="px-2 py-1.5 text-xs text-ink-soft">{[L(u.locale), u.setup_for ? L(u.setup_for) : null, u.health_context ? L(u.health_context) : null, u.whatsapp ? "WhatsApp" : null].filter(Boolean).join(" · ")}</td>
                        <td className="px-2 py-1.5">
                          <form action={setInternal}>
                            <input type="hidden" name="user_id" value={u.id} />
                            <input type="hidden" name="internal" value={u.internal ? "false" : "true"} />
                            <button className="whitespace-nowrap text-xs text-ink-soft underline">{u.internal ? "Include" : "Internal"}</button>
                          </form>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
          <Card title="Live activity" sub="Latest check-ins (category only, no medicine names)">
            {m.feed.length ? (
              <ol className="flex max-h-[560px] flex-col gap-2 overflow-auto text-sm">
                {m.feed.map((f, i) => (
                  <li key={i} className="flex items-start justify-between gap-2 border-b border-line pb-2">
                    <span><span className="font-semibold">{f.who}</span> · {L(f.kind)} · <span className="text-ink-soft">{f.category}</span></span>
                    <span className="shrink-0 text-xs text-ink-faint">{new Date(f.at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })} · {L(f.channel)}</span>
                  </li>
                ))}
              </ol>
            ) : <p className="text-sm text-ink-faint">No check-ins yet.</p>}
          </Card>
        </div>

        <details className="rounded-xl border border-line bg-surface p-4 text-sm text-ink-soft">
          <summary className="cursor-pointer font-semibold text-ink">How these numbers are defined</summary>
          <ul className="mt-2 flex list-disc flex-col gap-1 pl-5">
            <li><b>Active</b>: opened the app, checked in (web or WhatsApp), messaged the assistant or shared evidence that day.</li>
            <li><b>Adherence</b>: completed ÷ scheduled actions, counted once an action&apos;s window has closed (or earlier if already done). Weekly goals count each completion toward their target. Paused items are excluded.</li>
            <li><b>Honest answers</b>: share of scheduled actions with any explicit answer (done, skipped, unable, missed) instead of silence.</li>
            <li><b>Minutes to done</b>: median time between an action&apos;s scheduled time and the &quot;done&quot; check-in.</li>
            <li><b>Stickiness</b>: average daily actives ÷ weekly actives.</li>
            <li>Team accounts (ADMIN_EMAILS and anyone marked internal) are excluded unless you include them. Days are in IST.</li>
          </ul>
        </details>
      </main>
    </div>
  );
}
