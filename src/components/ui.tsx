import type { ReactNode } from "react";

import { bucketOf, BUCKET_COLOR } from "@/lib/status";

const STATUS_ICON: Record<string, string> = {
  self_reported: "✓", evidence_supported: "✓✓", due: "●", awaiting_response: "●", needs_review: "?", skipped: "–", unable: "☾", missed: "–", paused: "Ⅱ", no_response: "…", later: "⏱", pending: "○",
};

/** Status pill: tinted with the state's color, plus an icon so color is never the only cue. */
export function StatusBadge({ status, label }: { status: string; label: string }) {
  const c = BUCKET_COLOR[bucketOf(status)];
  const quiet = status === "pending" || status === "paused";
  return (
    <span className="chip whitespace-nowrap" style={quiet ? undefined : { background: `color-mix(in srgb, ${c} 16%, var(--surface))`, color: `color-mix(in srgb, ${c} 70%, var(--ink))` }}>
      <span aria-hidden="true">{STATUS_ICON[status] ?? "○"}</span>
      {label}
    </span>
  );
}

export function Alert({ tone = "info", children, role }: { tone?: "info" | "warn" | "danger" | "ok"; children: ReactNode; role?: "alert" | "status" }) {
  const cls = { info: "bg-surface-2 text-ink", warn: "bg-warn-bg text-warn-ink", danger: "bg-danger-bg text-danger-ink", ok: "bg-ok-bg text-ok-ink" }[tone];
  return (
    <div role={role ?? (tone === "danger" ? "alert" : "status")} className={`rounded-lg px-4 py-3 text-[0.95rem] ${cls}`}>
      {children}
    </div>
  );
}

export function PageHeader({ title, subtitle, children }: { title: string; subtitle?: ReactNode; children?: ReactNode }) {
  return (
    <header className="mb-7 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-[2rem] sm:text-[2.6rem]">{title}</h1>
        {subtitle ? <p className="mt-1.5 max-w-2xl text-ink-soft">{subtitle}</p> : null}
      </div>
      {children ? <div className="flex flex-wrap items-center gap-2">{children}</div> : null}
    </header>
  );
}

export function Section({ title, children, id, description, icon, action, className = "" }: { title: string; children: ReactNode; id?: string; description?: ReactNode; icon?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <section aria-labelledby={id} className={`panel mb-5 p-5 sm:p-6 ${className}`}>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          {icon ? <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">{icon}</span> : null}
          <div className="min-w-0">
            <h2 id={id} className="text-lg">{title}</h2>
            {description ? <p className="mt-0.5 text-sm text-ink-soft">{description}</p> : null}
          </div>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
