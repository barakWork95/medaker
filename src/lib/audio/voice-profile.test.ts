import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  checkSample,
  computeVoiceProfile,
  loadVoiceProfile,
  resetVoiceProfileCache,
  sampleResultFrom,
  saveVoiceProfile,
  type CalibrationSampleResult,
} from "./voice-profile";
import type { PitchSummary } from "./pitch";

const summary = (over: Partial<PitchSummary> = {}): PitchSummary => ({
  frames: 100,
  voicedFrames: 70,
  voicedRatio: 0.7,
  meanF0: 130,
  medianF0: 128,
  p10F0: 110,
  p90F0: 160,
  minF0: 100,
  maxF0: 170,
  rangeSemitones: 6.5,
  ...over,
});

const sample = (id: string, medianF0: number, p10F0: number, p90F0: number): CalibrationSampleResult => ({
  wordId: id,
  markId: "x",
  durationMs: 900,
  medianF0,
  p10F0,
  p90F0,
  voicedRatio: 0.7,
});

class MemoryStorage {
  private m = new Map<string, string>();
  getItem(k: string) {
    return this.m.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.m.set(k, v);
  }
  removeItem(k: string) {
    this.m.delete(k);
  }
}

describe("sample checks", () => {
  it("accepts a good take and rejects short or unvoiced ones", () => {
    expect(checkSample(summary(), 900)).toBeNull();
    expect(checkSample(summary(), 200)).toBe("too-short");
    expect(checkSample(summary({ voicedRatio: 0.1 }), 900)).toBe("unvoiced");
    expect(checkSample(summary({ medianF0: null }), 900)).toBe("unvoiced");
    expect(sampleResultFrom("w1", "etnahta", 900, summary())).toMatchObject({ wordId: "w1", medianF0: 128, p10F0: 110, p90F0: 160 });
    expect(() => sampleResultFrom("w1", "etnahta", 900, summary({ medianF0: null }))).toThrow();
  });
});

describe("computeVoiceProfile", () => {
  it("takes the median baseline and the widest range across samples", () => {
    const p = computeVoiceProfile([sample("a", 120, 100, 150), sample("b", 140, 115, 190), sample("c", 130, 105, 160)], "audio/webm");
    expect(p.baselineF0).toBe(130);
    expect(p.f0Min).toBe(100);
    expect(p.f0Max).toBe(190);
    expect(p.rangeSemitones).toBeCloseTo(12 * Math.log2(1.9), 5);
    expect(p.samples).toHaveLength(3);
    expect(p.mimeType).toBe("audio/webm");
    expect(computeVoiceProfile([sample("a", 120, 100, 150), sample("b", 140, 115, 190)]).baselineF0).toBe(130);
    expect(() => computeVoiceProfile([])).toThrow();
  });
});

describe("storage", () => {
  beforeEach(() => {
    resetVoiceProfileCache();
    Object.defineProperty(globalThis, "localStorage", { value: new MemoryStorage(), configurable: true });
  });
  afterEach(() => {
    resetVoiceProfileCache();
    delete (globalThis as { localStorage?: unknown }).localStorage;
  });

  it("round-trips through localStorage and clears", () => {
    expect(loadVoiceProfile()).toBeNull();
    const p = computeVoiceProfile([sample("a", 120, 100, 150)]);
    saveVoiceProfile(p);
    resetVoiceProfileCache();
    expect(loadVoiceProfile()).toEqual(p);
    saveVoiceProfile(null);
    resetVoiceProfileCache();
    expect(loadVoiceProfile()).toBeNull();
  });

  it("ignores corrupt or foreign data", () => {
    globalThis.localStorage.setItem("medaker.voiceProfile.v1", "{not json");
    expect(loadVoiceProfile()).toBeNull();
    resetVoiceProfileCache();
    globalThis.localStorage.setItem("medaker.voiceProfile.v1", JSON.stringify({ version: 99 }));
    expect(loadVoiceProfile()).toBeNull();
  });

  it("survives a missing localStorage", () => {
    delete (globalThis as { localStorage?: unknown }).localStorage;
    resetVoiceProfileCache();
    expect(loadVoiceProfile()).toBeNull();
    expect(() => saveVoiceProfile(computeVoiceProfile([sample("a", 120, 100, 150)]))).not.toThrow();
  });
});
