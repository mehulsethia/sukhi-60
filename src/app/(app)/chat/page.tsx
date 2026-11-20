import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { requireUser } from "@/lib/supabase/server";
import { features } from "@/lib/config";
import { ChatClient, type ChatMessage } from "@/components/ChatClient";
import { assistantSuggestions } from "@/server/suggestions";
import { getToday } from "@/server/core";
import { fmtTime, hoursAgoIso } from "@/lib/format";
import { getLocale } from "next-intl/server";

export const metadata: Metadata = { title: "Buddy" };

export default async function ChatPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const { supabase, user } = await requireUser();
  const t = await getTranslations();
  const [{ data: msgs }, { data: consents }, { data: profile }] = await Promise.all([
    // Reminder notices live on Today and in notifications; the chat is for conversation.
    supabase.from("messages").select("id, role, channel, content, source_refs, safety_flag, created_at").neq("role", "notice").order("created_at", { ascending: false }).limit(60),
    supabase.from("consents").select("kind, granted"),
    supabase.from("profiles").select("accessibility, display_name, timezone").eq("id", user.id).single(),
  ]);
  const tz = profile?.timezone ?? "Asia/Kolkata";
  const [suggestions, todayActions, locale] = await Promise.all([assistantSuggestions(supabase, user.id, tz, t), getToday(supabase, user.id, tz), getLocale()]);
  const today = todayActions.map((a) => ({ id: a.id, title: a.item.title, time: a.local_time ? fmtTime(a.due_at, tz, locale) : null, display: a.display }));
  const voiceConsent = !!consents?.find((c) => c.kind === "voice_processing" && c.granted);
  const audioReplies = !!(profile?.accessibility as { audio_replies?: boolean } | null)?.audio_replies;
  const initial: ChatMessage[] = (msgs ?? []).reverse().map((m) => ({ id: m.id, role: m.role, channel: m.channel, content: m.content, sources: (m.source_refs as ChatMessage["sources"]) ?? [], safety: m.safety_flag }));
  // Restart follow-ups stay answerable until answered, dismissed, or two days old.
  const nudgeIds = initial.flatMap((m) => m.sources.filter((x) => x.type === "nudge").map((x) => x.id));
  const { data: nudges } = nudgeIds.length ? await supabase.from("nudge_events").select("id").in("id", nudgeIds).is("acknowledged_at", null).is("outcome", null).gte("created_at", hoursAgoIso(48)) : { data: [] };
  const openNudges = (nudges ?? []).map((n) => n.id);
  // Proposals stay tappable while pending and unexpired (the server checks again on tap).
  const codes = initial.flatMap((m) => m.sources.filter((x) => x.type === "proposal").map((x) => x.id));
  const { data: props } = codes.length ? await supabase.from("change_proposals").select("confirm_code").in("confirm_code", codes).eq("status", "pending").gt("expires_at", new Date().toISOString()) : { data: [] };
  const openProposals = Array.from(new Set((props ?? []).map((p) => p.confirm_code)));
  return (
    <ChatClient
      // Remount when the server has newer messages (proactive check-ins, proof results).
      key={initial.at(-1)?.id ?? "empty"}
      today={today}
      initial={initial}
      openNudges={openNudges}
      openProposals={openProposals}
      whatsappLaunched={features.whatsappLaunched()}
      voice={{ configured: features.speech(), consent: voiceConsent }}
      audioReplies={audioReplies}
      suggestions={suggestions}
      name={profile?.display_name?.split(" ")[0] ?? null}
      autoSend={q?.slice(0, 2000)}
    />
  );
}
