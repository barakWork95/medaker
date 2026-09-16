"use client";

/**
 * TaamWord — a single Torah word as a touch target with context-aware
 * gesture validation.
 *
 * The component owns the pointer state machine (via useGestureRecognizer) and
 * validates the recognized gesture IN VERSE CONTEXT: it receives the whole token
 * list plus its own index and asks the rule engine (validateGestureInContext) for the
 * expected gesture, so context rules such as "last major mark before sof pasuq" or
 * "geresh before revia" are honoured. The parent owns progression state (`status`).
 *
 *   <TaamWord tokens={tokens} index={i} status="target" feedback="immediate" onResult={...} />
 */
import { useEffect, useRef, useState } from "react";
import type { WordToken } from "@/lib/taamim/tokenize";
import { isAttempt, validateGestureInContext, type ValidationResult } from "@/lib/taamim/validate";
import { useGestureRecognizer, type GestureEvent } from "@/lib/gestures/useGestureRecognizer";
import { GESTURE_LABELS_HE, type RecognizedGesture } from "@/lib/taamim/config";

export type WordStatus =
  | "idle" //     not yet reachable
  | "target" //   the word the learner should act on now
  | "done" //     completed (practice)
  | "answered" // exam: a gesture has been recorded (no correctness shown)
  | "locked"; //  no interaction

export interface TaamWordProps {
  /** All tokens of the verse — the context the rule engine evaluates against. */
  tokens: readonly WordToken[];
  /** Index of this word within `tokens`. */
  index: number;
  status: WordStatus;
  /** "immediate" flashes green/red (practice); "silent" records only (exam). */
  feedback: "immediate" | "silent";
  /** Show the pointed text (vowels + cantillation) instead of STAM. */
  hint?: boolean;
  /** Allow gestures on words that are not the current target (exam mode). */
  acceptAnyWord?: boolean;
  onResult?: (token: WordToken, gesture: RecognizedGesture, result: ValidationResult) => void;
  /** Non-attempt events (single/double tap, unknown stroke) for UI hints. */
  onNonAttempt?: (token: WordToken, event: GestureEvent) => void;
}

export function TaamWord({
  tokens,
  index,
  status,
  feedback,
  hint = false,
  acceptAnyWord = false,
  onResult,
  onNonAttempt,
}: TaamWordProps) {
  const token = tokens[index];
  const [flash, setFlash] = useState<"correct" | "incorrect" | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (flashTimer.current) clearTimeout(flashTimer.current);
  }, []);

  const interactive = status === "target" || (acceptAnyWord && status !== "locked");

  const handlers = useGestureRecognizer({
    disabled: !interactive,
    debugId: token.id,
    onGesture(event) {
      if (!isAttempt(event.gesture)) {
        onNonAttempt?.(token, event);
        return;
      }
      const result = validateGestureInContext(tokens, index, event.gesture);
      if (feedback === "immediate") {
        setFlash(result.correct ? "correct" : "incorrect");
        if (flashTimer.current) clearTimeout(flashTimer.current);
        flashTimer.current = setTimeout(() => setFlash(null), result.correct ? 700 : 600);
      }
      onResult?.(token, event.gesture, result);
    },
  });

  const text = hint ? token.pointed : token.display;
  const label = `${token.display} — ${
    token.requiredGesture === "NONE" ? "ללא מחווה" : GESTURE_LABELS_HE[token.requiredGesture]
  }`;

  const classes = [
    // Same font, size and metrics whether or not the hint is on — only the glyph string changes.
    "gesture-target font-stam inline-block rounded-md px-1.5 py-0.5 leading-none transition-colors duration-200",
    "text-ink",
    status === "target" && "bg-gold/25 shadow-[inset_0_-3px_0_0_var(--color-gold)]",
    status === "done" && "text-ink/60",
    status === "answered" && "shadow-[inset_0_-3px_0_0_var(--color-navy-700)]",
    status === "locked" && "cursor-default",
    !interactive && "cursor-default",
    flash === "correct" && "bg-correct/30 animate-flash-correct",
    flash === "incorrect" && "bg-incorrect/30 animate-flash-incorrect",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <span
      role="button"
      aria-label={label}
      aria-disabled={!interactive}
      data-word-id={token.id}
      data-status={status}
      data-required={token.requiredGesture}
      className={classes}
      {...handlers}
    >
      {text}
    </span>
  );
}
