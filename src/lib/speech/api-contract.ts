/**
 * Remote alignment API contract — `POST {base}/api/align` (contract version 1).
 *
 * The client sends the audio plus the fully worked-out Temani expectations (so the server needs
 * no Hebrew rules of its own) and receives phoneme-level boundaries. Anything the server leaves
 * out (accent contours, notes) is filled in locally from its precise timestamps.
 *
 * Request  → AlignRequest   (JSON; audio as base64 in the browser's recording container)
 * Response → AlignResponse  (JSON). HTTP 4xx/5xx or a malformed body → the client falls back to
 *                            the local engine and reports `fallbackFrom`.
 */
import type { VoiceProfile } from "@/lib/audio/voice-profile";
import type { VerseRef } from "@/lib/scripture";

export const ALIGN_CONTRACT_VERSION = 1 as const;
export const ALIGN_PATH = "/api/align";

export interface AlignExpectedSyllable {
  index: number;
  ipa: string;
  stressed: boolean;
  /** Relative expected duration (see expected.ts WEIGHTS). */
  weight: number;
}

export interface AlignExpectedWord {
  index: number;
  display: string;
  pointed: string;
  ipa: string;
  roman: string;
  syllables: AlignExpectedSyllable[];
  /** Governing cantillation mark id (config.ts TAAM_META ids) or null. */
  markId: string | null;
  /** True when the word ends a phrase (any required gesture). */
  disjunctive: boolean;
}

export interface AlignRequest {
  contractVersion: typeof ALIGN_CONTRACT_VERSION;
  tradition: "temani";
  verse: { ref: VerseRef; text: string };
  expected: AlignExpectedWord[];
  profile: VoiceProfile | null;
  audio: { mimeType: string; durationMs: number; base64: string };
}

export interface AlignPhone {
  /** IPA symbol as sent in `expected[].ipa`. */
  phone: string;
  start: number;
  end: number;
  /** Goodness-of-pronunciation 0..1, if the server scores phones. */
  score?: number;
}

export interface AlignSyllableSpan {
  index: number;
  start: number;
  end: number;
}

export interface AlignWord {
  index: number;
  /** null when the aligner could not find the word (omitted). */
  start: number | null;
  end: number | null;
  syllables: AlignSyllableSpan[];
  phones: AlignPhone[];
  /** Word-level pronunciation score 0..1 and Hebrew issue strings, if scored. */
  phonetic?: { score: number; issues: string[] } | null;
}

export interface AlignResponse {
  contractVersion: typeof ALIGN_CONTRACT_VERSION;
  engine: string; // server's own identifier, e.g. "mfa-3.1" / "wav2vec2-he-ctc"
  words: AlignWord[];
  /** Optional server-side pitch track (10 ms frames) — otherwise the client computes its own. */
  warnings?: string[];
}

export function isAlignResponse(v: unknown): v is AlignResponse {
  if (!v || typeof v !== "object") return false;
  const r = v as AlignResponse;
  return r.contractVersion === ALIGN_CONTRACT_VERSION && Array.isArray(r.words) && r.words.every((w) => typeof w.index === "number" && Array.isArray(w.syllables) && Array.isArray(w.phones));
}
