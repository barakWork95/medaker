"use client";

/**
 * Verse recording sheet (Phase 2): record → evaluate with the pronunciation engine →
 * word-level colour feedback with tap-to-play segments; Phase 1 pitch metrics stay below.
 */
import { useEffect, useRef, useState } from "react";
import { decodeBlob, type DecodedAudio } from "@/lib/audio/decode";
import { estimatePitchTrack, hzToSemitones, summarizePitch, type PitchSummary } from "@/lib/audio/pitch";
import { SegmentPlayer } from "@/lib/audio/segment-player";
import { useAudioRecorder } from "@/lib/audio/useAudioRecorder";
import { formatHz, formatSemitones, useVoiceProfile } from "@/lib/audio/voice-profile";
import { formatRefHe, type VerseRef } from "@/lib/scripture";
import { getEngine, type VerseEvaluation, type WordResult } from "@/lib/speech/engine";
import { BottomSheet } from "../BottomSheet";
import { AudioRecorder } from "./AudioRecorder";
import { WordFeedback } from "./WordFeedback";

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
  const [evaluation, setEvaluation] = useState<VerseEvaluation | null>(null);
  const [pitch, setPitch] = useState<PitchSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [playing, setPlaying] = useState<number | null>(null);
  const player = useRef<SegmentPlayer | null>(null);

  useEffect(
    () => () => {
      player.current?.dispose();
    },
    [],
  );

  const evaluate = async () => {
    const rec = recorder.recording;
    if (!rec) return;
    setBusy(true);
    setProblem(null);
    try {
      const decoded: DecodedAudio = await decodeBlob(rec.blob);
      player.current?.dispose();
      player.current = new SegmentPlayer(decoded.samples, decoded.sampleRate);
      setPitch(summarizePitch(estimatePitchTrack(decoded.samples, decoded.sampleRate)));
      const engine = getEngine();
      setEvaluation(await engine.evaluate({ recording: rec, verse: { ref: verseRef, text }, profile, tradition: "temani" }));
    } catch (err) {
      setProblem(err instanceof Error && /alignment server/.test(err.message) ? "שרת הניתוח אינו זמין. נסו שוב מאוחר יותר." : "לא ניתן לנתח את ההקלטה.");
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    player.current?.dispose();
    player.current = null;
    setPlaying(null);
    setEvaluation(null);
    setPitch(null);
    setProblem(null);
    recorder.reset();
  };

  const playWord = (w: WordResult) => {
    if (!player.current || w.start === null || w.end === null) return;
    setPlaying(w.index);
    player.current.play(w.start, w.end, () => setPlaying(null));
  };

  const delta = pitch?.medianF0 && profile ? hzToSemitones(profile.baselineF0, pitch.medianF0) : null;

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
        {!evaluation && (
          <p className="rounded-2xl border-2 border-gold bg-parchment px-4 py-4 text-center font-stam text-2xl font-bold leading-[1.6] text-ink" dir="rtl">
            {text}
          </p>
        )}

        {!profile && !evaluation && (
          <p className="rounded-lg border border-gold/40 bg-gold/10 p-3 text-sm text-parchment/90">
            עדיין לא בוצע כיול קול.{" "}
            <button type="button" onClick={onCalibrate} className="font-semibold text-gold underline underline-offset-2">
              לכיול קול
            </button>{" "}
            כדי שהניתוח יותאם לקול שלך.
          </p>
        )}

        {evaluation ? (
          <>
            <WordFeedback evaluation={evaluation} playing={playing} onPlayWord={playWord} />
            {recorder.recording && (
              <audio controls src={recorder.recording.url} className="w-full" preload="metadata" data-testid="playback-full">
                <track kind="captions" />
              </audio>
            )}
            <button type="button" onClick={reset} className="min-h-11 rounded-lg border border-navy-700 px-4 text-parchment/80 hover:border-gold/60">
              הקלטה חדשה
            </button>
          </>
        ) : (
          <AudioRecorder recorder={recorder} maxDurationMs={VERSE_MAX_MS} hint="קריאת הפסוק במלואו בניגון התימני." />
        )}

        {recorder.status === "stopped" && !evaluation && (
          <button
            type="button"
            onClick={() => void evaluate()}
            disabled={busy}
            className="min-h-12 rounded-lg bg-gold px-4 font-semibold text-navy hover:bg-gold-300 disabled:opacity-40"
            data-testid="verse-analyse"
          >
            {busy ? "מנתח…" : "ניתוח הקריאה"}
          </button>
        )}

        {problem && (
          <p role="alert" className="text-center text-sm text-incorrect">
            {problem}
          </p>
        )}

        {pitch && evaluation && (
          <div className="rounded-lg border border-navy-700 bg-navy p-3 text-sm" data-testid="verse-analysis">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1">
              <dt className="text-parchment/60">גובה ממוצע</dt>
              <dd dir="ltr" className="text-end">
                {pitch.medianF0 ? formatHz(pitch.medianF0) : "—"}
              </dd>
              <dt className="text-parchment/60">טווח</dt>
              <dd dir="ltr" className="text-end">
                {pitch.rangeSemitones ? formatSemitones(pitch.rangeSemitones) : "—"}
              </dd>
              <dt className="text-parchment/60">חלק קולי</dt>
              <dd dir="ltr" className="text-end">
                {Math.round(pitch.voicedRatio * 100)}%
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
          </div>
        )}
      </div>
    </BottomSheet>
  );
}
