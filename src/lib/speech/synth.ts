/**
 * Synthesises verse-shaped audio from expected words for fixtures/tests:
 * each syllable → a harmonic burst (duration ∝ weight) with a short gap between syllables
 * and a longer gap between words. Returns the samples plus the ground-truth word boundaries.
 * Not speech — but it has exactly the energy/voicing structure the local engine aligns on.
 */
import type { ExpectedWord } from "./expected";

export interface SynthOptions {
  sampleRate?: number;
  /** ms per weight unit. */
  unitMs?: number;
  gapMs?: number;
  wordGapMs?: number;
  f0?: number;
  /** Per-word overrides: omit the word entirely, or scale its syllable durations. */
  words?: Record<number, { omit?: boolean; scale?: number; dropSyllables?: number }>;
  /** Insert an extra burst (hesitation) after this word index. */
  extraAfterWord?: number;
  leadInMs?: number;
  /** Background noise amplitude (0 = clean). Real phone recordings sit around 0.01–0.03. */
  noiseFloor?: number;
  /** Per-syllable amplitude jitter (0..1 → ±fraction), seeded. */
  amplitudeJitter?: number;
  /** Seed for jitter / noise. */
  seed?: number;
}

export interface SynthResult {
  samples: Float32Array;
  sampleRate: number;
  boundaries: { index: number; start: number; end: number }[]; // seconds; omitted words absent
}

export function synthesizeVerse(words: ExpectedWord[], options: SynthOptions = {}): SynthResult {
  const sr = options.sampleRate ?? 16000;
  const unit = (options.unitMs ?? 150) / 1000;
  const gap = (options.gapMs ?? 35) / 1000;
  const wordGap = (options.wordGapMs ?? 140) / 1000;
  const f0 = options.f0 ?? 130;
  let seed = options.seed ?? 1;
  const rand = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };
  const jitter = options.amplitudeJitter ?? 0;
  const chunks: Float32Array[] = [];
  const boundaries: SynthResult["boundaries"] = [];
  let t = 0;
  const push = (seconds: number, voiced: boolean, hz = f0) => {
    const n = Math.round(seconds * sr);
    const c = new Float32Array(n);
    if (voiced) {
      let phase = 0;
      const amp = 0.5 * (1 + (rand() * 2 - 1) * jitter);
      for (let i = 0; i < n; i++) {
        phase += (2 * Math.PI * hz) / sr;
        // raised-cosine envelope so each burst has one clear energy peak
        const env = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / n);
        c[i] = amp * env * (Math.sin(phase) + 0.5 * Math.sin(2 * phase) + 0.25 * Math.sin(3 * phase)) / 1.75;
      }
    }
    if (options.noiseFloor) for (let i = 0; i < n; i++) c[i] += (rand() * 2 - 1) * options.noiseFloor;
    chunks.push(c);
    t += seconds;
  };
  push((options.leadInMs ?? 150) / 1000, false);
  words.forEach((w, wi) => {
    const ov = options.words?.[wi] ?? {};
    if (ov.omit) return;
    const start = t;
    const sylls = w.syllables.slice(0, Math.max(1, w.syllables.length - (ov.dropSyllables ?? 0)));
    sylls.forEach((s, si) => {
      push(s.weight * unit * (ov.scale ?? 1), true, f0 * (s.stressed ? 1.12 : 1));
      if (si < sylls.length - 1) push(gap, false);
    });
    boundaries.push({ index: wi, start, end: t });
    if (options.extraAfterWord === wi) {
      push(wordGap, false);
      push(unit, true, f0 * 0.9);
    }
    if (wi < words.length - 1) push(w.disjunctive ? wordGap * 2 : wordGap, false);
  });
  push(0.15, false);
  const total = chunks.reduce((a, c) => a + c.length, 0);
  const samples = new Float32Array(total);
  let o = 0;
  for (const c of chunks) {
    samples.set(c, o);
    o += c.length;
  }
  return { samples, sampleRate: sr, boundaries };
}
