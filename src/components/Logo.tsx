import Link from "next/link";

/** Sukhi mark: a single leaf on a teal tile — monochrome, crisp at any size. */
export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="8" fill="var(--primary)" />
      <path d="M10 22.5c0-7.2 4.8-12 12.5-12.5-.3 7.9-5.2 12.6-12.5 12.5Z" fill="var(--primary-ink)" />
      <path d="M10 22.5 17 15.5" stroke="var(--primary)" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function Logo({ href = "/", size = 28 }: { href?: string; size?: number }) {
  return (
    <Link href={href} className="inline-flex items-center gap-2 rounded-lg" aria-label="Sukhi">
      <LogoMark size={size} />
      <span className="display text-[1.3rem] font-semibold leading-none tracking-tight text-ink">Sukhi</span>
    </Link>
  );
}
