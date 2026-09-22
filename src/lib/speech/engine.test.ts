import { describe, expect, it, vi } from "vitest";
import { encodeWav } from "@/lib/audio/wav";
import { estimatePitchTrack } from "@/lib/audio/pitch";
import { computeVoiceProfile } from "@/lib/audio/voice-profile";
import { alignSyllables } from "./align";
import { LocalRhythmEngine, RemoteEngine, evaluateLocally, getRemoteApiUrl, statusFor, type EvaluationRequest, type VerseEvaluation } from "./engine";
import { buildExpectedWords } from "./expected";
import { detectNuclei } from "./nuclei";
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

describe("RemoteEngine", () => {
  it("posts audio + Temani expectations and returns the server's evaluation", async () => {
    const { request } = fixture(GEN_1_3);
    const served: VerseEvaluation = { engine: "remote", tradition: "temani", words: [], summary: { correct: 0, minor: 0, missing: 0, score: 0, coverage: 0, extraNuclei: 0 } };
    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      expect(String(url)).toBe("https://align.example/evaluate");
      const body = JSON.parse(String(init?.body));
      expect(body.tradition).toBe("temani");
      expect(body.expected[0]).toMatchObject({ display: "ויאמר", roman: "waˈyyömar" });
      expect(body.audio.mimeType).toBe("audio/wav");
      expect(body.audio.base64.length).toBeGreaterThan(100);
      return { ok: true, status: 200, json: async () => served } as unknown as Response;
    });
    const result = await new RemoteEngine("https://align.example/", fetchImpl as unknown as typeof fetch).evaluate(request);
    expect(result.engine).toBe("remote");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("rejects server errors and malformed bodies", async () => {
    const { request } = fixture(GEN_1_3);
    const bad = vi.fn(async () => ({ ok: false, status: 503, json: async () => ({}) }) as unknown as Response);
    await expect(new RemoteEngine("https://x", bad as unknown as typeof fetch).evaluate(request)).rejects.toThrow(/HTTP 503/);
    const malformed = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ nope: 1 }) }) as unknown as Response);
    await expect(new RemoteEngine("https://x", malformed as unknown as typeof fetch).evaluate(request)).rejects.toThrow(/malformed/);
  });

  it("is only selected when a URL is configured", () => {
    expect(getRemoteApiUrl()).toBeNull();
  });
});
