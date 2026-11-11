import { Check, Clock, Footprints, SkipForward } from "lucide-react";

/**
 * Hero art: a gentle sunrise over a winding path (spec §2.4, §3.2), with a small,
 * static example of the Today card floating over it. Decorative — the hero copy carries
 * the meaning — so the whole figure is aria-hidden.
 */
export function HeroIllustration({ labels }: { labels: { time: string; item: string; detail: string; done: string; later: string; skip: string; note: string } }) {
  return (
    <div aria-hidden="true" className="relative mx-auto w-full max-w-[520px]">
      <svg viewBox="0 0 520 440" className="block h-auto w-full" role="presentation">
        <defs>
          <linearGradient id="sk-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#EAF4FF" />
            <stop offset="1" stopColor="#F7FBFF" />
          </linearGradient>
          <clipPath id="sk-frame"><rect width="520" height="440" rx="28" /></clipPath>
        </defs>
        <g clipPath="url(#sk-frame)">
          <rect width="520" height="440" fill="url(#sk-sky)" />
          {/* sun: the one small warm detail */}
          <circle cx="352" cy="214" r="62" fill="#FDE9B8" opacity="0.55" />
          <circle cx="352" cy="214" r="40" fill="#FBD989" opacity="0.8" />
          {/* far and near hills in teal tints */}
          <path d="M0 250 C 90 214 170 222 250 240 S 420 212 520 232 V440 H0Z" fill="#D7ECF1" />
          <path d="M0 300 C 110 262 210 276 300 292 S 450 270 520 282 V440 H0Z" fill="#B9DED8" />
          <path d="M0 350 C 120 318 240 330 340 344 S 470 330 520 338 V440 H0Z" fill="#8CC7BC" />
          {/* winding path toward the sunrise */}
          <path d="M188 440 C 214 404 286 392 298 362 C 310 334 270 318 300 296 C 318 284 340 280 352 276 L 360 276 C 344 284 330 292 322 302 C 302 326 342 344 326 370 C 308 400 256 412 248 440Z" fill="#F7FBFF" opacity="0.95" />
          {/* restrained leaf motifs */}
          <g fill="#0B6E5F" opacity="0.85">
            <path d="M70 352c0-16 10-28 28-30-1 18-12 29-28 30Z" />
            <path d="M84 360c4-12 14-19 27-18-4 13-14 19-27 18Z" opacity="0.7" />
            <path d="M452 372c0-14 9-25 25-26-1 15-10 25-25 26Z" />
          </g>
          <path d="M70 352v24M452 372v20" stroke="#0B6E5F" strokeWidth="2" strokeLinecap="round" opacity="0.6" />
        </g>
      </svg>

      {/* Example check-in card (static, illustrative) */}
      <div className="absolute left-3 top-6 w-[min(300px,72%)] rounded-[var(--r-lg)] border border-line bg-surface p-4 shadow-[var(--shadow-lg)] sm:left-0 sm:top-8 sm:p-5">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--r-md)] bg-primary-soft text-primary"><Footprints size={20} /></span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-primary">{labels.time}</p>
            <p className="truncate text-[1.05rem] font-bold leading-tight text-ink">{labels.item}</p>
          </div>
        </div>
        <p className="mt-2 text-sm text-ink-soft">{labels.detail}</p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          <span className="inline-flex min-h-9 items-center gap-1 rounded-full bg-primary px-3 text-sm font-semibold text-white"><Check size={15} />{labels.done}</span>
          <span className="inline-flex min-h-9 items-center gap-1 rounded-full border border-line px-3 text-sm font-semibold text-ink"><Clock size={14} />{labels.later}</span>
          <span className="hidden min-h-9 items-center gap-1 rounded-full border border-line px-3 text-sm font-semibold text-ink sm:inline-flex"><SkipForward size={14} />{labels.skip}</span>
        </div>
      </div>
      <div className="absolute bottom-6 right-3 flex max-w-[64%] items-center gap-2.5 rounded-[var(--r-lg)] border border-line bg-surface px-3.5 py-3 shadow-[var(--shadow-md)] sm:right-0">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ok-bg text-[var(--sukhi-success)]"><Check size={17} strokeWidth={2.6} /></span>
        <p className="text-sm font-semibold leading-snug text-ink">{labels.note}</p>
      </div>
    </div>
  );
}
