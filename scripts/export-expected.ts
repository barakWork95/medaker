/**
 * Print the AlignRequest `expected` array for a verse — the Temani expectations the aligner
 * server needs. Used to build fixtures for medaker-aligner.
 *
 *   npx vite-node --config vitest.config.mts scripts/export-expected.ts "בְּרֵאשִׁ֖ית בָּרָ֣א …" > expected.json
 */
import { buildExpectedWords } from "@/lib/speech/expected";

const text = process.argv[2];
if (!text) {
  console.error('usage: export-expected.ts "<pointed verse>"');
  process.exit(1);
}
const expected = buildExpectedWords(text).map((w) => ({
  index: w.index,
  display: w.display,
  pointed: w.pointed,
  ipa: w.ipa,
  roman: w.roman,
  syllables: w.syllables.map((s) => ({ index: s.index, ipa: s.ipa, stressed: s.stressed, weight: s.weight })),
  markId: w.token.primaryMark?.id ?? null,
  disjunctive: w.disjunctive,
}));
console.log(JSON.stringify(expected, null, 2));
