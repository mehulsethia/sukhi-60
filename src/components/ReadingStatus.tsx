"use client";
// Shown on a plan while its document is read in the background; refreshes when it finishes.
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { AlertCircle, ScanText } from "lucide-react";
import { retryPlanReading } from "@/app/actions";
import { SubmitButton } from "@/components/SubmitButton";

export function ReadingStatus({ planId, docId, state }: { planId: string; docId: string; state: "pending" | "failed" | "stale" }) {
  const t = useTranslations("reading");
  const router = useRouter();
  useEffect(() => {
    if (state !== "pending") return;
    const h = setInterval(async () => {
      try {
        const r = await fetch(`/api/plan/reading?doc=${docId}`, { cache: "no-store" });
        const j = (await r.json()) as { state?: string };
        if (j.state && j.state !== "pending") router.refresh();
      } catch { /* offline: keep waiting */ }
    }, 4000);
    return () => clearInterval(h);
  }, [state, docId, router]);

  if (state === "pending") {
    return (
      <div role="status" className="mb-6 flex items-start gap-4 rounded-2xl border border-line bg-surface p-5 shadow-[var(--shadow-sm)]">
        <span className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">
          <ScanText size={21} aria-hidden="true" />
          <span aria-hidden="true" className="absolute inset-0 animate-ping rounded-xl bg-primary/20" />
        </span>
        <div>
          <p className="text-lg font-semibold">{t("title")}</p>
          <p className="mt-0.5 text-ink-soft">{t("body")}</p>
          <div className="mt-3 h-1.5 w-56 max-w-full overflow-hidden rounded-full bg-surface-2"><div className="h-full w-1/3 animate-[sukhi-indeterminate_1.4s_ease-in-out_infinite] rounded-full bg-primary" /></div>
        </div>
      </div>
    );
  }
  return (
    <div role="alert" className="mb-6 flex items-start gap-4 rounded-2xl border border-[color-mix(in_srgb,var(--st-missed)_40%,var(--line))] bg-surface p-5">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-danger-bg text-danger-ink"><AlertCircle size={21} aria-hidden="true" /></span>
      <div className="flex-1">
        <p className="text-lg font-semibold">{t("failedTitle")}</p>
        <p className="mt-0.5 text-ink-soft">{t("failedBody")}</p>
        <form action={retryPlanReading} className="mt-3">
          <input type="hidden" name="plan_id" value={planId} />
          <SubmitButton className="btn btn-primary">{t("retry")}</SubmitButton>
        </form>
      </div>
    </div>
  );
}
