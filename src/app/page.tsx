import Link from "next/link";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import {
  ArrowRight, BarChart3, Bell, Camera, Check, CircleCheck, ClipboardList, Clock, Footprints, Heart, Mic,
  Minus, Moon, Pill, RotateCcw, Salad, Sparkles, Sprout, Target, TrendingUp, Undo2,
} from "lucide-react";
import { getUser } from "@/lib/supabase/server";
import { features } from "@/lib/config";
import { SiteHeader } from "@/components/landing/SiteHeader";
import { SiteFooter } from "@/components/landing/SiteFooter";
import { HeroIllustration } from "@/components/landing/HeroIllustration";
import { EXAMPLE_WEEK, GREETINGS, alsoIn } from "@/components/landing/samples";
import { LogoMark } from "@/components/Logo";

export const metadata: Metadata = {
  title: { absolute: "Sukhi — Your health in your own hands" },
  description: "Small steps today. A healthier tomorrow. Sukhi helps you turn everyday intentions into healthy habits, stay consistent and find your way back whenever life gets in the way.",
};

const container = "mx-auto w-full max-w-6xl px-4 sm:px-8";
const h2 = "text-[1.75rem] leading-tight sm:text-[2rem]";
const lead = "mt-4 text-lg leading-relaxed text-ink-soft";

export default async function Landing() {
  const { user } = await getUser();
  const t = await getTranslations("landing");
  const tr = await getTranslations();
  const locale = await getLocale();
  const cta = user ? "/today" : "/signup";
  const meet = features.demo() ? "/demo" : "#why-sukhi";

  const steps = [
    { n: "01", Icon: ClipboardList, title: t("step1Title"), lead: t("step1Lead"), body: t("step1Body") },
    { n: "02", Icon: Bell, title: t("step2Title"), lead: t("step2Lead"), body: t("step2Body") },
    { n: "03", Icon: Camera, title: t("step3Title"), lead: t("step3Lead"), body: t("step3Body"), branches: true },
    { n: "04", Icon: BarChart3, title: t("step4Title"), lead: t("step4Lead"), body: t("step4Body") },
  ];
  const why = [
    { Icon: Target, text: t("why1") },
    { Icon: Clock, text: t("why2") },
    { Icon: Sparkles, text: t("why3") },
    { Icon: Heart, text: t("why4") },
    { Icon: TrendingUp, text: t("why5") },
  ];
  const domains = [
    { Icon: Footprints, title: t("domMoveTitle"), body: t("domMoveBody") },
    { Icon: Salad, title: t("domFoodTitle"), body: t("domFoodBody") },
    { Icon: Moon, title: t("domSleepTitle"), body: t("domSleepBody") },
    { Icon: Pill, title: t("domMedsTitle"), body: t("domMedsBody") },
  ];
  const feats = [
    { Icon: Mic, text: t("feat1") },
    { Icon: Camera, text: t("feat2") },
    { Icon: Bell, text: t("feat3") },
    { Icon: BarChart3, text: t("feat4") },
    { Icon: RotateCcw, text: t("feat5") },
  ];
  const days = [1, 2, 3, 4, 5, 6, 7].map((d) => tr(`weekday.${d}`));
  const roadmap = ([1, 2, 3, 4] as const).map((g) => ({ title: t(`rm${g}Title`), items: ([1, 2, 3, 4, 5] as const).map((i) => t(`rm${g}_${i}`)) }));

  return (
    <>
      <a href="#main" className="skip-link">{tr("app.skipToContent")}</a>
      <SiteHeader signedIn={!!user} />
      <main id="main">
        {/* Hero */}
        <section className="overflow-hidden bg-[linear-gradient(180deg,var(--sukhi-sky)_0%,var(--sukhi-page)_100%)]">
          <div className={`${container} grid items-center gap-10 py-12 sm:py-16 lg:grid-cols-[1.1fr_1fr] lg:gap-14 lg:py-20`}>
            <div className="max-w-xl">
              <p className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3.5 py-1.5 text-sm font-semibold text-primary">
                <LogoMark size={18} />{t("heroEyebrow")}
              </p>
              <h1 className="mt-6 text-[2rem] leading-[1.1] sm:text-[2.5rem] lg:text-[3rem]">{t("heroTitle")}</h1>
              <ul className="mt-3 flex flex-col gap-0.5 text-lg text-ink-soft" aria-label={t("heroAlso")}>
                {alsoIn(locale).map((l) => <li key={l.text} lang={l.lang}>{l.text}</li>)}
              </ul>
              <p className="mt-6 text-[1.35rem] font-semibold leading-snug text-primary sm:text-2xl">{t("heroSub")}</p>
              <p className="mt-4 text-lg leading-relaxed text-ink-soft">{t("heroBody")}</p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                <Link href={cta} className="btn btn-primary btn-lg whitespace-normal text-center">
                  {user ? t("openApp") : t("heroPrimary")}<ArrowRight size={19} aria-hidden="true" />
                </Link>
                <Link href={meet} className="btn btn-secondary btn-lg">{t("heroSecondary")}</Link>
              </div>
              <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2.5">
                {[t("heroBenefit1"), t("heroBenefit2"), t("heroBenefit3")].map((b) => (
                  <li key={b} className="flex items-center gap-2 font-medium text-ink">
                    <CircleCheck size={20} className="shrink-0 text-primary" aria-hidden="true" />{b}
                  </li>
                ))}
              </ul>
            </div>
            <HeroIllustration labels={{ time: t("illusTime"), item: t("illusItem"), detail: t("illusDetail"), done: t("illusDone"), later: t("illusLater"), skip: t("illusSkip"), note: t("illusNote") }} />
          </div>
        </section>

        {/* How Sukhi Works */}
        <section id="how-it-works" aria-labelledby="how-title" className="scroll-mt-20 bg-sky py-16 sm:py-24">
          <div className={container}>
            <div className="mx-auto max-w-2xl text-center">
              <h2 id="how-title" className={h2}>{t("howTitle")}</h2>
              <p className={lead}>{t("howIntro")}</p>
            </div>
            <ol className="mx-auto mt-12 grid max-w-5xl gap-5 md:grid-cols-2">
              {steps.map((s) => (
                <li key={s.n} className={`flex flex-col rounded-[var(--r-lg)] border bg-surface p-6 ${s.branches ? "border-primary/30 shadow-[var(--shadow-md)]" : "border-line shadow-[var(--shadow-sm)]"}`}>
                  <div className="flex items-center justify-between">
                    <span className="flex h-12 w-12 items-center justify-center rounded-[var(--r-md)] bg-primary-soft text-primary"><s.Icon size={24} aria-hidden="true" /></span>
                    <span className="text-sm font-bold tabular-nums text-ink-faint">{t("stepLabel", { n: s.n })}</span>
                  </div>
                  <h3 className="mt-5 text-xl">{s.title}</h3>
                  <p className="mt-1.5 font-semibold text-primary">{s.lead}</p>
                  <p className="mt-3 text-ink-soft">{s.body}</p>
                  {s.branches ? (
                    <div className="mt-5 flex flex-col gap-2.5">
                      <div className="rounded-[var(--r-md)] bg-ok-bg p-3.5">
                        <p className="flex items-center gap-2 font-bold text-ok-ink"><Check size={18} aria-hidden="true" />{t("step3DidLabel")}</p>
                        <p className="mt-1 text-[0.95rem] text-ink">{t("step3DidBody")}</p>
                      </div>
                      <div className="rounded-[var(--r-md)] bg-surface-2 p-3.5">
                        <p className="flex items-center gap-2 font-bold text-ink"><Undo2 size={18} className="text-ink-soft" aria-hidden="true" />{t("step3NotLabel")}</p>
                        <p className="mt-1 text-[0.95rem] text-ink">{t("step3NotBody")}</p>
                      </div>
                    </div>
                  ) : null}
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Why Sukhi */}
        <section id="why-sukhi" aria-labelledby="why-title" className="scroll-mt-20 py-16 sm:py-24">
          <div className={container}>
            <div className="grid items-center gap-10 rounded-[28px] bg-sky px-5 py-10 sm:px-10 sm:py-14 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16 lg:px-14">
              <PhoneChat
                user={t("whyChatUser")}
                reply={t("whyChatReply")}
                options={[t("whyChatOpt1"), t("whyChatOpt2")]}
              />
              <div>
                <h2 id="why-title" className={h2}>{t("whyTitle")}</h2>
                <p className={lead}>{t("whyBody")}</p>
                <ul className="mt-7 flex flex-col gap-3.5">
                  {why.map((w) => (
                    <li key={w.text} className="flex items-center gap-3.5 text-[1.05rem] font-medium">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface text-primary shadow-[var(--shadow-sm)]"><w.Icon size={19} aria-hidden="true" /></span>
                      {w.text}
                    </li>
                  ))}
                </ul>
                <p className="mt-8 text-2xl font-bold text-primary">{t("whySignature")}</p>
                <p className="mt-2 text-ink-soft">{t("whySupport")}</p>
              </div>
            </div>
          </div>
        </section>

        {/* Benefits / everyday wellbeing */}
        <section id="benefits" aria-labelledby="benefits-title" className="scroll-mt-20 pb-16 sm:pb-24">
          <div className={container}>
            <div className="max-w-2xl">
              <h2 id="benefits-title" className={h2}>{t("benefitsTitle")}</h2>
              <p className={lead}>{t("benefitsIntro")}</p>
            </div>
            <ul className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {domains.map((d) => (
                <li key={d.title} className="card p-6">
                  <d.Icon size={26} className="text-primary" aria-hidden="true" />
                  <h3 className="mt-4 text-xl">{d.title}</h3>
                  <p className="mt-2 text-ink-soft">{d.body}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Features */}
        <section id="features" aria-labelledby="features-title" className="scroll-mt-20 border-y border-line bg-surface py-16 sm:py-24">
          <div className={`${container} grid items-center gap-12 lg:grid-cols-2 lg:gap-16`}>
            <div>
              <h2 id="features-title" className={h2}>{t("featuresTitle")}</h2>
              <p className={lead}>{t("featuresBody")}</p>
              <ul className="mt-8 flex flex-col gap-3">
                {feats.map((f) => (
                  <li key={f.text} className="flex items-center gap-3.5 text-[1.05rem]">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--r-md)] bg-primary-soft text-primary"><f.Icon size={19} aria-hidden="true" /></span>
                    {f.text}
                  </li>
                ))}
              </ul>
            </div>
            <figure className="rounded-[var(--r-lg)] border border-line bg-bg p-5 sm:p-7">
              <figcaption className="text-sm font-semibold text-ink-soft">{t("featCardLabel")}</figcaption>
              <p className="mt-1 text-xl font-bold">{t("featCardTitle")}</p>
              <ol className="mt-6 grid grid-cols-7 gap-1.5 sm:gap-2.5">
                {EXAMPLE_WEEK.map((s, i) => (
                  <li key={i} className="flex flex-col items-center gap-2">
                    <span className={`flex aspect-square w-full max-w-12 items-center justify-center rounded-[var(--r-md)] ${
                      s === "done" ? "bg-[var(--sukhi-success)] text-white" : s === "skipped" ? "bg-surface-3 text-ink-soft" : s === "none" ? "border-2 border-dashed border-line-strong bg-surface text-ink-faint" : "border border-line bg-surface"
                    }`}>
                      {s === "done" ? <Check size={18} strokeWidth={2.6} aria-hidden="true" /> : s === "skipped" ? <Minus size={18} aria-hidden="true" /> : null}
                      <span className="sr-only">{s === "done" ? t("featLegendDone") : s === "skipped" ? t("featLegendSkip") : s === "none" ? t("featLegendNone") : ""}</span>
                    </span>
                    <span className="text-xs font-medium text-ink-soft">{days[i]}</span>
                  </li>
                ))}
              </ol>
              <ul className="mt-5 flex flex-wrap gap-x-5 gap-y-1.5 text-sm text-ink-soft" aria-hidden="true">
                <li className="flex items-center gap-1.5"><Check size={15} className="text-[var(--sukhi-success)]" />{t("featLegendDone")}</li>
                <li className="flex items-center gap-1.5"><Minus size={15} />{t("featLegendSkip")}</li>
                <li className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm border-2 border-dashed border-line-strong" />{t("featLegendNone")}</li>
              </ul>
              <p className="mt-6 flex items-start gap-3 rounded-[var(--r-md)] border border-line bg-surface p-4">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary"><Sprout size={18} aria-hidden="true" /></span>
                <span className="pt-1.5 font-medium">{t("featCardWelcome")}</span>
              </p>
            </figure>
          </div>
        </section>

        {/* Languages */}
        <section aria-labelledby="lang-title" className="py-16 sm:py-24">
          <div className={container}>
            <div className="mx-auto max-w-2xl text-center">
              <h2 id="lang-title" className={h2}>{t("langTitle")}</h2>
              <p className={lead}>{t("langBody")}</p>
            </div>
            <ul className="mx-auto mt-10 grid max-w-4xl gap-4 md:grid-cols-3">
              {GREETINGS.map((g) => (
                <li key={g.lang} className="card p-5">
                  <p className="text-sm font-bold text-primary" lang={g.lang}>{g.label}</p>
                  <p className="mt-2 text-lg" lang={g.lang}>“{g.text}”</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Future roadmap */}
        <section id="roadmap" aria-labelledby="roadmap-title" className="scroll-mt-20 border-t border-line py-16 sm:py-24">
          <div className={container}>
            <div className="max-w-2xl">
              <h2 id="roadmap-title" className={h2}>{t("roadmapTitle")}</h2>
              <p className={lead}>{t("roadmapBody")}</p>
            </div>
            <div className="mt-10 grid gap-10 border-t border-line pt-10 sm:grid-cols-2 lg:grid-cols-4 lg:gap-8">
              {roadmap.map((g) => (
                <div key={g.title}>
                  <h3 className="text-lg font-semibold">{g.title}</h3>
                  <ul className="mt-4 flex flex-col gap-3">
                    {g.items.map((it) => (
                      <li key={it} className="flex gap-3 text-[1rem] leading-relaxed text-ink-soft">
                        <span aria-hidden="true" className="mt-[0.8em] h-px w-4 shrink-0 bg-ink-faint" />
                        <span>{it}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
            <p className="hint mt-10 max-w-3xl">{t("roadmapNote")}</p>
          </div>
        </section>

        {/* FAQs */}
        <section id="faqs" aria-labelledby="faq-title" className="scroll-mt-20 border-t border-line bg-surface py-16 sm:py-24">
          <div className="mx-auto max-w-3xl px-4 sm:px-8">
            <h2 id="faq-title" className={`${h2} text-center`}>{t("faqTitle")}</h2>
            <div className="mt-10 flex flex-col gap-3">
              {(["1", "2", "3", "4", "5", "6"] as const).map((n) => (
                <details key={n} className="group rounded-[var(--r-lg)] border border-line bg-surface open:bg-bg">
                  <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 text-lg font-semibold [&::-webkit-details-marker]:hidden">
                    {t(`q${n}`)}
                    <span aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sky text-xl leading-none text-primary transition-transform group-open:rotate-45">+</span>
                  </summary>
                  <p className="px-5 pb-5 text-ink-soft">{t(`a${n}`)}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <section aria-labelledby="cta-title" className="py-16 sm:py-24">
          <div className={container}>
            <div className="flex flex-col items-center rounded-[28px] bg-primary px-6 py-14 text-center text-white sm:px-12">
              <h2 id="cta-title" className={`${h2} !text-white`}>{t("ctaTitle")}</h2>
              <p className="mt-4 max-w-xl text-lg text-white/90">{t("ctaBody")}</p>
              <Link href={cta} className="btn btn-accent btn-lg mt-8">{user ? t("openApp") : t("ctaButton")}<ArrowRight size={19} aria-hidden="true" /></Link>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}

/** Restrained phone illustration of the Gentle Restart Loop (spec §3.4). Decorative. */
function PhoneChat({ user, reply, options }: { user: string; reply: string; options: string[] }) {
  return (
    <div aria-hidden="true" className="mx-auto w-full max-w-[300px] rounded-[36px] border border-line-strong bg-surface p-2.5 shadow-[var(--shadow-lg)]">
      <div className="rounded-[28px] bg-bg px-4 pb-6 pt-4">
        <div className="mx-auto mb-4 h-1.5 w-16 rounded-full bg-surface-3" />
        <div className="flex items-center gap-2 border-b border-line pb-3">
          <LogoMark size={26} />
          <span className="font-bold">Sukhi</span>
        </div>
        <div className="mt-4 flex flex-col gap-2.5 text-[0.95rem]">
          <p className="max-w-[85%] self-end rounded-2xl rounded-br-md bg-primary px-3.5 py-2.5 text-white">{user}</p>
          <p className="max-w-[90%] self-start rounded-2xl rounded-bl-md border border-line bg-surface px-3.5 py-2.5">{reply}</p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {options.map((o) => <span key={o} className="rounded-full border border-primary/40 bg-surface px-3 py-1.5 text-sm font-semibold text-primary">{o}</span>)}
          </div>
        </div>
      </div>
    </div>
  );
}
