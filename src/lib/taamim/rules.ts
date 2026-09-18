/**
 * Context rule engine.
 *
 * A word's required gesture is not decided by its mark alone: the sheet attaches an
 * ordered chain of (contextRule → expectedGesture) pairs to some marks. This module
 * implements each rule identifier against the full verse (all tokens) and resolves
 * the gesture for one word:
 *
 *   resolveGesture(tokens, i) →
 *     mark = tokens[i].primaryMark (strongest disjunctive on the word)
 *     for rule of mark.rules (sheet order): if CONTEXT_RULES[rule.id](ctx) → rule.expectedGesture
 *     else mark.defaultGesture
 *
 * Adding a rule = (1) register its Hebrew text → id in scripts/import-taamim.mjs,
 * (2) add the id to ContextRuleId and its evaluator to CONTEXT_RULES here,
 * (3) `npm run import:taamim`, (4) add a case to rules.test.ts.
 */
import type { GestureType, TaamDefinition } from "./config";
import type { WordToken } from "./tokenize";

export type ContextRuleId = "LAST_MAJOR_BEFORE_SOF_PASUK" | "NEXT_MAJOR_IS_REVIA_WITHOUT_PASEK";

const REVIA = 0x0597;
const PASEQ = 0x05c0;
const SOF_PASUQ = 0x05c3;

/**
 * "Major" = an ACCENT whose DEFAULT gesture is triple-tap or long-press (sheet wording:
 * "הטעם … מסוג (triple-tap / long-press)"). Sof pasuq (׃) is the verse terminator the rules
 * measure up to, not one of the accents — it is never major, whatever its own gesture is.
 */
export function isMajorMark(mark: TaamDefinition): boolean {
  if (mark.codePoint === SOF_PASUQ) return false;
  return mark.defaultGesture === "TRIPLE_TAP" || mark.defaultGesture === "LONG_PRESS";
}

/** A mark occurrence in verse order. */
export interface MarkPosition {
  tokenIndex: number;
  mark: TaamDefinition;
}

/** Flatten the verse into marks in reading order (each token's marks in text order). */
export function markSequence(tokens: readonly WordToken[]): MarkPosition[] {
  const seq: MarkPosition[] = [];
  tokens.forEach((t, tokenIndex) => {
    for (const mark of t.marks) seq.push({ tokenIndex, mark });
  });
  return seq;
}

export interface RuleContext {
  tokens: readonly WordToken[];
  /** Index of the word being evaluated. */
  index: number;
  /** The governing mark of that word. */
  mark: TaamDefinition;
  /** Whole-verse mark sequence and the position of `mark` within it. */
  sequence: MarkPosition[];
  position: number;
}

export interface ContextRuleSpec {
  /** Short Hebrew description for reports / hints. */
  labelHe: string;
  describe: string;
  evaluate: (ctx: RuleContext) => boolean;
}

export const CONTEXT_RULES: Record<ContextRuleId, ContextRuleSpec> = {
  LAST_MAJOR_BEFORE_SOF_PASUK: {
    labelHe: "הטעם המפסיק האחרון לפני סוף פסוק",
    describe:
      "Scanning forward, sof pasuq (U+05C3) is reached before any other major accent (triple-tap / long-press by default).",
    evaluate({ sequence, position }) {
      for (let p = position + 1; p < sequence.length; p++) {
        const m = sequence[p].mark;
        if (m.codePoint === SOF_PASUQ) return true;
        if (isMajorMark(m)) return false;
      }
      return false; // no sof pasuq in this text → not a complete verse, rule does not apply
    },
  },
  NEXT_MAJOR_IS_REVIA_WITHOUT_PASEK: {
    labelHe: "הטעם המפסיק הבא הוא רביע ללא פסק ביניהם",
    describe:
      "The next major mark (triple-tap / long-press by default) after this one is revia (U+0597) and no paseq (U+05C0) occurs between them.",
    evaluate({ sequence, position }) {
      for (let p = position + 1; p < sequence.length; p++) {
        const m = sequence[p].mark;
        if (m.codePoint === PASEQ) return false;
        if (isMajorMark(m)) return m.codePoint === REVIA;
      }
      return false;
    },
  },
};

export interface ResolvedGesture {
  gesture: GestureType;
  mark: TaamDefinition | null;
  /** The rule that overrode the default, if any. */
  rule: ContextRuleId | null;
}

/**
 * Resolve the required gesture of tokens[index] in the context of the whole verse.
 * `primaryMark` must already be set on the tokens (tokenizeVerse does this).
 */
export function resolveGesture(tokens: readonly WordToken[], index: number): ResolvedGesture {
  const token = tokens[index];
  const mark = token?.primaryMark ?? null;
  if (!mark) return { gesture: "NONE", mark: null, rule: null };

  const sequence = markSequence(tokens);
  const position = sequence.findIndex((p) => p.tokenIndex === index && p.mark === mark);
  const ctx: RuleContext = { tokens, index, mark, sequence, position };

  for (const rule of mark.rules) {
    if (CONTEXT_RULES[rule.id].evaluate(ctx)) {
      return { gesture: rule.expectedGesture, mark, rule: rule.id };
    }
  }
  return { gesture: mark.defaultGesture, mark, rule: null };
}
