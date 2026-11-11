"use client";
import { useActionState } from "react";
import { adminLogin } from "./actions";
import { Logo } from "@/components/Logo";

export function AdminLogin() {
  const [state, action, pending] = useActionState(adminLogin, null);
  return (
    <main className="flex min-h-dvh items-center justify-center bg-bg px-4">
      <form action={action} className="w-full max-w-sm rounded-2xl border border-line bg-surface p-7 shadow-[var(--shadow-md)]">
        <Logo />
        <h1 className="mt-6 text-2xl">Pilot dashboard</h1>
        <p className="mt-1 text-sm text-ink-soft">For the Sukhi team. Sign in with your team email.</p>
        {state?.error ? <p role="alert" className="mt-4 rounded-lg bg-danger-bg px-3 py-2 text-sm text-danger-ink">{state.error}</p> : null}
        <div className="field mt-5"><label htmlFor="admin-email">Email</label><input id="admin-email" name="email" type="email" autoComplete="username" required className="input" /></div>
        <div className="field mt-3"><label htmlFor="admin-password">Password</label><input id="admin-password" name="password" type="password" autoComplete="current-password" required className="input" /></div>
        <button className="btn btn-primary mt-5 w-full" disabled={pending}>{pending ? "Signing in…" : "Sign in"}</button>
      </form>
    </main>
  );
}
