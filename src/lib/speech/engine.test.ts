import { describe, expect, it, vi } from "vitest";
import { encodeWav } from "@/lib/audio/wav";
import { estimatePitchTrack } from "@/lib/audio/pitch";
import { computeVoiceProfile } from "@/lib/audio/voice-profile";
import { alignSyllables } from "./align";
import { FallbackEngine, LocalRhythmEngine, RemoteEngine, evaluateLocally, getEngine, getRemoteApiUrl, resolveRemoteApi, statusFor, type EvaluationRequest, type VerseEvaluation } from "./engine";
import type { AlignRequest, AlignResponse } from "./api-contract";
import { buildExpectedWords } from "./expected";
import { analyzeNuclei, detectNuclei } from "./nuclei";
import { synthesizeVerse, type SynthOptions } from "./synth";

const GEN_1_1 = "בְּרֵאשִׁ֖ית בָּרָ֣א אֱלֹהִ֑ים אֵ֥ת הַשָּׁמַ֖יִם וְאֵ֥ת הָאָֽרֶץ׃";
const GEN_1_3 = "וַיֹּ֥אמֶר אֱלֹהִ֖ים יְהִ֣י א֑וֹר וַֽיְהִי־אֽוֹר׃";
const ref = { book: "Genesis", chapter: 1, verse: 1 };

/** Build a WAV Blob fixture (real audio bytes) for a verse. */
function fixture(text: string, options: SynthOptions = {}) {
  const expected = buildExpectedWords(text);
  const synth = synthesizeVerse(expected, options);
  const blob = new Blob([encodeWav(synth.samples, synth.sampleRate)], { type: "audio/wav" });
  return { expected, synth, blob, request: { recording: { blob, mimeType: "audio/wav", durationMs: Math.round((synth.samples.length / synth.sampleRate) * 1000) }, verse: { ref, text }, profile: null, tradition: "temani" as const } satisfies EvaluationRequest };
}

describe("expected words", () => {
  it("carries Temani syllables and weights per word", () => {
    const words = buildExpectedWords(GEN_1_1);
    expect(words.map((w) => w.syllables.length)).toEqual([3, 2, 3, 1, 4, 2, 3]); // ha-šå-ma-yim
    expect(words[0].roman).toBe("bəreˈšiṯ");
    expect(words[2].disjunctive).toBe(true); // etnahta
    expect(words[2].syllables[2].weight).toBe(1.6); // disjunctive final syllable
    expect(words[1].disjunctive).toBe(false); // munah
    expect(words[1].syllables[1].stressed).toBe(true);
  });
});

describe("nuclei + alignment on synthetic verse audio", () => {
  it("detects one nucleus per syllable and aligns every word (Gen 1:1)", () => {
    const { expected, synth } = fixture(GEN_1_1);
    const track = estimatePitchTrack(synth.samples, synth.sampleRate);
    const nuclei = detectNuclei(track);
    const syllables = expected.flatMap((w) => w.syllables);
    expect(nuclei.length).toBe(syllables.length); // 17
    const a = alignSyllables(syllables, nuclei);
    expect(a.omitted).toEqual([]);
    expect(a.inserted).toEqual([]);
    expect(a.matches.map((m) => m.nucleus)).toEqual(syllables.map((_, i) => i));
  });
});

describe("LocalRhythmEngine (WAV blob fixtures)", () => {
  it("marks a clean reading all-correct with word timestamps within 60 ms of the truth", async () => {
    const { request, synth } = fixture(GEN_1_1);
    const result = await new LocalRhythmEngine().evaluate(request);
    expect(result.engine).toBe("local-rhythm");
    expect(result.words.map((w) => w.status)).toEqual(Array(7).fill("correct"));
    expect(result.summary).toMatchObject({ correct: 7, minor: 0, missing: 0, score: 100, extraNuclei: 0 });
    expect(result.summary.coverage).toBe(1);
    for (const b of synth.boundaries) {
      const w = result.words[b.index];
      expect(Math.abs((w.start as number) - b.start)).toBeLessThan(0.06);
      expect(Math.abs((w.end as number) - b.end)).toBeLessThan(0.06);
    }
    expect(result.words.every((w) => w.phonetic === null)).toBe(true); // local engine cannot judge phonemes
  });

  it("flags an omitted word as missing and keeps its neighbours correct", async () => {
    const { request } = fixture(GEN_1_1, { words: { 3: { omit: true } } }); // skip את
    const result = await new LocalRhythmEngine().evaluate(request);
    expect(result.words[3].status).toBe("missing");
    expect(result.words[3].start).toBeNull();
    expect(result.words[3].notes).toContain("המילה לא זוהתה בהקלטה");
    expect(result.words.filter((_, i) => i !== 3).map((w) => w.status)).toEqual(Array(6).fill("correct"));
    expect(result.summary.missing).toBe(1);
  });

  it("flags a word read with a syllable swallowed as minor", async () => {
    const { request } = fixture(GEN_1_1, { words: { 4: { dropSyllables: 1 } } }); // השמים with 3 of 4 syllables
    const result = await new LocalRhythmEngine().evaluate(request);
    expect(result.words[4].status).toBe("minor");
    expect(result.words[4].syllablesMatched).toBe(3);
    expect(result.words[4].notes.join(" ")).toMatch(/זוהו 3 מתוך 4/);
    expect(result.words.filter((_, i) => i !== 4).map((w) => w.status)).toEqual(Array(6).fill("correct"));
  });

  it("flags a badly stretched word as minor (rhythm) and reports it as too long", async () => {
    const { request } = fixture(GEN_1_3, { words: { 2: { scale: 3.2 } } }); // יהי dragged out
    const result = await new LocalRhythmEngine().evaluate(request);
    expect(result.words[2].status).toBe("minor");
    expect(result.words[2].notes).toContain("המילה ארוכה מהצפוי");
    expect(result.words.filter((_, i) => i !== 2).every((w) => w.status === "correct")).toBe(true);
  });

  it("tolerates an extra hesitation burst", async () => {
    const { request } = fixture(GEN_1_3, { extraAfterWord: 1 });
    const result = await new LocalRhythmEngine().evaluate(request);
    expect(result.summary.extraNuclei).toBe(1);
    expect(result.summary.missing).toBe(0);
    expect(result.summary.score).toBeGreaterThanOrEqual(90);
  });

  it("tolerates a globally faster reading", async () => {
    const { request } = fixture(GEN_1_1, { unitMs: 95, gapMs: 25, wordGapMs: 90 });
    const result = await new LocalRhythmEngine().evaluate(request);
    expect(result.summary.missing).toBe(0);
    expect(result.summary.score).toBeGreaterThanOrEqual(85);
  });

  it("relates word pitch to the calibrated baseline", async () => {
    const { expected, synth } = fixture(GEN_1_1, { f0: 150 });
    const track = estimatePitchTrack(synth.samples, synth.sampleRate);
    const profile = computeVoiceProfile([{ wordId: "a", markId: "a", durationMs: 900, medianF0: 130, p10F0: 120, p90F0: 140, voicedRatio: 0.8 }]);
    const r = evaluateLocally(expected, track, profile);
    const delta = r.words[1].pitchVsBaselineSemitones as number; // ברא: unstressed 150, stressed 168
    expect(delta).toBeGreaterThan(2);
    expect(delta).toBeLessThan(4.5);
    expect(r.words[0].pitchMovementSemitones as number).toBeGreaterThan(0); // stressed syllable lifts pitch
  });

  it("returns everything missing for silence", async () => {
    const silence = new Blob([encodeWav(new Float32Array(16000), 16000)], { type: "audio/wav" });
    const result = await new LocalRhythmEngine().evaluate({ recording: { blob: silence, mimeType: "audio/wav", durationMs: 1000 }, verse: { ref, text: GEN_1_3 }, profile: null, tradition: "temani" });
    expect(result.summary.missing).toBe(result.words.length);
    expect(result.summary.score).toBe(0);
  });
});

describe("statusFor thresholds", () => {
  it("maps syllable share and rhythm to statuses", () => {
    expect(statusFor({ syllablesExpected: 3, syllablesMatched: 3, rhythmDeviation: 0.1 })).toBe("correct");
    expect(statusFor({ syllablesExpected: 3, syllablesMatched: 3, rhythmDeviation: 0.8 })).toBe("minor");
    expect(statusFor({ syllablesExpected: 3, syllablesMatched: 2, rhythmDeviation: 0 })).toBe("minor");
    expect(statusFor({ syllablesExpected: 3, syllablesMatched: 1, rhythmDeviation: 0 })).toBe("missing");
    expect(statusFor({ syllablesExpected: 1, syllablesMatched: 0, rhythmDeviation: null })).toBe("missing");
  });
});

describe("RemoteEngine — /api/align contract", () => {
  /** A fake aligner that answers with the fixture's ground-truth boundaries, split evenly into syllables and phones. */
  function fakeServer(expected: ReturnType<typeof buildExpectedWords>, synth: ReturnType<typeof synthesizeVerse>, opts: { omit?: number[]; phoneticLow?: number[] } = {}) {
    return vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      expect(String(url)).toBe("https://align.example/api/align");
      const body: AlignRequest = JSON.parse(String(init?.body));
      expect(body.contractVersion).toBe(1);
      expect(body.tradition).toBe("temani");
      expect(body.expected[0]).toMatchObject({ display: expected[0].display, markId: expected[0].token.primaryMark?.id ?? null });
      expect(body.expected[0].syllables[0]).toMatchObject({ index: 0, stressed: expect.any(Boolean), weight: expect.any(Number) });
      expect(body.audio.mimeType).toBe("audio/wav");
      expect(body.audio.base64.length).toBeGreaterThan(100);
      const words: AlignResponse["words"] = expected.map((w) => {
        const b = synth.boundaries.find((x) => x.index === w.index);
        if (!b || opts.omit?.includes(w.index)) return { index: w.index, start: null, end: null, syllables: [], phones: [] };
        const n = w.syllables.length;
        const step = (b.end - b.start) / n;
        return {
          index: w.index,
          start: b.start,
          end: b.end,
          syllables: w.syllables.map((s, i) => ({ index: i, start: b.start + i * step, end: b.start + (i + 1) * step })),
          phones: w.syllables.flatMap((s, i) => [...s.ipa].map((ph, k, arr) => ({ phone: ph, start: b.start + i * step + (k * step) / arr.length, end: b.start + i * step + ((k + 1) * step) / arr.length, score: 0.9 }))),
          phonetic: { score: opts.phoneticLow?.includes(w.index) ? 0.4 : 0.92, issues: opts.phoneticLow?.includes(w.index) ? ["ו נשמעה כ־V"] : [] },
        };
      });
      const response: AlignResponse = { contractVersion: 1, engine: "fake-aligner", words };
      return { ok: true, status: 200, json: async () => response } as unknown as Response;
    });
  }

  it("uses the server's boundaries and phone spans, scores accents locally on them", async () => {
    const { request, expected, synth } = fixture(GEN_1_1, { pitch: "accent" });
    const fetchImpl = fakeServer(expected, synth, { phoneticLow: [1] });
    const result = await new RemoteEngine("https://align.example/", fetchImpl as unknown as typeof fetch).evaluate(request);
    expect(result.engine).toBe("remote");
    expect(result.remoteEngine).toBe("fake-aligner");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    for (const b of synth.boundaries) {
      expect(result.words[b.index].start).toBe(b.start);
      expect(result.words[b.index].end).toBe(b.end);
    }
    expect(result.words[0].phones.length).toBeGreaterThan(3);
    expect(result.words[0].syllableSpans).toHaveLength(3);
    expect(result.words[0].phonetic?.score).toBe(0.92);
    expect(result.words[1].status).toBe("minor"); // low phonetic score
    expect(result.words[1].phonetic?.issues).toEqual(["ו נשמעה כ־V"]);
    expect(result.words[2].accent?.verdict).toBe("good"); // etnahta melody, judged locally on server timestamps
    expect(result.summary.accentAnalysed).toBeGreaterThanOrEqual(3);
  });

  it("marks words the server could not find as missing", async () => {
    const { request, expected, synth } = fixture(GEN_1_3);
    const result = await new RemoteEngine("https://align.example", fakeServer(expected, synth, { omit: [2] }) as unknown as typeof fetch).evaluate(request);
    expect(result.words[2].status).toBe("missing");
    expect(result.words[2].accent).toBeNull();
    expect(result.summary.missing).toBe(1);
  });

  it("rejects server errors, malformed bodies and wrong contract versions", async () => {
    const { request } = fixture(GEN_1_3);
    const bad = vi.fn(async () => ({ ok: false, status: 503, json: async () => ({}) }) as unknown as Response);
    await expect(new RemoteEngine("https://x", bad as unknown as typeof fetch).evaluate(request)).rejects.toThrow(/HTTP 503/);
    const malformed = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ nope: 1 }) }) as unknown as Response);
    await expect(new RemoteEngine("https://x", malformed as unknown as typeof fetch).evaluate(request)).rejects.toThrow(/malformed/);
    const wrongVersion = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ contractVersion: 2, engine: "x", words: [] }) }) as unknown as Response);
    await expect(new RemoteEngine("https://x", wrongVersion as unknown as typeof fetch).evaluate(request)).rejects.toThrow(/malformed/);
  });

  it("FallbackEngine answers locally when the server fails and says why", async () => {
    const { request } = fixture(GEN_1_1);
    const down = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });
    const engine = new FallbackEngine(new RemoteEngine("https://x", down as unknown as typeof fetch), new LocalRhythmEngine());
    const result = await engine.evaluate(request);
    expect(result.engine).toBe("local-rhythm");
    expect(result.fallbackFrom).toEqual({ engine: "remote", reason: "Failed to fetch" });
    expect(result.summary.correct).toBe(7);
  });

  it("targets the live Cloud Run service by default, honours overrides and the off switch", () => {
    expect(getRemoteApiUrl()).toBe("https://medaker-aligner-363966365041.europe-west1.run.app");
    expect(resolveRemoteApi()).toEqual({ url: "https://medaker-aligner-363966365041.europe-west1.run.app", source: "default" });
    expect(getEngine()).toBeInstanceOf(FallbackEngine);
    const store = new Map<string, string>();
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) },
    });
    try {
      store.set("medaker.alignmentApi", "http://localhost:8000/");
      expect(resolveRemoteApi()).toEqual({ url: "http://localhost:8000", source: "storage" });
      store.set("medaker.alignmentApi", "none");
      expect(resolveRemoteApi()).toEqual({ url: null, source: "storage" });
      expect(getEngine()).toBeInstanceOf(LocalRhythmEngine);
    } finally {
      delete (globalThis as { localStorage?: unknown }).localStorage;
    }
  });
});

describe("cantillation accent scoring through the local engine", () => {
  it("scores template-shaped melodies as good and flat/inverted ones lower", async () => {
    const good = await new LocalRhythmEngine().evaluate(fixture(GEN_1_2, { pitch: "accent", noiseFloor: 0.01, seed: 8 }).request);
    const flat = await new LocalRhythmEngine().evaluate(fixture(GEN_1_2, { pitch: "flat", noiseFloor: 0.01, seed: 8 }).request);
    const inverted = await new LocalRhythmEngine().evaluate(fixture(GEN_1_2, { pitch: "inverted", noiseFloor: 0.01, seed: 8 }).request);
    const disjunctives = good.words.filter((w) => w.accent);
    expect(disjunctives.length).toBeGreaterThanOrEqual(5); // revia, zaqef, tipeha, etnahta, zaqef, tipeha, sof pasuq …
    expect(good.summary.accentScore as number).toBeGreaterThanOrEqual(70);
    expect(good.summary.accentGood).toBeGreaterThanOrEqual(Math.floor(disjunctives.length * 0.7));
    expect(flat.summary.accentScore as number).toBeLessThan(good.summary.accentScore as number);
    expect(inverted.summary.accentScore as number).toBeLessThan((good.summary.accentScore as number) - 25);
    // conjunctive words carry no accent analysis; rhythm/alignment is unaffected by the melody
    expect(good.words.filter((w) => !w.accent).every((w) => w.status === "correct")).toBe(true);
    expect(good.summary.missing).toBe(0);
  });

  it("exposes the analysed region and contours for the UI", async () => {
    const result = await new LocalRhythmEngine().evaluate(fixture(GEN_1_1, { pitch: "accent" }).request);
    const etnahta = result.words[2].accent!; // אלהים
    expect(etnahta.markId).toBe("etnahta");
    expect(etnahta.region.end).toBe(result.words[2].end);
    expect(etnahta.region.start).toBeGreaterThanOrEqual(result.words[2].start as number);
    expect(etnahta.contour).toHaveLength(16);
    expect(etnahta.template).toHaveLength(16);
    expect(etnahta.templateDescribeHe.length).toBeGreaterThan(5);
  });
});

/* ---------------- boundary accuracy (Phase 2 feedback) ---------------- */

const GEN_1_2 = "וְהָאָ֗רֶץ הָיְתָ֥ה תֹ֙הוּ֙ וָבֹ֔הוּ וְחֹ֖שֶׁךְ עַל־פְּנֵ֣י תְה֑וֹם וְר֣וּחַ אֱלֹהִ֔ים מְרַחֶ֖פֶת עַל־פְּנֵ֥י הַמָּֽיִם׃";

/** Every word segment must contain all of its own nucleus peaks and none of another word's. */
function assertNoLeaks(result: VerseEvaluation, synth: ReturnType<typeof synthesizeVerse>) {
  const peaks = result.nuclei ?? [];
  for (const b of synth.boundaries) {
    const w = result.words[b.index];
    expect(w.start).not.toBeNull();
    const inside = peaks.filter((p) => p.t >= (w.start as number) && p.t <= (w.end as number));
    const own = peaks.filter((p) => p.t >= b.start && p.t <= b.end);
    expect(inside.length).toBe(own.length);
    for (const p of inside) expect(p.t >= b.start - 0.001 && p.t <= b.end + 0.001).toBe(true);
  }
  // segments never overlap
  const spans = result.words.filter((w) => w.start !== null).sort((a, b) => (a.start as number) - (b.start as number));
  for (let i = 1; i < spans.length; i++) expect(spans[i].start as number).toBeGreaterThanOrEqual(spans[i - 1].end as number);
}

function boundaryErrors(result: VerseEvaluation, synth: ReturnType<typeof synthesizeVerse>) {
  return synth.boundaries.map((b) => {
    const w = result.words[b.index];
    return Math.max(Math.abs((w.start as number) - b.start), Math.abs((w.end as number) - b.end));
  });
}

describe("word boundary accuracy", () => {
  const cases: [string, string, SynthOptions][] = [
    ["clean, default tempo", GEN_1_1, {}],
    ["connected speech with a noise floor (no gaps inside words, 60 ms between words)", GEN_1_2, { gapMs: 0, wordGapMs: 60, noiseFloor: 0.02, amplitudeJitter: 0.35, seed: 5 }],
    ["fast reader", GEN_1_2, { unitMs: 90, gapMs: 0, wordGapMs: 45, noiseFloor: 0.015, amplitudeJitter: 0.3, seed: 9 }],
    ["slow reader", GEN_1_1, { unitMs: 280, gapMs: 20, wordGapMs: 220, noiseFloor: 0.02, amplitudeJitter: 0.3, seed: 3 }],
    ["quiet recording", GEN_1_3, { gapMs: 0, wordGapMs: 70, noiseFloor: 0.004, amplitudeJitter: 0.4, seed: 11 }],
  ];
  for (const [name, text, options] of cases) {
    it(`${name}: every boundary within 50 ms, no leaks, no overlaps`, async () => {
      const { request, synth } = fixture(text, options);
      const result = await new LocalRhythmEngine().evaluate(request);
      expect(result.summary.missing).toBe(0);
      const errors = boundaryErrors(result, synth);
      expect(Math.max(...errors)).toBeLessThan(0.05);
      assertNoLeaks(result, synth);
    });
  }

  it("scales its timing constants to the reader's tempo", async () => {
    const fast = fixture(GEN_1_2, { unitMs: 90, gapMs: 0, wordGapMs: 45, seed: 2 });
    const slow = fixture(GEN_1_2, { unitMs: 280, gapMs: 20, wordGapMs: 220, seed: 2 });
    const a = analyzeNuclei(estimatePitchTrack(fast.synth.samples, fast.synth.sampleRate));
    const b = analyzeNuclei(estimatePitchTrack(slow.synth.samples, slow.synth.sampleRate));
    expect(a.syllableIntervalS).toBeLessThan(0.16);
    expect(b.syllableIntervalS).toBeGreaterThan(0.3);
    const n = fast.expected.flatMap((w) => w.syllables).length;
    expect(a.nuclei.length).toBe(n);
    expect(b.nuclei.length).toBe(n);
    // word gaps are found as silence gaps in both readings
    expect(a.gaps.length).toBeGreaterThanOrEqual(fast.expected.length - 1);
    expect(b.gaps.length).toBeGreaterThanOrEqual(slow.expected.length - 1);
  });

  it("derives the silence level from the noise floor, not the global peak", async () => {
    const { synth } = fixture(GEN_1_3, { noiseFloor: 0.03, gapMs: 0, wordGapMs: 60, seed: 4 });
    const a = analyzeNuclei(estimatePitchTrack(synth.samples, synth.sampleRate));
    expect(a.noiseFloor).toBeGreaterThan(0);
    expect(a.silenceLevel).toBeGreaterThan(a.noiseFloor);
    expect(a.nuclei.length).toBe(buildExpectedWords(GEN_1_3).flatMap((w) => w.syllables).length);
  });
});
