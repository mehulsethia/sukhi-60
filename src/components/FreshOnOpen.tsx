"use client";
// Pages whose numbers change because of other people (the circle leaderboard) or other
// channels (chat, WhatsApp, photo check-ins): a cached copy from the tab prefetch or the
// device page cache is shown at once, then replaced with fresh data.
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function FreshOnOpen({ renderedAt, maxAgeMs = 5_000 }: { renderedAt: number; maxAgeMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    if (Date.now() - renderedAt > maxAgeMs) router.refresh();
  }, [renderedAt, maxAgeMs, router]);
  return null;
}
