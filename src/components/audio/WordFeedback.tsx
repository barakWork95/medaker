"use client";

/**
 * Word-level evaluation view: the verse as coloured words (green / amber / red), tap a word to
 * hear that segment, expand for details (syllables, rhythm, pitch, notes).
 */
import { useMemo, useState } from "react";
import type { AccentVerdict } from "@/lib/speech/contour";
import type { VerseEvaluation, WordResult, WordStatus } from "@/lib/speech/engine";
import { friendlyToken } from "@/lib/speech/friendly";
import { ContourSparkline } from "./ContourSparkline";

const ACCENT: Record<AccentVerdict, { labelHe: string; className: string; icon: string }> = {
  good: { labelHe: "הניגון נכון", className: "bg-correct text-navy", icon: "♪" },
  partial: { labelHe: "ניגון חלקי", className: "bg-amber-400 text-navy", icon: "♪" },
  off: { labelHe: "ניגון שונה מהצפוי", className: "bg-incorrect text-parchment", icon: "♪" },
  unvoiced: { labelHe: "לא ניתן לנתח ניגון", className: "bg-navy-700 text-parchment/70", icon: "♪" },
};

/** Phase 2 status → a 0–100 "pronunciation & rhythm" figure for the combined view. */
export function rhythmScoreOf(w: WordResult): number {
  if (w.status === "missing") return 0;
  const share = w.syllablesExpected ? w.syllablesMatched / w.syllablesExpected : 0;
  const rhythm = w.rhythmDeviation === null ? 1 : Math.max(0, 1 - w.rhythmDeviation / 1.2);
  const phonetic = w.phonetic ? w.phonetic.score : 1;
  return Math.round(100 * (0.4 * share + 0.3 * rhythm + 0.3 * phonetic));
}

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
  const [openHint, setOpenHint] = useState<string | null>(null);
  const sel = selected !== null ? evaluation.words[selected] : null;
  const friendly = useMemo(() => (sel ? friendlyToken(sel.pointed) : null), [sel]);
  const { summary } = evaluation;
  const local = evaluation.engine === "local-rhythm";

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
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm" data-testid="accent-summary">
        <span className="text-parchment/70">
          ניגון הטעמים:{" "}
          {summary.accentScore !== null ? (
            <strong className="text-gold">{summary.accentScore}%</strong>
          ) : (
            <span className="text-parchment/50">לא נותח</span>
          )}
        </span>
        {summary.accentAnalysed > 0 && (
          <span className="text-parchment/60">
            {summary.accentGood} מתוך {summary.accentAnalysed} טעמים בניגון הנכון
          </span>
        )}
      </div>
      {evaluation.fallbackFrom && (
        <p role="status" className="rounded-lg border border-amber-500/50 bg-amber-400/10 px-3 py-2 text-xs text-parchment/90" data-testid="fallback-note">
          שרת היישור לא היה זמין ({evaluation.fallbackFrom.reason}); התוצאות חושבו במנוע המקומי.
        </p>
      )}

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
              className={`relative rounded-md px-1.5 py-0.5 ring-2 transition ${st.className} ${playing === w.index ? "ring-4 ring-gold" : ""} ${selected === w.index ? "outline outline-2 outline-gold-700" : ""}`}
            >
              {w.pointed}
              {w.accent && (
                <span
                  className={`absolute -top-2 -start-2 grid size-4 place-items-center rounded-full text-[10px] font-bold leading-none shadow ${ACCENT[w.accent.verdict].className}`}
                  title={`${w.accent.nameHe}: ${ACCENT[w.accent.verdict].labelHe}${w.accent.score !== null ? ` (${w.accent.score}%)` : ""}`}
                  data-testid="accent-badge"
                  data-verdict={w.accent.verdict}
                  aria-hidden
                >
                  {ACCENT[w.accent.verdict].icon}
                </span>
              )}
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
        <li className="flex items-center gap-1.5">
          <span className="grid size-3.5 place-items-center rounded-full bg-correct text-[9px] font-bold text-navy">♪</span>
          ניגון הטעם (ירוק / כתום / אדום)
        </li>
        <li className="text-parchment/50">· הקשה על מילה משמיעה את הקטע</li>
      </ul>

      <p
        className={`rounded-lg px-3 py-2 text-xs leading-relaxed ${local ? "border border-gold/40 bg-gold/10 text-parchment/90" : "border border-correct/40 bg-correct/10 text-parchment/90"}`}
        data-testid="engine-note"
      >
        {local ? (
          <>
            <strong className="text-gold">ניתוח מקומי (במכשיר):</strong> בודק אילו מילים והברות נקראו, את הקצב ואת תנועת הגובה.{" "}
            <strong>אינו בודק הגייה</strong> — האם ו נשמעה W, ק נשמעה G וכדומה. בדיקת הגייה תימנית מלאה מתבצעת רק עם מנוע היישור בשרת.
          </>
        ) : (
          <>
            <strong className="text-correct">מנוע שרת:</strong> יישור מלא — זמנים, הברות והתאמה פונטית להגייה התימנית.
          </>
        )}
      </p>

      {sel && friendly && (
        <div className="rounded-lg border border-navy-700 bg-navy p-3 text-sm" data-testid="word-detail">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="font-stam text-2xl font-bold text-parchment" data-testid="respelled">
              {friendly.respelled}
              {friendly.changed && <span className="ms-2 text-base font-normal text-parchment/50">({friendly.pointed})</span>}
            </span>
            <span className="text-xs text-parchment/50">{friendly.changed ? "כך זה נשמע בהגייה התימנית" : "נקרא כפי שכתוב"}</span>
          </div>

          {friendly.hints.length > 0 && (
            <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="כללי הגייה למילה" data-testid="hint-chips">
              {friendly.hints.map((h) => (
                <li key={h.id}>
                  <button
                    type="button"
                    onClick={() => setOpenHint(openHint === h.id ? null : h.id)}
                    title={h.detail}
                    aria-expanded={openHint === h.id}
                    className={`rounded-full border px-2 py-0.5 text-xs ${openHint === h.id ? "border-gold bg-gold/20 text-gold" : "border-navy-700 text-parchment/80 hover:border-gold/60"}`}
                    dir="rtl"
                  >
                    {h.label}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {openHint && <p className="mt-1 text-xs text-gold/90">{friendly.hints.find((h) => h.id === openHint)?.detail}</p>}

          {/* Combined scores: pronunciation/rhythm (Phase 2) + accent melody (Phase 3) */}
          <div className="mt-3 grid grid-cols-2 gap-2" data-testid="combined-scores">
            <div className="rounded-lg bg-navy-800 px-3 py-2">
              <div className="text-[11px] text-parchment/60">הגייה וקצב</div>
              <div className="text-xl font-bold" style={{ color: sel.status === "correct" ? "var(--color-correct)" : sel.status === "minor" ? "#f59e0b" : "var(--color-incorrect)" }} data-testid="rhythm-score">
                {rhythmScoreOf(sel)}%
              </div>
              <div className="text-[11px] text-parchment/50">{STATUS[sel.status].labelHe}</div>
            </div>
            <div className="rounded-lg bg-navy-800 px-3 py-2">
              <div className="text-[11px] text-parchment/60">טעם וניגון{sel.accent ? ` · ${sel.accent.nameHe}` : ""}</div>
              {sel.accent ? (
                <>
                  <div
                    className="text-xl font-bold"
                    style={{ color: sel.accent.verdict === "good" ? "var(--color-correct)" : sel.accent.verdict === "partial" ? "#f59e0b" : sel.accent.verdict === "off" ? "var(--color-incorrect)" : "var(--color-parchment)" }}
                    data-testid="accent-score"
                  >
                    {sel.accent.score !== null ? `${sel.accent.score}%` : "—"}
                  </div>
                  <div className="text-[11px] text-parchment/50">{ACCENT[sel.accent.verdict].labelHe}</div>
                </>
              ) : (
                <>
                  <div className="text-xl font-bold text-parchment/40">—</div>
                  <div className="text-[11px] text-parchment/50">{sel.status === "missing" ? "המילה לא זוהתה" : "מילה מחברת — ללא ניגון מפסיק"}</div>
                </>
              )}
            </div>
          </div>
          {sel.accent && sel.accent.contour.length > 0 && (
            <div className="mt-2 rounded-lg bg-navy-800 px-2 py-1 text-parchment">
              <ContourSparkline user={sel.accent.contour} template={sel.accent.template} />
              <div className="flex justify-between text-[11px] text-parchment/60">
                <span>הצפוי: {sel.accent.templateDescribeHe}</span>
                <span dir="ltr">{sel.accent.movementSemitones !== null ? `${sel.accent.movementSemitones.toFixed(1)} st` : ""}</span>
              </div>
            </div>
          )}
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
            <dt className="text-parchment/60">התאמה פונטית</dt>
            <dd className="text-end">{sel.phonetic ? `${Math.round(sel.phonetic.score * 100)}%` : "לא נבדקה (מנוע מקומי)"}</dd>
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
