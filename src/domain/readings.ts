// Numbers read off a measuring device (BP monitor, glucometer, scale, thermometer, oximeter).
// The AI only transcribes what the display shows; these rules decide whether the numbers are
// plausible enough to save. Sukhi never says whether a reading is good or bad.
export const READING_KINDS = ["blood_pressure", "glucose", "weight", "temperature", "spo2"] as const;
export type ReadingKind = (typeof READING_KINDS)[number];

export interface Reading {
  kind: ReadingKind;
  value: number;
  value2: number | null; // diastolic for blood pressure
  pulse: number | null;
  unit: string;
}

export interface RawReading {
  kind?: string | null;
  value?: number | null;
  value2?: number | null;
  pulse?: number | null;
  unit?: string | null;
  legible?: boolean | null;
}

const UNIT: Record<string, string> = {
  mmhg: "mmHg", "mm hg": "mmHg",
  "mg/dl": "mg/dL", mgdl: "mg/dL", "mmol/l": "mmol/L", mmol: "mmol/L",
  kg: "kg", kgs: "kg", lb: "lb", lbs: "lb",
  c: "°C", "°c": "°C", "℃": "°C", celsius: "°C", f: "°F", "°f": "°F", "℉": "°F", fahrenheit: "°F",
  "%": "%", "%spo2": "%", spo2: "%",
};
const DEFAULT_UNIT: Record<ReadingKind, string> = { blood_pressure: "mmHg", glucose: "mg/dL", weight: "kg", temperature: "°C", spo2: "%" };
const RANGE: Record<string, [number, number]> = {
  mmHg: [50, 260], "mmHg-dia": [30, 160], "mg/dL": [20, 600], "mmol/L": [1.1, 33.3],
  kg: [2, 300], lb: [4, 660], "°C": [30, 44], "°F": [86, 111], "%": [50, 100], pulse: [30, 220],
};

const inRange = (v: number | null | undefined, key: string): v is number => typeof v === "number" && Number.isFinite(v) && v >= RANGE[key][0] && v <= RANGE[key][1];
const round = (v: number, dp: number) => Math.round(v * 10 ** dp) / 10 ** dp;

function normUnit(kind: ReadingKind, unit: string | null | undefined, value: number): string | null {
  const u = UNIT[(unit ?? "").trim().toLowerCase()];
  if (u) return u;
  // No unit shown: infer only where the number makes it unambiguous.
  if (kind === "temperature") return value <= 45 ? "°C" : "°F";
  if (kind === "glucose") return value > 33.3 ? "mg/dL" : null;
  if (kind === "weight") return null;
  return DEFAULT_UNIT[kind];
}

/** A plausible reading, or null. Implausible numbers are dropped, never "fixed". */
export function cleanReading(raw: RawReading | null | undefined): Reading | null {
  if (!raw || raw.legible === false) return null;
  const kind = READING_KINDS.find((k) => k === raw.kind);
  if (!kind || typeof raw.value !== "number") return null;
  const unit = normUnit(kind, raw.unit, raw.value);
  if (!unit || (kind !== "glucose" && kind !== "weight" && kind !== "temperature" && unit !== DEFAULT_UNIT[kind])) return null;
  if (kind === "glucose" && unit !== "mg/dL" && unit !== "mmol/L") return null;
  if (kind === "weight" && unit !== "kg" && unit !== "lb") return null;
  if (kind === "temperature" && unit !== "°C" && unit !== "°F") return null;
  if (!inRange(raw.value, unit)) return null;
  const pulse = inRange(raw.pulse, "pulse") ? Math.round(raw.pulse) : null;
  if (kind === "blood_pressure") {
    if (!inRange(raw.value2, "mmHg-dia") || raw.value2 >= raw.value) return null;
    return { kind, value: Math.round(raw.value), value2: Math.round(raw.value2), pulse, unit };
  }
  const dp = unit === "mg/dL" || unit === "%" ? 0 : 1;
  return { kind, value: round(raw.value, dp), value2: null, pulse: kind === "spo2" ? pulse : null, unit };
}

/** "128/82 mmHg, pulse 74" style, for messages and screens. */
export function formatReading(r: Pick<Reading, "kind" | "value" | "value2" | "pulse" | "unit">, pulseWord = "pulse"): string {
  const main = r.kind === "blood_pressure" ? `${r.value}/${r.value2} ${r.unit}` : r.kind === "spo2" ? `SpO₂ ${r.value}%` : `${r.value} ${r.unit}`;
  return r.pulse ? `${main}, ${pulseWord} ${r.pulse}` : main;
}

/**
 * The person typing the right numbers: "128/82", "128/82 74", "112", "36.9", "97 80".
 * Keeps the kind and unit of the reading being corrected.
 */
export function parseReadingText(prev: Pick<Reading, "kind" | "unit">, text: string): Reading | null {
  const nums = (text.replace(/,/g, ".").match(/\d+(?:\.\d+)?/g) ?? []).map(Number);
  if (!nums.length) return null;
  if (prev.kind === "blood_pressure") {
    if (nums.length < 2) return null;
    return cleanReading({ kind: prev.kind, value: nums[0], value2: nums[1], pulse: nums[2] ?? null, unit: prev.unit });
  }
  return cleanReading({ kind: prev.kind, value: nums[0], pulse: prev.kind === "spo2" ? nums[1] ?? null : null, unit: prev.unit });
}

/** What to show as "type it like …" when correcting a reading. */
export function readingExample(kind: ReadingKind, unit: string): string {
  if (kind === "blood_pressure") return "128/82";
  if (kind === "glucose") return unit === "mmol/L" ? "6.2" : "112";
  if (kind === "temperature") return unit === "°F" ? "98.6" : "36.8";
  if (kind === "weight") return unit === "lb" ? "160" : "72.5";
  return "97";
}
