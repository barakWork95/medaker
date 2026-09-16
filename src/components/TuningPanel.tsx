"use client";

/**
 * On-device gesture tuning panel. Open with `?tune=1` or the footer link.
 * Sliders write to the runtime config store (persisted in localStorage); the
 * readout shows how the last gesture was classified so thresholds can be
 * adjusted while testing on a real phone. Copy the JSON into GESTURE_CONFIG
 * once a setting is proven.
 */
import { useState } from "react";
import {
  GESTURE_CONFIG_DEFAULTS,
  GESTURE_CONFIG_KEYS,
  GESTURE_CONFIG_META,
  resetGestureConfig,
  setGestureConfig,
  useGestureConfig,
  useLastGesture,
} from "@/lib/gestures/config-store";

export function TuningPanel({ onClose }: { onClose: () => void }) {
  const cfg = useGestureConfig();
  const last = useLastGesture();
  const [copied, setCopied] = useState(false);

  const overrides = Object.fromEntries(
    GESTURE_CONFIG_KEYS.filter((k) => cfg[k] !== GESTURE_CONFIG_DEFAULTS[k]).map((k) => [k, cfg[k]]),
  );

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(cfg, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked */
    }
  };

  return (
    <section
      aria-label="כיוונון מחוות"
      className="rounded-2xl border border-gold/50 bg-navy-800 p-4 text-sm text-parchment"
      data-testid="tuning-panel"
    >
      <header className="flex items-center justify-between gap-2">
        <h2 className="font-semibold text-gold">כיוונון מחוות</h2>
        <div className="flex gap-2">
          <button type="button" onClick={copy} className="rounded border border-navy-700 px-2 py-1 hover:border-gold/60">
            {copied ? "הועתק ✓" : "העתק JSON"}
          </button>
          <button type="button" onClick={resetGestureConfig} className="rounded border border-navy-700 px-2 py-1 hover:border-gold/60">
            איפוס
          </button>
          <button type="button" onClick={onClose} className="rounded border border-navy-700 px-2 py-1 hover:border-gold/60" aria-label="סגור">
            ✕
          </button>
        </div>
      </header>

      {/* Last gesture readout */}
      <div className="mt-3 rounded-lg bg-navy p-3 font-mono text-xs leading-relaxed" dir="ltr">
        {last ? (
          <>
            <div>
              <span className="text-gold">{last.event.gesture}</span>
              {last.event.taps ? ` ×${last.event.taps}` : ""} · {last.durationMs}ms · {last.pathPx}px
              {last.wordId ? ` · ${last.wordId}` : ""}
            </div>
            {last.event.classification && (
              <div className="text-parchment/70">
                {last.event.classification.template ?? "—"}
                {last.event.classification.score !== undefined ? ` (${last.event.classification.score.toFixed(2)})` : ""}
                {" · "}
                {last.event.classification.reason}
              </div>
            )}
          </>
        ) : (
          <span className="text-parchment/50">בצע מחווה על מילה כדי לראות כיצד זוהתה</span>
        )}
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {GESTURE_CONFIG_KEYS.map((key) => {
          const meta = GESTURE_CONFIG_META[key];
          const changed = cfg[key] !== GESTURE_CONFIG_DEFAULTS[key];
          return (
            <label key={key} className="block">
              <span className="flex justify-between">
                <span className={changed ? "text-gold" : ""}>{meta.label}</span>
                <span className="font-mono text-parchment/80" dir="ltr">
                  {cfg[key]}
                  {meta.unit}
                </span>
              </span>
              <input
                type="range"
                min={meta.min}
                max={meta.max}
                step={meta.step}
                value={cfg[key]}
                onChange={(e) => setGestureConfig({ [key]: Number(e.target.value) })}
                className="w-full accent-[var(--color-gold)]"
                aria-label={meta.label}
              />
              <span className="block text-[11px] text-parchment/50">
                {meta.hint} · ברירת מחדל {GESTURE_CONFIG_DEFAULTS[key]}
                {meta.unit}
              </span>
            </label>
          );
        })}
      </div>

      {Object.keys(overrides).length > 0 && (
        <pre className="mt-3 overflow-x-auto rounded bg-navy p-2 text-[11px] text-parchment/80" dir="ltr">
          {JSON.stringify(overrides)}
        </pre>
      )}
    </section>
  );
}
