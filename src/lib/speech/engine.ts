/**
 * Pronunciation / alignment engine interface (Phase 2).
 *
 * Two implementations behind one contract:
 *  - LocalRhythmEngine  — runs in the browser: decode → pitch/energy track → syllable nuclei →
 *    DTW against the expected Temani syllables → word timestamps, omissions, rhythm scores,
 *    pitch movement. It CANNOT judge phonemes (needs an acoustic model) → `phonetic: null`.
 *  - RemoteEngine       — POSTs the audio + expected phonetics to a forced-alignment server
 *    (NEXT_PUBLIC_ALIGNMENT_API or localStorage "medaker.alignmentApi", `POST /api/align`,
 *    api-contract.ts) and maps its phoneme-level boundaries onto WordResults. Accent contours
 *    are still computed locally on the server's precise timestamps unless it supplies them.
 *  - FallbackEngine     — tries remote, falls back to local on any failure and records why.
 *
 * Phase 3 adds `accent` per word: the pitch contour from the accented syllable to the word end
 * scored against the accent's Temani template (contour.ts / accent-templates.ts).
 *
 * getEngine() returns FallbackEngine(remote, local) when a server is configured, else local.
 */
import { decodeBlob } from "@/lib/audio/decode";
import { estimatePitchTrack, percentile, type PitchFrame } from "@/lib/audio/pitch";
import { ALIGN_CONTRACT_VERSION, ALIGN_PATH, isAlignResponse, type AlignRequest, type AlignResponse } from "./api-contract";
import { analyzeAccent, type AccentAnalysis } from "./contour";
import type { Recording } from "@/lib/audio/recorder";
import type { VoiceProfile } from "@/lib/audio/voice-profile";
import type { VerseRef } from "@/lib/scripture";
import { alignOptionsForTempo, alignSyllables } from "./align";
import { refineBoundaries, spansFromMatches } from "./boundaries";
import { buildExpectedWords, type ExpectedWord } from "./expected";
import { analyzeNuclei, type Nucleus, type SilenceGap } from "./nuclei";

export type Tradition = "temani";
export type WordStatus = "correct" | "minor" | "missing";
export type EngineId = "local-rhythm" | "remote";

export interface SyllableSpan {
  index: number;
  start: number;
  end: number;
}

export interface PhoneSpan {
  phone: string;
  start: number;
  end: number;
  score?: number;
}

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
  /** Syllable timestamps (local: matched nuclei; remote: server boundaries). */
  syllableSpans: SyllableSpan[];
  /** Phoneme boundaries — remote engine only. */
  phones: PhoneSpan[];
  /** Cantillation contour analysis; null when the word has no disjunctive template. */
  accent: AccentAnalysis | null;
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
    /** Mean cantillation score over words with an analysable accent (0..100), null if none. */
    accentScore: number | null;
    accentGood: number;
    accentAnalysed: number;
  };
  /** Set when the remote engine failed and the local one produced this result instead. */
  fallbackFrom?: { engine: "remote"; reason: string };
  /** Server identifier when engine === "remote". */
  remoteEngine?: string;
  /** Local engine only — for the debug view / Phase 3. */
  track?: PitchFrame[];
  nuclei?: Nucleus[];
  gaps?: SilenceGap[];
  /** Median syllable interval of the reading (s). */
  syllableIntervalS?: number;
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

/** Region the accent melody lives in: accented syllable onset → word end (whole word as fallback). */
export function accentRegion(word: { start: number | null; end: number | null; syllableSpans: SyllableSpan[] }, stressedIndex: number | null): { start: number; end: number } | null {
  if (word.start === null || word.end === null) return null;
  const stressed = stressedIndex !== null ? word.syllableSpans.find((s) => s.index === stressedIndex) : undefined;
  return { start: stressed ? stressed.start : word.start, end: word.end };
}

/** Accent analysis for every word that has a template and a located region. */
export function analyzeAccents(words: WordResult[], expected: ExpectedWord[], track: PitchFrame[]): void {
  for (const w of words) {
    const exp = expected[w.index];
    const mark = exp?.token.primaryMark;
    if (!mark || w.status === "missing") {
      w.accent = null;
      continue;
    }
    const stressedIndex = exp.syllables.findIndex((s) => s.stressed);
    const region = accentRegion(w, stressedIndex >= 0 ? stressedIndex : null);
    w.accent = region ? analyzeAccent(track, region, mark.id, mark.nameHe) : null;
  }
}

export function accentSummary(words: WordResult[]): Pick<VerseEvaluation["summary"], "accentScore" | "accentGood" | "accentAnalysed"> {
  const analysed = words.filter((w) => w.accent && w.accent.score !== null);
  const accentGood = analysed.filter((w) => w.accent!.verdict === "good").length;
  return {
    accentScore: analysed.length ? Math.round(analysed.reduce((a, w) => a + (w.accent!.score as number), 0) / analysed.length) : null,
    accentGood,
    accentAnalysed: analysed.length,
  };
}

export function evaluateLocally(
  expected: ExpectedWord[],
  track: PitchFrame[],
  profile: VoiceProfile | null,
): Omit<VerseEvaluation, "engine" | "tradition"> {
  const analysis = analyzeNuclei(track);
  const { nuclei, gaps, syllableIntervalS } = analysis;
  const durationS = track.length ? track[track.length - 1].t : 0;
  const syllables = expected.flatMap((w) => w.syllables);
  const alignment = alignSyllables(syllables, nuclei, alignOptionsForTempo(syllableIntervalS));

  // refined, non-overlapping playback boundaries per word
  const perWord = new Map<number, Nucleus[]>();
  for (const m of alignment.matches) {
    const wi = syllables[m.syllable].wordIndex;
    perWord.set(wi, [...(perWord.get(wi) ?? []), nuclei[m.nucleus]]);
  }
  const refined = new Map(refineBoundaries(spansFromMatches(perWord), track, analysis.rms, gaps, durationS).map((b) => [b.index, b]));
  // global tempo: seconds of nucleus per weight unit (median → robust to one odd word)
  const rates = alignment.matches.map((m) => (nuclei[m.nucleus].end - nuclei[m.nucleus].start) / syllables[m.syllable].weight);
  const tempo = percentile(rates, 0.5);

  const words: WordResult[] = expected.map((w) => {
    const mine = alignment.matches.filter((m) => syllables[m.syllable].wordIndex === w.index);
    const matchedNuclei = mine.map((m) => nuclei[m.nucleus]);
    const syllableSpans: SyllableSpan[] = mine.map((m) => ({ index: syllables[m.syllable].index, start: nuclei[m.nucleus].start, end: nuclei[m.nucleus].end }));
    const bounds = refined.get(w.index);
    const start = bounds ? bounds.start : null;
    const end = bounds ? bounds.end : null;

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
      syllableSpans,
      phones: [],
      accent: null,
    };
  });
  analyzeAccents(words, expected, track);

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
      ...accentSummary(words),
    },
    track,
    nuclei,
    gaps,
    syllableIntervalS,
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

/**
 * Remote forced-alignment engine — `POST {base}/api/align` (api-contract.ts). The server's
 * phoneme/syllable boundaries replace the local timestamps; status, rhythm, pitch and accent
 * are then derived locally on those precise boundaries.
 */
export class RemoteEngine implements PronunciationEngine {
  readonly id = "remote" as const;
  readonly capabilities = { phonetic: true, timestamps: true };
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  constructor(baseUrl: string, fetchImpl?: typeof fetch) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    // Browsers require fetch to be called with the global as `this`; a bare method reference
    // stored on the instance throws "Illegal invocation". Wrap the default.
    this.fetchImpl = fetchImpl ?? ((input, init) => globalThis.fetch(input, init));
  }

  async evaluate(request: EvaluationRequest): Promise<VerseEvaluation> {
    const expected = buildExpectedWords(request.verse.text);
    const body: AlignRequest = {
      contractVersion: ALIGN_CONTRACT_VERSION,
      tradition: request.tradition,
      verse: request.verse,
      expected: expected.map((w) => ({
        index: w.index,
        display: w.display,
        pointed: w.pointed,
        ipa: w.ipa,
        roman: w.roman,
        syllables: w.syllables.map((s) => ({ index: s.index, ipa: s.ipa, stressed: s.stressed, weight: s.weight })),
        markId: w.token.primaryMark?.id ?? null,
        disjunctive: w.disjunctive,
      })),
      profile: request.profile,
      audio: { mimeType: request.recording.mimeType, durationMs: request.recording.durationMs, base64: await blobToBase64(request.recording.blob) },
    };
    const res = await this.fetchImpl(`${this.baseUrl}${ALIGN_PATH}`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`alignment server: HTTP ${res.status}`);
    const json: unknown = await res.json();
    if (!isAlignResponse(json)) throw new Error("alignment server: malformed response");

    // local acoustics on the server's boundaries
    const decoded = await decodeBlob(request.recording.blob);
    const track = estimatePitchTrack(decoded.samples, decoded.sampleRate);
    return { engine: this.id, tradition: request.tradition, remoteEngine: json.engine, ...fromAlignResponse(json, expected, track, request.profile) };
  }
}

/** Map an AlignResponse onto WordResults (status from coverage + phonetic score; accent locally). */
export function fromAlignResponse(response: AlignResponse, expected: ExpectedWord[], track: PitchFrame[], profile: VoiceProfile | null): Omit<VerseEvaluation, "engine" | "tradition"> {
  const byIndex = new Map(response.words.map((w) => [w.index, w]));
  const words: WordResult[] = expected.map((w) => {
    const r = byIndex.get(w.index);
    const start = r?.start ?? null;
    const end = r?.end ?? null;
    const syllableSpans: SyllableSpan[] = (r?.syllables ?? []).map((s) => ({ index: s.index, start: s.start, end: s.end }));
    const phones: PhoneSpan[] = (r?.phones ?? []).map((p) => ({ phone: p.phone, start: p.start, end: p.end, score: p.score }));
    const phonetic: PhoneticResult | null = r?.phonetic ? { score: r.phonetic.score, issues: r.phonetic.issues ?? [] } : null;
    const syllablesMatched = Math.min(w.syllables.length, syllableSpans.length);
    let status: WordStatus = start === null ? "missing" : syllablesMatched >= w.syllables.length ? "correct" : "minor";
    if (status === "correct" && phonetic && phonetic.score < 0.6) status = "minor";
    const notes: string[] = [];
    if (status === "missing") notes.push("המילה לא זוהתה בהקלטה");
    else if (syllablesMatched < w.syllables.length) notes.push(`זוהו ${syllablesMatched} מתוך ${w.syllables.length} הברות`);

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
    return {
      index: w.index,
      display: w.display,
      pointed: w.pointed,
      roman: w.roman,
      start,
      end,
      status,
      syllablesExpected: w.syllables.length,
      syllablesMatched,
      rhythmDeviation: null,
      pitchMovementSemitones,
      pitchVsBaselineSemitones,
      phonetic,
      notes,
      syllableSpans,
      phones,
      accent: null,
    };
  });
  analyzeAccents(words, expected, track);
  const correct = words.filter((w) => w.status === "correct").length;
  const minor = words.filter((w) => w.status === "minor").length;
  const missing = words.filter((w) => w.status === "missing").length;
  const syllables = expected.reduce((a, w) => a + w.syllables.length, 0);
  return {
    words,
    summary: {
      correct,
      minor,
      missing,
      score: scoreFor(words),
      coverage: syllables ? words.reduce((a, w) => a + w.syllablesMatched, 0) / syllables : 0,
      extraNuclei: 0,
      ...accentSummary(words),
    },
    track,
  };
}

/** Remote first; on any failure the local engine answers and `fallbackFrom` says why. */
export class FallbackEngine implements PronunciationEngine {
  readonly id = "remote" as const;
  readonly capabilities = { phonetic: true, timestamps: true };
  constructor(
    private readonly primary: PronunciationEngine,
    private readonly fallback: PronunciationEngine,
  ) {}
  async evaluate(request: EvaluationRequest): Promise<VerseEvaluation> {
    try {
      return await this.primary.evaluate(request);
    } catch (err) {
      const local = await this.fallback.evaluate(request);
      return { ...local, fallbackFrom: { engine: "remote", reason: err instanceof Error ? err.message : String(err) } };
    }
  }
}

export function getEngine(): PronunciationEngine {
  const url = getRemoteApiUrl();
  return url ? new FallbackEngine(new RemoteEngine(url), new LocalRhythmEngine()) : new LocalRhythmEngine();
}
