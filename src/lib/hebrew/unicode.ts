/**
 * Hebrew Unicode utilities for Medaker.
 *
 * Two layers of text exist in the app:
 *   - DATA layer  : the fully pointed verse (letters + nikkud + ta'amim) as stored.
 *   - DISPLAY layer: "STAM" text — letters only, like a Sefer Torah.
 *
 * All regexes below are built from Unicode code-point ranges of the Hebrew
 * block (U+0590–U+05FF). See CLAUDE.md → "Unicode handling rules".
 */

/** Cantillation marks (ta'amim): U+0591 ETNAHTA … U+05AF MASORA CIRCLE. */
export const CANTILLATION_RE = /[֑-֯]/g;

/**
 * Points (nikkud) and point-like marks:
 *  U+05B0–U+05BB vowels, U+05BC dagesh/mapiq, U+05BD meteg, U+05BF rafe,
 *  U+05C1/U+05C2 shin/sin dot, U+05C4/U+05C5 upper/lower dot, U+05C7 qamats qatan.
 */
export const POINTS_RE = /[ְ-ׇֽֿׁׂׅׄ]/g;

/**
 * Punctuation that is NOT written in a Torah scroll:
 *  U+05C0 PASEQ, U+05C3 SOF PASUQ, U+05C6 NUN HAFUKHA.
 * (They stay in the data layer — sof pasuq and paseq carry gestures.)
 */
export const NON_STAM_PUNCT_RE = /[׀׃׆]/g;

/** U+05BE MAQAF — joins words into one accentual unit. Rendered as a space in STAM. */
export const MAQAF = "־";
export const MAQAF_RE = /־/g;

/**
 * Invisible format characters that often appear inside pointed Hebrew:
 *  U+034F CGJ (orders marks), U+200C/D ZWNJ/ZWJ, U+200E/F LRM/RLM, U+FEFF BOM.
 */
export const FORMAT_CHARS_RE = /[͏‌-‏﻿]/g;

/** Any Hebrew letter (U+05D0 ALEF … U+05EA TAV). */
export const HEBREW_LETTER_RE = /[א-ת]/;

/** Everything that is a combining mark on a Hebrew base letter. */
export const ALL_MARKS_RE = /[֑-ׇֽֿׁׂׅׄ]/g;

export function stripCantillation(text: string): string {
  return text.replace(CANTILLATION_RE, "");
}

export function stripPoints(text: string): string {
  return text.replace(POINTS_RE, "");
}

export function stripFormatChars(text: string): string {
  return text.replace(FORMAT_CHARS_RE, "");
}

/**
 * Convert pointed text to the STAM display form:
 * letters only, no nikkud, no ta'amim, no sof-pasuq/paseq, maqaf → space.
 * Whitespace runs are collapsed so the result is stable for layout.
 */
export function toStamDisplay(text: string): string {
  return text
    .normalize("NFD")
    .replace(FORMAT_CHARS_RE, "")
    .replace(ALL_MARKS_RE, "")
    .replace(NON_STAM_PUNCT_RE, "")
    .replace(MAQAF_RE, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Keep vowels but drop cantillation — used when a "vowels only" hint level is
 * wanted (not the default hint, which shows everything).
 */
export function toVowelsOnly(text: string): string {
  return stripFormatChars(text.normalize("NFD")).replace(CANTILLATION_RE, "");
}

/** Unique code points of cantillation marks in `text`, in order of first appearance. */
export function extractCantillation(text: string): number[] {
  const seen = new Set<number>();
  const out: number[] = [];
  for (const ch of text.normalize("NFD")) {
    const cp = ch.codePointAt(0)!;
    if (cp >= 0x0591 && cp <= 0x05af && !seen.has(cp)) {
      seen.add(cp);
      out.push(cp);
    }
  }
  return out;
}

/** True if the token contains at least one Hebrew letter (i.e. is a real word). */
export function hasHebrewLetters(text: string): boolean {
  return HEBREW_LETTER_RE.test(text);
}

/** Format a code point as "U+05XX" for logs, reports and CLAUDE.md tables. */
export function formatCodePoint(cp: number): string {
  return "U+" + cp.toString(16).toUpperCase().padStart(4, "0");
}
