// One account, several roles ("hats"). A role comes from what the person has, not from a
// single column: a care plan makes them a patient, a doctor profile a doctor, and following
// someone makes them family. profiles.primary_role is only where they land by default.
export type Hat = "patient" | "doctor" | "family";

export type HatFacts = { hasPlan: boolean; isDoctor: boolean; follows: number; primaryRole?: string | null };

export function hatsFrom(f: HatFacts): Hat[] {
  const hats: Hat[] = [];
  // Someone who is neither a doctor nor family is a patient even before their first plan.
  if (f.hasPlan || f.primaryRole === "patient" || (!f.isDoctor && f.follows === 0)) hats.push("patient");
  if (f.isDoctor) hats.push("doctor");
  if (f.follows > 0) hats.push("family");
  return hats;
}

export type WaMode = "patient" | "doctor";
export const DOCTOR_MODE_MINUTES = 30;

/**
 * Which side of WhatsApp free text goes to. Doctor-only accounts (default "doctor") always get
 * the doctor side; anyone else who is also a doctor gets it while "clinic" mode is open.
 * Button taps carry their own side in the id, so this only decides typed messages and photos.
 */
export function waMode(f: { isDoctor: boolean; primaryRole?: string | null; doctorUntil?: string | null }, now = Date.now()): WaMode {
  if (!f.isDoctor) return "patient";
  if (f.primaryRole === "doctor") return "doctor";
  return f.doctorUntil && Date.parse(f.doctorUntil) > now ? "doctor" : "patient";
}
