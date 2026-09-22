"use client";

/** Header gear → settings sheet: voice calibration status + actions. */
import { useState } from "react";
import { formatHz, formatSemitones, saveVoiceProfile, useVoiceProfile } from "@/lib/audio/voice-profile";
import { BottomSheet } from "./BottomSheet";

export function SettingsMenu({ onCalibrate }: { onCalibrate: () => void }) {
  const [open, setOpen] = useState(false);
  const profile = useVoiceProfile();

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
        <p className="mt-3 text-[11px] text-parchment/40">ההקלטות והפרופיל הקולי נשמרים במכשיר זה בלבד ואינם נשלחים לשום שרת.</p>
      </BottomSheet>
    </>
  );
}
