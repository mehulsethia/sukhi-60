import Link from "next/link";

/** Sukhi mark: a white leaf on a teal rounded square (spec §2.4). Monochrome, crisp at any size. */
export function LogoMark({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" className="shrink-0">
      <rect width="32" height="32" rx="8" fill="var(--sukhi-teal)" />
      <path d="M9 23.5C9 15.4 14.4 9.8 23 9c-.3 8.7-5.7 14.3-14 14.5Z" fill="#fff" />
      <path d="M9.6 22.9c3.2-3.4 6-6 9.6-8.6" stroke="var(--sukhi-teal)" strokeWidth="1.6" strokeLinecap="round" fill="none" />
    </svg>
  );
}

/** Horizontal logo: mark + navy wordmark. `tone="light"` is for use on teal backgrounds. */
export function Logo({ href = "/", size = 32, tone = "dark" }: { href?: string; size?: number; tone?: "dark" | "light" }) {
  return (
    <Link href={href} className="inline-flex items-center gap-2.5 rounded-lg" aria-label="Sukhi">
      <LogoMark size={size} />
      <span className={`display text-[1.35rem] font-bold leading-none tracking-tight ${tone === "light" ? "text-white" : "text-ink"}`}>Sukhi</span>
    </Link>
  );
}
