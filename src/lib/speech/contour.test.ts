import { describe, expect, it } from "vitest";
import type { PitchFrame } from "@/lib/audio/pitch";
import { ACCENT_TEMPLATES, ACCENT_TEMPLATES_BY_MARK } from "./accent-templates";
import { ACCENT_THRESHOLDS, analyzeAccent, contourDistance, resampleContour, scoreContour, templateContour, verdictFor } from "./contour";

/** Frames following a semitone shape over [start, end] around a base of 130 Hz, with optional jitter. */
function frames(shape: number[], start = 1, end = 1.5, base = 130, jitter = 0, seed = 1): PitchFrame[] {
  const out: PitchFrame[] = [];
  let s = seed;
  const rand = () => ((s = (s * 9301 + 49297) % 233280) / 233280 - 0.5) * 2;
  for (let t = start; t <= end + 1e-9; t += 0.01) {
    const u = (t - start) / (end - start);
    const idx = u * (shape.length - 1);
    const i = Math.min(shape.length - 2, Math.floor(idx));
    const st = shape[i] + (shape[i + 1] - shape[i]) * (idx - i) + rand() * jitter;
    out.push({ t: Number(t.toFixed(3)), f0: base * Math.pow(2, st / 12), rms: 0.2, rmsShort: 0.2, clarity: 0.9 });
  }
  return out;
}

describe("templates", () => {
  it("cover every disjunctive mark used by the rule engine", () => {
    for (const id of ["etnahta", "sof-pasuq", "zaqef-qatan", "zaqef-gadol", "segol", "revia", "tipeha", "shalshelet", "zarqa", "pashta", "geresh", "tevir", "pazer"]) {
      expect(ACCENT_TEMPLATES_BY_MARK.get(id), id).toBeDefined();
    }
    for (const t of ACCENT_TEMPLATES) {
      expect(t.points[0]).toBe(0);
      expect(t.movement).toBeGreaterThan(0);
    }
  });
});

describe("contour utilities", () => {
  it("resamples to an even grid", () => {
    const r = resampleContour([{ t: 0, st: 0 }, { t: 1, st: 4 }], 5);
    expect(r.map((p) => p.st)).toEqual([0, 1, 2, 3, 4]);
    expect(resampleContour([], 5)).toEqual([]);
  });
  it("DTW distance is 0 for identical contours and grows with difference", () => {
    const a = templateContour(ACCENT_TEMPLATES_BY_MARK.get("zaqef-qatan")!);
    expect(contourDistance(a, a)).toBe(0);
    const b = templateContour(ACCENT_TEMPLATES_BY_MARK.get("etnahta")!);
    expect(contourDistance(a, b)).toBeGreaterThan(1.5);
  });
  it("maps scores to verdicts", () => {
    expect(verdictFor(null)).toBe("unvoiced");
    expect(verdictFor(85)).toBe("good");
    expect(verdictFor(55)).toBe("partial");
    expect(verdictFor(20)).toBe("off");
  });
});

describe("analyzeAccent", () => {
  it("scores a contour that follows the template highly, even with jitter", () => {
    for (const id of ["etnahta", "zaqef-qatan", "segol", "revia", "tipeha", "sof-pasuq", "pashta"]) {
      const t = ACCENT_TEMPLATES_BY_MARK.get(id)!;
      const a = analyzeAccent(frames(t.points, 1, 1.5, 130, 0.35, 3), { start: 1, end: 1.5 }, id, t.nameHe)!;
      expect(a.verdict, id).toBe("good");
      expect(a.score as number, id).toBeGreaterThanOrEqual(ACCENT_THRESHOLDS.good);
      expect(a.contour).toHaveLength(16);
    }
  });

  it("scores the opposite movement low", () => {
    const zaqef = ACCENT_TEMPLATES_BY_MARK.get("zaqef-qatan")!;
    const inverted = zaqef.points.map((p) => -p);
    const a = analyzeAccent(frames(inverted), { start: 1, end: 1.5 }, "zaqef-qatan", zaqef.nameHe)!;
    expect(a.verdict).toBe("off");
    expect(a.score as number).toBeLessThan(40);
  });

  it("scores a flat monotone low on a moving accent", () => {
    const a = analyzeAccent(frames([0, 0, 0, 0]), { start: 1, end: 1.5 }, "etnahta", "אתנחתא")!;
    expect(a.movementSemitones as number).toBeLessThan(0.5);
    expect(a.score as number).toBeLessThan(45);
    expect(a.verdict).not.toBe("good");
  });

  it("distinguishes a rising zaqef from a falling etnahta", () => {
    const rise = frames(ACCENT_TEMPLATES_BY_MARK.get("zaqef-qatan")!.points);
    const asZaqef = analyzeAccent(rise, { start: 1, end: 1.5 }, "zaqef-qatan", "זקף קטון")!;
    const asEtnahta = analyzeAccent(rise, { start: 1, end: 1.5 }, "etnahta", "אתנחתא")!;
    expect(asZaqef.score as number).toBeGreaterThan((asEtnahta.score as number) + 30);
  });

  it("returns unvoiced when there is too little voiced audio", () => {
    const few = frames([0, 1], 1, 1.02);
    const a = analyzeAccent(few, { start: 1, end: 1.02 }, "etnahta", "אתנחתא")!;
    expect(a.verdict).toBe("unvoiced");
    expect(a.score).toBeNull();
    expect(a.contour).toEqual([]);
  });

  it("returns null for marks without a template (conjunctives)", () => {
    expect(analyzeAccent(frames([0, 1]), { start: 1, end: 1.5 }, "munah", "מונח")).toBeNull();
  });

  it("is invariant to the absolute pitch (uses the region's opening pitch)", () => {
    const t = ACCENT_TEMPLATES_BY_MARK.get("revia")!;
    const low = analyzeAccent(frames(t.points, 1, 1.5, 100), { start: 1, end: 1.5 }, "revia", t.nameHe)!;
    const high = analyzeAccent(frames(t.points, 1, 1.5, 220), { start: 1, end: 1.5 }, "revia", t.nameHe)!;
    expect(low.score).toBe(high.score);
  });

  it("magnitude matters: a movement three times larger than expected loses points", () => {
    const t = ACCENT_TEMPLATES_BY_MARK.get("tipeha")!;
    const exact = scoreContour(templateContour(t), t);
    const huge = scoreContour(templateContour({ ...t, points: t.points.map((p) => p * 3.5) }), t);
    expect(huge.magnitudeScore).toBeLessThan(exact.magnitudeScore);
    expect(huge.score).toBeLessThan(exact.score);
  });
});
