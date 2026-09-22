import { describe, expect, it } from "vitest";
import { decodeWav, encodeWav } from "./wav";

describe("wav", () => {
  it("round-trips 16-bit PCM within quantisation error", () => {
    const x = new Float32Array(1000).map((_, i) => Math.sin(i / 7) * 0.8);
    const { samples, sampleRate } = decodeWav(encodeWav(x, 16000));
    expect(sampleRate).toBe(16000);
    expect(samples.length).toBe(1000);
    for (let i = 0; i < x.length; i++) expect(Math.abs(samples[i] - x[i])).toBeLessThan(1e-4);
  });
  it("rejects non-wav data", () => {
    expect(() => decodeWav(new ArrayBuffer(100))).toThrow(/not a WAV/);
  });
});
