import type { Metadata } from "next";
import Link from "next/link";
import { phoneText, waLink } from "@/domain/wa-ui";
import { businessNumber } from "@/server/wa/data";
import { getLocale, getTranslations } from "next-intl/server";
import { BellRing, Brain, ChevronRight, HandHeart, MessageCircle, ShieldCheck, Trash2, UserRound, Users } from "lucide-react";
import { requireUser } from "@/lib/supabase/server";
import { features } from "@/lib/config";
import { setMemoryStatus, unlinkWhatsApp } from "@/app/actions";
import { ConsentsForm, LinkCodeForm, PreferencesForm } from "@/components/SettingsForms";
import { PageHeader, Section } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { DeleteAccount } from "@/components/DeleteAccount";
import { fmtDateTime } from "@/lib/format";
import { ResetLearnedForm, SupportPrefsForm } from "@/components/SupportPrefsForm";
import { PushToggle } from "@/components/PushToggle";
import { getLearnedSummary } from "@/server/support";
import { normalizeRestart, normalizeStyles } from "@/domain/behaviour";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const { supabase, user } = await requireUser();
  const t = await getTranslations();
  const locale = await getLocale();
  const waNumber = features.whatsapp() ? await businessNumber() : null;
  const [{ data: profile }, { data: consents }, { data: binding }, { data: memory }] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).single(),
    supabase.from("consents").select("kind, granted"),
    supabase.from("channel_bindings").select("status, last_inbound_at, opted_out_at").neq("status", "revoked").maybeSingle(),
    supabase.from("memory_facts").select("id, kind, content, status, created_at").in("status", ["proposed", "confirmed"]).order("created_at", { ascending: false }).limit(30),
  ]);
  const tz = profile?.timezone ?? "UTC";
  const consentMap = Object.fromEntries((consents ?? []).map((c) => [c.kind, c.granted]));
  const learned = await getLearnedSummary(supabase, user.id, profile?.learning_reset_at ?? null, tz);

  const nav = [
    ["prefs", t("settings.profile"), UserRound],
    ["support", t("support.settingsTitle"), HandHeart],
    ["notifications", t("push.title"), BellRing],
    ["consents", t("settings.consents"), ShieldCheck],
    ...(features.whatsappLaunched() || binding ? [["wa", t("settings.whatsapp"), MessageCircle] as const] : []),
    ["family", t("people.title"), Users],
    ["memory", t("settings.memory"), Brain],
    ["delete", t("app.deleteTitle"), Trash2],
  ] as const;
  return (
    <>
      <PageHeader title={t("settings.title")} subtitle={user.email ?? undefined} />
      <nav aria-label={t("settingsUi.sections")} className="no-scrollbar -mx-4 mb-5 flex gap-2 overflow-x-auto px-4 lg:hidden">
        {nav.map(([id, label]) => <a key={id} href={`#${id}`} className="chip min-h-9 shrink-0 whitespace-nowrap border border-line bg-surface px-3 text-sm">{label}</a>)}
      </nav>
      <div className="lg:grid lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-8">
      <nav aria-label={t("settingsUi.sections")} className="sticky top-24 hidden self-start lg:block">
        <ul className="flex flex-col gap-1">
          {nav.map(([id, label, Icon]) => (
            <li key={id}><a href={`#${id}`} className="flex min-h-10 items-center gap-2.5 rounded-xl px-3 text-[0.95rem] font-semibold text-ink-soft hover:bg-surface hover:text-ink"><Icon size={17} aria-hidden="true" />{label}</a></li>
          ))}
        </ul>
      </nav>
      <div className="min-w-0 [&>section]:scroll-mt-24">
      <Section title={t("settings.profile")} id="prefs" icon={<UserRound size={20} aria-hidden="true" />} >
        <PreferencesForm profile={{ display_name: profile?.display_name ?? "", locale: profile?.locale ?? "en", timezone: tz, checkin_times: profile?.checkin_times ?? [], quiet_start: profile?.quiet_start ?? "21:30", quiet_end: profile?.quiet_end ?? "07:30", reminder_frequency: profile?.reminder_frequency ?? "normal", accessibility: (profile?.accessibility as Record<string, boolean>) ?? {}, limitations: profile?.limitations ?? "", care_notes: profile?.care_notes ?? "" }} />
      </Section>

      <Section title={t("support.settingsTitle")} id="support" icon={<HandHeart size={20} aria-hidden="true" />} >
        <SupportPrefsForm initial={{ styles: normalizeStyles(profile?.communication_styles), restart: normalizeRestart(profile?.restart_preference), motivation: profile?.personal_motivation ?? "" }} />
        <div className="mt-6 rounded-2xl bg-surface-2 p-4">
          <p className="font-bold">{t("support.learnedTitle")}</p>
          {!learned.hasData ? <p className="mt-2">{t("support.learnedNone")}</p> : (
            <ul className="mt-2 flex list-disc flex-col gap-1 pl-5">
              {learned.topBarrier ? <li>{t("support.learnedBarrier", { reason: t(`support.barrier_${learned.topBarrier.code}`), n: learned.topBarrier.n })}</li> : null}
              {learned.resumes > 0 ? <li>{t("support.learnedResumed", { n: learned.resumes })}</li> : null}
              {learned.timing.map((x) => <li key={`${x.itemId}-${x.scheduled}`}>{t("support.learnedTiming", { title: x.title, time: x.suggested, scheduled: x.scheduled })}</li>)}
              {learned.engagedStyle ? <li>{t("support.learnedStyle", { style: t(`support.style_${learned.engagedStyle}`) })}</li> : null}
            </ul>
          )}
          <ResetLearnedForm />
        </div>
      </Section>

      <Section title={t("push.title")} id="notifications" icon={<BellRing size={20} aria-hidden="true" />} description={t("push.body")}>
        <PushToggle publicKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || null} />
      </Section>

      <Section title={t("settings.consents")} id="consents" icon={<ShieldCheck size={20} aria-hidden="true" />} >
        <ConsentsForm consents={consentMap} whatsappLaunched={features.whatsappLaunched()} />
      </Section>

      {features.whatsappLaunched() || binding ? <Section title={t("settings.whatsapp")} id="wa" icon={<MessageCircle size={20} aria-hidden="true" />}>
        {!features.whatsappLaunched() ? (
          <>
            <p className="mb-1"><span className="chip bg-primary-soft text-primary">{t("common.comingSoon")}</span></p>
            <p>{t("settings.waComingSoon")}</p>
            {binding ? <form action={unlinkWhatsApp} className="mt-3"><SubmitButton className="btn btn-danger">{t("settings.waUnlink")}</SubmitButton></form> : null}
          </>
        ) : (
        <>
        <p><span className="font-semibold">{t("settings.phoneLabel")}:</span> {profile?.phone ? phoneText(profile.phone) : "-"} <Link href="/phone?change=1" className="ml-1 text-primary underline">{t("settings.phoneChange")}</Link></p>
        {!binding && profile?.phone && waNumber ? (
          <p className="mt-1">{t("settings.waSayHi")} <a href={waLink(waNumber, "Hi")} target="_blank" rel="noopener noreferrer" className="text-primary underline">{t("settings.waSayHiButton")}</a></p>
        ) : null}
        <p><span className="font-semibold">{t("settings.waStatus")}:</span> {binding ? (binding.status === "active" ? t("settings.waActive") : t("settings.waPaused")) : t("settings.waNotLinked")}</p>
        {binding?.last_inbound_at ? <p className="hint">{t("settings.waWindow", { time: fmtDateTime(binding.last_inbound_at, tz, locale) })}</p> : null}
        <p className="hint mt-1">{t("settings.waWindowNote")}</p>
        {features.whatsapp() ? <LinkCodeForm rebind={!!binding} /> : null}
        {binding ? <form action={unlinkWhatsApp} className="mt-2"><SubmitButton className="btn btn-danger">{t("settings.waUnlink")}</SubmitButton></form> : null}
        </>
        )}
      </Section> : null}

      <Section title={t("people.title")} id="family" icon={<Users size={20} aria-hidden="true" />}>
        <Link href="/people" className="flex items-center justify-between gap-2 text-primary underline">{t("people.manage")}<ChevronRight size={16} aria-hidden="true" /></Link>
      </Section>

      <Section title={t("settings.memory")} id="memory" icon={<Brain size={20} aria-hidden="true" />}>
        {(memory ?? []).length === 0 ? <p>{t("settings.memoryEmpty")}</p> : (
          <ul className="flex flex-col gap-2">
            {(memory ?? []).map((m) => (
              <li key={m.id} className="rounded-xl border border-line p-3">
                <p>{m.content}</p>
                <p className="hint">{t(`settings.mem_${m.status}`)}</p>
                {m.status === "proposed" ? (
                  <form action={setMemoryStatus} className="mt-2 flex gap-2">
                    <input type="hidden" name="memory_id" value={m.id} />
                    <SubmitButton className="btn btn-secondary" name="status" value="confirmed">{t("settings.memConfirm")}</SubmitButton>
                    <SubmitButton className="btn btn-ghost underline" name="status" value="rejected">{t("settings.memReject")}</SubmitButton>
                  </form>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Section>


      <Section title={t("app.deleteTitle")} id="delete" icon={<Trash2 size={20} aria-hidden="true" />}>
        <DeleteAccount />
      </Section>

      <form action="/auth/signout" method="post"><button className="btn btn-secondary w-full">{t("common.signOut")}</button></form>
      </div>
      </div>
    </>
  );
}
