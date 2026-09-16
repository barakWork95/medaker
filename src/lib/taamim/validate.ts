import { GESTURE_LABELS_HE, type GestureType, type RecognizedGesture } from "./config";
import { CONTEXT_RULES, resolveGesture, type ContextRuleId } from "./rules";
import type { WordToken } from "./tokenize";

export interface ValidationResult {
  correct: boolean;
  expected: GestureType;
  received: RecognizedGesture;
  /** Context rule that produced `expected`, if any. */
  rule: ContextRuleId | null;
  /** Human readable explanation (Hebrew) for feedback / exam reports. */
  message: string;
}

/**
 * Context-aware validation of the word at `index` within its verse.
 * The expected gesture is resolved live by the rule engine from ALL tokens:
 *  - A word whose resolved gesture is NONE must receive no gesture: any real gesture is an error.
 *  - Otherwise the received gesture must equal the resolved gesture exactly.
 *  - Single/double TAP and UNKNOWN are never attempts (see isAttempt()).
 */
export function validateGestureInContext(
  tokens: readonly WordToken[],
  index: number,
  received: RecognizedGesture,
): ValidationResult {
  const { gesture: expected, mark, rule } = resolveGesture(tokens, index);
  const markName = mark ? mark.nameHe : "ללא טעם מפסיק";
  const ruleNote = rule ? ` (${CONTEXT_RULES[rule].labelHe})` : "";

  if (expected === "NONE") {
    return {
      correct: false,
      expected,
      received,
      rule,
      message: `במילה זו אין טעם הדורש מחווה (${markName})`,
    };
  }
  const correct = received === expected;
  return {
    correct,
    expected,
    received,
    rule,
    message: correct
      ? `נכון! ${markName}${ruleNote} — ${GESTURE_LABELS_HE[expected]}`
      : `${markName}${ruleNote} דורש ${GESTURE_LABELS_HE[expected]}`,
  };
}

/**
 * Validate against the gesture that tokenizeVerse already resolved in context
 * (`token.requiredGesture` / `token.appliedRule`). Prefer validateGestureInContext
 * when the surrounding tokens are at hand; both give identical results for tokens
 * produced by tokenizeVerse.
 */
export function validateGesture(token: WordToken, received: RecognizedGesture): ValidationResult {
  const expected = token.requiredGesture;
  const rule = token.appliedRule;
  const markName = token.primaryMark ? token.primaryMark.nameHe : "ללא טעם מפסיק";
  const ruleNote = rule ? ` (${CONTEXT_RULES[rule].labelHe})` : "";
  if (expected === "NONE") {
    return { correct: false, expected, received, rule, message: `במילה זו אין טעם הדורש מחווה (${markName})` };
  }
  const correct = received === expected;
  return {
    correct,
    expected,
    received,
    rule,
    message: correct
      ? `נכון! ${markName}${ruleNote} — ${GESTURE_LABELS_HE[expected]}`
      : `${markName}${ruleNote} דורש ${GESTURE_LABELS_HE[expected]}`,
  };
}

/** TAP (1–2 taps) and UNKNOWN strokes are not counted as attempts. */
export function isAttempt(received: RecognizedGesture): received is GestureType {
  return received !== "TAP" && received !== "UNKNOWN" && received !== "NONE";
}

/* ---------- Exam scoring ---------- */

export interface ExamWordResult {
  token: WordToken;
  expected: GestureType;
  received: RecognizedGesture | null;
  status: "correct" | "wrong" | "missed" | "false-positive" | "ok-none";
}

export interface ExamReport {
  results: ExamWordResult[];
  required: number;
  correct: number;
  wrong: number;
  missed: number;
  falsePositives: number;
  /** 0..100 — correct / required, minus a penalty for gestures on NONE words. */
  accuracy: number;
}

export function scoreExam(
  tokens: WordToken[],
  attempts: Map<string, RecognizedGesture>,
): ExamReport {
  const results: ExamWordResult[] = tokens.map((token) => {
    const received = attempts.get(token.id) ?? null;
    const expected = token.requiredGesture;
    let status: ExamWordResult["status"];
    if (expected === "NONE") status = received ? "false-positive" : "ok-none";
    else if (!received) status = "missed";
    else status = received === expected ? "correct" : "wrong";
    return { token, expected, received, status };
  });

  const count = (s: ExamWordResult["status"]) => results.filter((r) => r.status === s).length;
  const required = results.filter((r) => r.expected !== "NONE").length;
  const correct = count("correct");
  const falsePositives = count("false-positive");
  const denominator = required + falsePositives;
  const accuracy = denominator === 0 ? 100 : Math.round((correct / denominator) * 100);

  return {
    results,
    required,
    correct,
    wrong: count("wrong"),
    missed: count("missed"),
    falsePositives,
    accuracy,
  };
}
