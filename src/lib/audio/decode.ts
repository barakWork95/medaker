/**
 * Decode a recorded Blob to mono PCM for analysis. Uses a throw-away AudioContext; the
 * callback form of decodeAudioData is used for older Safari.
 */
import { toMono } from "./pitch";
import { decodeWav, isWavBlob } from "./wav";

export interface DecodedAudio {
  samples: Float32Array;
  sampleRate: number;
  durationMs: number;
}

export async function decodeBlob(blob: Blob): Promise<DecodedAudio> {
  // WAV decodes without Web Audio — lets fixtures and tests run in Node.
  if (isWavBlob(blob)) {
    const { samples, sampleRate } = decodeWav(await blob.arrayBuffer());
    return { samples, sampleRate, durationMs: Math.round((samples.length / sampleRate) * 1000) };
  }
  const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new Ctx();
  try {
    const bytes = await blob.arrayBuffer();
    const buffer = await new Promise<AudioBuffer>((resolve, reject) => {
      const p = ctx.decodeAudioData(bytes, resolve, reject);
      if (p && typeof (p as Promise<AudioBuffer>).then === "function") (p as Promise<AudioBuffer>).then(resolve, reject);
    });
    const channels: Float32Array[] = [];
    for (let c = 0; c < buffer.numberOfChannels; c++) channels.push(buffer.getChannelData(c));
    return { samples: toMono(channels), sampleRate: buffer.sampleRate, durationMs: Math.round(buffer.duration * 1000) };
  } finally {
    void ctx.close().catch(() => undefined);
  }
}
