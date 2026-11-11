import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { requireUser } from "@/lib/supabase/server";
import { features } from "@/lib/config";
import { ChatClient, type ChatMessage } from "@/components/ChatClient";
import { assistantSuggestions } from "@/server/suggestions";
import { getToday } from "@/server/core";
import { fmtTime } from "@/lib/format";
import { getLocale } from "next-intl/server";

export const metadata: Metadata = { title: "Assistant" };

export default async function ChatPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const { supabase, user } = await requireUser();
  const t = await getTranslations();
  const [{ data: msgs }, { data: consents }, { data: profile }] = await Promise.all([
    supabase.from("messages").select("id, role, channel, content, source_refs, safety_flag, created_at").order("created_at", { ascending: false }).limit(60),
    supabase.from("consents").select("kind, granted"),
    supabase.from("profiles").select("accessibility, display_name, timezone").eq("id", user.id).single(),
  ]);
  const tz = profile?.timezone ?? "Asia/Kolkata";
  const [suggestions, todayActions, locale] = await Promise.all([assistantSuggestions(supabase, user.id, tz, t), getToday(supabase, user.id, tz), getLocale()]);
  const today = todayActions.map((a) => ({ id: a.id, title: a.item.title, time: a.local_time ? fmtTime(a.due_at, tz, locale) : null, display: a.display }));
  const voiceConsent = !!consents?.find((c) => c.kind === "voice_processing" && c.granted);
  const audioReplies = !!(profile?.accessibility as { audio_replies?: boolean } | null)?.audio_replies;
  const initial: ChatMessage[] = (msgs ?? []).reverse().map((m) => ({ id: m.id, role: m.role, channel: m.channel, content: m.content, sources: (m.source_refs as ChatMessage["sources"]) ?? [], safety: m.safety_flag }));
  return (
    <ChatClient
      // Remount when the server has newer messages (proactive check-ins, proof results).
      key={initial.at(-1)?.id ?? "empty"}
      today={today}
      initial={initial}
      voice={{ configured: features.speech(), consent: voiceConsent }}
      audioReplies={audioReplies}
      suggestions={suggestions}
      name={profile?.display_name?.split(" ")[0] ?? null}
      autoSend={q?.slice(0, 2000)}
    />
  );
}
