"use client";
import { useState } from "react";

export function TimesInput({ name, label, initial, addLabel, removeLabel }: { name: string; label: string; initial: string[]; addLabel: string; removeLabel: (t: string) => string }) {
  const [times, setTimes] = useState(initial);
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="label mb-1">{label}</legend>
      <ul className="flex flex-wrap gap-2">
        {times.map((t, i) => (
          <li key={i} className="flex items-center gap-1">
            <input type="time" name={name} value={t} aria-label={`${label} ${i + 1}`} className="input w-36" onChange={(e) => setTimes(times.map((x, j) => (j === i ? e.target.value : x)))} />
            <button type="button" className="btn btn-ghost px-3" aria-label={removeLabel(t)} onClick={() => setTimes(times.filter((_, j) => j !== i))}>✕</button>
          </li>
        ))}
      </ul>
      {times.length < 6 ? <button type="button" className="btn btn-secondary self-start" onClick={() => setTimes([...times, "12:00"])}>{addLabel}</button> : null}
    </fieldset>
  );
}
