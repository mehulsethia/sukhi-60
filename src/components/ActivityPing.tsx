"use client";
// Records "active today" once per device per day (was a database write on every page view).
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { pingActivity } from "@/app/actions";

export function ActivityPing() {
  const router = useRouter();
  // Back from the background after a while (the Home Screen app stays open for days): fetch fresh data.
  useEffect(() => {
    let hiddenAt = 0;
    const onVis = () => {
      if (document.visibilityState === "hidden") hiddenAt = Date.now();
      else if (hiddenAt && Date.now() - hiddenAt > 60_000) router.refresh();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [router]);
  useEffect(() => {
    const today = new Date().toLocaleDateString("en-CA");
    let last: string | null = null;
    try { last = localStorage.getItem("sukhi_active_day"); } catch {}
    if (last === today) return;
    void pingActivity().then(() => { try { localStorage.setItem("sukhi_active_day", today); } catch {} }, () => undefined);
  }, []);
  return null;
}
