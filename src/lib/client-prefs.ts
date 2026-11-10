// Browser-side preference cookie (mirrors the profile; read by the server for rendering).
export function setLocaleCookie(locale: string) {
  document.cookie = `sukhi_locale=${encodeURIComponent(locale)}; path=/; max-age=31536000; samesite=lax`;
}
