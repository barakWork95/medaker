/** Decode a Recording and summarise its pitch — the one call the UI needs. */
import { decodeBlob } from "./decode";
import { estimatePitchTrack, summarizePitch, type PitchFrame, type PitchSummary } from "./pitch";
import type { Recording } from "./recorder";

export interface RecordingAnalysis {
  durationMs: number;
  sampleRate: number;
  track: PitchFrame[];
  summary: PitchSummary;
}

export async function analyzeRecording(recording: Recording): Promise<RecordingAnalysis> {
  const decoded = await decodeBlob(recording.blob);
  const track = estimatePitchTrack(decoded.samples, decoded.sampleRate);
  return {
    durationMs: decoded.durationMs || recording.durationMs,
    sampleRate: decoded.sampleRate,
    track,
    summary: summarizePitch(track),
  };
}
