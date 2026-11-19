// Proof verification rules (pure). The AI describes a photo; these rules decide how far it
// counts, which findings send it to a human, and how strong the proof is.

export type ProofLevel = "photo_ai" | "photo_fresh" | "video_action" | "human_verified" | "flagged";
export const PROOF_RANK: Record<Exclude<ProofLevel, "flagged">, number> = { photo_ai: 1, photo_fresh: 2, video_action: 3, human_verified: 4 };

/**
 * Hard flags stop a photo from counting until a reviewer looks at it.
 * Soft flags are shown to the reviewer (and in audits) but don't block.
 */
export const HARD_FLAGS = ["reused_photo", "shared_photo", "old_photo", "screen_photo", "label_mismatch", "challenge_missed"] as const;
export const SOFT_FLAGS = ["similar_photo", "blister_count_down"] as const;
export type Flag = (typeof HARD_FLAGS)[number] | (typeof SOFT_FLAGS)[number];
export const isHard = (f: string) => (HARD_FLAGS as readonly string[]).includes(f);

/** How close two 64-bit perceptual hashes (16 hex chars) are: 0 = same picture. */
export function hamming(a: string, b: string): number {
  if (!/^[0-9a-f]{16}$/.test(a) || !/^[0-9a-f]{16}$/.test(b)) return 64;
  let n = 0;
  for (let i = 0; i < 16; i++) {
    let x = parseInt(a[i], 16) ^ parseInt(b[i], 16);
    while (x) { n += x & 1; x >>= 1; }
  }
  return n;
}

/**
 * Near-identical: the same file re-saved, resized or recompressed. Blocks until a human checks.
 * Up to SIMILAR_DISTANCE the picture looks alike, but a genuine daily photo of the same strip on
 * the same table can score there too, so that only sends it to a reviewer without blocking it.
 */
export const REUSE_DISTANCE = 3;
export const SIMILAR_DISTANCE = 10;

/**
 * Difference hash from a 9x8 greyscale thumbnail (72 bytes, row by row): each bit says whether
 * a pixel is brighter than its right-hand neighbour. Robust to resizing and recompression.
 */
export function dhashFromPixels(px: ArrayLike<number>): string {
  if (px.length < 72) throw new Error("need_9x8_pixels");
  let out = "";
  for (let y = 0; y < 8; y++) {
    for (let half = 0; half < 2; half++) {
      let nib = 0;
      for (let k = 0; k < 4; k++) {
        const x = half * 4 + k;
        nib = (nib << 1) | (px[y * 9 + x] > px[y * 9 + x + 1] ? 1 : 0);
      }
      out += nib.toString(16);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Fresh-photo challenge: something an old or borrowed photo can't contain.
// ---------------------------------------------------------------------------
export type Challenge = { kind: "fingers"; value: string } | { kind: "code"; value: string };
const CODE_CHARS = "ACEFHKMNPRTWXY34679"; // easy to write and read back

export function newChallenge(rand: () => number = Math.random): Challenge {
  if (rand() < 0.7) return { kind: "fingers", value: String(1 + Math.floor(rand() * 5)) };
  const c = () => CODE_CHARS[Math.floor(rand() * CODE_CHARS.length)];
  return { kind: "code", value: `${c()}${c()}` };
}

/** What the AI is told to look for (English; the person sees it in their language). */
export function challengeForModel(c: Challenge): string {
  return c.kind === "fingers"
    ? `a hand showing exactly ${c.value} raised finger${c.value === "1" ? "" : "s"}`
    : `the characters "${c.value}" handwritten on paper`;
}

// ---------------------------------------------------------------------------
// Flags and proof level for one assessed photo / video
// ---------------------------------------------------------------------------
export interface Findings {
  kind: "photo" | "document" | "video" | "text" | "audio";
  category: string;
  outcome: "supports" | "partially_supports" | "does_not_support" | "unclear" | "not_applicable";
  reusedOwn?: boolean;
  /** The same file byte for byte (not just a look-alike). */
  reusedExact?: boolean;
  reusedOther?: boolean;
  similarOwn?: boolean;
  takenHoursAgo?: number | null;
  screenOrEdited?: boolean;
  labelMatch?: "yes" | "no" | "not_visible" | null;
  challengeIssued?: boolean;
  challengeMet?: boolean | null;
  actionObserved?: boolean;
  blisterEmpty?: number | null;
  previousBlisterEmpty?: number | null;
}

export function flagsFor(f: Findings): Flag[] {
  const out: Flag[] = [];
  // A near-identical look-alike that shows today's fresh-photo sign can't be an old copy:
  // only the exact same file stays a hard flag then.
  const fresh = f.challengeIssued && f.challengeMet === true;
  const reused = !!f.reusedExact || (!!f.reusedOwn && !fresh);
  if (reused) out.push("reused_photo");
  if (f.reusedOther) out.push("shared_photo");
  if (!reused && (f.similarOwn || f.reusedOwn)) out.push("similar_photo");
  if (f.takenHoursAgo !== null && f.takenHoursAgo !== undefined && f.takenHoursAgo > 36) out.push("old_photo");
  if (f.screenOrEdited) out.push("screen_photo");
  if (f.category === "medication" && f.labelMatch === "no") out.push("label_mismatch");
  if (f.challengeIssued && f.challengeMet === false && (f.kind === "photo" || f.kind === "video")) out.push("challenge_missed");
  if (typeof f.blisterEmpty === "number" && typeof f.previousBlisterEmpty === "number" && f.blisterEmpty < f.previousBlisterEmpty) out.push("blister_count_down");
  return out;
}

export function proofLevelFor(f: Findings, flags: readonly string[]): ProofLevel | null {
  if (flags.some(isHard)) return "flagged";
  if (f.outcome !== "supports" && f.outcome !== "partially_supports") return null;
  if (f.kind === "video" && f.actionObserved) return "video_action";
  if (f.kind === "photo" || f.kind === "video") return f.challengeIssued && f.challengeMet ? "photo_fresh" : "photo_ai";
  return null;
}

/** Share of accepted photos a human re-checks to measure the AI (default 7%). */
export function auditRate(env: string | undefined): number {
  const n = Number(env);
  return Number.isFinite(n) && n >= 0 && n <= 1 ? n : 0.07;
}

// ---------------------------------------------------------------------------
// Proof breakdown for doctors, family and the person
// ---------------------------------------------------------------------------
export interface ProofBreakdown { done: number; photo: number; fresh: number; human: number; flagged: number }

export function proofBreakdown(rows: readonly { status: string; proof_level: string | null }[]): ProofBreakdown {
  const done = rows.filter((r) => r.status === "self_reported" || r.status === "evidence_supported");
  const lvl = (r: { proof_level: string | null }) => r.proof_level;
  return {
    done: done.length,
    photo: done.filter((r) => ["photo_ai", "photo_fresh", "video_action", "human_verified"].includes(lvl(r) ?? "")).length,
    fresh: done.filter((r) => ["photo_fresh", "video_action", "human_verified"].includes(lvl(r) ?? "")).length,
    human: done.filter((r) => lvl(r) === "human_verified").length,
    flagged: rows.filter((r) => lvl(r) === "flagged").length,
  };
}
