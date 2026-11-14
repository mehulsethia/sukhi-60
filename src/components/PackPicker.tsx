"use client";
// Pick several ready-made packs, then add them all with one tap (Today's empty state).
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Check, Droplets, Footprints, Moon, Sparkles, StretchHorizontal, Wind, Zap } from "lucide-react";
import { addTemplates } from "@/app/actions";
import { SubmitButton } from "@/components/SubmitButton";
import type { PackKey } from "@/domain/templates";

const ICON: Record<PackKey, typeof Sparkles> = { glow: Sparkles, sleep: Moon, active: Footprints, calm: Wind, energy: Zap, water: Droplets, walk: Footprints, stretch: StretchHorizontal };

export function PackPicker({ keys }: { keys: PackKey[] }) {
  const t = useTranslations();
  const [picked, setPicked] = useState<PackKey[]>([]);
  const toggle = (k: PackKey) => setPicked((ps) => (ps.includes(k) ? ps.filter((x) => x !== k) : [...ps, k]));

  return (
    <form action={addTemplates}>
      {picked.map((k) => <input key={k} type="hidden" name="packs" value={k} />)}
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {keys.map((k) => {
          const on = picked.includes(k);
          const Icon = ICON[k];
          return (
            <li key={k}>
              <button type="button" aria-pressed={on} onClick={() => toggle(k)} className={`relative flex w-full items-start gap-2.5 rounded-[var(--r-md)] border px-3 py-3 text-left transition-colors ${on ? "border-primary bg-primary-soft/50" : "border-line bg-surface hover:border-ink-soft"}`}>
                <Icon size={17} className={`mt-0.5 shrink-0 ${on ? "text-primary" : "text-ink-faint"}`} aria-hidden="true" />
                <span className="min-w-0 flex-1 pr-4">
                  <span className="block text-[0.92rem] font-medium leading-tight">{t(`packs.${k}`)}</span>
                  <span className="mt-0.5 block text-[0.75rem] leading-snug text-ink-faint">{t(`packs.${k}Desc`)}</span>
                </span>
                {on ? <Check size={14} className="absolute right-2.5 top-2.5 text-primary" aria-hidden="true" /> : null}
              </button>
            </li>
          );
        })}
      </ul>
      {picked.length ? (
        <SubmitButton className="btn btn-primary pop-in mt-3 w-full" pendingLabel={t("common.saving")}>{t("today.addPacks", { count: picked.length })}</SubmitButton>
      ) : null}
    </form>
  );
}
