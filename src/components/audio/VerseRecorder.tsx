"use client";

/**
 * Verse recording sheet (Phase 1): record the current verse, play it back, and see basic
 * pitch metrics against the calibrated voice profile. Cantillation assessment comes in a
 * later phase — this only proves the capture + analysis pipeline on real verses.
 */
import { useState } from "react";
import { analyzeRecording, type RecordingAnalysis } from "@/lib/audio/analyze";
import { hzToSemitones } from "@/lib/audio/pitch";
import { useAudioRecorder } from "@/lib/audio/useAudioRecorder";
import { formatHz, formatSemitones, useVoiceProfile } from "@/lib/audio/voice-profile";
import { formatRefHe, type VerseRef } from "@/lib/scripture";
import { BottomSheet } from "../BottomSheet";
import { AudioRecorder } from "./AudioRecorder";

const VERSE_MAX_MS = 90_000;

export function VerseRecorder({
  open,
  onClose,
  verseRef,
  text,
  onCalibrate,
}: {
  open: boolean;
  onClose: () => void;
  verseRef: VerseRef;
  /** Fully pointed verse text, shown for reading. */
  text: string;
  onCalibrate: () => void;
}) {
  const recorder = useAudioRecorder({ maxDurationMs: VERSE_MAX_MS });
  const profile = useVoiceProfile();
  const [analysis, setAnalysis] = useState<RecordingAnalysis | null>(null);
  const [analysing, setAnalysing] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const analyse = async () => {
    if (!recorder.recording) return;
    setAnalysing(true);
    setProblem(null);
    try {
      setAnalysis(await analyzeRecording(recorder.recording));
    } catch {
      setProblem("לא ניתן לנתח את ההקלטה.");
    } finally {
      setAnalysing(false);
    }
  };

  const reset = () => {
    setAnalysis(null);
    setProblem(null);
    recorder.reset();
  };

  const s = analysis?.summary;
  const delta = s?.medianF0 && profile ? hzToSemitones(profile.baselineF0, s.medianF0) : null;

  return (
    <BottomSheet
      open={open}
      onClose={() => {
        reset();
        onClose();
      }}
      title={`הקלטת ${formatRefHe(verseRef)}`}
    >
      <div className="flex flex-col gap-4" data-testid="verse-recorder">
        <p className="rounded-2xl border-2 border-gold bg-parchment px-4 py-4 text-center font-stam text-2xl font-bold leading-[1.6] text-ink" dir="rtl">
          {text}
        </p>

        {!profile && (
          <p className="rounded-lg border border-gold/40 bg-gold/10 p-3 text-sm text-parchment/90">
            עדיין לא בוצע כיול קול.{" "}
            <button type="button" onClick={onCalibrate} className="font-semibold text-gold underline underline-offset-2">
              לכיול קול
            </button>{" "}
            כדי שהניתוח יותאם לקול שלך.
          </p>
        )}

        <AudioRecorder recorder={recorder} maxDurationMs={VERSE_MAX_MS} hint="קריאת הפסוק במלואו בניגון התימני." />

        {recorder.status === "stopped" && !analysis && (
          <button
            type="button"
            onClick={() => void analyse()}
            disabled={analysing}
            className="min-h-12 rounded-lg bg-gold px-4 font-semibold text-navy hover:bg-gold-300 disabled:opacity-40"
            data-testid="verse-analyse"
          >
            {analysing ? "מנתח…" : "ניתוח בסיסי של ההקלטה"}
          </button>
        )}

        {problem && (
          <p role="alert" className="text-center text-sm text-incorrect">
            {problem}
          </p>
        )}

        {s && (
          <div className="rounded-lg border border-navy-700 bg-navy p-3 text-sm" data-testid="verse-analysis">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1">
              <dt className="text-parchment/60">משך</dt>
              <dd dir="ltr" className="text-end">
                {(analysis!.durationMs / 1000).toFixed(1)} s
              </dd>
              <dt className="text-parchment/60">גובה ממוצע</dt>
              <dd dir="ltr" className="text-end">
                {s.medianF0 ? formatHz(s.medianF0) : "—"}
              </dd>
              <dt className="text-parchment/60">טווח</dt>
              <dd dir="ltr" className="text-end">
                {s.rangeSemitones ? formatSemitones(s.rangeSemitones) : "—"}
              </dd>
              <dt className="text-parchment/60">חלק קולי</dt>
              <dd dir="ltr" className="text-end">
                {Math.round(s.voicedRatio * 100)}%
              </dd>
              {delta !== null && (
                <>
                  <dt className="text-parchment/60">ביחס לתדר הבסיס שלך</dt>
                  <dd dir="ltr" className="text-end">
                    {delta >= 0 ? "+" : ""}
                    {delta.toFixed(1)} st
                  </dd>
                </>
              )}
            </dl>
            <p className="mt-3 text-xs text-parchment/50">ניתוח הקריאה והטעמים מול הניגון התימני יתווסף בשלב הבא.</p>
          </div>
        )}
      </div>
    </BottomSheet>
  );
}
