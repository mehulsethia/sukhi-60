export function fmtTime(iso: string, tz: string, locale: string) {
  return new Intl.DateTimeFormat(locale === "en" ? "en-IN" : `${locale}-IN`, { timeZone: tz, hour: "numeric", minute: "2-digit" }).format(new Date(iso));
}
export function fmtDateTime(iso: string, tz: string, locale: string) {
  return new Intl.DateTimeFormat(locale === "en" ? "en-IN" : `${locale}-IN`, { timeZone: tz, dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));
}
export function fmtDate(date: string, locale: string) {
  return new Intl.DateTimeFormat(locale === "en" ? "en-IN" : `${locale}-IN`, { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`));
}

// Request-time clock helpers (server components render per request).
export const nowMs = () => Date.now();
export const hoursAgoIso = (h: number) => new Date(Date.now() - h * 3600_000).toISOString();
