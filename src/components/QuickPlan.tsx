"use client";
// Say or type what you want ("drink 3 litres of water and sleep by 11") and Sukhi builds the plan.
import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { Sparkles } from "lucide-react";
import { createQuickPlan } from "@/app/actions";
import { SubmitButton } from "@/components/SubmitButton";
import { VoiceRecorder } from "@/components/VoiceRecorder";

export function QuickPlan({ voiceEnabled }: { voiceEnabled: boolean }) {
  const t = useTranslations();
  const [state, action] = useActionState(createQuickPlan, null);
  const [text, setText] = useState("");
  const [voiceErr, setVoiceErr] = useState<string | null>(null);
  const err = state?.error ? (state.error === "medical" ? t("quickPlan.medical") : state.error === "ai_unavailable" ? t("quickPlan.unavailable") : state.error === "empty" ? t("quickPlan.empty") : t("common.error")) : voiceErr;
  return (
    <form action={action}>
      <div className="flex items-end gap-1 rounded-[22px] border border-line bg-surface p-1.5 focus-within:border-line-strong">
        <label htmlFor="wish" className="sr-only">{t("quickPlan.label")}</label>
        <textarea id="wish" name="wish" rows={2} maxLength={1000} value={text} onChange={(e) => setText(e.target.value)} placeholder={t("quickPlan.placeholder")} className="min-h-[52px] flex-1 resize-none bg-transparent px-2.5 py-2 text-[0.95rem] outline-none placeholder:text-ink-faint" />
        {text.trim() ? (
          <SubmitButton className="flex h-10 shrink-0 items-center gap-1.5 rounded-full bg-primary px-3.5 text-sm font-medium text-primary-ink disabled:opacity-60" pendingLabel={t("quickPlan.making")}>
            <Sparkles size={15} aria-hidden="true" />{t("quickPlan.make")}
          </SubmitButton>
        ) : (
          <VoiceRecorder compact primary enabled={voiceEnabled} disabledReason={t("chat.voiceUnavailable")} onTranscript={(tr) => { setVoiceErr(null); setText(tr); }} onError={setVoiceErr} />
        )}
      </div>
      {err ? <p className="mt-2 text-sm text-danger-ink" role="alert">{err}</p> : null}
    </form>
  );
}
