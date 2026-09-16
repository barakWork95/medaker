/**
 * Cantillation (ta'amim) → gesture mapping.
 *
 * Source of truth: `data/taamim-mapping.xlsx` (the user's "טעמי המקרא-Medaker.xlsx"),
 * imported by `npm run import:taamim` into `taamim.generated.json`. That file carries
 * name, code point, defaultGesture and the ordered contextRule chain per mark.
 * This module adds what the sheet does not have (stable ids, English names, ranks)
 * and re-exports everything typed. Do not hand-edit the generated JSON.
 */
import generated from "./taamim.generated.json";
import type { ContextRuleId } from "./rules";

export type GestureType =
  | "NONE" //              ללא — no gesture required
  | "LONG_PRESS" //        לחיצה ארוכה (≈0.5s)
  | "DIAGONAL" //          אלכסון יורד "\" (down & right)
  | "TRIPLE_TAP" //        הקשה משולשת
  | "ZIGZAG" //            קשקוש כלפי מעלה
  | "TILDE" //             גל ~ / אינפיניטי ∞ מימין לשמאל
  | "SWIPE_DOWN" //        החלקה למטה (סוף פסוק)
  | "SWIPE_DOWN_TWICE"; // החלקה למטה פעמיים ברצף, אצבע אחת (הטעם המפסיק האחרון לפני סוף פסוק)

export const GESTURE_TYPES: readonly GestureType[] = [
  "NONE",
  "LONG_PRESS",
  "DIAGONAL",
  "TRIPLE_TAP",
  "ZIGZAG",
  "TILDE",
  "SWIPE_DOWN",
  "SWIPE_DOWN_TWICE",
];

/** What the recognizer can emit. TAP (1–2 taps) and UNKNOWN are never "required". */
export type RecognizedGesture = GestureType | "TAP" | "UNKNOWN";

export const GESTURE_LABELS_HE: Record<GestureType, string> = {
  NONE: "ללא מחווה",
  LONG_PRESS: "לחיצה ארוכה",
  DIAGONAL: "אלכסון יורד (\\)",
  TRIPLE_TAP: "הקשה משולשת",
  ZIGZAG: "קשקוש כלפי מעלה",
  TILDE: "גל ~ / ∞ מימין לשמאל",
  SWIPE_DOWN: "החלקה למטה",
  SWIPE_DOWN_TWICE: "החלקה למטה, ושוב החלקה למטה",
};

export const GESTURE_ICONS: Record<GestureType, string> = {
  NONE: "·",
  LONG_PRESS: "●",
  DIAGONAL: "\\",
  TRIPLE_TAP: "⁝",
  ZIGZAG: "⩘",
  TILDE: "∿",
  SWIPE_DOWN: "↓",
  SWIPE_DOWN_TWICE: "↓↓",
};

/** A conditional rule attached to a mark (sheet columns contextRule / expectedGesture). */
export interface ContextRule {
  id: ContextRuleId;
  expectedGesture: GestureType;
  /** The Hebrew text from the sheet, for reports and docs. */
  sourceText: string;
}

export interface TaamDefinition {
  /** Stable id (transliterated), used as key in reports. */
  id: string;
  codePoint: number;
  /** The combining character itself, e.g. "֖". */
  char: string;
  nameHe: string;
  nameEn: string;
  /** Gesture when no context rule fires. */
  defaultGesture: GestureType;
  /** Ordered rule chain; first rule whose condition holds wins. */
  rules: readonly ContextRule[];
  /**
   * Disjunctive rank — lower = stronger pause. Used to choose ONE governing mark
   * when a word carries several marks (e.g. meteg + sof pasuq).
   * 0 emperors · 1 kings · 2 dukes · 3 counts · 4 paseq · 9 conjunctive/other.
   */
  rank: number;
}

/** Data the sheet does not carry, keyed by 4-digit hex code point. */
const TAAM_META: Record<string, { id: string; nameEn: string; rank: number }> = {
  "0591": { id: "etnahta", nameEn: "Etnahta", rank: 0 },
  "0592": { id: "segol", nameEn: "Segolta", rank: 1 },
  "0593": { id: "shalshelet", nameEn: "Shalshelet", rank: 1 },
  "0594": { id: "zaqef-qatan", nameEn: "Zaqef Qatan", rank: 1 },
  "0595": { id: "zaqef-gadol", nameEn: "Zaqef Gadol", rank: 1 },
  "0596": { id: "tipeha", nameEn: "Tipeha", rank: 1 },
  "0597": { id: "revia", nameEn: "Revia", rank: 2 },
  "0598": { id: "tsinnorit", nameEn: "Tsinnorit (U+0598 ZARQA)", rank: 3 },
  "0599": { id: "pashta", nameEn: "Pashta", rank: 9 },
  "059A": { id: "yetiv", nameEn: "Yetiv", rank: 2 },
  "059B": { id: "tevir", nameEn: "Tevir", rank: 2 },
  "059C": { id: "geresh", nameEn: "Geresh", rank: 3 },
  "059D": { id: "geresh-muqdam", nameEn: "Geresh Muqdam", rank: 3 },
  "059E": { id: "gershayim", nameEn: "Gershayim", rank: 3 },
  "059F": { id: "qarney-para", nameEn: "Qarney Para", rank: 3 },
  "05A0": { id: "telisha-gedola", nameEn: "Telisha Gedola", rank: 3 },
  "05A1": { id: "pazer", nameEn: "Pazer", rank: 3 },
  "05A2": { id: "atnah-hafukh", nameEn: "Atnah Hafukh", rank: 3 },
  "05A3": { id: "munah", nameEn: "Munah", rank: 9 },
  "05A4": { id: "mahapakh", nameEn: "Mahapakh", rank: 9 },
  "05A5": { id: "merkha", nameEn: "Merkha", rank: 9 },
  "05A6": { id: "merkha-kefula", nameEn: "Merkha Kefula", rank: 9 },
  "05A7": { id: "darga", nameEn: "Darga", rank: 9 },
  "05A8": { id: "qadma", nameEn: "Qadma", rank: 9 },
  "05A9": { id: "telisha-qetana", nameEn: "Telisha Qetana", rank: 9 },
  "05AA": { id: "yerah-ben-yomo", nameEn: "Yerah Ben Yomo", rank: 3 },
  "05AB": { id: "ole", nameEn: "Ole", rank: 9 },
  "05AC": { id: "iluy", nameEn: "Iluy", rank: 9 },
  "05AD": { id: "dehi", nameEn: "Dehi", rank: 3 },
  "05AE": { id: "zarqa", nameEn: "Zarqa (U+05AE ZINOR)", rank: 2 },
  "05AF": { id: "masora-circle", nameEn: "Masora Circle", rank: 9 },
  "05BD": { id: "meteg", nameEn: "Meteg", rank: 9 },
  "05BE": { id: "maqaf", nameEn: "Maqaf", rank: 9 },
  "05C0": { id: "paseq", nameEn: "Paseq", rank: 4 },
  "05C3": { id: "sof-pasuq", nameEn: "Sof Pasuq", rank: 0 },
};

function asGesture(value: string, where: string): GestureType {
  if ((GESTURE_TYPES as readonly string[]).includes(value)) return value as GestureType;
  throw new Error(`taamim.generated.json: ${where}: unknown gesture "${value}"`);
}

/** The full table from the sheet, in sheet order, enriched with meta. */
export const TAAMIM: readonly TaamDefinition[] = generated.marks.map((m) => {
  const meta = TAAM_META[m.hex];
  if (!meta) throw new Error(`taamim.generated.json: no TAAM_META for U+${m.hex} (${m.nameHe}) — add it in config.ts`);
  return {
    id: meta.id,
    codePoint: m.codePoint,
    char: String.fromCodePoint(m.codePoint),
    nameHe: m.nameHe,
    nameEn: meta.nameEn,
    defaultGesture: asGesture(m.defaultGesture, m.hex),
    rules: m.rules.map((r) => ({
      id: r.id as ContextRuleId,
      expectedGesture: asGesture(r.expectedGesture, `${m.hex} rule ${r.id}`),
      sourceText: r.sourceText,
    })),
    rank: meta.rank,
  };
});

/** code point → definition. */
export const TAAMIM_BY_CODEPOINT: ReadonlyMap<number, TaamDefinition> = new Map(
  TAAMIM.map((t) => [t.codePoint, t]),
);

export const TAAMIM_BY_ID: ReadonlyMap<string, TaamDefinition> = new Map(
  TAAMIM.map((t) => [t.id, t]),
);

/** Regex matching every code point that carries a mapping (marks + paseq/maqaf/sof-pasuq). */
export const MAPPED_CODEPOINTS_RE = new RegExp(
  "[" + TAAMIM.map((t) => "\\u" + t.codePoint.toString(16).padStart(4, "0")).join("") + "]",
  "g",
);

/** Gesture-timing / geometry defaults shared by recognizer, tuning panel and docs. */
export const GESTURE_CONFIG = {
  /** Long press duration in ms. */
  longPressMs: 500,
  /** Max gap between consecutive taps for a multi-tap (ms). */
  tapGapMs: 500,
  /** Max single-tap duration (ms) — longer and it is a press, not a tap. */
  tapMaxMs: 300,
  /** Pointer may wobble this many px and still count as a tap / press. */
  tapSlopPx: 10,
  /** Strokes shorter than this (px path length) are ignored. */
  minStrokePx: 24,
  /** Zigzag: minimum X direction changes. */
  zigzagMinChanges: 3,
  /** Hysteresis (px) when counting direction changes. */
  directionHysteresisPx: 8,
  /** Diagonal: accepted angle window (degrees below the +x axis, screen coords). */
  diagonalMinDeg: 20,
  diagonalMaxDeg: 70,
  /** Swipe-down: accepted deviation from straight down (±deg). */
  swipeDownToleranceDeg: 20,
  /** Max gap between the end of one swipe-down and the start of the next for SWIPE_DOWN_TWICE (ms). */
  swipeTwiceGapMs: 600,
  /** $1 recognizer acceptance score (0..1). */
  dollarOneMinScore: 0.7,
  /** $1 bounded rotation search (±deg) — keeps "\" distinct from "/". */
  dollarOneAngleRangeDeg: 20,
} as const;
