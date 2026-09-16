#!/usr/bin/env node
/**
 * Build src/lib/scripture/index.generated.json from Sefaria:
 *   - /api/shape/<book>      → Hebrew title + verses-per-chapter for all 39 Tanakh books
 *   - /api/v2/index/<torah>  → parasha ranges + Hebrew/English aliases (alts.Parasha)
 *
 *   npm run build:scripture
 *
 * Output is small (~20 KB) and committed; the app never calls these endpoints at runtime.
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const OUTPUT = join(root, "src", "lib", "scripture", "index.generated.json");

/** Canonical Tanakh order with Sefaria titles. */
const BOOKS = [
  ["torah", ["Genesis", "Exodus", "Leviticus", "Numbers", "Deuteronomy"]],
  [
    "neviim",
    ["Joshua", "Judges", "I Samuel", "II Samuel", "I Kings", "II Kings", "Isaiah", "Jeremiah", "Ezekiel",
     "Hosea", "Joel", "Amos", "Obadiah", "Jonah", "Micah", "Nahum", "Habakkuk", "Zephaniah", "Haggai", "Zechariah", "Malachi"],
  ],
  [
    "ketuvim",
    ["Psalms", "Proverbs", "Job", "Song of Songs", "Ruth", "Lamentations", "Ecclesiastes", "Esther",
     "Daniel", "Ezra", "Nehemiah", "I Chronicles", "II Chronicles"],
  ],
];

async function getJson(path) {
  const res = await fetch(`https://www.sefaria.org${path}`, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return res.json();
}

const HEBREW = /[א-ת]/;
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

function parseRange(wholeRef, book) {
  // "Genesis 6:9-11:32" | "Deuteronomy 33:1-34:12" | "Deuteronomy 31:1-30" (single-chapter range)
  const m = new RegExp(`^${book} (\\d+):(\\d+)-(?:(\\d+):)?(\\d+)$`).exec(wholeRef);
  if (!m) throw new Error(`unexpected wholeRef ${wholeRef}`);
  return { start: { chapter: +m[1], verse: +m[2] }, end: { chapter: m[3] ? +m[3] : +m[1], verse: +m[4] } };
}

const books = [];
const parashot = [];
for (const [section, titles] of BOOKS) {
  for (const title of titles) {
    const [shape] = await getJson(`/api/shape/${encodeURIComponent(title)}`);
    if (!shape || shape.book !== title) throw new Error(`shape mismatch for ${title}`);
    books.push({ id: title, heTitle: shape.heBook, section, chapters: shape.chapters });
    process.stdout.write(`${title} (${shape.chapters.length} ch) `);

    if (section === "torah") {
      const index = await getJson(`/api/v2/index/${encodeURIComponent(title)}`);
      const nodes = index.alts?.Parasha?.nodes ?? [];
      for (const node of nodes) {
        const titlesAll = node.titles.map((t) => t.text);
        const heTitle = titlesAll.find((t) => HEBREW.test(t) && !t.startsWith("פרשת"));
        const { start, end } = parseRange(node.wholeRef, title);
        parashot.push({
          id: slug(node.sharedTitle),
          title: node.sharedTitle,
          heTitle,
          book: title,
          start,
          end,
          aliases: titlesAll.filter((t) => t !== node.sharedTitle && t !== heTitle),
        });
      }
    }
  }
}
console.log();

const out = {
  source: "Sefaria API (/api/shape, /api/v2/index alts.Parasha)",
  generatedAt: new Date().toISOString(),
  books,
  parashot,
};
writeFileSync(OUTPUT, JSON.stringify(out) + "\n");
const verses = books.reduce((n, b) => n + b.chapters.reduce((a, c) => a + c, 0), 0);
console.log(`${books.length} books, ${books.reduce((n, b) => n + b.chapters.length, 0)} chapters, ${verses} verses, ${parashot.length} parashot → ${relative(root, OUTPUT)}`);
