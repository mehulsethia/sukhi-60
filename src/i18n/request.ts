import { getRequestConfig } from "next-intl/server";
import { cookies } from "next/headers";

export const LOCALES = ["en", "hi", "mr"] as const;
export type AppLocale = (typeof LOCALES)[number];
export const LOCALE_COOKIE = "sukhi_locale";

// No locale prefix in URLs: the locale comes from the user's saved profile (mirrored in a cookie).
export default getRequestConfig(async () => {
  const store = await cookies();
  const c = store.get(LOCALE_COOKIE)?.value;
  const locale: AppLocale = (LOCALES as readonly string[]).includes(c ?? "") ? (c as AppLocale) : "en";
  return { locale, messages: (await import(`../../messages/${locale}.json`)).default };
});
