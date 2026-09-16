/**
 * $1 Unistroke Recognizer (Wobbrock, Wilson & Li, UIST 2007) — TypeScript port,
 * with BOUNDED rotation invariance: we do NOT rotate strokes to their indicative
 * angle, and we only search ±angleRange° for the best fit. This keeps "\" distinct
 * from "/" and a right-to-left wave distinct from a left-to-right one.
 *
 * Pipeline: resample(64) → scaleToSquare(250) → translateToOrigin → best-angle path distance.
 */

export interface Point {
  x: number;
  y: number;
}

export interface Template {
  name: string;
  points: Point[]; // preprocessed
}

export interface RecognizeResult {
  name: string;
  score: number; // 0..1, higher is better
  distance: number;
}

export const NUM_POINTS = 64;
const SQUARE_SIZE = 250;
const ORIGIN: Point = { x: 0, y: 0 };
const HALF_DIAGONAL = 0.5 * Math.sqrt(2 * SQUARE_SIZE * SQUARE_SIZE);
const PHI = 0.5 * (-1 + Math.sqrt(5));
/** Below this width/height ratio a stroke is treated as 1-D and scaled uniformly. */
const ONE_D_THRESHOLD = 0.12;

const rad = (deg: number) => (deg * Math.PI) / 180;

export function pathLength(pts: Point[]): number {
  let d = 0;
  for (let i = 1; i < pts.length; i++) d += distance(pts[i - 1], pts[i]);
  return d;
}

export function distance(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export function centroid(pts: Point[]): Point {
  let x = 0;
  let y = 0;
  for (const p of pts) {
    x += p.x;
    y += p.y;
  }
  return { x: x / pts.length, y: y / pts.length };
}

export function boundingBox(pts: Point[]) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

export function resample(points: Point[], n = NUM_POINTS): Point[] {
  if (points.length === 0) return [];
  if (points.length === 1) return Array.from({ length: n }, () => ({ ...points[0] }));
  const interval = pathLength(points) / (n - 1);
  if (interval === 0) return Array.from({ length: n }, () => ({ ...points[0] }));
  const pts = points.map((p) => ({ ...p }));
  const out: Point[] = [{ ...pts[0] }];
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const d = distance(pts[i - 1], pts[i]);
    if (acc + d >= interval) {
      const t = (interval - acc) / d;
      const q = {
        x: pts[i - 1].x + t * (pts[i].x - pts[i - 1].x),
        y: pts[i - 1].y + t * (pts[i].y - pts[i - 1].y),
      };
      out.push(q);
      pts.splice(i, 0, q); // q becomes the next start point
      acc = 0;
    } else {
      acc += d;
    }
  }
  while (out.length < n) out.push({ ...pts[pts.length - 1] });
  return out.slice(0, n);
}

export function rotateBy(pts: Point[], radians: number): Point[] {
  const c = centroid(pts);
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return pts.map((p) => ({
    x: (p.x - c.x) * cos - (p.y - c.y) * sin + c.x,
    y: (p.x - c.x) * sin + (p.y - c.y) * cos + c.y,
  }));
}

export function scaleToSquare(pts: Point[], size = SQUARE_SIZE): Point[] {
  const b = boundingBox(pts);
  const longSide = Math.max(b.width, b.height) || 1;
  const uniform = Math.min(b.width, b.height) / longSide < ONE_D_THRESHOLD;
  const sx = uniform ? size / longSide : size / (b.width || 1);
  const sy = uniform ? size / longSide : size / (b.height || 1);
  return pts.map((p) => ({ x: p.x * sx, y: p.y * sy }));
}

export function translateTo(pts: Point[], target: Point = ORIGIN): Point[] {
  const c = centroid(pts);
  return pts.map((p) => ({ x: p.x + target.x - c.x, y: p.y + target.y - c.y }));
}

export function normalize(raw: Point[]): Point[] {
  return translateTo(scaleToSquare(resample(raw)), ORIGIN);
}

function pathDistance(a: Point[], b: Point[]): number {
  let d = 0;
  for (let i = 0; i < a.length; i++) d += distance(a[i], b[i]);
  return d / a.length;
}

function distanceAtAngle(pts: Point[], tmpl: Point[], radians: number): number {
  return pathDistance(rotateBy(pts, radians), tmpl);
}

/** Golden-section search for the best rotation in [a, b] (radians). */
function distanceAtBestAngle(pts: Point[], tmpl: Point[], a: number, b: number, threshold: number) {
  let x1 = PHI * a + (1 - PHI) * b;
  let f1 = distanceAtAngle(pts, tmpl, x1);
  let x2 = (1 - PHI) * a + PHI * b;
  let f2 = distanceAtAngle(pts, tmpl, x2);
  while (Math.abs(b - a) > threshold) {
    if (f1 < f2) {
      b = x2;
      x2 = x1;
      f2 = f1;
      x1 = PHI * a + (1 - PHI) * b;
      f1 = distanceAtAngle(pts, tmpl, x1);
    } else {
      a = x1;
      x1 = x2;
      f1 = f2;
      x2 = (1 - PHI) * a + PHI * b;
      f2 = distanceAtAngle(pts, tmpl, x2);
    }
  }
  return Math.min(f1, f2);
}

export function makeTemplate(name: string, raw: Point[]): Template {
  return { name, points: normalize(raw) };
}

export interface RecognizeOptions {
  /** Bounded rotation search, ± degrees. Default 20. */
  angleRangeDeg?: number;
  anglePrecisionDeg?: number;
}

/** Return every template scored, best first. */
export function recognizeAll(
  raw: Point[],
  templates: Template[],
  { angleRangeDeg = 20, anglePrecisionDeg = 2 }: RecognizeOptions = {},
): RecognizeResult[] {
  if (raw.length < 2) return [];
  const pts = normalize(raw);
  const results = templates.map((t) => {
    const d = distanceAtBestAngle(
      pts,
      t.points,
      -rad(angleRangeDeg),
      rad(angleRangeDeg),
      rad(anglePrecisionDeg),
    );
    return { name: t.name, distance: d, score: 1 - d / HALF_DIAGONAL };
  });
  return results.sort((a, b) => b.score - a.score);
}

export function recognize(
  raw: Point[],
  templates: Template[],
  options?: RecognizeOptions,
): RecognizeResult | null {
  return recognizeAll(raw, templates, options)[0] ?? null;
}
