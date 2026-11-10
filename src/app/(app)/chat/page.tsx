import { getTranslations } from "next-intl/server";
import { requireUser } from "@/lib/supabase/server";
import { features } from "@/lib/config";
import { ChatClient, type ChatMessage } from "@/components/ChatClient";
import { PageHeader } from "@/components/ui";

export default async function ChatPage() {
  const { supabase, user } = await requireUser();
  const t = await getTranslations();
  const [{ data: msgs }, { data: consents }, { data: profile }] = await Promise.all([
    supabase.from("messages").select("id, role, channel, content, source_refs, safety_flag, created_at").order("created_at", { ascending: false }).limit(40),
    supabase.from("consents").select("kind, granted"),
    supabase.from("profiles").select("accessibility").eq("id", user.id).single(),
  ]);
  const voiceConsent = !!consents?.find((c) => c.kind === "voice_processing" && c.granted);
  const audioReplies = !!(profile?.accessibility as { audio_replies?: boolean } | null)?.audio_replies;
  const initial: ChatMessage[] = (msgs ?? []).reverse().map((m) => ({ id: m.id, role: m.role, channel: m.channel, content: m.content, sources: (m.source_refs as ChatMessage["sources"]) ?? [], safety: m.safety_flag }));
  return (
    <>
      <PageHeader title={t("chat.title")} />
      <ChatClient initial={initial} voice={{ configured: features.speech(), consent: voiceConsent }} audioReplies={audioReplies} />
    </>
  );
}
