"use client";

/**
 * React wrapper around AudioRecorderService.
 *
 *   const rec = useAudioRecorder({ maxDurationMs: 10000 });
 *   rec.status      "unsupported" | "idle" | "requesting" | "recording" | "stopped" | "error"
 *   rec.start()     must be called from a user gesture (iOS AudioContext policy)
 *   rec.stop()      resolves the Recording (also set on rec.recording)
 *   rec.reset()     discards the recording and revokes its object URL
 *   rec.getWaveform(buf) / rec.waveformSize   for the live visualiser
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { AudioRecorderService, RecorderError, WAVEFORM_SIZE, isRecordingSupported, type AudioRecorderOptions, type Recording } from "./recorder";

export type RecorderStatus = "unsupported" | "idle" | "requesting" | "recording" | "stopped" | "error";

export interface UseAudioRecorder {
  status: RecorderStatus;
  recording: Recording | null;
  error: string | null;
  /** Live elapsed time while recording (ms), updated ~10×/s. */
  elapsedMs: number;
  start: () => Promise<void>;
  stop: () => Promise<Recording | null>;
  reset: () => void;
  getWaveform: (target: Uint8Array<ArrayBuffer>) => boolean;
  waveformSize: number;
}

export function useAudioRecorder(options: AudioRecorderOptions = {}): UseAudioRecorder {
  const service = useRef<AudioRecorderService | null>(null);
  const [status, setStatus] = useState<RecorderStatus>("idle");
  const [recording, setRecording] = useState<Recording | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const optionsRef = useRef(options);
  useEffect(() => {
    optionsRef.current = options;
  }, [options]);

  // Feature detection runs on the client only (SSR renders "idle" → no hydration mismatch).
  useEffect(() => {
    if (!isRecordingSupported()) {
      const id = setTimeout(() => setStatus("unsupported"), 0);
      return () => clearTimeout(id);
    }
  }, []);

  const getService = useCallback(() => {
    if (!service.current) {
      service.current = new AudioRecorderService({
        ...optionsRef.current,
        onAutoStop: () => optionsRef.current.onAutoStop?.(),
      });
    }
    return service.current;
  }, []);

  const getWaveform = useCallback((target: Uint8Array<ArrayBuffer>) => service.current?.getWaveform(target) ?? false, []);

  const reset = useCallback(() => {
    setRecording((r) => {
      if (r) URL.revokeObjectURL(r.url);
      return null;
    });
    setError(null);
    setElapsedMs(0);
    setStatus(isRecordingSupported() ? "idle" : "unsupported");
  }, []);

  const stop = useCallback(async (): Promise<Recording | null> => {
    const svc = service.current;
    if (!svc || svc.state !== "recording") return null;
    try {
      const rec = await svc.stop();
      setRecording((prev) => {
        if (prev) URL.revokeObjectURL(prev.url);
        return rec;
      });
      setElapsedMs(rec.durationMs);
      setStatus("stopped");
      return rec;
    } catch (err) {
      setError(err instanceof RecorderError ? err.message : String(err));
      setStatus("error");
      return null;
    }
  }, []);

  const start = useCallback(async () => {
    const svc = getService();
    if (svc.state !== "idle") return;
    setError(null);
    setStatus("requesting");
    try {
      await svc.start();
      setRecording((prev) => {
        if (prev) URL.revokeObjectURL(prev.url);
        return null;
      });
      setElapsedMs(0);
      setStatus("recording");
    } catch (err) {
      setError(err instanceof RecorderError ? err.message : String(err));
      setStatus("error");
    }
  }, [getService]);

  // elapsed-time ticker + auto-stop reflection
  useEffect(() => {
    if (status !== "recording") return;
    const id = setInterval(() => {
      const svc = service.current;
      if (!svc) return;
      if (svc.state === "idle") return; // auto-stop is handled by stop()
      setElapsedMs(Math.round(svc.elapsedMs));
    }, 100);
    return () => clearInterval(id);
  }, [status]);

  // auto-stop: the service stops itself; mirror the result into React state
  useEffect(() => {
    if (!options.maxDurationMs || status !== "recording") return;
    const id = setTimeout(() => void stop(), options.maxDurationMs + 50);
    return () => clearTimeout(id);
  }, [options.maxDurationMs, status, stop]);

  // unmount: release the microphone, revoke URLs
  useEffect(
    () => () => {
      service.current?.cancel();
      setRecording((r) => {
        if (r) URL.revokeObjectURL(r.url);
        return null;
      });
    },
    [],
  );

  return {
    status,
    recording,
    error,
    elapsedMs,
    start,
    stop,
    reset,
    getWaveform,
    waveformSize: WAVEFORM_SIZE,
  };
}
