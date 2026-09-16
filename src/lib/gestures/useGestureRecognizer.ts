"use client";

/**
 * React hook: pointer-event state machine → Medaker gestures.
 *
 *  pointerdown ─┬─ no movement, 500ms ──────────────► LONG_PRESS
 *               ├─ up < 300ms, moved < 10px ────────► tap (×3 within 500ms gaps → TRIPLE_TAP,
 *               │                                       else TAP{taps} after the window closes)
 *               └─ moved ≥ 10px … pointerup ────────► classifyStroke() → DIAGONAL | ZIGZAG | TILDE | SWIPE_DOWN | UNKNOWN
 *                                                       (SWIPE_DOWN, finger lifted, SWIPE_DOWN again within swipeTwiceGapMs → SWIPE_DOWN_TWICE;
 *                                                        a lone SWIPE_DOWN is emitted when the gap window closes)
 *
 * One hook instance per touch target (word). Uses Pointer Events so mouse, pen
 * and touch behave identically; the element needs the `.gesture-target` class
 * (touch-action: none) so the browser does not steal the pointer for scrolling.
 */
import { useCallback, useEffect, useRef } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import type { RecognizedGesture } from "@/lib/taamim/config";
import { classifyStroke, type StrokeClassification, type StrokePoint } from "./classify";
import { getGestureConfig, recordGestureDebug } from "./config-store";
import { pathLength } from "./dollar-one";

export interface GestureEvent {
  gesture: RecognizedGesture;
  /** For TAP / TRIPLE_TAP: number of taps. */
  taps?: number;
  /** For strokes: classifier output. */
  classification?: StrokeClassification;
  /** Raw path (strokes only) — handy for debugging overlays. */
  points?: StrokePoint[];
}

export interface UseGestureRecognizerOptions {
  onGesture: (event: GestureEvent) => void;
  disabled?: boolean;
  /** Identifies the target in the tuning panel's debug readout. */
  debugId?: string;
  /** Override the runtime store (tests / special targets). */
  longPressMs?: number;
  tapGapMs?: number;
}

export interface GestureHandlers {
  onPointerDown: (e: ReactPointerEvent<HTMLElement>) => void;
  onPointerMove: (e: ReactPointerEvent<HTMLElement>) => void;
  onPointerUp: (e: ReactPointerEvent<HTMLElement>) => void;
  onPointerCancel: (e: ReactPointerEvent<HTMLElement>) => void;
  onContextMenu: (e: React.SyntheticEvent) => void;
}

export function useGestureRecognizer({
  onGesture,
  disabled = false,
  debugId,
  longPressMs,
  tapGapMs,
}: UseGestureRecognizerOptions): GestureHandlers {
  const onGestureRef = useRef(onGesture);
  useEffect(() => {
    onGestureRef.current = onGesture;
  }, [onGesture]);

  const active = useRef(false);
  const pointerId = useRef<number | null>(null);
  const points = useRef<StrokePoint[]>([]);
  const moved = useRef(false);
  const longPressFired = useRef(false);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tapCount = useRef(0);
  const tapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /**
   * A SWIPE_DOWN waiting to see whether a second one follows. SWIPE_DOWN_TWICE is
   * strictly sequential with ONE finger: pointerdown while a stroke is active is ignored
   * (see onPointerDown), so a two-finger swipe can only ever yield a single SWIPE_DOWN.
   */
  const pendingSwipe = useRef<{ event: GestureEvent; startedAt: number; path: StrokePoint[] } | null>(null);
  const swipeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = (ref: typeof longPressTimer) => {
    if (ref.current) {
      clearTimeout(ref.current);
      ref.current = null;
    }
  };

  const emit = useCallback(
    (event: GestureEvent, startedAt: number, path: StrokePoint[]) => {
      recordGestureDebug({
        at: Date.now(),
        wordId: debugId ?? null,
        event,
        durationMs: Math.round(performance.now() - startedAt),
        pathPx: Math.round(pathLength(path)),
      });
      onGestureRef.current(event);
    },
    [debugId],
  );
  const emitRef = useRef(emit);
  useEffect(() => {
    emitRef.current = emit;
  }, [emit]);

  /** Emit a pending lone SWIPE_DOWN now (called when something else interrupts the window). */
  const flushPendingSwipe = useCallback(() => {
    clearTimer(swipeTimer);
    const pending = pendingSwipe.current;
    pendingSwipe.current = null;
    if (pending) emitRef.current(pending.event, pending.startedAt, pending.path);
  }, []);

  const reset = useCallback(() => {
    active.current = false;
    pointerId.current = null;
    points.current = [];
    moved.current = false;
    longPressFired.current = false;
    clearTimer(longPressTimer);
  }, []);

  useEffect(
    () => () => {
      clearTimer(longPressTimer);
      clearTimer(tapTimer);
      clearTimer(swipeTimer);
    },
    [],
  );


  const onPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLElement>) => {
      if (disabled || active.current) return; // second finger while active → ignored (no multi-touch gestures)
      if (e.pointerType === "mouse" && e.button !== 0) return;
      // Stop text selection / compat mouse events; zoom is stopped by touch-action.
      e.preventDefault();
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // Synthetic / already-released pointers throw NotFoundError; capture is an optimisation only.
      }
      active.current = true;
      pointerId.current = e.pointerId;
      moved.current = false;
      longPressFired.current = false;
      points.current = [{ x: e.clientX, y: e.clientY, t: performance.now() }];

      const startedAt = points.current[0].t;
      clearTimer(longPressTimer);
      longPressTimer.current = setTimeout(() => {
        if (active.current && !moved.current) {
          longPressFired.current = true;
          tapCount.current = 0;
          clearTimer(tapTimer);
          flushPendingSwipe();
          emit({ gesture: "LONG_PRESS" }, startedAt, points.current);
        }
      }, longPressMs ?? getGestureConfig().longPressMs);
    },
    [disabled, emit, flushPendingSwipe, longPressMs],
  );

  const onPointerMove = useCallback((e: ReactPointerEvent<HTMLElement>) => {
    if (!active.current || e.pointerId !== pointerId.current) return;
    const p = { x: e.clientX, y: e.clientY, t: performance.now() };
    points.current.push(p);
    if (!moved.current) {
      const first = points.current[0];
      if (Math.hypot(p.x - first.x, p.y - first.y) > getGestureConfig().tapSlopPx) {
        moved.current = true;
        clearTimer(longPressTimer);
      }
    }
  }, []);

  const onPointerUp = useCallback(
    (e: ReactPointerEvent<HTMLElement>) => {
      if (!active.current || e.pointerId !== pointerId.current) return;
      const path = points.current;
      const wasMoved = moved.current;
      const fired = longPressFired.current;
      const duration = performance.now() - path[0].t;
      reset();
      if (fired) return; // already emitted LONG_PRESS

      const cfg = getGestureConfig();
      const startedAt = path[0].t;

      if (!wasMoved) {
        if (duration > cfg.tapMaxMs) return; // a press that was released too early: ignore
        flushPendingSwipe();
        tapCount.current += 1;
        clearTimer(tapTimer);
        if (tapCount.current >= 3) {
          tapCount.current = 0;
          emit({ gesture: "TRIPLE_TAP", taps: 3 }, startedAt, path);
          return;
        }
        tapTimer.current = setTimeout(() => {
          const taps = tapCount.current;
          tapCount.current = 0;
          emit({ gesture: "TAP", taps }, startedAt, path);
        }, tapGapMs ?? cfg.tapGapMs);
        return;
      }

      tapCount.current = 0;
      clearTimer(tapTimer);
      const classification = classifyStroke(path, cfg);
      const event: GestureEvent = { gesture: classification.gesture, classification, points: path };

      if (classification.gesture === "SWIPE_DOWN") {
        if (pendingSwipe.current) {
          // second sequential swipe-down inside the window → SWIPE_DOWN_TWICE
          clearTimer(swipeTimer);
          const first = pendingSwipe.current;
          pendingSwipe.current = null;
          emit(
            { gesture: "SWIPE_DOWN_TWICE", classification, points: [...first.path, ...path] },
            first.startedAt,
            [...first.path, ...path],
          );
          return;
        }
        pendingSwipe.current = { event, startedAt, path };
        swipeTimer.current = setTimeout(flushPendingSwipe, cfg.swipeTwiceGapMs);
        return;
      }

      flushPendingSwipe();
      emit(event, startedAt, path);
    },
    [emit, flushPendingSwipe, reset, tapGapMs],
  );

  const onPointerCancel = useCallback(
    (e: ReactPointerEvent<HTMLElement>) => {
      if (e.pointerId === pointerId.current) reset();
    },
    [reset],
  );

  const onContextMenu = useCallback((e: React.SyntheticEvent) => e.preventDefault(), []);

  return { onPointerDown, onPointerMove, onPointerUp, onPointerCancel, onContextMenu };
}
