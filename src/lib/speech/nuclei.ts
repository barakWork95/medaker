/**
 * Syllable-nucleus detection from the Phase 1 pitch track (10 ms frames with RMS + F0).
 * A nucleus = a local maximum of the smoothed energy inside a voiced run.
 */
import type { PitchFrame } from "@/lib/audio/pitch";

export interface Nucleus {
  /** Peak time (s). */
  t: number;
  start: number;
  end: number;
  /** Peak RMS. */
  energy: number;
  /** Median F0 over the nucleus (Hz), null if unvoiced. */
  f0: number | null;
}

export interface NucleiOptions {
  /** Smoothing window over frames (odd). */
  smooth?: number;
  /** Gaps (s) shorter than this do not split a voiced run. */
  bridgeGap?: number;
  /** Minimum peak separation (s). */
  minSeparation?: number;
  /** A peak must exceed this × run maximum. */
  minRelative?: number;
  /** A valley between two peaks must dip below this × the smaller peak, else they merge. */
  valleyRatio?: number;
  /** Frames below this × global max RMS are silence. */
  silenceRatio?: number;
}

const D: Required<NucleiOptions> = {
  smooth: 5,
  bridgeGap: 0.04,
  minSeparation: 0.08,
  minRelative: 0.25,
  valleyRatio: 0.7,
  silenceRatio: 0.08,
};

function smooth(values: number[], w: number): number[] {
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

export function detectNuclei(track: PitchFrame[], options: NucleiOptions = {}): Nucleus[] {
  const o = { ...D, ...options };
  if (track.length < 3) return [];
  const rms = smooth(
    track.map((f) => f.rms),
    o.smooth,
  );
  const maxRms = Math.max(...rms);
  const silence = maxRms * o.silenceRatio;
  const hop = track.length > 1 ? track[1].t - track[0].t : 0.01;
  const bridgeFrames = Math.round(o.bridgeGap / hop);

  // 1. active runs (energy above silence), bridging short gaps
  const active = rms.map((r) => r > silence);
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

  // 2. peaks within each run
  const nuclei: Nucleus[] = [];
  const minSepFrames = Math.round(o.minSeparation / hop);
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
    if (!peaks.length && b >= a) peaks = [a + Math.round((b - a) / 2)];
    // merge peaks without a real valley between them or too close together
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
    // boundaries: valleys between consecutive peaks, run edges outside
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
