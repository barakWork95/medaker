/**
 * The "expected" side of alignment: verse tokens → words → syllables with duration weights.
 * Reuses tokenizeVerse (context rules) and the Temani transcriber.
 */
import { tokenizeVerse, type WordToken } from "@/lib/taamim/tokenize";
import { transcribeToken, type PhoneticWord } from "./temani-phonetics";

export interface ExpectedSyllable {
  wordIndex: number;
  /** Position within the word. */
  index: number;
  ipa: string;
  stressed: boolean;
  /** Relative expected duration (1 = plain syllable). */
  weight: number;
  /** Expected silence after this syllable, in weight units (pause after disjunctives). */
  pauseAfter: number;
}

export interface ExpectedWord {
  index: number;
  token: WordToken;
  display: string;
  pointed: string;
  parts: PhoneticWord[];
  ipa: string;
  roman: string;
  syllables: ExpectedSyllable[];
  /** Sum of syllable weights (+ pause). */
  weight: number;
  /** True when the word carries a disjunctive (any required gesture). */
  disjunctive: boolean;
}

export const WEIGHTS = {
  plain: 1,
  stressed: 1.35,
  /** Extra on the final syllable of a disjunctive word (the melisma / pause lands there). */
  disjunctiveFinal: 1.6,
  pauseAfterDisjunctive: 0.6,
  pauseAfterWord: 0.15,
} as const;

export function buildExpectedWords(text: string): ExpectedWord[] {
  const tokens = tokenizeVerse(text, "exp");
  return tokens.map((token, index) => {
    const parts = transcribeToken(token.pointed);
    const disjunctive = token.requiredGesture !== "NONE";
    const syllables: ExpectedSyllable[] = [];
    parts.forEach((part, p) => {
      part.syllables.forEach((s, i) => {
        const lastOfWord = p === parts.length - 1 && i === part.syllables.length - 1;
        let weight: number = s.stressed ? WEIGHTS.stressed : WEIGHTS.plain;
        if (lastOfWord && disjunctive) weight = Math.max(weight, WEIGHTS.disjunctiveFinal);
        syllables.push({
          wordIndex: index,
          index: syllables.length,
          ipa: s.phonemes.map((x) => x.ipa).join(""),
          stressed: s.stressed,
          weight,
          pauseAfter: lastOfWord ? (disjunctive ? WEIGHTS.pauseAfterDisjunctive : WEIGHTS.pauseAfterWord) : 0,
        });
      });
    });
    return {
      index,
      token,
      display: token.display,
      pointed: token.pointed,
      parts,
      ipa: parts.map((p) => p.ipa).join(" "),
      roman: parts.map((p) => p.roman).join("-"),
      syllables,
      weight: syllables.reduce((a, s) => a + s.weight + s.pauseAfter, 0),
      disjunctive,
    };
  });
}
