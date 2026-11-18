"use client";
// Country code + number. India first and default; the guess comes from the time zone.
import { useTranslations } from "next-intl";
import { COUNTRIES } from "@/domain/wa-ui";

export function PhoneInput({ dial, onDial, value, onValue, onEnter, uncontrolled }: { dial: string; onDial?: (d: string) => void; value?: string; onValue?: (v: string) => void; onEnter?: () => void; uncontrolled?: { dial: string; phone: string } }) {
  const t = useTranslations();
  const placeholder = dial === "91" ? "98200 01234" : dial === "49" ? "151 23456789" : t("settings.phoneLabel");
  return (
    <div className="flex gap-2">
      <label htmlFor="dial" className="sr-only">{t("settings.phoneCountry")}</label>
      <select id="dial" name="dial" className="input w-[6.5rem] shrink-0 text-lg" {...(uncontrolled ? { defaultValue: uncontrolled.dial } : { value: dial, onChange: (e) => onDial?.(e.target.value) })}>
        {COUNTRIES.map((c) => <option key={c.iso} value={c.dial}>{`+${c.dial} ${c.iso}`}</option>)}
      </select>
      <input id="phone" name="phone" type="tel" inputMode="tel" autoComplete="tel-national" required maxLength={20} className="input min-w-0 flex-1 text-lg" placeholder={placeholder}
        {...(uncontrolled ? { defaultValue: uncontrolled.phone } : { value, onChange: (e) => onValue?.(e.target.value) })}
        onKeyDown={(e) => { if (e.key === "Enter" && onEnter) { e.preventDefault(); onEnter(); } }} />
    </div>
  );
}
