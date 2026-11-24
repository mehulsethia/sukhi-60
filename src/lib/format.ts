/** Intl locale for dates/times. Latin digits everywhere: Marathi otherwise defaults to Devanagari numerals
 *  ("६:०० PM"), which reads oddly next to English words and differs from Hindi. */
export function intlLocale(locale: string): string {
  return `${locale === "hi" || locale === "mr" ? locale : "en"}-IN-u-nu-latn`;
}

export function fmtTime(iso: string, tz: string, locale: string) {
  return new Intl.DateTimeFormat(intlLocale(locale), { timeZone: tz, hour: "numeric", minute: "2-digit" }).format(new Date(iso));
}
export function fmtDateTime(iso: string, tz: string, locale: string) {
  return new Intl.DateTimeFormat(intlLocale(locale), { timeZone: tz, dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));
}
export function fmtDate(date: string, locale: string) {
  return new Intl.DateTimeFormat(intlLocale(locale), { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`));
}

/** When a slot happens, relative to today: time only today, "tomorrow" label, else short date + time. */
export function fmtWhen(dueIso: string, localDate: string, today: string, tomorrowLabel: string, tz: string, locale: string) {
  const time = fmtTime(dueIso, tz, locale);
  if (localDate === today) return time;
  const tomorrow = new Date(`${today}T00:00:00Z`); tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  if (localDate === tomorrow.toISOString().slice(0, 10)) return `${tomorrowLabel}, ${time}`;
  return `${fmtDate(localDate, locale)}, ${time}`;
}

// Request-time clock helpers (server components render per request).
export const nowMs = () => Date.now();
export const hoursAgoIso = (h: number) => new Date(Date.now() - h * 3600_000).toISOString();

/** "2 hours ago", "yesterday", "3 days ago" in the person's language. */
export function fmtAgo(iso: string, locale: string, now = Date.now()) {
  const diff = (new Date(iso).getTime() - now) / 1000;
  const rtf = new Intl.RelativeTimeFormat(intlLocale(locale), { numeric: "auto" });
  const abs = Math.abs(diff);
  if (abs < 3600) return rtf.format(Math.round(diff / 60), "minute");
  if (abs < 86_400) return rtf.format(Math.round(diff / 3600), "hour");
  return rtf.format(Math.round(diff / 86_400), "day");
}
