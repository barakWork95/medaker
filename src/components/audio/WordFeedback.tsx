"use client";

/**
 * Word-level evaluation view: the verse as coloured words (green / amber / red), tap a word to
 * hear that segment, expand for details (syllables, rhythm, pitch, notes).
 */
import { useState } from "react";
import type { VerseEvaluation, WordResult, WordStatus } from "@/lib/speech/engine";

const STATUS: Record<WordStatus, { labelHe: string; className: string; dot: string }> = {
  correct: { labelHe: "נכון", className: "bg-correct/25 text-ink ring-correct/60", dot: "bg-correct" },
  minor: { labelHe: "סטייה קלה", className: "bg-amber-400/35 text-ink ring-amber-500/70", dot: "bg-amber-400" },
  missing: { labelHe: "חסר / לא זוהה", className: "bg-incorrect/20 text-ink/50 ring-incorrect/60 line-through decoration-incorrect/70", dot: "bg-incorrect" },
};

export function WordFeedback({
  evaluation,
  playing,
  onPlayWord,
}: {
  evaluation: VerseEvaluation;
  /** Index of the word whose segment is playing. */
  playing: number | null;
  onPlayWord: (word: WordResult) => void;
}) {
  const [selected, setSelected] = useState<number | null>(null);
  const sel = selected !== null ? evaluation.words[selected] : null;
  const { summary } = evaluation;

  return (
    <div className="flex flex-col gap-3" data-testid="word-feedback" data-engine={evaluation.engine}>
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className="text-2xl font-bold" style={{ color: summary.score >= 80 ? "var(--color-correct)" : summary.score >= 50 ? "#f59e0b" : "var(--color-incorrect)" }}>
          {summary.score}%
        </span>
        <span className="text-parchment/70">
          {summary.correct} נכונות · {summary.minor} סטיות · {summary.missing} חסרות
          {summary.extraNuclei > 0 ? ` · ${summary.extraNuclei} הברות עודפות` : ""}
        </span>
      </div>

      <p className="flex flex-wrap justify-center gap-x-2 gap-y-3 rounded-2xl border-2 border-gold bg-parchment px-3 py-4 font-stam text-2xl font-bold leading-[1.5]" dir="rtl">
        {evaluation.words.map((w) => {
          const st = STATUS[w.status];
          const canPlay = w.start !== null && w.end !== null;
          return (
            <button
              key={w.index}
              type="button"
              onClick={() => {
                setSelected(w.index);
                if (canPlay) onPlayWord(w);
              }}
              aria-label={`${w.display} — ${st.labelHe}${canPlay ? ", הקשה להשמעה" : ""}`}
              aria-pressed={selected === w.index}
              data-testid="feedback-word"
              data-status={w.status}
              className={`rounded-md px-1.5 py-0.5 ring-2 transition ${st.className} ${playing === w.index ? "ring-4 ring-gold" : ""} ${selected === w.index ? "outline outline-2 outline-gold-700" : ""}`}
            >
              {w.pointed}
            </button>
          );
        })}
      </p>

      <ul className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-parchment/70">
        {(Object.keys(STATUS) as WordStatus[]).map((k) => (
          <li key={k} className="flex items-center gap-1.5">
            <span className={`size-2.5 rounded-full ${STATUS[k].dot}`} />
            {STATUS[k].labelHe}
          </li>
        ))}
        <li className="text-parchment/50">· הקשה על מילה משמיעה את הקטע</li>
      </ul>

      {sel && (
        <div className="rounded-lg border border-navy-700 bg-navy p-3 text-sm" data-testid="word-detail">
          <div className="flex items-baseline justify-between gap-2">
            <span className="font-stam text-xl font-bold text-parchment">{sel.pointed}</span>
            <span className="font-mono text-xs text-parchment/60" dir="ltr">
              {sel.roman}
            </span>
          </div>
          <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
            <dt className="text-parchment/60">מצב</dt>
            <dd>{STATUS[sel.status].labelHe}</dd>
            <dt className="text-parchment/60">הברות</dt>
            <dd dir="ltr" className="text-end">
              {sel.syllablesMatched}/{sel.syllablesExpected}
            </dd>
            <dt className="text-parchment/60">זמן</dt>
            <dd dir="ltr" className="text-end">
              {sel.start !== null && sel.end !== null ? `${sel.start.toFixed(2)}–${sel.end.toFixed(2)} s` : "—"}
            </dd>
            <dt className="text-parchment/60">קצב</dt>
            <dd dir="ltr" className="text-end">
              {sel.rhythmDeviation !== null ? `${Math.round(Math.exp(sel.rhythmDeviation) * 100 - 100)}% סטייה` : "—"}
            </dd>
            <dt className="text-parchment/60">תנועת גובה</dt>
            <dd dir="ltr" className="text-end">
              {sel.pitchMovementSemitones !== null ? `${sel.pitchMovementSemitones.toFixed(1)} st` : "—"}
            </dd>
            {sel.pitchVsBaselineSemitones !== null && (
              <>
                <dt className="text-parchment/60">מול תדר הבסיס</dt>
                <dd dir="ltr" className="text-end">
                  {sel.pitchVsBaselineSemitones >= 0 ? "+" : ""}
                  {sel.pitchVsBaselineSemitones.toFixed(1)} st
                </dd>
              </>
            )}
            <dt className="text-parchment/60">הגייה</dt>
            <dd className="text-end">{sel.phonetic ? `${Math.round(sel.phonetic.score * 100)}%` : "דורש מנוע שרת"}</dd>
          </dl>
          {(sel.notes.length > 0 || sel.phonetic?.issues.length) && (
            <ul className="mt-2 list-disc ps-4 text-xs text-parchment/80">
              {sel.notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
              {sel.phonetic?.issues.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
