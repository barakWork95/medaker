import { hasHebrewLetters, stripFormatChars, toStamDisplay } from "@/lib/hebrew/unicode";
import { COMPOUND_TAAMIM, TAAMIM_BY_CODEPOINT, type GestureType, type TaamDefinition } from "./config";
import { resolveGesture, type ContextRuleId } from "./rules";

/** One touch target: a word (or maqaf-joined group) with its data-layer marks. */
export interface WordToken {
  id: string;
  index: number;
  /** Original pointed text (data layer) incl. trailing sof-pasuq / paseq. */
  pointed: string;
  /** STAM display text (letters only). */
  display: string;
  /** All mapped marks found on this token, in text order (deduplicated). */
  marks: TaamDefinition[];
  /** The single mark that decides the required gesture (highest rank), if any. */
  primaryMark: TaamDefinition | null;
  /**
   * Gesture the user must perform on this word — resolved IN VERSE CONTEXT by the
   * rule engine (rules.ts): a context rule override, else the mark's defaultGesture.
   */
  requiredGesture: GestureType;
  /** The context rule that overrode the default, if any. */
  appliedRule: ContextRuleId | null;
}

/** Standalone punctuation tokens that attach to the previous word. */
const ATTACH_TO_PREVIOUS_RE = /^[׀׃־׆]+$/;

/** True if `counts` holds every code point of `sequence`, with multiplicity. */
function containsSequence(counts: Map<number, number>, sequence: readonly number[]): boolean {
  const need = new Map<number, number>();
  for (const cp of sequence) need.set(cp, (need.get(cp) ?? 0) + 1);
  for (const [cp, n] of need) if ((counts.get(cp) ?? 0) < n) return false;
  return true;
}

/**
 * Extract mapped marks from a token, in text order, deduplicated by code point.
 * Compound marks (config COMPOUND_TAAMIM, e.g. תרין פשטין = U+05A8 + U+0599, or U+0599 twice
 * in WLC) replace their component marks: the compound takes the first component's position.
 */
export function marksOf(pointed: string): TaamDefinition[] {
  const singles: TaamDefinition[] = [];
  const counts = new Map<number, number>();
  for (const ch of pointed.normalize("NFD")) {
    const cp = ch.codePointAt(0)!;
    const def = TAAMIM_BY_CODEPOINT.get(cp);
    if (!def) continue;
    if (!counts.has(cp)) singles.push(def);
    counts.set(cp, (counts.get(cp) ?? 0) + 1);
  }

  let out = singles;
  for (const compound of COMPOUND_TAAMIM) {
    const sequence = [compound.codePoints, ...compound.alternateSequences].find((seq) => containsSequence(counts, seq));
    if (!sequence) continue;
    const parts = new Set(sequence);
    const at = out.findIndex((m) => parts.has(m.codePoint));
    out = out.filter((m) => !parts.has(m.codePoint));
    out.splice(at, 0, compound);
  }
  return out;
}

/**
 * Choose the mark that governs the required gesture:
 * the mark with a non-NONE default and the lowest (strongest) rank; ties → first in text order.
 */
export function primaryMarkOf(marks: TaamDefinition[]): TaamDefinition | null {
  let best: TaamDefinition | null = null;
  for (const m of marks) {
    if (m.defaultGesture === "NONE") continue;
    if (!best || m.rank < best.rank) best = m;
  }
  return best;
}

export function tokenizeVerse(verse: string, idPrefix = "w"): WordToken[] {
  const parts = stripFormatChars(verse.normalize("NFD")).trim().split(/\s+/).filter(Boolean);

  // Merge standalone punctuation (׀ ׃ ־) into the preceding word.
  const merged: string[] = [];
  for (const part of parts) {
    if (merged.length && (ATTACH_TO_PREVIOUS_RE.test(part) || !hasHebrewLetters(part))) {
      merged[merged.length - 1] += part;
    } else {
      merged.push(part);
    }
  }

  // Pass 1: per-word data (marks, governing mark).
  const tokens: WordToken[] = merged.map((pointed, index) => {
    const marks = marksOf(pointed);
    return {
      id: `${idPrefix}-${index}`,
      index,
      pointed,
      display: toStamDisplay(pointed),
      marks,
      primaryMark: primaryMarkOf(marks),
      requiredGesture: "NONE",
      appliedRule: null,
    };
  });
  // Pass 2: resolve gestures with the whole verse as context.
  for (const token of tokens) {
    const resolved = resolveGesture(tokens, token.index);
    token.requiredGesture = resolved.gesture;
    token.appliedRule = resolved.rule;
  }
  return tokens;
}
