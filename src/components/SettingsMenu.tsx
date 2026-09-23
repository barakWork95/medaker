"use client";

/** Header gear → settings sheet: voice calibration status + actions. */
import { useEffect, useState } from "react";
import { formatHz, formatSemitones, saveVoiceProfile, useVoiceProfile } from "@/lib/audio/voice-profile";
import { resolveRemoteApi, type RemoteApiSource } from "@/lib/speech/engine";
import { BottomSheet } from "./BottomSheet";

type Health = "unknown" | "checking" | "ok" | "down";

export function SettingsMenu({ onCalibrate }: { onCalibrate: () => void }) {
  const [open, setOpen] = useState(false);
  const profile = useVoiceProfile();
  const [server, setServer] = useState<{ url: string | null; source: RemoteApiSource }>({ url: null, source: null });
  const [health, setHealth] = useState<Health>("unknown");

  // Resolve on open (localStorage is client-only) and ping /health.
  useEffect(() => {
    if (!open) return;
    const resolved = resolveRemoteApi();
    const controller = new AbortController();
    // setState inside async callbacks only (React Compiler lint rule)
    Promise.resolve().then(() => setServer(resolved));
    if (resolved.url) {
      Promise.resolve().then(() => setHealth("checking"));
      fetch(`${resolved.url}/health`, { signal: controller.signal })
        .then((r) => setHealth(r.ok ? "ok" : "down"))
        .catch(() => setHealth("down"));
    } else {
      Promise.resolve().then(() => setHealth("unknown"));
    }
    return () => controller.abort();
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="grid size-11 place-items-center rounded-full text-parchment/70 hover:bg-navy hover:text-gold"
        aria-label="הגדרות"
        aria-haspopup="dialog"
        data-testid="settings-trigger"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-6" aria-hidden>
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
        </svg>
      </button>

      <BottomSheet open={open} onClose={() => setOpen(false)} title="הגדרות">
        <section className="rounded-lg border border-navy-700 p-3" data-testid="settings-voice">
          <h3 className="font-semibold text-gold">כיול קול</h3>
          {profile ? (
            <p className="mt-1 text-sm text-parchment/80">
              מכויל · תדר בסיס <span dir="ltr">{formatHz(profile.baselineF0)}</span> · טווח {formatSemitones(profile.rangeSemitones)} ·{" "}
              {new Date(profile.createdAt).toLocaleDateString("he-IL")}
            </p>
          ) : (
            <p className="mt-1 text-sm text-parchment/60">לא בוצע כיול. הכיול מתאים את ניתוח הקריאה לקול שלך (כ־30 שניות).</p>
          )}
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onCalibrate();
              }}
              className="min-h-11 rounded-lg bg-gold px-4 font-semibold text-navy hover:bg-gold-300"
              data-testid="settings-calibrate"
            >
              {profile ? "כיול מחדש" : "כיול קול"}
            </button>
            {profile && (
              <button
                type="button"
                onClick={() => saveVoiceProfile(null)}
                className="min-h-11 rounded-lg border border-navy-700 px-4 text-parchment/80 hover:border-incorrect/60 hover:text-incorrect"
              >
                מחיקת הכיול
              </button>
            )}
          </div>
        </section>
        <section className="mt-3 rounded-lg border border-navy-700 p-3" data-testid="settings-server">
          <h3 className="font-semibold text-gold">מנוע יישור (שרת)</h3>
          {server.url ? (
            <p className="mt-1 text-sm text-parchment/80" dir="ltr">
              <span className="font-mono text-xs">{server.url}</span>
              <span dir="rtl" className="ms-2 text-xs text-parchment/60">
                ({server.source === "storage" ? "הגדרה במכשיר" : server.source === "env" ? "הגדרת בנייה" : "שרת ברירת המחדל"}) ·{" "}
                {health === "checking" ? "בודק…" : health === "ok" ? "מחובר ✓" : health === "down" ? "לא זמין — ייעשה שימוש במנוע המקומי" : ""}
              </span>
            </p>
          ) : (
            <p className="mt-1 text-sm text-parchment/60">השרת כובה בהגדרות — הניתוח מתבצע במכשיר (קצב, הברות וניגון; ללא בדיקת הגייה).</p>
          )}
        </section>
        <p className="mt-3 text-[11px] text-parchment/40">
          {server.url ? "הקלטות נשלחות לשרת היישור לצורך הניתוח בלבד; הפרופיל הקולי נשמר במכשיר." : "ההקלטות והפרופיל הקולי נשמרים במכשיר זה בלבד ואינם נשלחים לשום שרת."}
        </p>
      </BottomSheet>
    </>
  );
}
