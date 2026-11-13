"use client";
import { useEffect, useState } from "react";
import { Check } from "lucide-react";

/** Fire a short confirmation from anywhere on the client (survives the card re-mounting after a refresh). */
export function showToast(text: string) {
  window.dispatchEvent(new CustomEvent<string>("sukhi:toast", { detail: text }));
}

/** One quiet toast above the bottom nav. Mounted once in the app layout. */
export function ToastHost() {
  const [text, setText] = useState<string | null>(null);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const on = (e: Event) => {
      setText((e as CustomEvent<string>).detail);
      clearTimeout(timer);
      timer = setTimeout(() => setText(null), 2600);
    };
    window.addEventListener("sukhi:toast", on);
    return () => { window.removeEventListener("sukhi:toast", on); clearTimeout(timer); };
  }, []);
  if (!text) return null;
  return (
    <div role="status" aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-[calc(72px+env(safe-area-inset-bottom))] z-40 flex justify-center px-4 lg:bottom-8">
      <p className="pop-in flex items-center gap-2 rounded-full bg-ink px-4 py-2 text-sm font-medium text-white shadow-[var(--shadow-lg)]">
        <Check size={15} aria-hidden="true" />{text}
      </p>
    </div>
  );
}
