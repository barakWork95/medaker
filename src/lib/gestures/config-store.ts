/**
 * Runtime gesture configuration.
 *
 * `GESTURE_CONFIG` (taamim/config.ts) holds the compiled-in DEFAULTS. This store
 * layers overrides on top so thresholds can be tuned on a real device without a
 * rebuild:
 *   1. localStorage  — persisted from the in-app Tuning panel (`?tune=1` or footer link)
 *   2. URL query     — e.g. `?longPressMs=400&dollarOneMinScore=0.65` (wins over storage)
 *
 * Pure-TS module (no React) so `classifyStroke` and the hook can read it; React
 * components use `useGestureConfig()` (useSyncExternalStore) to re-render on change.
 */
import { useSyncExternalStore } from "react";
import { GESTURE_CONFIG } from "@/lib/taamim/config";
import type { GestureEvent } from "./useGestureRecognizer";

export type GestureConfigKey = keyof typeof GESTURE_CONFIG;
export type GestureConfig = { -readonly [K in GestureConfigKey]: number };

export const GESTURE_CONFIG_DEFAULTS: GestureConfig = { ...GESTURE_CONFIG };
export const GESTURE_CONFIG_KEYS = Object.keys(GESTURE_CONFIG) as GestureConfigKey[];

/** UI metadata for the tuning panel — keep in sync with GESTURE_CONFIG. */
export const GESTURE_CONFIG_META: Record<
  GestureConfigKey,
  { label: string; min: number; max: number; step: number; unit: string; hint: string }
> = {
  longPressMs: { label: "לחיצה ארוכה", min: 250, max: 1200, step: 50, unit: "ms", hint: "כמה זמן להחזיק עד שנספרת לחיצה ארוכה" },
  tapGapMs: { label: "מרווח בין הקשות", min: 200, max: 900, step: 50, unit: "ms", hint: "מרווח מרבי בין הקשות בהקשה משולשת" },
  tapMaxMs: { label: "משך הקשה מרבי", min: 100, max: 500, step: 25, unit: "ms", hint: "מגע ארוך מזה אינו נחשב הקשה" },
  tapSlopPx: { label: "סטיית הקשה", min: 4, max: 30, step: 1, unit: "px", hint: "תזוזה מותרת בזמן הקשה/לחיצה" },
  minStrokePx: { label: "אורך מינימלי של תנועה", min: 10, max: 80, step: 2, unit: "px", hint: "תנועות קצרות מזה מתעלמות" },
  zigzagMinChanges: { label: "שינויי כיוון בקשקוש", min: 2, max: 6, step: 1, unit: "", hint: "מספר חילופי כיוון אופקיים הנדרש לשלשלת" },
  directionHysteresisPx: { label: "היסטרזיס כיוון", min: 3, max: 25, step: 1, unit: "px", hint: "רעידה קטנה מזה לא נספרת כשינוי כיוון" },
  diagonalMinDeg: { label: "אלכסון — זווית מינימלית", min: 5, max: 45, step: 1, unit: "°", hint: "זווית הקו מתחת לאופק (0 = אופקי)" },
  diagonalMaxDeg: { label: "אלכסון — זווית מרבית", min: 45, max: 85, step: 1, unit: "°", hint: "90 = אנכי" },
  swipeDownToleranceDeg: { label: "החלקה למטה — סטייה מאנכי", min: 5, max: 40, step: 1, unit: "°", hint: "כמה מותר לסטות מקו אנכי ישר כלפי מטה" },
  dollarOneMinScore: { label: "סף זיהוי $1", min: 0.4, max: 0.95, step: 0.01, unit: "", hint: "ציון התאמה מינימלי לתבנית (נמוך = סלחני)" },
  dollarOneAngleRangeDeg: { label: "טווח סיבוב $1", min: 0, max: 60, step: 1, unit: "°", hint: "כמה מותר לסובב את התנועה כדי להתאים לתבנית" },
};

const STORAGE_KEY = "medaker.gestureConfig.v1";
const listeners = new Set<() => void>();
let current: GestureConfig = { ...GESTURE_CONFIG_DEFAULTS };
let loaded = false;

function sanitize(input: unknown): Partial<GestureConfig> {
  const out: Partial<GestureConfig> = {};
  if (!input || typeof input !== "object") return out;
  for (const key of GESTURE_CONFIG_KEYS) {
    const v = Number((input as Record<string, unknown>)[key]);
    if (Number.isFinite(v)) out[key] = v;
  }
  return out;
}

function loadOnce() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  let stored: Partial<GestureConfig> = {};
  try {
    stored = sanitize(JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "null"));
  } catch {
    /* storage unavailable or corrupt → defaults */
  }
  const fromUrl: Partial<GestureConfig> = {};
  try {
    const params = new URLSearchParams(window.location.search);
    for (const key of GESTURE_CONFIG_KEYS) {
      const raw = params.get(key);
      if (raw !== null && Number.isFinite(Number(raw))) fromUrl[key] = Number(raw);
    }
  } catch {
    /* ignore */
  }
  current = { ...GESTURE_CONFIG_DEFAULTS, ...stored, ...fromUrl };
}

function persist() {
  if (typeof window === "undefined") return;
  try {
    const overrides: Partial<GestureConfig> = {};
    for (const key of GESTURE_CONFIG_KEYS) {
      if (current[key] !== GESTURE_CONFIG_DEFAULTS[key]) overrides[key] = current[key];
    }
    if (Object.keys(overrides).length) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides));
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

function emit() {
  for (const fn of listeners) fn();
}

/** Current effective config (defaults + persisted + URL overrides). Safe on the server. */
export function getGestureConfig(): GestureConfig {
  loadOnce();
  return current;
}

export function setGestureConfig(patch: Partial<GestureConfig>) {
  loadOnce();
  current = { ...current, ...sanitize(patch) };
  persist();
  emit();
}

export function resetGestureConfig() {
  loadOnce();
  current = { ...GESTURE_CONFIG_DEFAULTS };
  persist();
  emit();
}

export function subscribeGestureConfig(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function useGestureConfig(): GestureConfig {
  return useSyncExternalStore(subscribeGestureConfig, getGestureConfig, () => GESTURE_CONFIG_DEFAULTS);
}

/* ---------- Last-gesture debug record (feeds the tuning panel) ---------- */

export interface GestureDebugRecord {
  at: number;
  wordId: string | null;
  event: GestureEvent;
  durationMs: number;
  pathPx: number;
}

let lastGesture: GestureDebugRecord | null = null;
const debugListeners = new Set<() => void>();

export function recordGestureDebug(record: GestureDebugRecord) {
  lastGesture = record;
  for (const fn of debugListeners) fn();
}

export function useLastGesture(): GestureDebugRecord | null {
  return useSyncExternalStore(
    (fn) => {
      debugListeners.add(fn);
      return () => {
        debugListeners.delete(fn);
      };
    },
    () => lastGesture,
    () => null,
  );
}
