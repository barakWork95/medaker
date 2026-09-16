/**
 * Sample verses — Westminster Leningrad Codex text.
 *
 * Source of truth is `verses.json`. Every entry is verified against Sefaria's
 * "Tanach with Ta'amei Hamikra" (WLC) version by `npm run verify:verses`, which
 * also refreshes the offline snapshot `verses.wlc.json` used by `verses.test.ts`.
 * Zarqa is encoded as U+05AE (ZINOR) as in WLC/Sefaria.
 */
import data from "./verses.json";

export interface Verse {
  id: string;
  /** Hebrew reference for display. */
  ref: string;
  /** Sefaria-style reference used for verification, e.g. "Genesis 1:1". */
  sefariaRef: string;
  /** Fully pointed text (letters + nikkud + ta'amim + sof pasuq). */
  text: string;
}

export const VERSES: Verse[] = data;
