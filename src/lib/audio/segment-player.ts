/**
 * Plays a time range of decoded PCM through Web Audio. MediaRecorder's webm blobs have no
 * seek index in Chrome (currentTime is ignored), so segment playback must come from PCM.
 */
export class SegmentPlayer {
  private ctx: AudioContext | null = null;
  private buffer: AudioBuffer | null = null;
  private source: AudioBufferSourceNode | null = null;
  private onEnd: (() => void) | null = null;

  constructor(
    private readonly samples: Float32Array,
    private readonly sampleRate: number,
  ) {}

  private ensure(): AudioContext {
    if (!this.ctx) {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new Ctx();
      this.buffer = this.ctx.createBuffer(1, this.samples.length, this.sampleRate);
      this.buffer.copyToChannel(this.samples as Float32Array<ArrayBuffer>, 0);
    }
    return this.ctx;
  }

  /** Play [start, end) seconds; resolves/invokes onEnd when playback stops. Must be user-initiated on iOS. */
  play(start: number, end: number, onEnd?: () => void) {
    const ctx = this.ensure();
    this.stop();
    if (ctx.state === "suspended") void ctx.resume();
    const src = ctx.createBufferSource();
    src.buffer = this.buffer;
    src.connect(ctx.destination);
    const s = Math.max(0, start);
    const d = Math.max(0.05, Math.min(end, this.samples.length / this.sampleRate) - s);
    this.onEnd = onEnd ?? null;
    src.onended = () => {
      if (this.source === src) {
        this.source = null;
        this.onEnd?.();
        this.onEnd = null;
      }
    };
    src.start(0, s, d);
    this.source = src;
  }

  stop() {
    if (this.source) {
      const s = this.source;
      this.source = null;
      try {
        s.stop();
      } catch {
        /* already stopped */
      }
      this.onEnd?.();
      this.onEnd = null;
    }
  }

  dispose() {
    this.stop();
    void this.ctx?.close().catch(() => undefined);
    this.ctx = null;
    this.buffer = null;
  }
}
