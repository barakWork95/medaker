import { describe, expect, it } from "vitest";
import { ANALYSIS_RATE, estimatePitchTrack, hzToSemitones, median, percentile, resample, summarizePitch, toMono } from "./pitch";

/** Harmonic-rich periodic signal (voice-like) at `hz`, optional linear glide to `hzEnd`. */
function tone(hz: number, seconds: number, sampleRate = ANALYSIS_RATE, hzEnd = hz, amp = 0.5): Float32Array {
  const n = Math.round(seconds * sampleRate);
  const out = new Float32Array(n);
  let phase = 0;
  for (let i = 0; i < n; i++) {
    const f = hz + (hzEnd - hz) * (i / n);
    phase += (2 * Math.PI * f) / sampleRate;
    out[i] = amp * (Math.sin(phase) + 0.5 * Math.sin(2 * phase) + 0.25 * Math.sin(3 * phase)) / 1.75;
  }
  return out;
}

const voicedF0s = (track: ReturnType<typeof estimatePitchTrack>) => track.filter((f) => f.f0 !== null).map((f) => f.f0 as number);

describe("estimatePitchTrack", () => {
  it("finds a steady 110 Hz tone within 2 %", () => {
    const track = estimatePitchTrack(tone(110, 1), ANALYSIS_RATE);
    const f0s = voicedF0s(track);
    expect(f0s.length).toBeGreaterThan(track.length * 0.8);
    for (const f of f0s) expect(Math.abs(f - 110) / 110).toBeLessThan(0.02);
  });

  it("finds 220 Hz without octave errors and works at 48 kHz input", () => {
    const track = estimatePitchTrack(tone(220, 1, 48000), 48000);
    const s = summarizePitch(track);
    expect(s.voicedRatio).toBeGreaterThan(0.8);
    expect(Math.abs((s.medianF0 as number) - 220) / 220).toBeLessThan(0.02);
    expect(Math.abs((s.p10F0 as number) - 220) / 220).toBeLessThan(0.03);
    expect(Math.abs((s.p90F0 as number) - 220) / 220).toBeLessThan(0.03);
  });

  it("marks silence and noise-floor frames unvoiced", () => {
    const silence = new Float32Array(ANALYSIS_RATE);
    expect(voicedF0s(estimatePitchTrack(silence, ANALYSIS_RATE))).toHaveLength(0);
    let seed = 7;
    const noise = new Float32Array(ANALYSIS_RATE).map(() => {
      seed = (seed * 9301 + 49297) % 233280;
      return (seed / 233280 - 0.5) * 0.4;
    });
    const s = summarizePitch(estimatePitchTrack(noise, ANALYSIS_RATE));
    expect(s.voicedRatio).toBeLessThan(0.25);
  });

  it("follows a glide and reports the range in semitones", () => {
    const track = estimatePitchTrack(tone(100, 2, ANALYSIS_RATE, 200), ANALYSIS_RATE);
    const s = summarizePitch(track);
    expect(s.p10F0 as number).toBeGreaterThan(100);
    expect(s.p10F0 as number).toBeLessThan(125);
    expect(s.p90F0 as number).toBeGreaterThan(175);
    expect(s.p90F0 as number).toBeLessThan(200);
    expect(s.rangeSemitones as number).toBeGreaterThan(9);
    expect(s.rangeSemitones as number).toBeLessThan(12.5);
  });

  it("gates quiet passages relative to the loudest part", () => {
    const loud = tone(150, 0.5);
    const quiet = tone(150, 0.5, ANALYSIS_RATE, 150, 0.01);
    const both = new Float32Array(loud.length + quiet.length);
    both.set(loud);
    both.set(quiet, loud.length);
    const track = estimatePitchTrack(both, ANALYSIS_RATE);
    const firstHalf = track.filter((f) => f.t < 0.45);
    const secondHalf = track.filter((f) => f.t > 0.55);
    expect(firstHalf.filter((f) => f.f0 !== null).length).toBeGreaterThan(firstHalf.length * 0.8);
    expect(secondHalf.filter((f) => f.f0 !== null)).toHaveLength(0);
  });
});

describe("helpers", () => {
  it("resample keeps the waveform period", () => {
    const x = tone(100, 0.5, 48000);
    const y = resample(x, 48000, ANALYSIS_RATE);
    expect(y.length).toBe(Math.floor(x.length / 3));
    const f0s = voicedF0s(estimatePitchTrack(y, ANALYSIS_RATE));
    expect(Math.abs((median(f0s) as number) - 100)).toBeLessThan(2);
  });

  it("toMono averages channels", () => {
    expect(Array.from(toMono([new Float32Array([1, 0]), new Float32Array([0, 1])]))).toEqual([0.5, 0.5]);
  });

  it("median / percentile / semitones", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(median([])).toBeNull();
    expect(percentile([1, 2, 3, 4, 5], 0.5)).toBe(3);
    expect(percentile([10, 20], 0.9)).toBe(19);
    expect(hzToSemitones(110, 220)).toBeCloseTo(12);
    expect(summarizePitch([]).meanF0).toBeNull();
  });
});
