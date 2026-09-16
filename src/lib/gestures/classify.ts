/**
 * Stroke classifier: turns a recorded pointer path into a Medaker gesture.
 *
 * Strategy (see CLAUDE.md → "Gesture mapping logic"):
 *   1. Geometric pre-checks (path length, zigzag).
 *   2. $1 recognizer with bounded rotation over TEMPLATES.
 *   3. Directional post-checks so that orientation-sensitive gestures
 *      ("\" must go down-right, waves must go right-to-left) are enforced.
 *
 * Taps and long presses are NOT strokes; the hook handles them by timing.
 */
import type { RecognizedGesture } from "@/lib/taamim/config";
import { getGestureConfig, type GestureConfig } from "./config-store";
import { boundingBox, pathLength, recognizeAll, type Point } from "./dollar-one";
import { TEMPLATES, TEMPLATE_GESTURES } from "./templates";

export interface StrokePoint extends Point {
  t: number; // ms
}

export interface StrokeClassification {
  gesture: RecognizedGesture;
  /** Best $1 template name (if $1 ran). */
  template?: string;
  /** Best $1 score (if $1 ran). */
  score?: number;
  /** Why the stroke was rejected / accepted — for debugging & tuning. */
  reason: string;
}

/**
 * Count reversals of a 1-D signal, ignoring wobble smaller than `hysteresis`.
 * "right, left, right, left" → 3 changes.
 */
export function directionChanges(values: number[], hysteresis: number): number {
  let dir = 0;
  let changes = 0;
  let extreme = values[0] ?? 0;
  for (const v of values) {
    const delta = v - extreme;
    if (dir === 0) {
      if (Math.abs(delta) >= hysteresis) {
        dir = Math.sign(delta);
        extreme = v;
      }
    } else if (Math.sign(delta) === dir) {
      extreme = v;
    } else if (Math.abs(delta) >= hysteresis) {
      changes++;
      dir = -dir;
      extreme = v;
    }
  }
  return changes;
}

export function isUpwardZigzag(points: Point[], cfg: GestureConfig = getGestureConfig()): boolean {
  if (points.length < 4) return false;
  const first = points[0];
  const last = points[points.length - 1];
  const box = boundingBox(points);
  const netUp = first.y - last.y; // screen y grows downward
  if (netUp < Math.max(20, 0.5 * box.height)) return false;
  if (box.width < cfg.directionHysteresisPx * 1.5) return false;
  const xChanges = directionChanges(
    points.map((p) => p.x),
    cfg.directionHysteresisPx,
  );
  return xChanges >= cfg.zigzagMinChanges;
}

/** Angle in degrees of the chord start→end, measured clockwise from +x (screen space). */
export function chordAngleDeg(points: Point[]): number {
  const a = points[0];
  const b = points[points.length - 1];
  return (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
}

function isDownRightDiagonal(points: Point[], cfg: GestureConfig): boolean {
  const angle = chordAngleDeg(points); // "\" drawn top-left→bottom-right ≈ +45°
  return isStraight(points) && angle >= cfg.diagonalMinDeg && angle <= cfg.diagonalMaxDeg;
}

/** Path length no more than 30 % longer than the start→end chord. */
export function isStraight(points: Point[]): boolean {
  const a = points[0];
  const b = points[points.length - 1];
  const chord = Math.hypot(b.x - a.x, b.y - a.y);
  return chord > 0 && pathLength(points) / chord < 1.3;
}

/** Straight stroke heading down (screen +y), within ±swipeDownToleranceDeg of vertical. */
function isDownSwipe(points: Point[], cfg: GestureConfig): boolean {
  return isStraight(points) && Math.abs(chordAngleDeg(points) - 90) <= cfg.swipeDownToleranceDeg;
}

function isRightToLeftWave(points: Point[], cfg: GestureConfig): boolean {
  const first = points[0];
  const last = points[points.length - 1];
  const box = boundingBox(points);
  const yChanges = directionChanges(
    points.map((p) => p.y),
    cfg.directionHysteresisPx,
  );
  const xChanges = directionChanges(
    points.map((p) => p.x),
    cfg.directionHysteresisPx,
  );
  const netLeft = first.x - last.x;

  // Tilde: clearly ends left of where it started and wobbles vertically at least once.
  const tilde = netLeft >= 0.4 * box.width && yChanges >= 1 && xChanges <= 1;
  if (tilde) return true;

  // Infinity: near-closed loop that first heads left, reverses horizontally at
  // least once (a loop started at its right lobe reverses exactly once) and
  // crosses itself (≥2 vertical reversals), wider than tall.
  const closed = Math.hypot(last.x - first.x, last.y - first.y) <= 0.5 * Math.max(box.width, box.height);
  const quarter = points[Math.floor(points.length / 4)];
  const headsLeft = quarter.x < first.x;
  return closed && headsLeft && xChanges >= 1 && yChanges >= 2 && box.width >= box.height * 0.8;
}

/**
 * @param cfg thresholds — defaults to the runtime store (compiled defaults + device overrides).
 */
export function classifyStroke(points: StrokePoint[], cfg: GestureConfig = getGestureConfig()): StrokeClassification {
  if (points.length < 2) return { gesture: "UNKNOWN", reason: "too few points" };
  const length = pathLength(points);
  if (length < cfg.minStrokePx) return { gesture: "UNKNOWN", reason: `stroke too short (${length.toFixed(0)}px)` };

  if (isUpwardZigzag(points, cfg)) {
    return { gesture: "ZIGZAG", reason: "upward zigzag heuristic" };
  }

  // Straight strokes are classified by chord angle alone: $1 scales every stroke to a
  // square, which turns any straight line into a 45° diagonal and erases its angle.
  if (isStraight(points)) {
    const angle = chordAngleDeg(points);
    if (angle >= cfg.diagonalMinDeg && angle <= cfg.diagonalMaxDeg) {
      return { gesture: "DIAGONAL", reason: `straight line at ${angle.toFixed(0)}° (down-right)` };
    }
    if (Math.abs(angle - 90) <= cfg.swipeDownToleranceDeg) {
      return { gesture: "SWIPE_DOWN", reason: `straight line at ${angle.toFixed(0)}° (down)` };
    }
    return { gesture: "UNKNOWN", reason: `straight line at ${angle.toFixed(0)}° matches no gesture` };
  }

  const ranked = recognizeAll(points, TEMPLATES, { angleRangeDeg: cfg.dollarOneAngleRangeDeg });
  const best = ranked[0];
  if (!best || best.score < cfg.dollarOneMinScore) {
    return {
      gesture: "UNKNOWN",
      template: best?.name,
      score: best?.score,
      reason: `no template above ${cfg.dollarOneMinScore}`,
    };
  }

  const candidate = TEMPLATE_GESTURES[best.name] ?? "UNKNOWN";
  const base = { template: best.name, score: best.score };

  switch (candidate) {
    case "DIAGONAL":
      return isDownRightDiagonal(points, cfg)
        ? { gesture: "DIAGONAL", ...base, reason: "$1 backslash + down-right angle" }
        : { gesture: "UNKNOWN", ...base, reason: "backslash shape but wrong direction" };
    case "SWIPE_DOWN":
      return isDownSwipe(points, cfg)
        ? { gesture: "SWIPE_DOWN", ...base, reason: "$1 vertical line + downward direction" }
        : { gesture: "UNKNOWN", ...base, reason: "vertical line but not downward" };
    case "TILDE":
      return isRightToLeftWave(points, cfg)
        ? { gesture: "TILDE", ...base, reason: "$1 wave + right-to-left flow" }
        : { gesture: "UNKNOWN", ...base, reason: "wave shape but not right-to-left" };
    case "ZIGZAG":
      // $1 matched a zigzag the heuristic rejected (e.g. too few reversals).
      return { gesture: "UNKNOWN", ...base, reason: "zigzag-like but fewer than required reversals" };
    default:
      return { gesture: "UNKNOWN", ...base, reason: `matched distractor ${best.name}` };
  }
}
