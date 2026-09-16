import { hasHebrewLetters, stripFormatChars, toStamDisplay } from "@/lib/hebrew/unicode";
import { TAAMIM_BY_CODEPOINT, type GestureType, type TaamDefinition } from "./config";
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

/** Extract mapped marks from a token, in order, deduplicated by code point. */
export function marksOf(pointed: string): TaamDefinition[] {
  const out: TaamDefinition[] = [];
  const seen = new Set<number>();
  for (const ch of pointed.normalize("NFD")) {
    const cp = ch.codePointAt(0)!;
    const def = TAAMIM_BY_CODEPOINT.get(cp);
    if (def && !seen.has(cp)) {
      seen.add(cp);
      out.push(def);
    }
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
