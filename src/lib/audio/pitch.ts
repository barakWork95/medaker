/**
 * Fundamental-frequency (F0) estimation — pure functions, no DOM.
 *
 * Algorithm: a compact McLeod Pitch Method (normalised square-difference / autocorrelation
 * with parabolic peak interpolation), run on 16 kHz mono PCM:
 *   1. resample to ANALYSIS_RATE (cheap box-filter decimation + linear interpolation)
 *   2. frame (64 ms window, 10 ms hop), remove DC, gate on RMS
 *   3. NSDF over τ ∈ [sr/fMax, sr/fMin]; pick the first key maximum ≥ peakThreshold × global max
 *   4. clarity = NSDF at the peak → voiced if ≥ clarityThreshold; f0 = sr / τ*
 *   5. median-filter the voiced track to kill octave glitches
 *
 * summarizePitch() turns a track into the numbers the voice profile stores.
 */

export const ANALYSIS_RATE = 16000;

export interface PitchOptions {
  /** Analysis window (ms). 64 ms ≥ 4 periods at 60 Hz. */
  frameMs?: number;
  hopMs?: number;
  fMin?: number;
  fMax?: number;
  /** Frames quieter than this fraction of the loudest frame are unvoiced. */
  rmsGate?: number;
  /** Absolute RMS floor (full-scale = 1). */
  rmsFloor?: number;
  /** NSDF value the chosen peak must reach to count as voiced. */
  clarityThreshold?: number;
  /** First key maximum ≥ this × the global NSDF maximum wins (avoids octave errors). */
  peakThreshold?: number;
  /** Median-filter window over voiced frames (odd). */
  medianWindow?: number;
}

const DEFAULTS: Required<PitchOptions> = {
  frameMs: 64,
  hopMs: 10,
  fMin: 60,
  fMax: 500,
  rmsGate: 0.1,
  rmsFloor: 0.005,
  clarityThreshold: 0.6,
  peakThreshold: 0.8,
  medianWindow: 5,
};

export interface PitchFrame {
  /** Frame centre time in seconds. */
  t: number;
  /** Hz, or null when unvoiced / silent. */
  f0: number | null;
  /** RMS over the whole analysis window (frameMs). */
  rms: number;
  /** RMS over the central 20 ms only — sharp enough to separate short syllables. */
  rmsShort: number;
  clarity: number;
}

export interface PitchSummary {
  frames: number;
  voicedFrames: number;
  voicedRatio: number;
  meanF0: number | null;
  medianF0: number | null;
  /** 10th / 90th percentiles — robust "low" and "high" of the speaker's range. */
  p10F0: number | null;
  p90F0: number | null;
  minF0: number | null;
  maxF0: number | null;
  /** 12·log2(p90/p10). */
  rangeSemitones: number | null;
}

/** Mix down interleaved channels to mono. */
export function toMono(channels: Float32Array[]): Float32Array {
  if (channels.length === 1) return channels[0];
  const n = channels[0].length;
  const out = new Float32Array(n);
  for (const ch of channels) for (let i = 0; i < n; i++) out[i] += ch[i] / channels.length;
  return out;
}

/**
 * Resample with a box low-pass (when decimating) and linear interpolation.
 * Adequate for pitch tracking; not for playback.
 */
export function resample(samples: Float32Array, fromRate: number, toRate: number): Float32Array {
  if (fromRate === toRate) return samples;
  let src = samples;
  if (fromRate > toRate) {
    // anti-alias: moving average over the decimation factor
    const k = Math.max(1, Math.round(fromRate / toRate));
    if (k > 1) {
      src = new Float32Array(samples.length);
      let acc = 0;
      for (let i = 0; i < samples.length; i++) {
        acc += samples[i];
        if (i >= k) acc -= samples[i - k];
        src[i] = acc / Math.min(k, i + 1);
      }
    }
  }
  const ratio = fromRate / toRate;
  const outLen = Math.floor(src.length / ratio);
  const out = new Float32Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const pos = i * ratio;
    const j = Math.floor(pos);
    const frac = pos - j;
    const a = src[j] ?? 0;
    const b = src[j + 1] ?? a;
    out[i] = a + (b - a) * frac;
  }
  return out;
}

function rmsOf(x: Float32Array): number {
  let s = 0;
  for (let i = 0; i < x.length; i++) s += x[i] * x[i];
  return Math.sqrt(s / x.length);
}

/** Normalised square difference function for τ ∈ [tauMin, tauMax]. */
function nsdf(frame: Float32Array, tauMin: number, tauMax: number): Float32Array {
  const n = frame.length;
  const out = new Float32Array(tauMax + 1);
  for (let tau = tauMin; tau <= tauMax; tau++) {
    let acf = 0;
    let m = 0;
    for (let i = 0; i + tau < n; i++) {
      const a = frame[i];
      const b = frame[i + tau];
      acf += a * b;
      m += a * a + b * b;
    }
    out[tau] = m > 0 ? (2 * acf) / m : 0;
  }
  return out;
}

/** Key maxima of the NSDF (peaks between positive zero crossings), as [tau, value]. */
function keyMaxima(d: Float32Array, tauMin: number, tauMax: number): [number, number][] {
  const peaks: [number, number][] = [];
  let tau = tauMin;
  // skip the initial positive lobe around τ≈0 (we start at tauMin, but ensure we start below zero)
  while (tau <= tauMax && d[tau] > 0) tau++;
  while (tau <= tauMax) {
    while (tau <= tauMax && d[tau] <= 0) tau++;
    let best = -1;
    let bestTau = -1;
    while (tau <= tauMax && d[tau] > 0) {
      if (d[tau] > best) {
        best = d[tau];
        bestTau = tau;
      }
      tau++;
    }
    if (bestTau >= 0) peaks.push([bestTau, best]);
  }
  return peaks;
}

function parabolic(d: Float32Array, tau: number): [number, number] {
  const a = d[tau - 1] ?? d[tau];
  const b = d[tau];
  const c = d[tau + 1] ?? d[tau];
  const denom = a - 2 * b + c;
  if (denom === 0) return [tau, b];
  const shift = (0.5 * (a - c)) / denom;
  const value = b - 0.25 * (a - c) * shift;
  return [tau + shift, value];
}

export function median(values: number[]): number | null {
  if (!values.length) return null;
  const s = [...values].sort((x, y) => x - y);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export function percentile(values: number[], p: number): number | null {
  if (!values.length) return null;
  const s = [...values].sort((x, y) => x - y);
  const idx = (s.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  return s[lo] + (s[hi] - s[lo]) * (idx - lo);
}

/**
 * Track F0 over a mono signal. `sampleRate` may be anything; the signal is resampled to
 * ANALYSIS_RATE internally.
 */
export function estimatePitchTrack(samples: Float32Array, sampleRate: number, options: PitchOptions = {}): PitchFrame[] {
  const o = { ...DEFAULTS, ...options };
  const sr = ANALYSIS_RATE;
  const x = resample(samples, sampleRate, sr);
  const frameLen = Math.round((o.frameMs / 1000) * sr);
  const hop = Math.round((o.hopMs / 1000) * sr);
  const tauMin = Math.max(2, Math.floor(sr / o.fMax));
  const tauMax = Math.min(frameLen - 2, Math.ceil(sr / o.fMin));
  if (x.length < frameLen) return [];

  // pass 1: frames + RMS (for the relative gate) + short-window RMS (energy envelope)
  const frames: { start: number; rms: number; rmsShort: number; data: Float32Array }[] = [];
  const shortLen = Math.round(0.02 * sr);
  const shortOff = Math.max(0, Math.floor((frameLen - shortLen) / 2));
  let maxRms = 0;
  for (let start = 0; start + frameLen <= x.length; start += hop) {
    const data = new Float32Array(frameLen);
    let mean = 0;
    for (let i = 0; i < frameLen; i++) mean += x[start + i];
    mean /= frameLen;
    for (let i = 0; i < frameLen; i++) data[i] = x[start + i] - mean;
    const rms = rmsOf(data);
    if (rms > maxRms) maxRms = rms;
    frames.push({ start, rms, rmsShort: rmsOf(data.subarray(shortOff, shortOff + shortLen)), data });
  }
  const gate = Math.max(o.rmsFloor, maxRms * o.rmsGate);

  // pass 2: NSDF per frame
  const track: PitchFrame[] = frames.map(({ start, rms, rmsShort, data }) => {
    const t = (start + frameLen / 2) / sr;
    if (rms < gate) return { t, f0: null, rms, rmsShort, clarity: 0 };
    const d = nsdf(data, tauMin, tauMax);
    const peaks = keyMaxima(d, tauMin, tauMax);
    if (!peaks.length) return { t, f0: null, rms, rmsShort, clarity: 0 };
    let globalMax = 0;
    for (const [, v] of peaks) if (v > globalMax) globalMax = v;
    const chosen = peaks.find(([, v]) => v >= o.peakThreshold * globalMax) ?? peaks[0];
    const [tau, clarity] = parabolic(d, chosen[0]);
    if (clarity < o.clarityThreshold || tau <= 0) return { t, f0: null, rms, rmsShort, clarity };
    return { t, f0: sr / tau, rms, rmsShort, clarity };
  });

  // pass 3: median filter over voiced frames only
  const w = Math.max(1, o.medianWindow | 1);
  const half = w >> 1;
  const voicedIdx = track.map((f, i) => (f.f0 !== null ? i : -1)).filter((i) => i >= 0);
  const smoothed = voicedIdx.map((_, k) => {
    const lo = Math.max(0, k - half);
    const hi = Math.min(voicedIdx.length - 1, k + half);
    const window = voicedIdx.slice(lo, hi + 1).map((i) => track[i].f0 as number);
    return median(window) as number;
  });
  voicedIdx.forEach((i, k) => {
    track[i] = { ...track[i], f0: smoothed[k] };
  });
  return track;
}

export function summarizePitch(track: PitchFrame[]): PitchSummary {
  const voiced = track.filter((f) => f.f0 !== null).map((f) => f.f0 as number);
  const p10 = percentile(voiced, 0.1);
  const p90 = percentile(voiced, 0.9);
  return {
    frames: track.length,
    voicedFrames: voiced.length,
    voicedRatio: track.length ? voiced.length / track.length : 0,
    meanF0: voiced.length ? voiced.reduce((a, b) => a + b, 0) / voiced.length : null,
    medianF0: median(voiced),
    p10F0: p10,
    p90F0: p90,
    minF0: voiced.length ? Math.min(...voiced) : null,
    maxF0: voiced.length ? Math.max(...voiced) : null,
    rangeSemitones: p10 && p90 ? 12 * Math.log2(p90 / p10) : null,
  };
}

export function hzToSemitones(fromHz: number, toHz: number): number {
  return 12 * Math.log2(toHz / fromHz);
}
