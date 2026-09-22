/**
 * Word boundary refinement after alignment.
 *
 * Matched nuclei give a word's core; its playable segment should start where speech resumes
 * after the previous word and end where it stops before the next one:
 *   start = end of the last silence gap between the previous word's last nucleus and this
 *           word's first nucleus; else the energy valley (argmin RMS) between the two peaks;
 *           else the energy onset of the first nucleus.
 *   end   = mirror image.
 * Small padding is added and then clipped so consecutive segments never overlap.
 */
import type { PitchFrame } from "@/lib/audio/pitch";
import type { Nucleus, SilenceGap } from "./nuclei";

export interface WordSpan {
  index: number;
  /** Peak times of this word's matched nuclei (sorted). */
  peaks: number[];
  /** Energy onset/offset of first/last nucleus. */
  onset: number;
  offset: number;
}

export interface RefinedBoundary {
  index: number;
  start: number;
  end: number;
}

export interface BoundaryOptions {
  padS?: number;
}

function valleyBetween(track: PitchFrame[], rms: number[], t0: number, t1: number): number {
  let best = -1;
  let bestV = Infinity;
  for (let i = 0; i < track.length; i++) {
    if (track[i].t < t0 || track[i].t > t1) continue;
    if (rms[i] < bestV) {
      bestV = rms[i];
      best = i;
    }
  }
  return best >= 0 ? track[best].t : (t0 + t1) / 2;
}

export function refineBoundaries(
  spans: WordSpan[],
  track: PitchFrame[],
  rms: number[],
  gaps: SilenceGap[],
  durationS: number,
  options: BoundaryOptions = {},
): RefinedBoundary[] {
  const pad = options.padS ?? 0.02;
  const ordered = [...spans].sort((a, b) => a.peaks[0] - b.peaks[0]);
  const out: RefinedBoundary[] = ordered.map((w, k) => {
    const prev = ordered[k - 1];
    const next = ordered[k + 1];
    const firstPeak = w.peaks[0];
    const lastPeak = w.peaks[w.peaks.length - 1];

    let start: number;
    if (prev) {
      const prevLast = prev.peaks[prev.peaks.length - 1];
      const gap = gaps.filter((g) => g.end <= firstPeak && g.start >= prevLast).sort((a, b) => b.end - a.end)[0];
      start = gap ? gap.end : valleyBetween(track, rms, prevLast, firstPeak);
    } else {
      const gap = gaps.filter((g) => g.end <= firstPeak).sort((a, b) => b.end - a.end)[0];
      start = gap && gap.end > w.onset - 0.05 ? gap.end : w.onset;
    }

    let end: number;
    if (next) {
      const nextFirst = next.peaks[0];
      const gap = gaps.filter((g) => g.start >= lastPeak && g.end <= nextFirst).sort((a, b) => a.start - b.start)[0];
      end = gap ? gap.start : valleyBetween(track, rms, lastPeak, nextFirst);
    } else {
      const gap = gaps.filter((g) => g.start >= lastPeak).sort((a, b) => a.start - b.start)[0];
      end = gap && gap.start < w.offset + 0.05 ? gap.start : w.offset;
    }
    return { index: w.index, start: Math.max(0, start - pad), end: Math.min(durationS, end + pad) };
  });
  // no overlaps between consecutive segments
  for (let k = 1; k < out.length; k++) {
    if (out[k].start < out[k - 1].end) {
      const mid = (out[k].start + out[k - 1].end) / 2;
      out[k - 1].end = mid;
      out[k].start = mid;
    }
  }
  return out;
}

/** Convenience: build spans from nuclei matched per word. */
export function spansFromMatches(perWord: Map<number, Nucleus[]>): WordSpan[] {
  const spans: WordSpan[] = [];
  for (const [index, nuclei] of perWord) {
    if (!nuclei.length) continue;
    const sorted = [...nuclei].sort((a, b) => a.t - b.t);
    spans.push({ index, peaks: sorted.map((n) => n.t), onset: sorted[0].start, offset: sorted[sorted.length - 1].end });
  }
  return spans;
}
