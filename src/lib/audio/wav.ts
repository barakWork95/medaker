/** Minimal PCM WAV encode/decode (16-bit, mono/stereo). Pure — used for fixtures and offline decoding. */

export function encodeWav(samples: Float32Array, sampleRate: number): ArrayBuffer {
  const bytes = 44 + samples.length * 2;
  const buf = new ArrayBuffer(bytes);
  const v = new DataView(buf);
  const str = (o: number, s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i));
  };
  str(0, "RIFF");
  v.setUint32(4, bytes - 8, true);
  str(8, "WAVE");
  str(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, 1, true); // mono
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  str(36, "data");
  v.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return buf;
}

export interface WavData {
  samples: Float32Array; // mono
  sampleRate: number;
}

export function decodeWav(buf: ArrayBuffer): WavData {
  const v = new DataView(buf);
  const tag = (o: number) => String.fromCharCode(v.getUint8(o), v.getUint8(o + 1), v.getUint8(o + 2), v.getUint8(o + 3));
  if (tag(0) !== "RIFF" || tag(8) !== "WAVE") throw new Error("not a WAV file");
  let o = 12;
  let channels = 1;
  let sampleRate = 0;
  let bits = 16;
  let format = 1;
  while (o + 8 <= buf.byteLength) {
    const id = tag(o);
    const size = v.getUint32(o + 4, true);
    if (id === "fmt ") {
      format = v.getUint16(o + 8, true);
      channels = v.getUint16(o + 10, true);
      sampleRate = v.getUint32(o + 12, true);
      bits = v.getUint16(o + 22, true);
    } else if (id === "data") {
      if (format !== 1 && format !== 3) throw new Error(`unsupported WAV format ${format}`);
      const frames = Math.floor(size / (channels * (bits / 8)));
      const out = new Float32Array(frames);
      for (let f = 0; f < frames; f++) {
        let acc = 0;
        for (let c = 0; c < channels; c++) {
          const idx = o + 8 + (f * channels + c) * (bits / 8);
          if (format === 3) acc += v.getFloat32(idx, true);
          else if (bits === 16) acc += v.getInt16(idx, true) / 0x8000;
          else if (bits === 8) acc += (v.getUint8(idx) - 128) / 128;
          else if (bits === 32) acc += v.getInt32(idx, true) / 0x80000000;
          else if (bits === 24) {
            const b0 = v.getUint8(idx), b1 = v.getUint8(idx + 1), b2 = v.getInt8(idx + 2);
            acc += ((b2 << 16) | (b1 << 8) | b0) / 0x800000;
          }
        }
        out[f] = acc / channels;
      }
      return { samples: out, sampleRate };
    }
    o += 8 + size + (size % 2);
  }
  throw new Error("WAV has no data chunk");
}

export function isWavBlob(blob: Blob): boolean {
  return /wav|wave/i.test(blob.type);
}
