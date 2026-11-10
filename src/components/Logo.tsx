import Link from "next/link";

/** Sukhi mark: a two-leaf sprout in an indigo roundel, with the wordmark. */
export function LogoMark({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden="true">
      <rect width="40" height="40" rx="12" fill="var(--primary)" />
      <path d="M20 31V18" stroke="var(--primary-ink)" strokeWidth="2.6" strokeLinecap="round" />
      <path d="M20 22c-6 0-9.5-4.2-9.5-9 5.8 0 9.5 3.6 9.5 9Z" fill="var(--leaf)" />
      <path d="M20 19c0-5.4 3.6-9 9.5-9 0 4.8-3.5 9-9.5 9Z" fill="var(--accent)" />
    </svg>
  );
}

export function Logo({ href = "/", size = 32 }: { href?: string; size?: number }) {
  return (
    <Link href={href} className="inline-flex items-center gap-2.5 rounded-xl" aria-label="Sukhi">
      <LogoMark size={size} />
      <span className="display text-[1.45rem] font-bold leading-none tracking-tight text-ink">Sukhi</span>
    </Link>
  );
}
