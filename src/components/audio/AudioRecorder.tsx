"use client";

/**
 * Recorder control: mic button → live waveform + timer → stop → playback + re-record.
 * Owns nothing but presentation; state comes from a useAudioRecorder() instance passed in,
 * so parents can react to the Recording (analyse it, keep it, etc.).
 */
import type { UseAudioRecorder } from "@/lib/audio/useAudioRecorder";
import { WaveformCanvas } from "./WaveformCanvas";

function formatMs(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function MicIcon({ className = "size-6" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0" />
      <path d="M12 18v3" />
    </svg>
  );
}

export function AudioRecorder({
  recorder,
  maxDurationMs,
  hint,
  disabled = false,
}: {
  recorder: UseAudioRecorder;
  maxDurationMs?: number;
  /** Small caption under the control. */
  hint?: string;
  disabled?: boolean;
}) {
  const { status, recording, error, elapsedMs } = recorder;
  const isRecording = status === "recording";

  if (status === "unsupported") {
    return (
      <p role="alert" className="rounded-lg border border-incorrect/50 bg-incorrect/10 p-3 text-sm text-parchment">
        הדפדפן אינו תומך בהקלטה. נסו Chrome או Safari מעודכנים.
      </p>
    );
  }

  return (
    <div className="flex flex-col items-center gap-3" data-testid="audio-recorder" data-status={status}>
      <div className="w-full rounded-lg border border-navy-700 bg-navy px-2 py-1">
        <WaveformCanvas active={isRecording} getWaveform={recorder.getWaveform} size={recorder.waveformSize} />
      </div>

      <div className="flex items-center gap-4">
        <span className="min-w-12 font-mono text-sm tabular-nums text-parchment/80" aria-live="polite" dir="ltr">
          {formatMs(elapsedMs)}
          {maxDurationMs ? ` / ${formatMs(maxDurationMs)}` : ""}
        </span>

        {isRecording ? (
          <button
            type="button"
            onClick={() => void recorder.stop()}
            className="grid size-16 place-items-center rounded-full bg-incorrect text-parchment shadow-lg ring-4 ring-incorrect/30 active:scale-95"
            aria-label="עצור הקלטה"
            data-testid="stop-recording"
          >
            <span className="block size-6 rounded-sm bg-parchment" aria-hidden />
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void recorder.start()}
            disabled={disabled || status === "requesting"}
            className="grid size-16 place-items-center rounded-full bg-gold text-navy shadow-lg ring-4 ring-gold/30 active:scale-95 disabled:opacity-50"
            aria-label={status === "stopped" ? "הקלט מחדש" : "התחל הקלטה"}
            data-testid="start-recording"
          >
            <MicIcon className="size-7" />
          </button>
        )}

        <span className="min-w-12 text-sm text-parchment/60">
          {status === "requesting" ? "מבקש הרשאה…" : isRecording ? "מקליט" : status === "stopped" ? "הוקלט" : ""}
        </span>
      </div>

      {recording && status === "stopped" && (
        <audio controls src={recording.url} className="w-full" data-testid="playback" preload="metadata">
          <track kind="captions" />
        </audio>
      )}

      {error && (
        <p role="alert" className="text-center text-sm text-incorrect">
          {error}
        </p>
      )}
      {hint && !error && <p className="text-center text-xs text-parchment/50">{hint}</p>}
    </div>
  );
}
