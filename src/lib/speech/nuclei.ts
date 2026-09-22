/**
 * Syllable-nucleus and silence-gap detection from the Phase 1 pitch track (10 ms frames with
 * RMS + F0).
 *
 * Adaptive to the recording and the reader:
 *  - the silence level is derived from the recording's own noise floor (p10 of RMS) and loud
 *    level (p90), not from the global peak;
 *  - detection runs twice: the first pass estimates the reader's syllable tempo (median peak
 *    interval), the second pass scales every timing constant (bridging, minimum separation,
 *    minimum gap) to that tempo.
 */
import { percentile, type PitchFrame } from "@/lib/audio/pitch";

export interface Nucleus {
  /** Peak time (s). */
  t: number;
  /** Energy onset / offset around the peak (valley or run edge), s. */
  start: number;
  end: number;
  /** Peak (smoothed) RMS. */
  energy: number;
  /** Median F0 over the nucleus (Hz), null if unvoiced. */
  f0: number | null;
}

export interface SilenceGap {
  start: number;
  end: number;
  duration: number;
}

export interface NucleiOptions {
  /** Smoothing window over frames (odd). */
  smooth?: number;
  /** Silence level = floor + silenceFraction × (loud − floor). */
  silenceFraction?: number;
  /** A peak must exceed this × run maximum. */
  minRelative?: number;
  /** A valley between two peaks must dip below this × the smaller peak, else they merge. */
  valleyRatio?: number;
  /** Fallback tempo (s per syllable) when it cannot be estimated. */
  defaultSyllableS?: number;
  /** Timing constants as fractions of the syllable interval, clamped to [min, max] seconds. */
  bridgeGap?: { frac: number; min: number; max: number };
  minSeparation?: { frac: number; min: number; max: number };
  minGap?: { frac: number; min: number; max: number };
}

export const NUCLEI_DEFAULTS: Required<NucleiOptions> = {
  smooth: 5,
  silenceFraction: 0.12,
  minRelative: 0.25,
  valleyRatio: 0.7,
  defaultSyllableS: 0.2,
  bridgeGap: { frac: 0.25, min: 0.03, max: 0.08 },
  minSeparation: { frac: 0.45, min: 0.06, max: 0.16 },
  minGap: { frac: 0.2, min: 0.04, max: 0.12 },
};

export interface NucleiAnalysis {
  nuclei: Nucleus[];
  gaps: SilenceGap[];
  /** Median interval between consecutive nucleus peaks (s) — the reader's syllable tempo. */
  syllableIntervalS: number;
  silenceLevel: number;
  noiseFloor: number;
  /** Smoothed RMS per frame (for boundary refinement). */
  rms: number[];
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const scaled = (c: { frac: number; min: number; max: number }, interval: number) => clamp(c.frac * interval, c.min, c.max);

export function smoothSeries(values: number[], w: number): number[] {
  const half = w >> 1;
  return values.map((_, i) => {
    let s = 0;
    let n = 0;
    for (let j = Math.max(0, i - half); j <= Math.min(values.length - 1, i + half); j++) {
      s += values[j];
      n++;
    }
    return s / n;
  });
}

/** Adaptive silence level from the recording's own dynamics. */
export function silenceLevelOf(rms: number[], fraction: number): { silenceLevel: number; noiseFloor: number } {
  const floor = percentile(rms, 0.1) ?? 0;
  const loud = percentile(rms, 0.9) ?? 0;
  return { silenceLevel: floor + fraction * Math.max(0, loud - floor), noiseFloor: floor };
}

function activeRuns(active: boolean[], bridgeFrames: number): [number, number][] {
  const runs: [number, number][] = [];
  let i = 0;
  while (i < active.length) {
    if (!active[i]) {
      i++;
      continue;
    }
    let j = i;
    let gap = 0;
    let end = i;
    while (j < active.length) {
      if (active[j]) {
        end = j;
        gap = 0;
      } else if (++gap > bridgeFrames) break;
      j++;
    }
    runs.push([i, end]);
    i = end + 1;
  }
  return runs;
}

function peaksInRuns(track: PitchFrame[], rms: number[], runs: [number, number][], hop: number, minSepS: number, o: Required<NucleiOptions>): Nucleus[] {
  const nuclei: Nucleus[] = [];
  const minSepFrames = Math.round(minSepS / hop);
  for (const [a, b] of runs) {
    let runMax = 0;
    for (let k = a; k <= b; k++) runMax = Math.max(runMax, rms[k]);
    const threshold = runMax * o.minRelative;
    let peaks: number[] = [];
    for (let k = a; k <= b; k++) {
      const left = k > a ? rms[k - 1] : 0;
      const right = k < b ? rms[k + 1] : 0;
      if (rms[k] >= threshold && rms[k] >= left && rms[k] > right) peaks.push(k);
    }
    if (!peaks.length) peaks = [a + Math.round((b - a) / 2)];
    const merged: number[] = [];
    for (const p of peaks) {
      const last = merged[merged.length - 1];
      if (last === undefined) {
        merged.push(p);
        continue;
      }
      let valley = Infinity;
      for (let k = last; k <= p; k++) valley = Math.min(valley, rms[k]);
      const smaller = Math.min(rms[last], rms[p]);
      if (p - last < minSepFrames || valley > smaller * o.valleyRatio) {
        if (rms[p] > rms[last]) merged[merged.length - 1] = p;
      } else merged.push(p);
    }
    merged.forEach((p, idx) => {
      let start = a;
      let end = b;
      if (idx > 0) {
        let v = merged[idx - 1];
        for (let k = merged[idx - 1]; k <= p; k++) if (rms[k] < rms[v]) v = k;
        start = v;
      }
      if (idx < merged.length - 1) {
        let v = p;
        for (let k = p; k <= merged[idx + 1]; k++) if (rms[k] < rms[v]) v = k;
        end = v;
      }
      const f0s = track
        .slice(start, end + 1)
        .map((f) => f.f0)
        .filter((f): f is number => f !== null)
        .sort((x, y) => x - y);
      nuclei.push({
        t: track[p].t,
        start: track[start].t - hop / 2,
        end: track[end].t + hop / 2,
        energy: rms[p],
        f0: f0s.length ? f0s[f0s.length >> 1] : null,
      });
    });
  }
  return nuclei;
}

export function estimateSyllableInterval(nuclei: Nucleus[], fallback: number): number {
  if (nuclei.length < 3) return fallback;
  const intervals = nuclei.slice(1).map((n, i) => n.t - nuclei[i].t);
  return percentile(intervals, 0.5) ?? fallback;
}

/** Silent stretches (below `silenceLevel`) lasting at least `minGapS`. */
export function detectSilenceGaps(track: PitchFrame[], rms: number[], silenceLevel: number, minGapS: number): SilenceGap[] {
  const hop = track.length > 1 ? track[1].t - track[0].t : 0.01;
  const gaps: SilenceGap[] = [];
  let i = 0;
  while (i < rms.length) {
    if (rms[i] >= silenceLevel) {
      i++;
      continue;
    }
    let j = i;
    while (j < rms.length && rms[j] < silenceLevel) j++;
    const start = track[i].t - hop / 2;
    const end = track[j - 1].t + hop / 2;
    if (end - start >= minGapS) gaps.push({ start, end, duration: end - start });
    i = j;
  }
  return gaps;
}

export function analyzeNuclei(track: PitchFrame[], options: NucleiOptions = {}): NucleiAnalysis {
  const o: Required<NucleiOptions> = { ...NUCLEI_DEFAULTS, ...options };
  const empty: NucleiAnalysis = { nuclei: [], gaps: [], syllableIntervalS: o.defaultSyllableS, silenceLevel: 0, noiseFloor: 0, rms: [] };
  if (track.length < 3) return empty;
  const hop = track[1].t - track[0].t;
  // energy envelope: short-window RMS (falls back to frame RMS for older tracks)
  const raw = track.map((f) => f.rmsShort ?? f.rms);

  // pass 1: default tempo → nuclei → measured tempo
  const pass = (interval: number) => {
    // smoothing scales with tempo: ≈ a quarter of a syllable, 3–7 frames
    const w = Math.max(3, Math.min(7, Math.round(0.25 * interval / hop) | 1));
    const rms = smoothSeries(raw, w);
    const { silenceLevel, noiseFloor } = silenceLevelOf(rms, o.silenceFraction);
    const active = rms.map((r) => r > silenceLevel);
    const runs = activeRuns(active, Math.round(scaled(o.bridgeGap, interval) / hop));
    return { rms, silenceLevel, noiseFloor, nuclei: peaksInRuns(track, rms, runs, hop, scaled(o.minSeparation, interval), o) };
  };
  const first = pass(o.defaultSyllableS);
  const interval = estimateSyllableInterval(first.nuclei, o.defaultSyllableS);
  // pass 2: tempo-scaled constants
  const second = pass(interval);
  const { rms, silenceLevel, noiseFloor, nuclei } = second;
  const syllableIntervalS = estimateSyllableInterval(nuclei, interval);
  const gaps = detectSilenceGaps(track, rms, silenceLevel, scaled(o.minGap, syllableIntervalS));
  return { nuclei, gaps, syllableIntervalS, silenceLevel, noiseFloor, rms };
}

/** Back-compat helper. */
export function detectNuclei(track: PitchFrame[], options: NucleiOptions = {}): Nucleus[] {
  return analyzeNuclei(track, options).nuclei;
}
