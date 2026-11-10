// Browser-side preference cookie (mirrors the profile; read by the server for rendering).
export function setLocaleCookie(locale: string) {
  document.cookie = `sukhi_locale=${encodeURIComponent(locale)}; path=/; max-age=31536000; samesite=lax`;
}

/**
 * Full page load to an internal path. Used only right after an auth state change, so the
 * fresh session cookie is guaranteed to accompany the very next server render (soft
 * navigations can race with server redirects on auth-gated routes).
 */
export function hardNavigate(path: string) {
  window.location.assign(new URL(path, window.location.origin).toString());
}
