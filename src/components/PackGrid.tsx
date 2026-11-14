import { getTranslations } from "next-intl/server";
import { Droplets, Footprints, Moon, Plus, Sparkles, StretchHorizontal, Wind, Zap } from "lucide-react";
import { addTemplate } from "@/app/actions";
import { SubmitButton } from "@/components/SubmitButton";
import { PACK_KEYS, type PackKey } from "@/domain/templates";

const ICON: Record<PackKey, typeof Sparkles> = { glow: Sparkles, sleep: Moon, active: Footprints, calm: Wind, energy: Zap, water: Droplets, walk: Footprints, stretch: StretchHorizontal };

/** One tap = a ready, scheduled plan. */
export async function PackGrid({ keys = [...PACK_KEYS], exclude = [] }: { keys?: PackKey[]; exclude?: string[] }) {
  const t = await getTranslations();
  return (
    <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {keys.filter((k) => !exclude.includes(k)).map((k) => {
        const Icon = ICON[k];
        return (
          <li key={k}>
            <form action={addTemplate}>
              <input type="hidden" name="template" value={k} />
              <SubmitButton className="group flex w-full items-start gap-2.5 rounded-[var(--r-md)] border border-line bg-surface px-3 py-3 text-left transition-colors hover:border-primary disabled:opacity-60" pendingLabel={t("common.saving")}>
                <Icon size={17} className="mt-0.5 shrink-0 text-primary" aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="block text-[0.92rem] font-medium leading-tight">{t(`packs.${k}`)}</span>
                  <span className="mt-0.5 block text-[0.75rem] leading-snug text-ink-faint">{t(`packs.${k}Desc`)}</span>
                </span>
                <Plus size={15} className="mt-0.5 shrink-0 text-ink-faint group-hover:text-primary" aria-hidden="true" />
              </SubmitButton>
            </form>
          </li>
        );
      })}
    </ul>
  );
}
