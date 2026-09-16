import { describe, expect, it } from "vitest";
import { classifyStroke, directionChanges, type StrokePoint } from "./classify";

/** Deterministic pseudo-random noise so tests are stable. */
function noise(seed: number) {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280 - 0.5;
  };
}

function stroke(fn: (t: number) => { x: number; y: number }, n = 40, jitter = 0, seed = 1): StrokePoint[] {
  const r = noise(seed);
  return Array.from({ length: n }, (_, i) => {
    const p = fn(i / (n - 1));
    return { x: p.x + r() * jitter, y: p.y + r() * jitter, t: i * 12 };
  });
}

const line = (x0: number, y0: number, x1: number, y1: number) => (t: number) => ({
  x: x0 + (x1 - x0) * t,
  y: y0 + (y1 - y0) * t,
});

const TAU = Math.PI * 2;

describe("directionChanges", () => {
  it("counts reversals with hysteresis", () => {
    expect(directionChanges([0, 20, 0, 20, 0], 8)).toBe(3);
    expect(directionChanges([0, 20, 18, 20, 40], 8)).toBe(0); // wobble ignored
  });
});

describe("classifyStroke", () => {
  it("accepts a backslash drawn down-right", () => {
    expect(classifyStroke(stroke(line(100, 100, 180, 190), 30, 3)).gesture).toBe("DIAGONAL");
  });

  it("rejects a slash and a reversed backslash", () => {
    expect(classifyStroke(stroke(line(100, 190, 180, 100), 30, 3)).gesture).toBe("UNKNOWN");
    expect(classifyStroke(stroke(line(180, 190, 100, 100), 30, 3)).gesture).toBe("UNKNOWN");
  });

  it("rejects horizontal lines and upward vertical lines", () => {
    expect(classifyStroke(stroke(line(100, 100, 220, 104), 30, 2)).gesture).toBe("UNKNOWN");
    expect(classifyStroke(stroke(line(220, 104, 100, 100), 30, 2)).gesture).toBe("UNKNOWN");
    expect(classifyStroke(stroke(line(103, 220, 100, 100), 30, 2)).gesture).toBe("UNKNOWN");
  });

  it("accepts a downward swipe within the vertical tolerance", () => {
    expect(classifyStroke(stroke(line(100, 100, 103, 220), 30, 2)).gesture).toBe("SWIPE_DOWN");
    // 80° below horizontal → still a swipe-down (tolerance ±20° around 90°)
    expect(classifyStroke(stroke(line(100, 100, 121, 220), 30, 2)).gesture).toBe("SWIPE_DOWN");
    // 60° below horizontal → inside the diagonal window, not a swipe
    expect(classifyStroke(stroke(line(100, 100, 169, 220), 30, 2)).gesture).toBe("DIAGONAL");
    // a wobbly, non-straight downward path is rejected
    const wobble = stroke((t) => ({ x: 100 + 40 * Math.sin(TAU * 2 * t), y: 100 + 120 * t }), 48, 1);
    expect(classifyStroke(wobble).gesture).not.toBe("SWIPE_DOWN");
  });

  it("accepts a right-to-left tilde (both phases)", () => {
    const up = stroke((t) => ({ x: 300 - 160 * t, y: 200 - 30 * Math.sin(TAU * t) }), 48, 3);
    const down = stroke((t) => ({ x: 300 - 160 * t, y: 200 + 30 * Math.sin(TAU * t) }), 48, 3, 7);
    expect(classifyStroke(up).gesture).toBe("TILDE");
    expect(classifyStroke(down).gesture).toBe("TILDE");
  });

  it("rejects a left-to-right tilde", () => {
    const ltr = stroke((t) => ({ x: 140 + 160 * t, y: 200 - 30 * Math.sin(TAU * t) }), 48, 3);
    expect(classifyStroke(ltr).gesture).toBe("UNKNOWN");
  });

  it("accepts a right-to-left infinity loop", () => {
    // start at the right lobe, heading up-left
    const inf = stroke(
      (t) => ({ x: 200 + 80 * Math.cos(TAU * t), y: 200 - 35 * Math.sin(2 * TAU * t) }),
      64,
      3,
    );
    expect(classifyStroke(inf).gesture).toBe("TILDE");
    // start at the crossing, heading left
    const inf2 = stroke(
      (t) => ({ x: 200 + 80 * Math.cos(Math.PI / 2 + TAU * t), y: 200 + 35 * Math.sin(Math.PI + 2 * TAU * t) }),
      64,
      3,
      5,
    );
    expect(classifyStroke(inf2).gesture).toBe("TILDE");
  });

  it("rejects a left-to-right infinity loop", () => {
    const inf = stroke(
      (t) => ({ x: 200 + 80 * Math.cos(Math.PI + TAU * t), y: 200 - 35 * Math.sin(2 * TAU * t) }),
      64,
      3,
    );
    expect(classifyStroke(inf).gesture).toBe("UNKNOWN");
  });

  it("accepts an upward zigzag with ≥3 direction changes", () => {
    const pts: StrokePoint[] = [];
    const xs = [100, 150, 100, 150, 100]; // 4 segments → 3 reversals
    for (let seg = 0; seg < xs.length - 1; seg++) {
      for (let i = 0; i < 8; i++) {
        const t = i / 8;
        pts.push({ x: xs[seg] + (xs[seg + 1] - xs[seg]) * t, y: 300 - (seg + t) * 30, t: pts.length * 10 });
      }
    }
    expect(classifyStroke(pts).gesture).toBe("ZIGZAG");
  });

  it("rejects a downward zigzag and a two-reversal zigzag", () => {
    const down: StrokePoint[] = [];
    const xs = [100, 150, 100, 150, 100];
    for (let seg = 0; seg < xs.length - 1; seg++) {
      for (let i = 0; i < 8; i++) {
        const t = i / 8;
        down.push({ x: xs[seg] + (xs[seg + 1] - xs[seg]) * t, y: 100 + (seg + t) * 30, t: down.length * 10 });
      }
    }
    expect(classifyStroke(down).gesture).not.toBe("ZIGZAG");

    const few: StrokePoint[] = [];
    const xs2 = [100, 150, 100, 150]; // 2 reversals only
    for (let seg = 0; seg < xs2.length - 1; seg++) {
      for (let i = 0; i < 8; i++) {
        const t = i / 8;
        few.push({ x: xs2[seg] + (xs2[seg + 1] - xs2[seg]) * t, y: 300 - (seg + t) * 30, t: few.length * 10 });
      }
    }
    expect(classifyStroke(few).gesture).not.toBe("ZIGZAG");
  });

  it("ignores tiny strokes", () => {
    expect(classifyStroke(stroke(line(100, 100, 108, 108), 5)).gesture).toBe("UNKNOWN");
  });
});
