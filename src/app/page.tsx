import Link from "next/link";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Camera, Check, ClipboardCheck, HeartHandshake, Languages, Lock, MessageCircle, ShieldCheck, TrendingUp, X } from "lucide-react";
import { getUser } from "@/lib/supabase/server";
import { features } from "@/lib/config";
import { SiteHeader } from "@/components/landing/SiteHeader";
import { HeroCheckin } from "@/components/landing/HeroCheckin";
import { ASSESSMENT_SAMPLE, CHAT_SAMPLE, WEEK_SAMPLE, WHATSAPP_SAMPLE } from "@/components/landing/samples";
import { VCheckin, VLanguages, VProgress, VReminder, WhatsAppPhone } from "@/components/Vignettes";
import { Logo } from "@/components/Logo";

export const metadata: Metadata = {
  title: { absolute: "Sukhi — stay with the plan you and your doctor agreed on" },
  description: "Gentle reminders, honest check-ins and progress you can see. In English, Hindi and Marathi, on the web and WhatsApp.",
};

const container = "mx-auto w-full max-w-6xl px-5 sm:px-8";

export default async function Landing() {
  const { user } = await getUser();
  const t = await getTranslations("landing");
  const tr = await getTranslations();
  const steps = [
    { V: VLanguages, title: t("step1Title"), body: t("step1Body") },
    { V: VReminder, title: t("step2Title"), body: t("step2Body") },
    { V: VCheckin, title: t("step3Title"), body: t("step3Body") },
    { V: VProgress, title: t("step4Title"), body: t("step4Body") },
  ];
  const why = [
    { icon: ClipboardCheck, title: t("why1Title"), body: t("why1Body") },
    { icon: HeartHandshake, title: t("why2Title"), body: t("why2Body") },
    { icon: Lock, title: t("why3Title"), body: t("why3Body") },
    { icon: Languages, title: t("why4Title"), body: t("why4Body") },
  ];
  const days = [1, 2, 3, 4, 5, 6, 7].map((d) => tr(`weekday.${d}`));
  const cta = user ? "/today" : "/signup";

  return (
    <>
      <a href="#main" className="skip-link">{tr("app.skipToContent")}</a>
      <SiteHeader signedIn={!!user} />
      <main id="main">
        {/* Hero */}
        <section className="border-b border-line">
          <div className={`${container} grid items-center gap-12 py-14 sm:py-20 lg:grid-cols-[1.15fr_1fr] lg:gap-16 lg:py-24`}>
            <div className="max-w-xl">
              <h1 className="text-[2.5rem] leading-[1.05] sm:text-[3.4rem] lg:text-[3.9rem]">{t("heroTitle")}</h1>
              <p className="mt-6 text-lg leading-relaxed text-ink-soft sm:text-xl">{t("heroBody")}</p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link href={cta} className="btn btn-primary btn-lg">{user ? t("openApp") : t("heroPrimary")}</Link>
                {features.demo() ? <Link href="/demo" className="btn btn-secondary btn-lg">{t("heroSecondary")}</Link> : null}
              </div>
              <p className="mt-6 flex items-center gap-2 text-[0.95rem] text-ink-soft"><ShieldCheck size={18} className="shrink-0 text-primary" aria-hidden="true" />{t("heroNote")}</p>
            </div>
            <HeroCheckin />
          </div>
        </section>

        {/* How it works — a real sequence */}
        <section id="how" className="scroll-mt-20 py-16 sm:py-24">
          <div className={container}>
            <div className="max-w-2xl">
              <h2 className="text-3xl sm:text-[2.6rem]">{t("howTitle")}</h2>
              <p className="mt-3 text-lg text-ink-soft">{t("howIntro")}</p>
            </div>
            <ol className="mt-12 grid gap-x-8 gap-y-12 md:grid-cols-2">
              {steps.map(({ V, title, body }, i) => (
                <li key={title} className="flex flex-col">
                  <div className="flex min-h-[250px] items-center justify-center rounded-2xl bg-surface-2 p-6 sm:p-10"><div className="w-full max-w-sm"><V /></div></div>
                  <p className="mt-5 text-sm font-semibold text-primary">{i + 1}</p>
                  <h3 className="mt-1 text-xl">{title}</h3>
                  <p className="mt-2 text-ink-soft">{body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Features */}
        <section id="features" className="scroll-mt-20 border-t border-line bg-surface py-16 sm:py-24">
          <div className={container}>
            <h2 className="max-w-3xl text-3xl sm:text-[2.6rem]">{t("featuresTitle")}</h2>
            <div className="mt-14 flex flex-col gap-16 lg:gap-24">
              <Feature title={t("f1Title")} body={t("f1Body")} icon={<MessageCircle aria-hidden="true" />}>
                <div className="flex flex-col gap-3">
                  <p lang="hi" className="max-w-[85%] self-end rounded-2xl rounded-br-md bg-primary px-4 py-3 text-primary-ink">{CHAT_SAMPLE.user}</p>
                  <div className="max-w-[90%] self-start rounded-2xl rounded-bl-md border border-line bg-surface px-4 py-3">
                    <p>{CHAT_SAMPLE.reply}</p>
                    <p className="mt-2 flex items-center gap-1.5 text-xs text-ink-soft"><ClipboardCheck size={14} aria-hidden="true" />{CHAT_SAMPLE.source}</p>
                  </div>
                </div>
              </Feature>
              <Feature title={t("f2Title")} body={t("f2Body")} icon={<Camera aria-hidden="true" />} flip>
                <div className="rounded-2xl border border-line bg-surface p-5">
                  <p className="font-semibold">{ASSESSMENT_SAMPLE.outcome}</p>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-xl bg-ok-bg p-4 text-ok-ink">
                      {ASSESSMENT_SAMPLE.observed.map((o) => <p key={o} className="flex items-center gap-2"><Check size={16} aria-hidden="true" />{o}</p>)}
                    </div>
                    <div className="rounded-xl bg-surface-2 p-4 text-ink-soft">
                      {ASSESSMENT_SAMPLE.cannot.map((o) => <p key={o} className="flex items-start gap-2"><X size={16} className="mt-1 shrink-0" aria-hidden="true" />{o}</p>)}
                    </div>
                  </div>
                </div>
              </Feature>
              <Feature title={t("f3Title")} body={t("f3Body")} icon={<TrendingUp aria-hidden="true" />}>
                <VProgress />
              </Feature>
            </div>
          </div>
        </section>

        {/* WhatsApp */}
        <section className="border-t border-line py-16 sm:py-24">
          <div className={`${container} grid items-center gap-12 lg:grid-cols-[1fr_auto] lg:gap-20`}>
            <div className="max-w-xl">
              <h2 className="text-3xl sm:text-[2.6rem]">{t("waTitle")}</h2>
              <p className="mt-4 text-lg text-ink-soft">{t("waBody")}</p>
              <p className="mt-4 text-sm text-ink-faint">{t("waNote")}</p>
            </div>
            <WhatsAppPhone title={t("waContact")} messages={WHATSAPP_SAMPLE} />
          </div>
        </section>

        {/* Why Sukhi */}
        <section className="border-t border-line bg-surface py-16 sm:py-24">
          <div className={container}>
            <h2 className="text-3xl sm:text-[2.6rem]">{t("whyTitle")}</h2>
            <div className="mt-12 grid gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-2">
              {why.map((w) => (
                <div key={w.title} className="bg-surface p-6 sm:p-8">
                  <w.icon size={22} className="text-primary" aria-hidden="true" />
                  <h3 className="mt-4 text-xl">{w.title}</h3>
                  <p className="mt-2 text-ink-soft">{w.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Safety */}
        <section id="safety" className="scroll-mt-20 bg-ink py-16 text-surface sm:py-24">
          <div className={`${container} grid gap-12 lg:grid-cols-[1fr_1.2fr]`}>
            <div>
              <h2 className="text-3xl sm:text-[2.6rem]">{t("safetyTitle")}</h2>
              <p className="mt-4 text-lg opacity-75">{t("safetyBody")}</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {([["safetyIsLabel", ["safetyIs1", "safetyIs2", "safetyIs3"], Check], ["safetyIsntLabel", ["safetyIsnt1", "safetyIsnt2", "safetyIsnt3"], X]] as const).map(([label, items, Icon]) => (
                <div key={label} className="rounded-2xl border border-white/10 bg-white/[0.04] p-6">
                  <h3 className="text-lg">{t(label)}</h3>
                  <ul className="mt-4 space-y-3 opacity-90">
                    {items.map((k) => <li key={k} className="flex gap-3"><Icon size={18} className="mt-1 shrink-0 opacity-70" aria-hidden="true" />{t(k)}</li>)}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Families */}
        <section id="families" className="scroll-mt-20 py-16 sm:py-24">
          <div className={`${container} grid items-center gap-12 lg:grid-cols-2`}>
            <div>
              <h2 className="text-3xl sm:text-[2.6rem]">{t("familyTitle")}</h2>
              <p className="mt-4 text-lg text-ink-soft">{t("familyBody")}</p>
            </div>
            <figure className="rounded-2xl border border-line bg-surface p-6 shadow-[var(--shadow-md)]">
              <figcaption className="text-sm text-ink-soft">{t("familyPreviewNote")}</figcaption>
              <p className="display mt-1 text-xl font-semibold">{t("familyPreviewTitle")}</p>
              <div className="mt-6 flex h-32 items-end justify-between gap-2 sm:gap-3" aria-hidden="true">
                {WEEK_SAMPLE.map((n, i) => (
                  <div key={i} className="flex flex-1 flex-col items-center gap-2">
                    <div className="w-full rounded-md bg-primary" style={{ height: `${Math.max(6, (n / 3) * 96)}px`, opacity: n ? 1 : 0.2 }} />
                    <span className="text-xs text-ink-faint">{days[i]}</span>
                  </div>
                ))}
              </div>
            </figure>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className="scroll-mt-20 border-t border-line bg-surface py-16 sm:py-24">
          <div className="mx-auto max-w-3xl px-5 sm:px-8">
            <h2 className="text-3xl sm:text-[2.6rem]">{t("faqTitle")}</h2>
            <div className="mt-10 divide-y divide-line border-y border-line">
              {(["1", "2", "3", "4", "5"] as const).map((n) => (
                <details key={n} className="group py-5">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-lg font-semibold [&::-webkit-details-marker]:hidden">
                    {t(`q${n}`)}
                    <span aria-hidden="true" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-line text-ink-soft transition-transform group-open:rotate-45">+</span>
                  </summary>
                  <p className="mt-3 max-w-2xl text-ink-soft">{t(`a${n}`)}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="py-16 sm:py-24">
          <div className={container}>
            <div className="flex flex-col items-start justify-between gap-8 rounded-2xl bg-primary px-6 py-12 text-primary-ink sm:px-12 lg:flex-row lg:items-center">
              <div className="max-w-xl">
                <h2 className="text-3xl sm:text-4xl">{t("ctaTitle")}</h2>
                <p className="mt-3 text-lg opacity-85">{t("ctaBody")}</p>
              </div>
              <Link href={cta} className="btn btn-accent btn-lg">{user ? t("openApp") : t("heroPrimary")}</Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className={`${container} grid gap-10 py-12 md:grid-cols-[2fr_1fr_1fr]`}>
          <div>
            <Logo />
            <p className="mt-3 max-w-sm text-ink-soft">{t("footerTagline")}</p>
          </div>
          <nav aria-label={t("footerProduct")}>
            <h2 className="text-sm font-semibold">{t("footerProduct")}</h2>
            <ul className="mt-3 space-y-2 text-ink-soft">
              <li><a href="#how" className="hover:text-ink">{t("navHow")}</a></li>
              <li><a href="#features" className="hover:text-ink">{t("navFeatures")}</a></li>
              <li><Link href="/login" className="hover:text-ink">{t("logIn")}</Link></li>
              <li><Link href="/signup" className="hover:text-ink">{t("getStarted")}</Link></li>
            </ul>
          </nav>
          <nav aria-label={t("footerLegal")}>
            <h2 className="text-sm font-semibold">{t("footerLegal")}</h2>
            <ul className="mt-3 space-y-2 text-ink-soft">
              <li><Link href="/privacy" className="hover:text-ink">{tr("legal.privacyTitle")}</Link></li>
              <li><Link href="/terms" className="hover:text-ink">{tr("legal.termsTitle")}</Link></li>
            </ul>
          </nav>
        </div>
        <p className={`${container} pb-10 text-sm text-ink-faint`}>{t("copyright", { year: new Date().getFullYear() })}</p>
      </footer>
    </>
  );
}

function Feature({ title, body, icon, children, flip }: { title: string; body: string; icon: React.ReactNode; children: React.ReactNode; flip?: boolean }) {
  return (
    <div className="grid items-center gap-8 lg:grid-cols-2 lg:gap-20">
      <div className={flip ? "lg:order-2" : ""}>
        <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-soft text-primary [&>svg]:h-5 [&>svg]:w-5">{icon}</span>
        <h3 className="mt-5 text-2xl sm:text-3xl">{title}</h3>
        <p className="mt-3 max-w-lg text-lg text-ink-soft">{body}</p>
      </div>
      <div className={`rounded-2xl bg-surface-2 p-5 sm:p-8 ${flip ? "lg:order-1" : ""}`}>{children}</div>
    </div>
  );
}
