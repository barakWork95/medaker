"use client";

/**
 * Trainer — Practice / Exam orchestration over ONE verse.
 *
 * The verse comes from scripture navigation (MedakerApp/useScripture); the parent
 * remounts this component with `key={refToKey(ref)}` so all practice/exam state
 * resets whenever the verse changes. Tokens are derived from `text` via tokenizeVerse,
 * which runs the context rule engine — so navigation and validation are always in sync.
 *
 * Practice: the target word is highlighted; NONE-words are auto-completed;
 *           immediate green/red feedback; auto-advances to the next verse (onNext).
 * Exam:     no highlight, no feedback; last gesture per word is recorded;
 *           "סיים" produces an ExamReport.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { formatRefHe, type VerseRef } from "@/lib/scripture";
import { tokenizeVerse, type WordToken } from "@/lib/taamim/tokenize";
import { scoreExam, type ExamReport as Report, type ValidationResult } from "@/lib/taamim/validate";
import { GESTURE_LABELS_HE, type RecognizedGesture } from "@/lib/taamim/config";
import { CONTEXT_RULES } from "@/lib/taamim/rules";
import { TaamWord, type WordStatus } from "./TaamWord";
import { VerseScroll } from "./VerseScroll";
import { GestureLegend } from "./GestureLegend";
import { ExamReport } from "./ExamReport";
import { TuningPanel } from "./TuningPanel";
import { MicIcon } from "./audio/AudioRecorder";
import { VerseRecorder } from "./audio/VerseRecorder";
import { useUrlFlag } from "@/lib/useUrlFlag";

type Mode = "practice" | "exam";

export interface TrainerProps {
  verseRef: VerseRef;
  /** Fully pointed verse text. */
  text: string;
  onNext?: () => void;
  onPrev?: () => void;
  /** Opens the voice-calibration sheet (owned by MedakerApp). */
  onCalibrate?: () => void;
}

export function Trainer({ verseRef, text, onNext, onPrev, onCalibrate }: TrainerProps) {
  const [mode, setMode] = useState<Mode>("practice");
  const [hint, setHint] = useState(false);
  const [recording, setRecording] = useState(false);
  const [toast, setToast] = useState<{ text: string; tone: "correct" | "incorrect" | "info" } | null>(null);
  // `?tune=1` opens the on-device tuning panel (see lib/gestures/config-store.ts);
  // the footer link / ✕ override it for the session.
  const urlTune = useUrlFlag("tune");
  const [tuningOverride, setTuningOverride] = useState<boolean | null>(null);
  const tuning = tuningOverride ?? urlTune;
  const setTuning = setTuningOverride;

  const verseKey = `${verseRef.book}-${verseRef.chapter}-${verseRef.verse}`;
  const tokens = useMemo(() => tokenizeVerse(text, verseKey), [text, verseKey]);
  const refLabel = formatRefHe(verseRef);

  // Practice state
  const firstRequired = useCallback(
    (from: number) => tokens.findIndex((t, i) => i >= from && t.requiredGesture !== "NONE"),
    [tokens],
  );
  const [targetIndex, setTargetIndex] = useState<number>(() => firstRequired(0));
  const [mistakes, setMistakes] = useState(0);

  // Exam state
  const [attempts, setAttempts] = useState<Map<string, RecognizedGesture>>(new Map());
  const [report, setReport] = useState<Report | null>(null);

  /** Restart the current verse (mode switch / new exam). */
  const resetVerse = useCallback(() => {
    setTargetIndex(firstRequired(0));
    setAttempts(new Map());
    setReport(null);
    setMistakes(0);
    setToast(null);
  }, [firstRequired]);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 1800);
    return () => clearTimeout(id);
  }, [toast]);

  const advanceVerse = useCallback(() => {
    if (onNext) onNext();
    else resetVerse();
  }, [onNext, resetVerse]);

  const onPracticeResult = (token: WordToken, gesture: RecognizedGesture, result: ValidationResult) => {
    setToast({ text: result.message, tone: result.correct ? "correct" : "incorrect" });
    if (!result.correct) {
      setMistakes((m) => m + 1);
      return;
    }
    const next = firstRequired(token.index + 1);
    if (next === -1) {
      setTargetIndex(-1); // every required word done → all words render as "done"
      setToast({ text: "כל הכבוד! הפסוק הושלם", tone: "correct" });
      setTimeout(advanceVerse, 1200);
    } else {
      setTargetIndex(next);
    }
  };

  const onExamResult = (token: WordToken, gesture: RecognizedGesture) => {
    setAttempts((prev) => new Map(prev).set(token.id, gesture));
  };

  const finishExam = () => setReport(scoreExam(tokens, attempts));

  const statusFor = (token: WordToken): WordStatus => {
    if (mode === "exam") {
      if (report) return "locked";
      return attempts.has(token.id) ? "answered" : "idle";
    }
    if (targetIndex === -1) return "done";
    if (token.index < targetIndex) return "done";
    if (token.index === targetIndex) return "target";
    return "idle";
  };

  const requiredCount = tokens.filter((t) => t.requiredGesture !== "NONE").length;
  const doneCount = targetIndex === -1 ? requiredCount : tokens.slice(0, targetIndex).filter((t) => t.requiredGesture !== "NONE").length;
  const target = targetIndex >= 0 ? tokens[targetIndex] : null;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-4 py-6">
      {/* Mode switch */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="tablist" className="flex rounded-full border border-gold/60 p-0.5 text-sm">
          {(["practice", "exam"] as Mode[]).map((m) => (
            <button
              key={m}
              role="tab"
              aria-selected={mode === m}
              onClick={() => {
                setMode(m);
                resetVerse();
                setHint(false);
              }}
              className={`rounded-full px-4 py-1.5 font-medium transition-colors ${
                mode === m ? "bg-gold text-navy" : "text-gold hover:bg-gold/10"
              }`}
            >
              {m === "practice" ? "תרגול" : "מבחן"}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 text-sm">
          <button
            type="button"
            onClick={onPrev}
            disabled={!onPrev}
            className="min-h-11 rounded-lg border border-navy-700 px-3 py-1.5 text-parchment/80 hover:border-gold/60 disabled:opacity-40"
          >
            הקודם
          </button>
          <span className="min-w-28 text-center text-parchment/80">{refLabel}</span>
          <button
            type="button"
            onClick={onNext}
            disabled={!onNext}
            className="min-h-11 rounded-lg border border-navy-700 px-3 py-1.5 text-parchment/80 hover:border-gold/60 disabled:opacity-40"
          >
            הבא
          </button>
        </div>
      </div>

      <VerseScroll reference={refLabel}>
        {tokens.map((token) => (
          <TaamWord
            key={token.id}
            tokens={tokens}
            index={token.index}
            status={statusFor(token)}
            feedback={mode === "practice" ? "immediate" : "silent"}
            hint={mode === "practice" && hint}
            acceptAnyWord={mode === "exam"}
            onResult={mode === "practice" ? onPracticeResult : onExamResult}
            onNonAttempt={(_, ev) => {
              if (ev.gesture === "UNKNOWN") setToast({ text: "המחווה לא זוהתה — נסה שוב", tone: "info" });
            }}
          />
        ))}
      </VerseScroll>

      {/* Recording entry point (Phase 1: capture + basic pitch metrics) */}
      <div className="flex justify-center">
        <button
          type="button"
          onClick={() => setRecording(true)}
          className="flex min-h-11 items-center gap-2 rounded-full border border-gold/60 px-4 text-sm font-medium text-gold hover:bg-gold/10"
          aria-haspopup="dialog"
          data-testid="record-verse"
        >
          <MicIcon className="size-5" />
          הקלטת הפסוק
        </button>
      </div>
      <VerseRecorder
        open={recording}
        onClose={() => setRecording(false)}
        verseRef={verseRef}
        text={text}
        onCalibrate={() => {
          setRecording(false);
          onCalibrate?.();
        }}
      />

      {/* Status line */}
      <div className="flex min-h-10 flex-wrap items-center justify-between gap-3 text-sm">
        {mode === "practice" ? (
          <>
            <span className="text-parchment/70">
              {doneCount}/{requiredCount} טעמים · {mistakes} טעויות
              {target && !hint && (
                <span className="text-parchment/40"> · מילה נוכחית: {target.display}</span>
              )}
            </span>
            <button
              type="button"
              onClick={() => setHint((h) => !h)}
              aria-pressed={hint}
              className={`rounded-lg border px-3 py-1.5 font-medium transition-colors ${
                hint ? "border-gold bg-gold/20 text-gold" : "border-navy-700 text-parchment/80 hover:border-gold/60"
              }`}
            >
              {hint ? "הסתר ניקוד וטעמים" : "הצג ניקוד וטעמים"}
            </button>
          </>
        ) : (
          <>
            <span className="text-parchment/70">{attempts.size} מילים סומנו · הטקסט נשאר ללא ניקוד</span>
            {!report && (
              <button
                type="button"
                onClick={finishExam}
                className="rounded-lg bg-gold px-4 py-1.5 font-semibold text-navy hover:bg-gold-300"
              >
                סיים מבחן
              </button>
            )}
          </>
        )}
      </div>

      {toast && (
        <p
          role="status"
          className="rounded-lg px-4 py-2 text-center text-sm font-medium"
          style={{
            background:
              toast.tone === "correct"
                ? "color-mix(in srgb, var(--color-correct) 20%, transparent)"
                : toast.tone === "incorrect"
                  ? "color-mix(in srgb, var(--color-incorrect) 20%, transparent)"
                  : "var(--color-navy-800)",
            color:
              toast.tone === "correct"
                ? "var(--color-correct)"
                : toast.tone === "incorrect"
                  ? "var(--color-incorrect)"
                  : "var(--color-parchment)",
          }}
        >
          {toast.text}
        </p>
      )}

      {report && <ExamReport report={report} onRestart={resetVerse} />}

      {mode === "practice" && hint && target && (
        <p className="text-center text-xs text-parchment/50">
          רמז: {target.primaryMark?.nameHe}
          {target.appliedRule ? ` (${CONTEXT_RULES[target.appliedRule].labelHe})` : ""} →{" "}
          {GESTURE_LABELS_HE[target.requiredGesture]}
        </p>
      )}

      <GestureLegend />

      {tuning ? (
        <TuningPanel onClose={() => setTuning(false)} />
      ) : (
        <button
          type="button"
          onClick={() => setTuning(true)}
          className="self-center text-xs text-parchment/40 underline-offset-2 hover:text-gold hover:underline"
        >
          כיוונון מחוות
        </button>
      )}
    </div>
  );
}
