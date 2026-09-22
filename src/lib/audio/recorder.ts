/**
 * Browser audio recorder built on getUserMedia + MediaRecorder, with an AnalyserNode tap for
 * the live waveform. No React here; the hook (useAudioRecorder.ts) wraps this.
 *
 * Browser notes
 *  - Chrome/Android/desktop: audio/webm;codecs=opus. Safari/iOS (≥ 14.5): audio/mp4 (AAC).
 *    We pick the first MediaRecorder.isTypeSupported() hit; each browser can decode what it
 *    recorded (decode.ts), which is all the analysis needs.
 *  - iOS requires the AudioContext to be created/resumed inside a user gesture: call start()
 *    from a click/pointer handler.
 *  - Duration is measured with performance.now(): Chrome's webm blobs carry no duration metadata.
 */

export interface Recording {
  blob: Blob;
  mimeType: string;
  durationMs: number;
  /** Object URL for playback. Call URL.revokeObjectURL when done. */
  url: string;
  createdAt: number;
}

export type RecorderErrorCode = "unsupported" | "permission-denied" | "no-microphone" | "in-use" | "unknown";

export class RecorderError extends Error {
  constructor(
    public readonly code: RecorderErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "RecorderError";
  }
}

export const RECORDER_ERROR_MESSAGES_HE: Record<RecorderErrorCode, string> = {
  unsupported: "הדפדפן אינו תומך בהקלטה. נסו Chrome או Safari מעודכנים.",
  "permission-denied": "אין הרשאה למיקרופון. יש לאפשר גישה למיקרופון בהגדרות הדפדפן.",
  "no-microphone": "לא נמצא מיקרופון במכשיר.",
  "in-use": "המיקרופון תפוס על ידי יישום אחר.",
  unknown: "ההקלטה נכשלה. נסו שוב.",
};

const MIME_CANDIDATES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4;codecs=mp4a.40.2",
  "audio/mp4",
  "audio/ogg;codecs=opus",
  "audio/aac",
];

export function isRecordingSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof MediaRecorder !== "undefined"
  );
}

export function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined" || typeof MediaRecorder.isTypeSupported !== "function") return undefined;
  return MIME_CANDIDATES.find((t) => MediaRecorder.isTypeSupported(t));
}

function toRecorderError(err: unknown): RecorderError {
  if (err instanceof RecorderError) return err;
  const name = (err as { name?: string })?.name ?? "";
  if (name === "NotAllowedError" || name === "SecurityError") return new RecorderError("permission-denied", RECORDER_ERROR_MESSAGES_HE["permission-denied"]);
  if (name === "NotFoundError" || name === "OverconstrainedError") return new RecorderError("no-microphone", RECORDER_ERROR_MESSAGES_HE["no-microphone"]);
  if (name === "NotReadableError" || name === "AbortError") return new RecorderError("in-use", RECORDER_ERROR_MESSAGES_HE["in-use"]);
  return new RecorderError("unknown", RECORDER_ERROR_MESSAGES_HE.unknown);
}

/** AnalyserNode fftSize — also the length of the buffer passed to getWaveform(). */
export const WAVEFORM_SIZE = 1024;

export interface AudioRecorderOptions {
  /** Auto-stop after this many ms (0 = never). */
  maxDurationMs?: number;
  /** MediaRecorder timeslice (ms). */
  timesliceMs?: number;
  onAutoStop?: () => void;
}

type State = "idle" | "recording" | "stopping";

export class AudioRecorderService {
  private stream: MediaStream | null = null;
  private recorder: MediaRecorder | null = null;
  private context: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private chunks: BlobPart[] = [];
  private startedAt = 0;
  private stopPromise: Promise<Recording> | null = null;
  private autoStopTimer: ReturnType<typeof setTimeout> | null = null;
  state: State = "idle";

  constructor(private readonly options: AudioRecorderOptions = {}) {}

  get mimeType(): string {
    return this.recorder?.mimeType || pickMimeType() || "";
  }

  /** Elapsed recording time (ms) while recording. */
  get elapsedMs(): number {
    return this.state === "idle" ? 0 : performance.now() - this.startedAt;
  }

  /** Fill `target` (length = analyser fftSize) with time-domain samples 0..255 (128 = silence). */
  getWaveform(target: Uint8Array<ArrayBuffer>): boolean {
    if (!this.analyser) return false;
    this.analyser.getByteTimeDomainData(target);
    return true;
  }

  async start(): Promise<void> {
    if (this.state !== "idle") return;
    if (!isRecordingSupported()) throw new RecorderError("unsupported", RECORDER_ERROR_MESSAGES_HE.unsupported);
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
      });
    } catch (err) {
      throw toRecorderError(err);
    }

    try {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.context = new Ctx();
      if (this.context.state === "suspended") await this.context.resume();
      const source = this.context.createMediaStreamSource(this.stream);
      this.analyser = this.context.createAnalyser();
      this.analyser.fftSize = WAVEFORM_SIZE;
      this.analyser.smoothingTimeConstant = 0.4;
      source.connect(this.analyser); // not connected to destination → no monitoring/feedback
    } catch {
      this.analyser = null; // waveform is optional; recording still works
    }

    const mimeType = pickMimeType();
    try {
      this.recorder = mimeType ? new MediaRecorder(this.stream, { mimeType }) : new MediaRecorder(this.stream);
    } catch (err) {
      this.releaseStream();
      throw toRecorderError(err);
    }
    this.chunks = [];
    this.recorder.ondataavailable = (e: BlobEvent) => {
      if (e.data && e.data.size > 0) this.chunks.push(e.data);
    };
    this.recorder.start(this.options.timesliceMs ?? 250);
    this.startedAt = performance.now();
    this.state = "recording";

    if (this.options.maxDurationMs) {
      this.autoStopTimer = setTimeout(() => {
        void this.stop();
        this.options.onAutoStop?.();
      }, this.options.maxDurationMs);
    }
  }

  stop(): Promise<Recording> {
    if (this.stopPromise) return this.stopPromise;
    const recorder = this.recorder;
    if (this.state !== "recording" || !recorder) {
      return Promise.reject(new RecorderError("unknown", "not recording"));
    }
    this.state = "stopping";
    if (this.autoStopTimer) clearTimeout(this.autoStopTimer);
    const durationMs = Math.round(performance.now() - this.startedAt);

    this.stopPromise = new Promise<Recording>((resolve, reject) => {
      recorder.onstop = () => {
        const mimeType = recorder.mimeType || this.mimeType || "audio/webm";
        const blob = new Blob(this.chunks, { type: mimeType });
        this.cleanup();
        if (!blob.size) {
          reject(new RecorderError("unknown", RECORDER_ERROR_MESSAGES_HE.unknown));
          return;
        }
        resolve({ blob, mimeType, durationMs, url: URL.createObjectURL(blob), createdAt: Date.now() });
      };
      recorder.onerror = () => {
        this.cleanup();
        reject(new RecorderError("unknown", RECORDER_ERROR_MESSAGES_HE.unknown));
      };
      try {
        recorder.stop();
      } catch {
        this.cleanup();
        reject(new RecorderError("unknown", RECORDER_ERROR_MESSAGES_HE.unknown));
      }
    }).finally(() => {
      this.stopPromise = null;
    });
    return this.stopPromise;
  }

  /** Abort without producing a recording. */
  cancel() {
    if (this.autoStopTimer) clearTimeout(this.autoStopTimer);
    try {
      if (this.recorder && this.recorder.state !== "inactive") {
        this.recorder.onstop = null;
        this.recorder.stop();
      }
    } catch {
      /* ignore */
    }
    this.cleanup();
  }

  private releaseStream() {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
  }

  private cleanup() {
    this.releaseStream();
    void this.context?.close().catch(() => undefined);
    this.context = null;
    this.analyser = null;
    this.recorder = null;
    this.chunks = [];
    this.state = "idle";
    if (this.autoStopTimer) {
      clearTimeout(this.autoStopTimer);
      this.autoStopTimer = null;
    }
  }
}
