/**
 * $1 templates for Medaker. Coordinates are in SCREEN space: +x → right, +y → down.
 * The page is RTL, but pointer coordinates are not — "right-to-left" always means
 * decreasing x.
 *
 * Distractor templates (mapped to UNKNOWN) are essential: without them a
 * left-to-right tilde would be accepted as the closest right-to-left one.
 */
import { makeTemplate, type Point, type Template } from "./dollar-one";
import type { RecognizedGesture } from "@/lib/taamim/config";

function sample(fn: (t: number) => Point, n = 48): Point[] {
  return Array.from({ length: n }, (_, i) => fn(i / (n - 1)));
}

const TAU = Math.PI * 2;

/** Tilde: one sine period, amplitude relative to width. */
const tilde = (rtl: boolean, upFirst: boolean) =>
  sample((t) => ({
    x: rtl ? 1 - t : t,
    y: 0.5 + (upFirst ? -0.25 : 0.25) * Math.sin(TAU * t),
  }));

/**
 * Figure-eight (lemniscate of Gerono): x = cos θ, y = sin 2θ / 2.
 * Starting at θ0 and moving in direction `dir` (+1 / −1).
 */
const infinity = (theta0: number, dir: 1 | -1, flipY = false) =>
  sample((t) => {
    const th = theta0 + dir * TAU * t;
    return { x: Math.cos(th), y: ((flipY ? -1 : 1) * Math.sin(2 * th)) / 2 };
  }, 64);

export const TEMPLATE_GESTURES: Record<string, RecognizedGesture> = {
  backslash: "DIAGONAL",
  "tilde-rtl-up": "TILDE",
  "tilde-rtl-down": "TILDE",
  "infinity-rtl-a": "TILDE",
  "infinity-rtl-b": "TILDE",
  "infinity-rtl-c": "TILDE",
  "infinity-rtl-d": "TILDE",
  "zigzag-up": "ZIGZAG",
  "vline-down": "SWIPE_DOWN",
  // distractors
  slash: "UNKNOWN",
  "slash-reverse": "UNKNOWN",
  "backslash-reverse": "UNKNOWN",
  "hline-ltr": "UNKNOWN",
  "hline-rtl": "UNKNOWN",
  "vline-up": "UNKNOWN",
  "tilde-ltr-up": "UNKNOWN",
  "tilde-ltr-down": "UNKNOWN",
  "infinity-ltr-a": "UNKNOWN",
  "infinity-ltr-b": "UNKNOWN",
  "zigzag-down": "UNKNOWN",
  circle: "UNKNOWN",
  "check-mark": "UNKNOWN",
};

export const TEMPLATES: Template[] = [
  makeTemplate("backslash", [
    { x: 0, y: 0 },
    { x: 1, y: 1 },
  ]),
  makeTemplate("tilde-rtl-up", tilde(true, true)),
  makeTemplate("tilde-rtl-down", tilde(true, false)),
  // start at the right lobe (θ=0 → x=1) and head left; both vertical phases
  makeTemplate("infinity-rtl-a", infinity(0, 1)),
  makeTemplate("infinity-rtl-b", infinity(0, -1)),
  // start at the centre crossing (θ=π/2 → x=0) heading left
  makeTemplate("infinity-rtl-c", infinity(Math.PI / 2, 1)),
  makeTemplate("infinity-rtl-d", infinity(Math.PI / 2, 1, true)),
  makeTemplate("zigzag-up", [
    { x: 0, y: 1 },
    { x: 1, y: 0.75 },
    { x: 0, y: 0.5 },
    { x: 1, y: 0.25 },
    { x: 0, y: 0 },
  ]),

  // ---- distractors ----
  makeTemplate("slash", [
    { x: 0, y: 1 },
    { x: 1, y: 0 },
  ]),
  makeTemplate("slash-reverse", [
    { x: 1, y: 0 },
    { x: 0, y: 1 },
  ]),
  makeTemplate("backslash-reverse", [
    { x: 1, y: 1 },
    { x: 0, y: 0 },
  ]),
  makeTemplate("hline-ltr", [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
  ]),
  makeTemplate("hline-rtl", [
    { x: 1, y: 0 },
    { x: 0, y: 0 },
  ]),
  makeTemplate("vline-down", [
    { x: 0, y: 0 },
    { x: 0, y: 1 },
  ]),
  makeTemplate("vline-up", [
    { x: 0, y: 1 },
    { x: 0, y: 0 },
  ]),
  makeTemplate("tilde-ltr-up", tilde(false, true)),
  makeTemplate("tilde-ltr-down", tilde(false, false)),
  makeTemplate("infinity-ltr-a", infinity(Math.PI, 1)),
  makeTemplate("infinity-ltr-b", infinity(Math.PI, -1)),
  makeTemplate("zigzag-down", [
    { x: 0, y: 0 },
    { x: 1, y: 0.25 },
    { x: 0, y: 0.5 },
    { x: 1, y: 0.75 },
    { x: 0, y: 1 },
  ]),
  makeTemplate(
    "circle",
    sample((t) => ({ x: Math.cos(TAU * t), y: Math.sin(TAU * t) })),
  ),
  makeTemplate("check-mark", [
    { x: 0, y: 0.5 },
    { x: 0.35, y: 1 },
    { x: 1, y: 0 },
  ]),
];
