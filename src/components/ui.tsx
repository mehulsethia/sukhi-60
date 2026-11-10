import type { ReactNode } from "react";

const STATUS_STYLE: Record<string, string> = {
  pending: "bg-surface-2 text-ink",
  due: "bg-warn-bg text-warn-ink",
  awaiting_response: "bg-warn-bg text-warn-ink",
  later: "bg-surface-2 text-ink",
  self_reported: "bg-ok-bg text-ok-ink",
  evidence_supported: "bg-ok-bg text-ok-ink",
  needs_review: "bg-warn-bg text-warn-ink",
  skipped: "bg-surface-2 text-ink",
  unable: "bg-surface-2 text-ink",
  missed: "bg-surface-2 text-ink",
  paused: "bg-surface-2 text-ink-soft",
  no_response: "bg-surface-2 text-ink-soft",
};
const STATUS_ICON: Record<string, string> = {
  self_reported: "✓", evidence_supported: "✓✓", due: "●", awaiting_response: "●", needs_review: "?", skipped: "–", unable: "☾", missed: "–", paused: "Ⅱ", no_response: "…", later: "⏱", pending: "○",
};

export function StatusBadge({ status, label }: { status: string; label: string }) {
  return (
    <span className={`chip ${STATUS_STYLE[status] ?? ""}`}>
      <span aria-hidden="true">{STATUS_ICON[status] ?? "○"}</span>
      {label}
    </span>
  );
}

export function Alert({ tone = "info", children, role }: { tone?: "info" | "warn" | "danger" | "ok"; children: ReactNode; role?: "alert" | "status" }) {
  const cls = { info: "bg-surface-2 text-ink", warn: "bg-warn-bg text-warn-ink", danger: "bg-danger-bg text-danger-ink", ok: "bg-ok-bg text-ok-ink" }[tone];
  return (
    <div role={role ?? (tone === "danger" ? "alert" : "status")} className={`rounded-2xl px-4 py-3 ${cls}`}>
      {children}
    </div>
  );
}

export function PageHeader({ title, subtitle, children }: { title: string; subtitle?: string; children?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-[2rem] font-bold sm:text-[2.4rem]">{title}</h1>
        {subtitle ? <p className="mt-1 text-ink-soft">{subtitle}</p> : null}
      </div>
      {children}
    </header>
  );
}

export function Section({ title, children, id }: { title: string; children: ReactNode; id?: string }) {
  return (
    <section aria-labelledby={id} className="card mb-5 p-5 sm:p-6">
      <h2 id={id} className="mb-4 text-xl font-bold">{title}</h2>
      {children}
    </section>
  );
}
