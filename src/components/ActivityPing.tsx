"use client";
// Records "active today" once per device per day (was a database write on every page view).
import { useEffect } from "react";
import { pingActivity } from "@/app/actions";

export function ActivityPing() {
  useEffect(() => {
    const today = new Date().toLocaleDateString("en-CA");
    let last: string | null = null;
    try { last = localStorage.getItem("sukhi_active_day"); } catch {}
    if (last === today) return;
    void pingActivity().then(() => { try { localStorage.setItem("sukhi_active_day", today); } catch {} }, () => undefined);
  }, []);
  return null;
}
