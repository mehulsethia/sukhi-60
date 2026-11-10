"use client";
// Product vignettes: small, faithful fragments of the real interface used as imagery on the
// landing page and in onboarding. Decorative (aria-hidden); the adjacent text carries meaning.
import { useTranslations } from "next-intl";
import { Bell, Check, Lock, Moon, ShieldCheck, Sun, Sunrise, Sunset } from "lucide-react";
import { LogoMark } from "@/components/Logo";

function Frame({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div aria-hidden="true" className={`w-full rounded-2xl border border-line bg-surface p-4 shadow-[var(--shadow-md)] ${className}`}>
      {children}
    </div>
  );
}

export function VLanguages() {
  const rows = [["EN", "Good evening, Asha"], ["HI", "शुभ संध्या, आशा"], ["MR", "शुभ संध्याकाळ, आशा"]];
  return (
    <Frame className="flex flex-col gap-2">
      {rows.map(([code, text], i) => (
        <div key={code} className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 ${i === 0 ? "border-primary bg-primary-soft" : "border-line"}`}>
          <span className="w-8 text-xs font-semibold text-ink-faint">{code}</span>
          <span className="display text-lg font-semibold">{text}</span>
          {i === 0 ? <Check size={18} className="ml-auto text-primary" /> : null}
        </div>
      ))}
    </Frame>
  );
}

export function VReminder() {
  const t = useTranslations();
  return (
    <div aria-hidden="true" className="flex w-full flex-col gap-3">
      <div className="flex items-start gap-3 rounded-2xl border border-line bg-surface/95 p-3.5 shadow-[var(--shadow-md)] backdrop-blur">
        <LogoMark size={36} />
        <div className="min-w-0 flex-1">
          <p className="flex items-center justify-between text-sm"><span className="font-semibold">Sukhi</span><span className="text-ink-faint">now</span></p>
          <p className="mt-0.5 text-[0.95rem]">{t("chat.notice")}: {t("onb.previewTitle")} · {t("onb.previewTime")}</p>
        </div>
      </div>
      <div className="ml-10 flex items-center gap-2 self-end rounded-2xl rounded-tr-sm bg-[#d9fdd3] px-3 py-2 text-[0.95rem] text-[#111b21] shadow-sm">
        <span lang="hi">हो गया</span><span className="text-xs text-[#53736b]">✓✓</span>
      </div>
    </div>
  );
}

export function VCheckin({ done = true }: { done?: boolean }) {
  const t = useTranslations();
  return (
    <Frame>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-primary">{t("onb.previewTime")}</p>
          <p className="display text-lg font-semibold">{t("onb.previewTitle")}</p>
          <p className="text-sm text-ink-soft">{t("onb.previewBody")}</p>
        </div>
        <span className={`chip ${done ? "bg-ok-bg text-ok-ink" : ""}`}>{done ? t("status.self_reported") : t("status.due")}</span>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2 text-sm font-semibold">
        <span className={`flex h-10 items-center justify-center gap-1.5 rounded-lg ${done ? "bg-primary text-primary-ink" : "border border-line-strong"}`}><Check size={16} />{t("today.done")}</span>
        <span className="flex h-10 items-center justify-center rounded-lg border border-line-strong text-ink-soft">{t("today.later")}</span>
        <span className="flex h-10 items-center justify-center rounded-lg border border-line-strong text-ink-soft">{t("today.skip")}</span>
      </div>
    </Frame>
  );
}

const WEEK = [1, 1, 0, 1, 1, 1, 0];
export function VProgress({ title }: { title?: string }) {
  const t = useTranslations();
  return (
    <Frame>
      <div className="flex items-baseline justify-between">
        <p className="font-semibold">{title ?? t("app.weekCard")}</p>
        <p className="text-sm text-ink-soft">{t("progress.activeDays", { days: 5 })}</p>
      </div>
      <div className="mt-4 grid grid-cols-7 gap-1.5">
        {WEEK.map((on, i) => (
          <div key={i} className="flex flex-col items-center gap-1.5">
            <div className={`flex h-9 w-full items-center justify-center rounded-md ${on ? "bg-primary text-primary-ink" : "bg-surface-2"}`}>{on ? <Check size={14} /> : null}</div>
            <span className="text-[0.7rem] text-ink-faint">{t(`weekday.${i + 1}`)}</span>
          </div>
        ))}
      </div>
      <div className="mt-4 flex items-center gap-2 rounded-lg bg-surface-2 px-3 py-2 text-sm">
        <ShieldCheck size={16} className="text-primary" />
        <span className="font-semibold">{t("progress.milestones")}</span>
        <span className="ml-auto text-ink-soft">{t("progress.milestonesEarned", { count: 3 })}</span>
      </div>
    </Frame>
  );
}

export function VRhythm() {
  const t = useTranslations();
  const rows = [
    { Icon: Sunrise, label: t("onb.morning"), time: "8:00" },
    { Icon: Sun, label: t("onb.midday"), time: "13:00" },
    { Icon: Sunset, label: t("onb.evening"), time: "18:30" },
  ];
  return (
    <Frame className="flex flex-col gap-2">
      {rows.map(({ Icon, label, time }) => (
        <div key={time} className="flex items-center gap-3 rounded-xl border border-line px-3 py-2.5">
          <Icon size={18} className="text-primary" />
          <span className="font-semibold">{label}</span>
          <span className="ml-auto text-sm tabular-nums text-ink-soft">{time}</span>
        </div>
      ))}
      <div className="flex items-center gap-3 rounded-xl bg-ink px-3 py-2.5 text-surface">
        <Moon size={18} />
        <span className="font-semibold">{t("onb.quietTitle")}</span>
        <span className="ml-auto text-sm tabular-nums opacity-80">21:30 – 07:30</span>
      </div>
    </Frame>
  );
}

export function VContext() {
  const t = useTranslations();
  return (
    <Frame className="flex flex-col gap-2">
      {(["discharge", "new_plan", "existing"] as const).map((r, i) => (
        <div key={r} className={`flex items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-[0.95rem] ${i === 0 ? "border-primary bg-primary-soft font-semibold" : "border-line text-ink-soft"}`}>
          {t(`onb.reason_${r}`)}
          {i === 0 ? <Check size={16} className="shrink-0 text-primary" /> : null}
        </div>
      ))}
    </Frame>
  );
}

export function VComfort() {
  const t = useTranslations();
  return (
    <Frame className="grid grid-cols-2 gap-3">
      {[1, 1.25].map((scale, i) => (
        <div key={scale} className={`rounded-xl border p-3 ${i === 1 ? "border-primary" : "border-line"}`} style={{ fontSize: `${scale}rem` }}>
          <p className="display font-semibold leading-tight">{t("onb.previewTitle")}</p>
          <p className="text-[0.8em] text-ink-soft">{t("onb.previewTime")}</p>
        </div>
      ))}
    </Frame>
  );
}

export function VPrivacy() {
  const t = useTranslations();
  const rows = [["perm_ai", true], ["perm_reminders", true], ["perm_family", false]] as const;
  return (
    <Frame className="flex flex-col gap-2">
      {rows.map(([k, on]) => (
        <div key={k} className="flex items-center gap-3 rounded-xl border border-line px-3 py-2.5">
          {k === "perm_family" ? <Lock size={16} className="text-ink-faint" /> : <Bell size={16} className="text-primary" />}
          <span className="font-semibold">{t(`onb.${k}`)}</span>
          <span className={`ml-auto flex h-6 w-10 items-center rounded-full p-0.5 ${on ? "justify-end bg-primary" : "justify-start bg-surface-3"}`}><span className="h-5 w-5 rounded-full bg-surface shadow-sm" /></span>
        </div>
      ))}
    </Frame>
  );
}

/** Phone mock-up showing a WhatsApp-style exchange (sample content passed in). */
export function WhatsAppPhone({ messages, title }: { messages: { from: "sukhi" | "me"; text: string; lang?: string }[]; title: string }) {
  return (
    <div className="relative mx-auto w-[290px] rounded-[40px] border border-line-strong bg-ink p-2.5 shadow-[var(--shadow-lg)]" aria-hidden="true">
      <div className="overflow-hidden rounded-[32px] bg-[#efeae2]">
        <div className="flex items-center gap-3 bg-[#075e54] px-4 pb-3 pt-6 text-white">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/15"><LogoMark size={22} /></span>
          <span className="font-semibold">{title}</span>
        </div>
        <div className="flex min-h-[370px] flex-col gap-2 p-3">
          {messages.map((m, i) => (
            <p key={i} lang={m.lang} className={`max-w-[84%] rounded-xl px-3 py-2 text-[0.88rem] leading-snug text-[#111b21] shadow-sm ${m.from === "me" ? "self-end rounded-tr-sm bg-[#d9fdd3]" : "self-start rounded-tl-sm bg-white"}`}>{m.text}</p>
          ))}
        </div>
      </div>
    </div>
  );
}
