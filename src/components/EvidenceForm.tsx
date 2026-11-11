"use client";
import { useRouter } from "next/navigation";
import { EvidenceCapture } from "@/components/EvidenceCapture";

export function EvidenceForm({ occurrenceId, canMarkDone }: { occurrenceId: string; canMarkDone: boolean }) {
  const router = useRouter();
  return <EvidenceCapture occurrenceId={occurrenceId} canMarkDone={canMarkDone} via="action" onDone={(r) => { if (r.ok) router.refresh(); }} />;
}
