/**
 * Cantillation pitch-contour matcher (ניתוח טעמים מוזיקלי).
 *
 *   region   = from the accented syllable's onset to the end of the word (the melisma of a
 *              disjunctive lives there); whole word if the stressed syllable was not located
 *   contour  = voiced F0 frames in the region → semitones relative to the region's opening
 *              pitch (median of its first fifth) → resampled to N points over [0, 1]
 *   score    = 0.5 · shape (DTW distance vs. the accent template, in semitones, against its
 *              tolerance) + 0.3 · magnitude (range vs. expected movement) + 0.2 · direction
 *              (sign of the end-to-start change), as 0–100
 *
 * Pure functions; the engine feeds it PitchFrames and word/syllable boundaries.
 */
import { percentile, type PitchFrame } from "@/lib/audio/pitch";
import { ACCENT_TEMPLATES_BY_MARK, type AccentTemplate } from "./accent-templates";

export const CONTOUR_POINTS = 16;
export const MIN_VOICED_FRAMES = 4;

export type AccentVerdict = "good" | "partial" | "off" | "unvoiced";

export interface ContourPoint {
  /** Normalised time 0..1. */
  t: number;
  /** Semitones vs. the region's opening pitch. */
  st: number;
}

export interface AccentAnalysis {
  markId: string;
  nameHe: string;
  region: { start: number; end: number };
  /** The user's normalised contour (CONTOUR_POINTS points), empty when unvoiced. */
  contour: ContourPoint[];
  /** The template resampled to the same grid. */
  template: ContourPoint[];
  templateDescribeHe: string;
  voicedFrames: number;
  movementSemitones: number | null;
  shapeScore: number | null;
  magnitudeScore: number | null;
  directionScore: number | null;
  /** 0..100, null when unvoiced. */
  score: number | null;
  verdict: AccentVerdict;
}

export const ACCENT_THRESHOLDS = { good: 70, partial: 40 } as const;

export function verdictFor(score: number | null): AccentVerdict {
  if (score === null) return "unvoiced";
  if (score >= ACCENT_THRESHOLDS.good) return "good";
  if (score >= ACCENT_THRESHOLDS.partial) return "partial";
  return "off";
}

/** Linear resampling of (t, value) pairs to n evenly spaced points over [0, 1]. */
export function resampleContour(points: { t: number; st: number }[], n = CONTOUR_POINTS): ContourPoint[] {
  if (!points.length) return [];
  if (points.length === 1) return Array.from({ length: n }, (_, i) => ({ t: i / (n - 1), st: points[0].st }));
  const t0 = points[0].t;
  const t1 = points[points.length - 1].t;
  const span = t1 - t0 || 1;
  const out: ContourPoint[] = [];
  let k = 0;
  for (let i = 0; i < n; i++) {
    const t = t0 + (i / (n - 1)) * span;
    while (k < points.length - 2 && points[k + 1].t < t) k++;
    const a = points[k];
    const b = points[k + 1];
    const f = b.t === a.t ? 0 : Math.min(1, Math.max(0, (t - a.t) / (b.t - a.t)));
    out.push({ t: i / (n - 1), st: a.st + (b.st - a.st) * f });
  }
  return out;
}

export function templateContour(template: AccentTemplate, n = CONTOUR_POINTS): ContourPoint[] {
  const pts = template.points.map((st, i) => ({ t: template.points.length > 1 ? i / (template.points.length - 1) : 0, st }));
  return resampleContour(pts, n);
}

/** DTW mean distance (semitones per point) between two equal-length contours, band-limited. */
export function contourDistance(a: ContourPoint[], b: ContourPoint[], band = 3): number {
  const n = a.length;
  const m = b.length;
  if (!n || !m) return Infinity;
  const INF = Number.POSITIVE_INFINITY;
  const D: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(INF));
  D[0][0] = 0;
  for (let i = 1; i <= n; i++) {
    for (let j = Math.max(1, i - band); j <= Math.min(m, i + band); j++) {
      const cost = Math.abs(a[i - 1].st - b[j - 1].st);
      D[i][j] = cost + Math.min(D[i - 1][j - 1], D[i - 1][j], D[i][j - 1]);
    }
  }
  return D[n][m] / Math.max(n, m);
}

export interface AccentRegion {
  start: number;
  end: number;
}

/** Semitone contour of the voiced frames in [start, end], relative to the opening pitch. */
export function extractContour(track: PitchFrame[], region: AccentRegion): { points: { t: number; st: number }[]; voicedFrames: number } {
  const frames = track.filter((f) => f.t >= region.start && f.t <= region.end && f.f0 !== null);
  if (frames.length < MIN_VOICED_FRAMES) return { points: [], voicedFrames: frames.length };
  const head = frames.slice(0, Math.max(1, Math.round(frames.length / 5))).map((f) => f.f0 as number);
  const ref = percentile(head, 0.5) as number;
  return {
    points: frames.map((f) => ({ t: f.t, st: 12 * Math.log2((f.f0 as number) / ref) })),
    voicedFrames: frames.length,
  };
}

export function scoreContour(user: ContourPoint[], template: AccentTemplate): {
  shapeScore: number;
  magnitudeScore: number;
  directionScore: number;
  score: number;
  movementSemitones: number;
} {
  const tmpl = templateContour(template, user.length || CONTOUR_POINTS);
  const dist = contourDistance(user, tmpl);
  const shapeScore = Math.max(0, 1 - dist / template.tolerance);

  const sts = user.map((p) => p.st);
  const movementSemitones = Math.max(...sts) - Math.min(...sts);
  const expected = template.movement;
  const magnitudeScore = expected <= 0.5 ? (movementSemitones < 1.5 ? 1 : Math.max(0, 1 - (movementSemitones - 1.5) / 4)) : Math.max(0, 1 - Math.abs(Math.log((movementSemitones + 0.5) / (expected + 0.5))) / Math.log(3));

  // direction = sign of the largest excursion from the opening pitch (a zaqef goes UP and
  // returns; an etnahta goes DOWN) — end-vs-start would call both "no change"
  const userDir = excursionSign(sts);
  const tmplDir = excursionSign(template.points);
  const directionScore = userDir === tmplDir ? 1 : userDir === 0 || tmplDir === 0 ? 0.5 : 0;

  const score = Math.round(100 * (0.5 * shapeScore + 0.3 * magnitudeScore + 0.2 * directionScore));
  return { shapeScore, magnitudeScore, directionScore, score, movementSemitones };
}

/** Sign of the point farthest from 0; |st| < 0.5 counts as "no movement". */
function excursionSign(sts: number[]): number {
  let best = 0;
  for (const v of sts) if (Math.abs(v) > Math.abs(best)) best = v;
  return Math.abs(best) < 0.5 ? 0 : Math.sign(best);
}

export function analyzeAccent(track: PitchFrame[], region: AccentRegion, markId: string, nameHe: string): AccentAnalysis | null {
  const template = ACCENT_TEMPLATES_BY_MARK.get(markId);
  if (!template) return null;
  const tmpl = templateContour(template);
  const { points, voicedFrames } = extractContour(track, region);
  if (!points.length) {
    return {
      markId,
      nameHe,
      region,
      contour: [],
      template: tmpl,
      templateDescribeHe: template.describeHe,
      voicedFrames,
      movementSemitones: null,
      shapeScore: null,
      magnitudeScore: null,
      directionScore: null,
      score: null,
      verdict: "unvoiced",
    };
  }
  const contour = resampleContour(points);
  const s = scoreContour(contour, template);
  return {
    markId,
    nameHe,
    region,
    contour,
    template: tmpl,
    templateDescribeHe: template.describeHe,
    voicedFrames,
    movementSemitones: s.movementSemitones,
    shapeScore: s.shapeScore,
    magnitudeScore: s.magnitudeScore,
    directionScore: s.directionScore,
    score: s.score,
    verdict: verdictFor(s.score),
  };
}
