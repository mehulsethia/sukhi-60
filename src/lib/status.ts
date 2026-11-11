// One mapping from occurrence status to a visual state, used by Today, Progress and
// notifications so a color always means the same thing.
export const BUCKETS = ["done", "evidence", "open", "review", "skipped", "unable", "missed", "noreply"] as const;
export type Bucket = (typeof BUCKETS)[number];

export function bucketOf(status: string): Bucket {
  switch (status) {
    case "self_reported": return "done";
    case "evidence_supported": return "evidence";
    case "needs_review": return "review";
    case "skipped": return "skipped";
    case "unable": return "unable";
    case "missed": return "missed";
    case "no_response": return "noreply";
    default: return "open"; // pending, due, awaiting_response, later, paused
  }
}

export const BUCKET_COLOR: Record<Bucket, string> = {
  done: "var(--st-done)",
  evidence: "var(--st-evidence)",
  open: "var(--st-open)",
  review: "var(--st-review)",
  skipped: "var(--st-skipped)",
  unable: "var(--st-unable)",
  missed: "var(--st-missed)",
  noreply: "var(--st-noreply)",
};

/** Buckets that count as completed. */
export const isDone = (b: Bucket) => b === "done" || b === "evidence";
/** Buckets where the person gave an explicit answer. */
export const isAnswered = (b: Bucket) => b !== "open" && b !== "noreply";
