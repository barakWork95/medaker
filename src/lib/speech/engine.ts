/**
 * Pronunciation / alignment engine interface (Phase 2).
 *
 * Two implementations behind one contract:
 *  - LocalRhythmEngine  — runs in the browser: decode → pitch/energy track → syllable nuclei →
 *    DTW against the expected Temani syllables → word timestamps, omissions, rhythm scores,
 *    pitch movement. It CANNOT judge phonemes (needs an acoustic model) → `phonetic: null`.
 *  - RemoteEngine       — POSTs the audio + expected phonetics to a forced-alignment server
 *    (NEXT_PUBLIC_ALIGNMENT_API or localStorage "medaker.alignmentApi") that returns the same
 *    VerseEvaluation shape with per-word phonetic scores. Contract: see CLAUDE.md §15.
 *
 * getEngine() picks remote when configured, else local; the UI shows which one ran.
 */
import { decodeBlob } from "@/lib/audio/decode";
import { estimatePitchTrack, percentile, type PitchFrame } from "@/lib/audio/pitch";
import type { Recording } from "@/lib/audio/recorder";
import type { VoiceProfile } from "@/lib/audio/voice-profile";
import type { VerseRef } from "@/lib/scripture";
import { alignSyllables } from "./align";
import { buildExpectedWords, type ExpectedWord } from "./expected";
import { detectNuclei, type Nucleus } from "./nuclei";

export type Tradition = "temani";
export type WordStatus = "correct" | "minor" | "missing";
export type EngineId = "local-rhythm" | "remote";

export interface EvaluationRequest {
  recording: Pick<Recording, "blob" | "mimeType" | "durationMs">;
  verse: { ref: VerseRef; text: string };
  profile: VoiceProfile | null;
  tradition: Tradition;
}

export interface PhoneticResult {
  /** 0..1 */
  score: number;
  /** Human-readable issues (Hebrew), e.g. "ו נשמעה כ־V". */
  issues: string[];
}

export interface WordResult {
  index: number;
  display: string;
  pointed: string;
  roman: string;
  /** Seconds into the recording; null when the word was not found. */
  start: number | null;
  end: number | null;
  status: WordStatus;
  syllablesExpected: number;
  syllablesMatched: number;
  /**
   * |log(actual / expected)| of the word's mean nucleus duration per weight unit, relative to
   * the reading's global tempo (median over all matched syllables). 0 = perfect.
   */
  rhythmDeviation: number | null;
  /** p90/p10 pitch movement inside the word (semitones); null if unvoiced. */
  pitchMovementSemitones: number | null;
  /** Median F0 of the word relative to the profile baseline (semitones), if both exist. */
  pitchVsBaselineSemitones: number | null;
  phonetic: PhoneticResult | null;
  notes: string[];
}

export interface VerseEvaluation {
  engine: EngineId;
  tradition: Tradition;
  words: WordResult[];
  summary: {
    correct: number;
    minor: number;
    missing: number;
    /** 0..100 */
    score: number;
    /** Share of expected syllables that found a nucleus. */
    coverage: number;
    /** Extra nuclei not matched to any syllable (hesitations, noise). */
    extraNuclei: number;
  };
  /** Local engine only — for the debug view / Phase 3. */
  track?: PitchFrame[];
  nuclei?: Nucleus[];
}

export interface PronunciationEngine {
  readonly id: EngineId;
  readonly capabilities: { phonetic: boolean; timestamps: boolean };
  evaluate(request: EvaluationRequest): Promise<VerseEvaluation>;
}

/* ---------------- local rhythm engine ---------------- */

export const LOCAL_THRESHOLDS = {
  /** Word is "correct" when at least this share of its syllables matched … */
  correctSyllableShare: 0.999,
  /** … and its rhythm deviation is below this (|log ratio|; 0.5 ≈ 65 % longer/shorter). */
  correctRhythm: 0.5,
  /** Below this share of syllables the word counts as missing. */
  missingSyllableShare: 0.34,
  /** A disjunctive word should show at least this much pitch movement (semitones) — informational. */
  disjunctiveMovement: 1.5,
} as const;

export function statusFor(w: Pick<WordResult, "syllablesExpected" | "syllablesMatched" | "rhythmDeviation">): WordStatus {
  const share = w.syllablesExpected ? w.syllablesMatched / w.syllablesExpected : 0;
  if (share < LOCAL_THRESHOLDS.missingSyllableShare) return "missing";
  if (share >= LOCAL_THRESHOLDS.correctSyllableShare && (w.rhythmDeviation ?? 0) < LOCAL_THRESHOLDS.correctRhythm) return "correct";
  return "minor";
}

export function scoreFor(words: WordResult[]): number {
  if (!words.length) return 0;
  const pts = words.reduce((a, w) => a + (w.status === "correct" ? 1 : w.status === "minor" ? 0.5 : 0), 0);
  return Math.round((pts / words.length) * 100);
}

export function evaluateLocally(
  expected: ExpectedWord[],
  track: PitchFrame[],
  profile: VoiceProfile | null,
): Omit<VerseEvaluation, "engine" | "tradition"> {
  const nuclei = detectNuclei(track);
  const syllables = expected.flatMap((w) => w.syllables);
  const alignment = alignSyllables(syllables, nuclei);
  // global tempo: seconds of nucleus per weight unit (median → robust to one odd word)
  const rates = alignment.matches.map((m) => (nuclei[m.nucleus].end - nuclei[m.nucleus].start) / syllables[m.syllable].weight);
  const tempo = percentile(rates, 0.5);

  const words: WordResult[] = expected.map((w) => {
    const mine = alignment.matches.filter((m) => syllables[m.syllable].wordIndex === w.index);
    const matchedNuclei = mine.map((m) => nuclei[m.nucleus]);
    const start = matchedNuclei.length ? Math.min(...matchedNuclei.map((nu) => nu.start)) : null;
    const end = matchedNuclei.length ? Math.max(...matchedNuclei.map((nu) => nu.end)) : null;

    let rhythmDeviation: number | null = null;
    let tooLong = false;
    if (mine.length && tempo) {
      const actual = matchedNuclei.reduce((a, nu) => a + (nu.end - nu.start), 0);
      const expectedDur = mine.reduce((a, m) => a + syllables[m.syllable].weight, 0) * tempo;
      rhythmDeviation = Math.abs(Math.log((actual + 1e-3) / (expectedDur + 1e-3)));
      tooLong = actual > expectedDur;
    }

    let pitchMovementSemitones: number | null = null;
    let pitchVsBaselineSemitones: number | null = null;
    if (start !== null && end !== null) {
      const f0s = track.filter((f) => f.t >= start && f.t <= end && f.f0 !== null).map((f) => f.f0 as number);
      const p10 = percentile(f0s, 0.1);
      const p90 = percentile(f0s, 0.9);
      const med = percentile(f0s, 0.5);
      if (p10 && p90) pitchMovementSemitones = 12 * Math.log2(p90 / p10);
      if (med && profile) pitchVsBaselineSemitones = 12 * Math.log2(med / profile.baselineF0);
    }

    const base = { syllablesExpected: w.syllables.length, syllablesMatched: mine.length, rhythmDeviation };
    const status = statusFor(base);
    const notes: string[] = [];
    if (status === "missing") notes.push("המילה לא זוהתה בהקלטה");
    else if (mine.length < w.syllables.length) notes.push(`זוהו ${mine.length} מתוך ${w.syllables.length} הברות`);
    if (rhythmDeviation !== null && rhythmDeviation >= LOCAL_THRESHOLDS.correctRhythm) {
      notes.push(tooLong ? "המילה ארוכה מהצפוי" : "המילה קצרה מהצפוי");
    }
    if (w.disjunctive && pitchMovementSemitones !== null && pitchMovementSemitones < LOCAL_THRESHOLDS.disjunctiveMovement) {
      notes.push("טעם מפסיק ללא תנועת גובה ניכרת");
    }

    return {
      index: w.index,
      display: w.display,
      pointed: w.pointed,
      roman: w.roman,
      start,
      end,
      status,
      ...base,
      pitchMovementSemitones,
      pitchVsBaselineSemitones,
      phonetic: null,
      notes,
    };
  });

  const correct = words.filter((w) => w.status === "correct").length;
  const minor = words.filter((w) => w.status === "minor").length;
  const missing = words.filter((w) => w.status === "missing").length;
  return {
    words,
    summary: {
      correct,
      minor,
      missing,
      score: scoreFor(words),
      coverage: syllables.length ? alignment.matches.length / syllables.length : 0,
      extraNuclei: alignment.inserted.length,
    },
    track,
    nuclei,
  };
}

export class LocalRhythmEngine implements PronunciationEngine {
  readonly id = "local-rhythm" as const;
  readonly capabilities = { phonetic: false, timestamps: true };

  async evaluate(request: EvaluationRequest): Promise<VerseEvaluation> {
    const decoded = await decodeBlob(request.recording.blob);
    const track = estimatePitchTrack(decoded.samples, decoded.sampleRate);
    const expected = buildExpectedWords(request.verse.text);
    return { engine: this.id, tradition: request.tradition, ...evaluateLocally(expected, track, request.profile) };
  }
}

/* ---------------- remote engine ---------------- */

export const REMOTE_API_STORAGE_KEY = "medaker.alignmentApi";

export function getRemoteApiUrl(): string | null {
  const fromEnv = process.env.NEXT_PUBLIC_ALIGNMENT_API;
  try {
    const fromStorage = globalThis.localStorage?.getItem(REMOTE_API_STORAGE_KEY);
    return (fromStorage || fromEnv || "").replace(/\/$/, "") || null;
  } catch {
    return fromEnv?.replace(/\/$/, "") || null;
  }
}

async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  if (typeof Buffer !== "undefined") return Buffer.from(bytes).toString("base64");
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

/** Wire format: POST {baseUrl}/evaluate → VerseEvaluation (engine: "remote"). */
export interface RemoteEvaluationBody {
  tradition: Tradition;
  verse: { ref: VerseRef; text: string };
  expected: { index: number; display: string; pointed: string; ipa: string; roman: string; syllables: string[] }[];
  profile: VoiceProfile | null;
  audio: { mimeType: string; durationMs: number; base64: string };
}

export class RemoteEngine implements PronunciationEngine {
  readonly id = "remote" as const;
  readonly capabilities = { phonetic: true, timestamps: true };
  private readonly baseUrl: string;
  constructor(
    baseUrl: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
  }

  async evaluate(request: EvaluationRequest): Promise<VerseEvaluation> {
    const expected = buildExpectedWords(request.verse.text).map((w) => ({
      index: w.index,
      display: w.display,
      pointed: w.pointed,
      ipa: w.ipa,
      roman: w.roman,
      syllables: w.syllables.map((s) => s.ipa),
    }));
    const body: RemoteEvaluationBody = {
      tradition: request.tradition,
      verse: request.verse,
      expected,
      profile: request.profile,
      audio: { mimeType: request.recording.mimeType, durationMs: request.recording.durationMs, base64: await blobToBase64(request.recording.blob) },
    };
    const res = await this.fetchImpl(`${this.baseUrl}/evaluate`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`alignment server: HTTP ${res.status}`);
    const json = (await res.json()) as VerseEvaluation;
    if (!Array.isArray(json.words) || !json.summary) throw new Error("alignment server: malformed response");
    return { ...json, engine: "remote", tradition: request.tradition };
  }
}

export function getEngine(): PronunciationEngine {
  const url = getRemoteApiUrl();
  return url ? new RemoteEngine(url) : new LocalRhythmEngine();
}
