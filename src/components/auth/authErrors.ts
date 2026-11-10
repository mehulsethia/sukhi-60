// Map Supabase auth errors to clear, actionable messages (keys in messages/*.json -> auth).
export function authErrorKey(err: { code?: string; message?: string; status?: number } | null): string {
  if (!err) return "genericError";
  const c = err.code ?? "";
  const m = (err.message ?? "").toLowerCase();
  if (c === "invalid_credentials" || m.includes("invalid login")) return "invalidCredentials";
  if (c === "email_not_confirmed" || m.includes("not confirmed")) return "unconfirmed";
  if (c === "user_already_exists" || c === "email_exists" || m.includes("already registered")) return "emailTaken";
  if (c === "weak_password" || m.includes("password should")) return "weakPassword";
  if (c.startsWith("over_") || err.status === 429) return "rateLimited";
  if (c === "otp_expired" || c === "flow_state_expired") return "linkError";
  return "genericError";
}
