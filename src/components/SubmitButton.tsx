"use client";
import { useFormStatus } from "react-dom";
import type { ReactNode } from "react";

export function SubmitButton({ children, pendingLabel, className = "btn btn-primary", name, value, disabled = false }: { children: ReactNode; pendingLabel?: string; className?: string; name?: string; value?: string; disabled?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} disabled={pending || disabled} aria-disabled={pending || disabled} name={name} value={value}>
      {pending && pendingLabel ? pendingLabel : children}
    </button>
  );
}
