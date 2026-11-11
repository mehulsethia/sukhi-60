import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Logo } from "@/components/Logo";

const container = "mx-auto w-full max-w-6xl px-4 sm:px-8";

/** Footer per spec §3.7 / copy §10: brand line, links, medical disclaimer. */
export async function SiteFooter() {
  const t = await getTranslations("landing");
  const tr = await getTranslations("legal");
  const contact = process.env.NEXT_PUBLIC_CONTACT_EMAIL;
  const links: [string, string][] = [
    ["/#why-sukhi", t("footerAbout")],
    ["/#how-it-works", t("navHow")],
    ["/privacy", tr("privacyTitle")],
    ["/terms", tr("termsTitle")],
    ...(contact ? ([[`mailto:${contact}`, t("footerContact")]] as [string, string][]) : []),
    ["/#faqs", t("navFaq")],
  ];
  return (
    <footer className="border-t border-line bg-surface">
      <div className={`${container} flex flex-col gap-8 py-12 md:flex-row md:items-start md:justify-between`}>
        <div className="max-w-sm">
          <Logo />
          <p className="mt-4 text-ink-soft">{t("footerBrand")}</p>
        </div>
        <nav aria-label={t("footerNav")}>
          <ul className="grid grid-cols-2 gap-x-10 gap-y-1 sm:grid-cols-3">
            {links.map(([href, label]) => (
              <li key={href}>
                {href.startsWith("/") && !href.includes("#") ? (
                  <Link href={href} className="inline-flex min-h-11 items-center text-ink-soft hover:text-ink hover:underline">{label}</Link>
                ) : (
                  <a href={href} className="inline-flex min-h-11 items-center text-ink-soft hover:text-ink hover:underline">{label}</a>
                )}
              </li>
            ))}
          </ul>
        </nav>
      </div>
      <div className={`${container} border-t border-line py-6`}>
        <p className="max-w-3xl text-[0.95rem] text-ink-soft">{t("footerDisclaimer")}</p>
        <p className="mt-2 text-sm text-ink-faint">{t("copyright", { year: new Date().getFullYear() })}</p>
      </div>
    </footer>
  );
}
