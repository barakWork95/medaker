#!/usr/bin/env node
/**
 * Import the cantillation → gesture mapping sheet into src/lib/taamim/taamim.generated.json.
 *
 *   npm run import:taamim            # reads data/taamim-mapping.xlsx
 *   npm run import:taamim -- path.xlsx
 *
 * Sheet columns (header row): name | Unicode | example | defaultGesture | contextRule | expectedGesture
 *  - A mark may span several rows: continuation rows leave name/Unicode/example empty and
 *    carry one extra contextRule/expectedGesture pair. Rules are kept in sheet order and
 *    evaluated first-match-wins.
 *  - Hebrew contextRule text is mapped to an explicit identifier via CONTEXT_RULE_TEXT.
 *    Unknown text is an error: register the rule here AND implement it in
 *    src/lib/taamim/rules.ts (CONTEXT_RULES) before importing.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";
import { readSheet } from "./lib/xlsx-lite.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
export const DEFAULT_SOURCE = join(root, "data", "taamim-mapping.xlsx");
export const OUTPUT = join(root, "src", "lib", "taamim", "taamim.generated.json");

/** Sheet gesture labels → GestureType. */
export const GESTURE_LABELS = {
  none: "NONE",
  "long-press": "LONG_PRESS",
  diagonal: "DIAGONAL",
  "triple-tap": "TRIPLE_TAP",
  קשקוש: "ZIGZAG",
  zigzag: "ZIGZAG",
  tilde: "TILDE",
  "swipe-down": "SWIPE_DOWN",
  "double swipe-down": "SWIPE_DOWN_TWICE", // sequential: swipe down, lift, swipe down again
  "swipe-down twice": "SWIPE_DOWN_TWICE",
};

/** Hebrew contextRule text (whitespace-normalised) → rule identifier. */
export const CONTEXT_RULE_TEXT = {
  "במקרה שהוא הטעם האחרון מסוג (triple-tap / long-press) עד לסוף הפסוק (swipe-down)":
    "LAST_MAJOR_BEFORE_SOF_PASUK",
  "במקרה שהטעם מסוג triple-tap / long-press הבא אחריו הוא רביע (597) ואין ביניהם פסק (05C0)":
    "NEXT_MAJOR_IS_REVIA_WITHOUT_PASEK",
};

const norm = (s) => String(s ?? "").replace(/\s+/g, " ").trim();

function gestureOf(label, where) {
  const key = norm(label).toLowerCase();
  const g = GESTURE_LABELS[key] ?? GESTURE_LABELS[norm(label)];
  if (!g) throw new Error(`${where}: unknown gesture label "${label}"`);
  return g;
}

function codePointOf(cell, where) {
  // "059A" stays text; "0591" is parsed by Excel as the number 591 → read its digits as hex.
  const hex = typeof cell === "number" ? String(Math.round(cell)).padStart(4, "0") : norm(cell).toUpperCase();
  if (!/^[0-9A-F]{4}$/.test(hex)) throw new Error(`${where}: bad Unicode cell "${cell}"`);
  return { hex, codePoint: parseInt(hex, 16) };
}

export function parseTaamimRows(rows) {
  const header = rows[0];
  const col = {};
  for (const [letter, title] of Object.entries(header)) col[norm(title)] = letter;
  for (const required of ["name", "Unicode", "defaultGesture", "contextRule", "expectedGesture"]) {
    if (!col[required]) throw new Error(`header row is missing column "${required}"`);
  }
  const cell = (row, name) => row[col[name]];

  const marks = [];
  rows.slice(1).forEach((row, i) => {
    const where = `row ${i + 2}`;
    const name = norm(cell(row, "name"));
    const unicode = cell(row, "Unicode");
    const ruleText = norm(cell(row, "contextRule"));
    const expected = norm(cell(row, "expectedGesture"));

    const rule =
      ruleText && ruleText.toLowerCase() !== "none"
        ? (() => {
            const id = CONTEXT_RULE_TEXT[ruleText];
            if (!id) throw new Error(`${where}: unregistered contextRule text:\n  "${ruleText}"`);
            return { id, expectedGesture: gestureOf(expected, where), sourceText: ruleText };
          })()
        : null;

    if (!name && unicode === undefined) {
      // continuation row → extra rule for the previous mark
      const prev = marks[marks.length - 1];
      if (!prev) throw new Error(`${where}: continuation row before any mark`);
      if (!rule) throw new Error(`${where}: continuation row without a contextRule`);
      prev.rules.push(rule);
      return;
    }
    if (!name || unicode === undefined) throw new Error(`${where}: name and Unicode must both be present`);
    const { hex, codePoint } = codePointOf(unicode, where);
    if (marks.some((m) => m.codePoint === codePoint)) throw new Error(`${where}: duplicate code point ${hex}`);
    marks.push({
      codePoint,
      hex,
      nameHe: name,
      example: norm(cell(row, "example")) || null,
      defaultGesture: gestureOf(cell(row, "defaultGesture"), where),
      rules: rule ? [rule] : [],
    });
  });
  return marks;
}

export function parseTaamimWorkbook(buffer) {
  return parseTaamimRows(readSheet(buffer));
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const source = process.argv[2] ? join(process.cwd(), process.argv[2]) : DEFAULT_SOURCE;
  const marks = parseTaamimWorkbook(readFileSync(source));
  const out = {
    source: relative(root, source),
    generatedAt: new Date().toISOString(),
    marks,
  };
  writeFileSync(OUTPUT, JSON.stringify(out, null, 2) + "\n");
  const rules = marks.reduce((n, m) => n + m.rules.length, 0);
  console.log(`${marks.length} marks, ${rules} context rules → ${relative(root, OUTPUT)}`);
}
