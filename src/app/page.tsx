import Link from "next/link";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { BellRing, Camera, Check, ClipboardCheck, HeartHandshake, Languages, Lock, MessageCircleHeart, ShieldCheck, Sprout, X } from "lucide-react";
import { getUser } from "@/lib/supabase/server";
import { features } from "@/lib/config";
import { SiteHeader } from "@/components/landing/SiteHeader";
import { HeroCheckin } from "@/components/landing/HeroCheckin";
import { ASSESSMENT_SAMPLE, CHAT_SAMPLE, WEEK_SAMPLE } from "@/components/landing/samples";
import { Logo } from "@/components/Logo";

export const metadata: Metadata = {
  title: { absolute: "Sukhi — stay with the plan you and your doctor agreed on" },
  description: "Gentle reminders, honest check-ins and a garden that grows with you. In English, Hindi and Marathi, on the web and WhatsApp.",
};

export default async function Landing() {
  const { user } = await getUser();
  const t = await getTranslations("landing");
  const tr = await getTranslations();
  const steps = [
    { icon: ClipboardCheck, title: t("step1Title"), body: t("step1Body") },
    { icon: BellRing, title: t("step2Title"), body: t("step2Body") },
    { icon: MessageCircleHeart, title: t("step3Title"), body: t("step3Body") },
    { icon: Sprout, title: t("step4Title"), body: t("step4Body") },
  ];
  const why = [
    { icon: ClipboardCheck, title: t("why1Title"), body: t("why1Body") },
    { icon: HeartHandshake, title: t("why2Title"), body: t("why2Body") },
    { icon: Lock, title: t("why3Title"), body: t("why3Body") },
    { icon: Languages, title: t("why4Title"), body: t("why4Body") },
  ];
  const days = [1, 2, 3, 4, 5, 6, 7].map((d) => tr(`weekday.${d}`));

  return (
    <>
      <a href="#main" className="skip-link">{tr("app.skipToContent")}</a>
      <SiteHeader signedIn={!!user} />
      <main id="main">
        {/* Hero */}
        <section className="relative overflow-hidden">
          <div aria-hidden="true" className="pointer-events-none absolute -right-40 -top-40 h-[520px] w-[520px] rounded-full bg-[radial-gradient(circle,color-mix(in_srgb,var(--accent)_28%,transparent),transparent_65%)]" />
          <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 pb-20 pt-12 sm:px-6 lg:grid-cols-[1.1fr_1fr] lg:gap-16 lg:pb-28 lg:pt-20">
            <div className="max-w-xl">
              <h1 className="text-[2.6rem] font-extrabold leading-[1.02] sm:text-6xl lg:text-[4.1rem]">{t("heroTitle")}</h1>
              <p className="mt-6 text-lg leading-relaxed text-ink-soft sm:text-xl">{t("heroBody")}</p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link href={user ? "/today" : "/signup"} className="btn btn-primary btn-lg">{user ? t("openApp") : t("heroPrimary")}</Link>
                {features.demo() ? <Link href="/demo" className="btn btn-secondary btn-lg">{t("heroSecondary")}</Link> : null}
              </div>
              <p className="mt-5 flex items-center gap-2 text-[0.95rem] text-ink-soft"><ShieldCheck size={18} className="shrink-0 text-leaf" aria-hidden="true" />{t("heroNote")}</p>
            </div>
            <HeroCheckin />
          </div>
        </section>

        {/* How it works — a real sequence, so numbered */}
        <section id="how" className="scroll-mt-20 border-y border-line bg-surface py-20 lg:py-24">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <h2 className="max-w-2xl text-4xl font-bold sm:text-5xl">{t("howTitle")}</h2>
            <p className="mt-4 max-w-xl text-lg text-ink-soft">{t("howIntro")}</p>
            <ol className="relative mt-14 grid gap-10 md:grid-cols-4 md:gap-6">
              <div aria-hidden="true" className="absolute left-6 right-6 top-6 hidden h-px bg-line md:block" />
              {steps.map((s, i) => (
                <li key={s.title} className="relative">
                  <span className="relative z-10 flex h-12 w-12 items-center justify-center rounded-full border border-line bg-bg text-lg font-bold text-primary">{i + 1}</span>
                  <s.icon size={22} className="mt-6 text-primary" aria-hidden="true" />
                  <h3 className="mt-2 text-xl font-bold">{s.title}</h3>
                  <p className="mt-2 text-ink-soft">{s.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Features — each paired with the real interface it describes */}
        <section id="features" className="scroll-mt-20 py-20 lg:py-28">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <h2 className="max-w-3xl text-4xl font-bold sm:text-5xl">{t("featuresTitle")}</h2>
            <div className="mt-16 flex flex-col gap-20 lg:gap-28">
              <Feature title={t("f1Title")} body={t("f1Body")} icon={<MessageCircleHeart aria-hidden="true" />}>
                <div className="flex flex-col gap-3 p-6">
                  <p lang="hi" className="max-w-[85%] self-end rounded-[20px] rounded-br-md bg-primary px-4 py-3 text-primary-ink">{CHAT_SAMPLE.user}</p>
                  <div className="max-w-[88%] self-start rounded-[20px] rounded-bl-md border border-line bg-surface px-4 py-3">
                    <p>{CHAT_SAMPLE.reply}</p>
                    <p className="mt-2 flex items-center gap-1.5 text-xs text-ink-soft"><ClipboardCheck size={14} aria-hidden="true" />{CHAT_SAMPLE.source}</p>
                  </div>
                </div>
              </Feature>
              <Feature title={t("f2Title")} body={t("f2Body")} icon={<Camera aria-hidden="true" />} flip>
                <div className="p-6">
                  <div className="flex items-center gap-3">
                    <div aria-hidden="true" className="h-16 w-16 shrink-0 rounded-2xl bg-[linear-gradient(160deg,var(--leaf-soft),var(--leaf))]" />
                    <p className="text-lg font-bold">{ASSESSMENT_SAMPLE.outcome}</p>
                  </div>
                  <div className="mt-5 grid gap-4 sm:grid-cols-2">
                    <div className="rounded-2xl bg-ok-bg p-4 text-ok-ink">
                      {ASSESSMENT_SAMPLE.observed.map((o) => <p key={o} className="flex items-center gap-2"><Check size={16} aria-hidden="true" />{o}</p>)}
                    </div>
                    <div className="rounded-2xl bg-surface-2 p-4">
                      {ASSESSMENT_SAMPLE.cannot.map((o) => <p key={o} className="flex items-start gap-2"><X size={16} className="mt-1 shrink-0" aria-hidden="true" />{o}</p>)}
                    </div>
                  </div>
                </div>
              </Feature>
              <Feature title={t("f3Title")} body={t("f3Body")} icon={<Sprout aria-hidden="true" />}>
                <div className="flex items-end justify-between gap-2 p-6 pt-10" aria-hidden="true">
                  {[0.35, 0.5, 0.65, 0.8, 1].map((s, i) => (
                    <svg key={i} viewBox="0 0 60 90" className="w-1/5" style={{ height: `${s * 110}px` }}>
                      <path d="M30 88 V30" stroke="var(--leaf)" strokeWidth="4" strokeLinecap="round" />
                      <path d="M30 60 C18 58 12 48 14 40 C24 42 30 50 30 60Z" fill="var(--leaf)" />
                      {i > 0 ? <path d="M30 48 C42 46 48 36 46 28 C36 30 30 38 30 48Z" fill="var(--leaf)" /> : null}
                      {i > 2 ? <circle cx="30" cy="24" r="9" fill="var(--bloom)" /> : null}
                      {i > 2 ? <circle cx="30" cy="24" r="4" fill="var(--sun)" /> : null}
                    </svg>
                  ))}
                </div>
              </Feature>
            </div>
          </div>
        </section>

        {/* Why Sukhi */}
        <section className="border-t border-line bg-surface py-20 lg:py-24">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <h2 className="text-4xl font-bold sm:text-5xl">{t("whyTitle")}</h2>
            <div className="mt-12 grid gap-x-12 gap-y-10 md:grid-cols-2">
              {why.map((w) => (
                <div key={w.title} className="flex gap-5">
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-accent-soft text-accent-ink"><w.icon size={22} aria-hidden="true" /></span>
                  <div>
                    <h3 className="text-xl font-bold">{w.title}</h3>
                    <p className="mt-2 text-ink-soft">{w.body}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Safety — indigo band */}
        <section id="safety" className="scroll-mt-20 bg-[#18213f] py-20 text-[#eef0f8] lg:py-24">
          <div className="mx-auto grid max-w-6xl gap-12 px-4 sm:px-6 lg:grid-cols-[1fr_1.2fr]">
            <div>
              <h2 className="text-4xl font-bold sm:text-5xl">{t("safetyTitle")}</h2>
              <p className="mt-5 text-lg text-[#c3c9e0]">{t("safetyBody")}</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-[24px] bg-white/[0.06] p-6 ring-1 ring-white/10">
                <h3 className="text-xl font-bold text-[#8fe0b8]">{t("safetyIsLabel")}</h3>
                <ul className="mt-4 space-y-3">
                  {(["safetyIs1", "safetyIs2", "safetyIs3"] as const).map((k) => <li key={k} className="flex gap-3"><Check size={20} className="mt-0.5 shrink-0 text-[#8fe0b8]" aria-hidden="true" />{t(k)}</li>)}
                </ul>
              </div>
              <div className="rounded-[24px] bg-white/[0.06] p-6 ring-1 ring-white/10">
                <h3 className="text-xl font-bold text-[#f4c25e]">{t("safetyIsntLabel")}</h3>
                <ul className="mt-4 space-y-3">
                  {(["safetyIsnt1", "safetyIsnt2", "safetyIsnt3"] as const).map((k) => <li key={k} className="flex gap-3"><X size={20} className="mt-0.5 shrink-0 text-[#f4c25e]" aria-hidden="true" />{t(k)}</li>)}
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* Families */}
        <section id="families" className="scroll-mt-20 py-20 lg:py-28">
          <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 sm:px-6 lg:grid-cols-2">
            <div>
              <h2 className="text-4xl font-bold sm:text-5xl">{t("familyTitle")}</h2>
              <p className="mt-5 text-lg text-ink-soft">{t("familyBody")}</p>
            </div>
            <figure className="rounded-[28px] border border-line bg-surface p-6 shadow-[var(--shadow-md)]">
              <figcaption className="text-sm text-ink-soft">{t("familyPreviewNote")}</figcaption>
              <p className="display mt-1 text-2xl font-bold">{t("familyPreviewTitle")}</p>
              <div className="mt-6 flex h-36 items-end justify-between gap-3" aria-hidden="true">
                {WEEK_SAMPLE.map((n, i) => (
                  <div key={i} className="flex flex-1 flex-col items-center gap-2">
                    <div className="w-full rounded-t-xl bg-leaf" style={{ height: `${Math.max(6, (n / 3) * 100)}px`, opacity: n ? 1 : 0.25 }} />
                    <span className="text-sm text-ink-soft">{days[i]}</span>
                  </div>
                ))}
              </div>
            </figure>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className="scroll-mt-20 border-t border-line bg-surface py-20 lg:py-24">
          <div className="mx-auto max-w-3xl px-4 sm:px-6">
            <h2 className="text-4xl font-bold sm:text-5xl">{t("faqTitle")}</h2>
            <div className="mt-10 divide-y divide-line border-y border-line">
              {(["1", "2", "3", "4", "5"] as const).map((n) => (
                <details key={n} className="group py-5">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-lg font-semibold [&::-webkit-details-marker]:hidden">
                    {t(`q${n}`)}
                    <span aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-2 text-xl transition-transform group-open:rotate-45">+</span>
                  </summary>
                  <p className="mt-3 max-w-2xl text-ink-soft">{t(`a${n}`)}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <section className="px-4 py-20 sm:px-6 lg:py-24">
          <div className="relative mx-auto max-w-6xl overflow-hidden rounded-[36px] bg-primary px-6 py-16 text-center text-primary-ink sm:px-12">
            <div aria-hidden="true" className="absolute -bottom-24 left-1/2 h-64 w-[640px] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,color-mix(in_srgb,var(--accent)_45%,transparent),transparent_70%)]" />
            <h2 className="relative mx-auto max-w-2xl text-4xl font-bold sm:text-5xl">{t("ctaTitle")}</h2>
            <p className="relative mx-auto mt-4 max-w-xl text-lg opacity-85">{t("ctaBody")}</p>
            <Link href={user ? "/today" : "/signup"} className="btn btn-accent btn-lg relative mt-8">{user ? t("openApp") : t("heroPrimary")}</Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-[2fr_1fr_1fr]">
          <div>
            <Logo />
            <p className="mt-3 max-w-sm text-ink-soft">{t("footerTagline")}</p>
          </div>
          <nav aria-label={t("footerProduct")}>
            <h2 className="text-base font-bold">{t("footerProduct")}</h2>
            <ul className="mt-3 space-y-2 text-ink-soft">
              <li><a href="#how" className="hover:text-ink">{t("navHow")}</a></li>
              <li><a href="#features" className="hover:text-ink">{t("navFeatures")}</a></li>
              <li><Link href="/login" className="hover:text-ink">{t("logIn")}</Link></li>
              <li><Link href="/signup" className="hover:text-ink">{t("getStarted")}</Link></li>
            </ul>
          </nav>
          <nav aria-label={t("footerLegal")}>
            <h2 className="text-base font-bold">{t("footerLegal")}</h2>
            <ul className="mt-3 space-y-2 text-ink-soft">
              <li><Link href="/privacy" className="hover:text-ink">{tr("legal.privacyTitle")}</Link></li>
              <li><Link href="/terms" className="hover:text-ink">{tr("legal.termsTitle")}</Link></li>
            </ul>
          </nav>
        </div>
        <p className="mx-auto max-w-6xl px-4 pb-10 text-sm text-ink-soft sm:px-6">{t("copyright", { year: new Date().getFullYear() })}</p>
      </footer>
    </>
  );
}

function Feature({ title, body, icon, children, flip }: { title: string; body: string; icon: React.ReactNode; children: React.ReactNode; flip?: boolean }) {
  return (
    <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-20">
      <div className={flip ? "lg:order-2" : ""}>
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-surface-2 text-primary [&>svg]:h-6 [&>svg]:w-6">{icon}</span>
        <h3 className="mt-5 text-3xl font-bold sm:text-4xl">{title}</h3>
        <p className="mt-4 max-w-lg text-lg text-ink-soft">{body}</p>
      </div>
      <div className={`rounded-[28px] border border-line bg-[linear-gradient(180deg,var(--surface),var(--surface-2))] shadow-[var(--shadow-md)] ${flip ? "lg:order-1" : ""}`}>{children}</div>
    </div>
  );
}
