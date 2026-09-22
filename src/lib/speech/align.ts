/**
 * Align expected syllables to detected nuclei with an edit-distance DP (a small DTW):
 *   match(i, j)   cost = timing drift + duration mismatch
 *   omit(i)       expected syllable with no nucleus   (cost OMIT)
 *   insert(j)     nucleus with no expected syllable   (cost INSERT)
 * Timing drift compares the expected cumulative weight fraction with the nucleus' time
 * fraction, so the aligner tolerates a globally faster/slower reading but resists
 * assigning a word's syllables to nuclei from the other end of the verse.
 * A boundary cue adds cost when consecutive syllables of ONE word are matched to nuclei
 * separated by a word-sized silence, or when a word boundary falls on nuclei with no gap —
 * so a swallowed syllable is charged to its own word rather than stolen from a neighbour.
 */
import type { ExpectedSyllable } from "./expected";
import type { Nucleus } from "./nuclei";

export interface SyllableMatch {
  syllable: number; // index into expected
  nucleus: number; // index into nuclei
  cost: number;
}

export interface AlignmentResult {
  matches: SyllableMatch[];
  omitted: number[]; // expected syllable indices
  inserted: number[]; // nucleus indices
  totalCost: number;
}

export interface AlignOptions {
  omitCost?: number;
  insertCost?: number;
  driftWeight?: number;
  durationWeight?: number;
  /** Weight of the word-boundary cue. */
  boundaryWeight?: number;
  /** Silence (s) that counts as a word gap. */
  wordGapS?: number;
  /** Silence (s) below which two nuclei are "within one word". */
  syllableGapS?: number;
}

const D: Required<AlignOptions> = {
  omitCost: 1.0,
  insertCost: 0.6,
  driftWeight: 3.0,
  durationWeight: 0.5,
  boundaryWeight: 0.6,
  wordGapS: 0.08,
  syllableGapS: 0.04,
};

export function alignSyllables(expected: ExpectedSyllable[], nuclei: Nucleus[], options: AlignOptions = {}): AlignmentResult {
  const o = { ...D, ...options };
  const n = expected.length;
  const m = nuclei.length;
  if (!n || !m) {
    return { matches: [], omitted: expected.map((_, i) => i), inserted: nuclei.map((_, j) => j), totalCost: n * o.omitCost + m * o.insertCost };
  }

  // expected cumulative fraction (centre of each syllable)
  const totalW = expected.reduce((a, s) => a + s.weight + s.pauseAfter, 0);
  const expFrac: number[] = [];
  let acc = 0;
  for (const s of expected) {
    expFrac.push((acc + s.weight / 2) / totalW);
    acc += s.weight + s.pauseAfter;
  }
  const t0 = nuclei[0].start;
  const t1 = nuclei[m - 1].end;
  const span = Math.max(1e-3, t1 - t0);
  const nucFrac = nuclei.map((nu) => (nu.t - t0) / span);
  const meanNucDur = nuclei.reduce((a, nu) => a + (nu.end - nu.start), 0) / m;
  const meanW = expected.reduce((a, s) => a + s.weight, 0) / n;

  const matchCost = (i: number, j: number) => {
    const drift = Math.abs(expFrac[i] - nucFrac[j]) * o.driftWeight;
    const expDur = (expected[i].weight / meanW) * meanNucDur;
    const dur = Math.abs(Math.log((nuclei[j].end - nuclei[j].start + 1e-3) / (expDur + 1e-3))) * o.durationWeight;
    // boundary cue relative to the previous pair (i-1, j-1)
    let boundary = 0;
    if (i > 0 && j > 0) {
      const sameWord = expected[i].wordIndex === expected[i - 1].wordIndex;
      const gap = nuclei[j].start - nuclei[j - 1].end;
      if (sameWord && gap > o.wordGapS) boundary = Math.min(1, (gap - o.wordGapS) / o.wordGapS) * o.boundaryWeight;
      if (!sameWord && gap < o.syllableGapS) boundary = o.boundaryWeight;
    }
    return drift + dur + boundary;
  };

  // DP over (i, j): cost of aligning expected[0..i) with nuclei[0..j)
  const cost: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  const back: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0)); // 1 match, 2 omit, 3 insert
  for (let i = 1; i <= n; i++) {
    cost[i][0] = i * o.omitCost;
    back[i][0] = 2;
  }
  for (let j = 1; j <= m; j++) {
    cost[0][j] = j * o.insertCost;
    back[0][j] = 3;
  }
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const mc = cost[i - 1][j - 1] + matchCost(i - 1, j - 1);
      const oc = cost[i - 1][j] + o.omitCost;
      const ic = cost[i][j - 1] + o.insertCost;
      if (mc <= oc && mc <= ic) {
        cost[i][j] = mc;
        back[i][j] = 1;
      } else if (oc <= ic) {
        cost[i][j] = oc;
        back[i][j] = 2;
      } else {
        cost[i][j] = ic;
        back[i][j] = 3;
      }
    }
  }

  const matches: SyllableMatch[] = [];
  const omitted: number[] = [];
  const inserted: number[] = [];
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    const b = back[i][j];
    if (b === 1) {
      matches.push({ syllable: i - 1, nucleus: j - 1, cost: matchCost(i - 1, j - 1) });
      i--;
      j--;
    } else if (b === 2) {
      omitted.push(i - 1);
      i--;
    } else {
      inserted.push(j - 1);
      j--;
    }
  }
  matches.reverse();
  omitted.reverse();
  inserted.reverse();
  return { matches, omitted, inserted, totalCost: cost[n][m] };
}
