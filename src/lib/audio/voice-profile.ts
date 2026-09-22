/**
 * Voice profile: the learner's baseline pitch, derived from the calibration recordings and
 * stored in localStorage ("medaker.voiceProfile.v1"). Later phases compare a verse recording's
 * pitch contour against `baselineF0` / the range.
 */
import { useSyncExternalStore } from "react";
import type { PitchSummary } from "./pitch";

export const VOICE_PROFILE_VERSION = 1;
const STORAGE_KEY = "medaker.voiceProfile.v1";

export interface CalibrationSampleResult {
  /** Calibration word id (see calibration-words.ts). */
  wordId: string;
  markId: string;
  durationMs: number;
  medianF0: number;
  p10F0: number;
  p90F0: number;
  voicedRatio: number;
}

export interface VoiceProfile {
  version: typeof VOICE_PROFILE_VERSION;
  createdAt: string;
  /** Median of the samples' median F0 (Hz). */
  baselineF0: number;
  /** Lowest p10 / highest p90 across samples (Hz). */
  f0Min: number;
  f0Max: number;
  /** 12·log2(f0Max / f0Min). */
  rangeSemitones: number;
  samples: CalibrationSampleResult[];
  /** MIME type the browser recorded with — useful for support diagnostics. */
  mimeType: string | null;
}

/** Minimum voiced share for a calibration take to be accepted. */
export const MIN_VOICED_RATIO = 0.25;
/** Minimum take length. */
export const MIN_SAMPLE_MS = 400;

export type SampleRejection = "too-short" | "unvoiced";

export function checkSample(summary: PitchSummary, durationMs: number): SampleRejection | null {
  if (durationMs < MIN_SAMPLE_MS) return "too-short";
  if (summary.voicedRatio < MIN_VOICED_RATIO || summary.medianF0 === null || summary.p10F0 === null || summary.p90F0 === null) {
    return "unvoiced";
  }
  return null;
}

export function sampleResultFrom(wordId: string, markId: string, durationMs: number, s: PitchSummary): CalibrationSampleResult {
  if (s.medianF0 === null || s.p10F0 === null || s.p90F0 === null) throw new Error("sampleResultFrom: unvoiced summary");
  return { wordId, markId, durationMs, medianF0: s.medianF0, p10F0: s.p10F0, p90F0: s.p90F0, voicedRatio: s.voicedRatio };
}

export function computeVoiceProfile(samples: CalibrationSampleResult[], mimeType: string | null = null): VoiceProfile {
  if (!samples.length) throw new Error("computeVoiceProfile: no samples");
  const medians = samples.map((s) => s.medianF0).sort((a, b) => a - b);
  const mid = medians.length >> 1;
  const baselineF0 = medians.length % 2 ? medians[mid] : (medians[mid - 1] + medians[mid]) / 2;
  const f0Min = Math.min(...samples.map((s) => s.p10F0));
  const f0Max = Math.max(...samples.map((s) => s.p90F0));
  return {
    version: VOICE_PROFILE_VERSION,
    createdAt: new Date().toISOString(),
    baselineF0,
    f0Min,
    f0Max,
    rangeSemitones: 12 * Math.log2(f0Max / f0Min),
    samples,
    mimeType,
  };
}

/* ---------- storage + React subscription ---------- */

const listeners = new Set<() => void>();
let cached: VoiceProfile | null | undefined; // undefined = not read yet

function isProfile(v: unknown): v is VoiceProfile {
  return (
    !!v &&
    typeof v === "object" &&
    (v as VoiceProfile).version === VOICE_PROFILE_VERSION &&
    typeof (v as VoiceProfile).baselineF0 === "number" &&
    Array.isArray((v as VoiceProfile).samples)
  );
}

export function loadVoiceProfile(): VoiceProfile | null {
  if (cached !== undefined) return cached;
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    cached = isProfile(parsed) ? parsed : null;
  } catch {
    cached = null;
  }
  return cached;
}

export function saveVoiceProfile(profile: VoiceProfile | null) {
  cached = profile;
  try {
    if (profile) globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(profile));
    else globalThis.localStorage?.removeItem(STORAGE_KEY);
  } catch {
    /* private mode / quota: keep the in-memory copy */
  }
  for (const fn of listeners) fn();
}

export function useVoiceProfile(): VoiceProfile | null {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    loadVoiceProfile,
    () => null,
  );
}

/** Test helper. */
export function resetVoiceProfileCache() {
  cached = undefined;
}

/** "130 Hz" / "טווח 7 חצאי טונים" style formatting. */
export function formatHz(hz: number): string {
  return `${Math.round(hz)} Hz`;
}
export function formatSemitones(st: number): string {
  return `${st.toFixed(1)} חצאי טונים`;
}
