"use client";

/**
 * Voice calibration (כיול קול): intro → 3 words (record, listen, analyse) → result → save.
 * Produces a VoiceProfile (baseline F0 + range) stored locally. Each step mounts its own
 * recorder (`key={step}`) so microphone/state are fresh per take.
 */
import { useState } from "react";
import { analyzeRecording } from "@/lib/audio/analyze";
import { CALIBRATION_ESTIMATE_SECONDS, CALIBRATION_WORDS, type CalibrationWord } from "@/lib/audio/calibration-words";
import { useAudioRecorder } from "@/lib/audio/useAudioRecorder";
import {
  checkSample,
  computeVoiceProfile,
  formatHz,
  formatSemitones,
  sampleResultFrom,
  saveVoiceProfile,
  useVoiceProfile,
  type CalibrationSampleResult,
  type VoiceProfile,
} from "@/lib/audio/voice-profile";
import { BottomSheet } from "../BottomSheet";
import { AudioRecorder } from "./AudioRecorder";

const TAKE_MAX_MS = 6000;

const REJECTION_HE = {
  "too-short": "ההקלטה קצרה מדי. יש להקליט את המילה במלואה.",
  unvoiced: "לא זוהה קול ברור. יש להתקרב למיקרופון ולנסות שוב.",
} as const;

type Step = { kind: "intro" } | { kind: "word"; index: number } | { kind: "result"; profile: VoiceProfile };

export function VoiceCalibration({ open, onClose }: { open: boolean; onClose: () => void }) {
  const existing = useVoiceProfile();
  const [step, setStep] = useState<Step>({ kind: "intro" });
  const [samples, setSamples] = useState<CalibrationSampleResult[]>([]);
  const [mimeType, setMimeType] = useState<string | null>(null);

  const restart = () => {
    setSamples([]);
    setStep({ kind: "intro" });
  };
  const close = () => {
    restart();
    onClose();
  };

  const onSample = (result: CalibrationSampleResult, mime: string) => {
    const next = [...samples, result];
    setSamples(next);
    setMimeType(mime);
    if (next.length >= CALIBRATION_WORDS.length) {
      setStep({ kind: "result", profile: computeVoiceProfile(next, mime) });
    } else {
      setStep({ kind: "word", index: next.length });
    }
  };

  return (
    <BottomSheet open={open} onClose={close} title="כיול קול">
      {step.kind === "intro" && (
        <div className="flex flex-col gap-4" data-testid="calibration-intro">
          <p className="text-sm leading-relaxed text-parchment/80">
            כדי להתאים את הניתוח לקול שלך, נקליט שלוש מילים קצרות בניגון התימני — כ־{CALIBRATION_ESTIMATE_SECONDS} שניות בסך הכול.
            מהן נחשב את תדר הבסיס של הקול ואת טווח הגובה, ונשמור אותם במכשיר בלבד.
          </p>
          <ol className="grid gap-2 text-sm">
            {CALIBRATION_WORDS.map((w, i) => (
              <li key={w.id} className="flex items-center gap-3 rounded-lg border border-navy-700 px-3 py-2">
                <span className="grid size-7 shrink-0 place-items-center rounded-full bg-gold/20 text-xs font-bold text-gold">{i + 1}</span>
                <span className="font-stam text-2xl font-bold text-parchment">{w.pointed}</span>
                <span className="text-parchment/60">{w.markNameHe}</span>
              </li>
            ))}
          </ol>
          {existing && (
            <p className="text-xs text-parchment/50">
              קיים כיול מ־{new Date(existing.createdAt).toLocaleDateString("he-IL")}: תדר בסיס {formatHz(existing.baselineF0)}, טווח{" "}
              {formatSemitones(existing.rangeSemitones)}. כיול חדש יחליף אותו.
            </p>
          )}
          <button
            type="button"
            onClick={() => setStep({ kind: "word", index: 0 })}
            className="min-h-12 rounded-lg bg-gold px-4 font-semibold text-navy hover:bg-gold-300"
            data-testid="calibration-start"
          >
            {existing ? "כיול מחדש" : "התחלת כיול"}
          </button>
        </div>
      )}

      {step.kind === "word" && (
        <WordStep
          key={step.index}
          index={step.index}
          word={CALIBRATION_WORDS[step.index]}
          onAccepted={onSample}
        />
      )}

      {step.kind === "result" && (
        <div className="flex flex-col gap-4" data-testid="calibration-result">
          <h3 className="text-lg font-semibold text-correct">הכיול הושלם</h3>
          <dl className="grid grid-cols-2 gap-2 text-sm">
            <Stat label="תדר בסיס" value={formatHz(step.profile.baselineF0)} />
            <Stat label="טווח הקול" value={formatSemitones(step.profile.rangeSemitones)} />
            <Stat label="נמוך" value={formatHz(step.profile.f0Min)} />
            <Stat label="גבוה" value={formatHz(step.profile.f0Max)} />
          </dl>
          <ul className="grid gap-1 text-xs text-parchment/60">
            {step.profile.samples.map((s) => {
              const w = CALIBRATION_WORDS.find((x) => x.id === s.wordId);
              return (
                <li key={s.wordId} className="flex justify-between">
                  <span>
                    {w?.pointed} · {w?.markNameHe}
                  </span>
                  <span dir="ltr">
                    {formatHz(s.medianF0)} ({Math.round(s.p10F0)}–{Math.round(s.p90F0)})
                  </span>
                </li>
              );
            })}
          </ul>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                saveVoiceProfile(step.profile);
                close();
              }}
              className="min-h-12 flex-1 rounded-lg bg-gold px-4 font-semibold text-navy hover:bg-gold-300"
              data-testid="calibration-save"
            >
              שמירת הפרופיל
            </button>
            <button type="button" onClick={restart} className="min-h-12 rounded-lg border border-navy-700 px-4 text-parchment/80 hover:border-gold/60">
              כיול מחדש
            </button>
          </div>
          <p className="text-[11px] text-parchment/40">פורמט הקלטה: {mimeType ?? "—"}</p>
        </div>
      )}
    </BottomSheet>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-navy px-3 py-2">
      <dt className="text-parchment/60">{label}</dt>
      <dd className="text-lg font-semibold text-gold" dir="ltr">
        {value}
      </dd>
    </div>
  );
}

function WordStep({
  index,
  word,
  onAccepted,
}: {
  index: number;
  word: CalibrationWord;
  onAccepted: (result: CalibrationSampleResult, mimeType: string) => void;
}) {
  const recorder = useAudioRecorder({ maxDurationMs: TAKE_MAX_MS });
  const [analysing, setAnalysing] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const analyse = async () => {
    const rec = recorder.recording;
    if (!rec) return;
    setAnalysing(true);
    setProblem(null);
    try {
      const { summary, durationMs } = await analyzeRecording(rec);
      const rejection = checkSample(summary, durationMs);
      if (rejection) {
        setProblem(REJECTION_HE[rejection]);
        return;
      }
      onAccepted(sampleResultFrom(word.id, word.markId, durationMs, summary), rec.mimeType);
    } catch {
      setProblem("לא ניתן לנתח את ההקלטה. נסו להקליט שוב.");
    } finally {
      setAnalysing(false);
    }
  };

  return (
    <div className="flex flex-col gap-4" data-testid="calibration-word" data-index={index}>
      <div className="flex items-center justify-between text-xs text-parchment/60">
        <span>
          מילה {index + 1} מתוך {CALIBRATION_WORDS.length}
        </span>
        <span>{word.sourceHe}</span>
      </div>
      <div className="rounded-2xl border-2 border-gold bg-parchment px-4 py-6 text-center">
        <p className="font-stam text-5xl font-bold leading-relaxed text-ink" dir="rtl">
          {word.pointed}
        </p>
        <p className="mt-2 text-sm font-medium text-gold-700">{word.markNameHe}</p>
      </div>
      <p className="text-sm text-parchment/70">{word.guidanceHe}</p>

      <AudioRecorder recorder={recorder} maxDurationMs={TAKE_MAX_MS} hint="לחיצה על המיקרופון, קריאת המילה בניגון, ועצירה." />

      {problem && (
        <p role="alert" className="text-center text-sm text-incorrect">
          {problem}
        </p>
      )}

      <button
        type="button"
        onClick={() => void analyse()}
        disabled={recorder.status !== "stopped" || analysing}
        className="min-h-12 rounded-lg bg-gold px-4 font-semibold text-navy hover:bg-gold-300 disabled:opacity-40"
        data-testid="calibration-accept"
      >
        {analysing ? "מנתח…" : index + 1 < CALIBRATION_WORDS.length ? "אישור והמשך" : "אישור וסיום"}
      </button>
    </div>
  );
}
