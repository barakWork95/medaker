#!/usr/bin/env node
/**
 * Verify src/data/verses.json against Sefaria's WLC-based version
 * ("Tanach with Ta'amei Hamikra") and refresh the offline snapshot.
 *
 *   npm run verify:verses            # compare, exit 1 on any mismatch
 *   npm run verify:verses -- --write # also (re)write src/data/verses.wlc.json
 *
 * Optional second witness: pass --uxlc to also compare against tanach.us UXLC
 * (Unicode/XML Leningrad Codex). UXLC inserts U+034F CGJ in leading-meteg
 * words and a space after maqaf; both are normalised away before comparing.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const dataDir = join(here, "..", "src", "data");
const verses = JSON.parse(readFileSync(join(dataDir, "verses.json"), "utf8"));
const write = process.argv.includes("--write");
const useUxlc = process.argv.includes("--uxlc");

const VERSION = "Tanach with Ta'amei Hamikra";

export function normalizeHebrew(s) {
  return s
    .replace(/<[^>]+>/g, "")
    .replace(/&thinsp;|&nbsp;/g, " ")
    .replace(/͏/g, "")
    .replace(/־\s+/g, "־")
    .normalize("NFD")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchSefaria(ref) {
  const url = `https://www.sefaria.org/api/v3/texts/${encodeURIComponent(ref.replace(/ /g, "."))}?version=hebrew%7C${encodeURIComponent(VERSION)}`;
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`Sefaria ${ref}: HTTP ${res.status}`);
  const json = await res.json();
  const v = json.versions?.find((x) => x.versionTitle === VERSION) ?? json.versions?.[0];
  if (!v) throw new Error(`Sefaria ${ref}: no version in response`);
  return { text: Array.isArray(v.text) ? v.text.join(" ") : v.text, versionTitle: v.versionTitle };
}

const uxlcCache = new Map();
async function fetchUxlc(ref) {
  const m = /^(\w+) (\d+):(\d+)$/.exec(ref);
  if (!m) throw new Error(`Bad ref ${ref}`);
  const [, book, ch, vs] = m;
  if (!uxlcCache.has(book)) {
    const res = await fetch(`https://www.tanach.us/Books/${book}.xml`);
    if (!res.ok) throw new Error(`UXLC ${book}: HTTP ${res.status}`);
    uxlcCache.set(book, await res.text());
  }
  const xml = uxlcCache.get(book);
  // The header also contains <c n="…"> verse-count elements; take the chapter that has words.
  const chapter = [...xml.matchAll(new RegExp(`<c n="${ch}">([\\s\\S]*?)</c>`, "g"))]
    .map((m) => m[1])
    .find((c) => c.includes("<w>"));
  const verse = chapter && new RegExp(`<v n="${vs}">([\\s\\S]*?)</v>`).exec(chapter)?.[1];
  if (!verse) throw new Error(`UXLC ${ref}: not found`);
  const words = [...verse.matchAll(/<w>([\s\S]*?)<\/w>/g)].map((w) => w[1].replace(/<[^>]+>/g, ""));
  return words.join(" ");
}

let failures = 0;
const snapshot = { source: `Sefaria API v3, version "${VERSION}" (WLC)`, fetchedAt: new Date().toISOString(), verses: {} };

for (const v of verses) {
  const sef = await fetchSefaria(v.sefariaRef);
  const a = normalizeHebrew(v.text);
  const b = normalizeHebrew(sef.text);
  const ok = a === b;
  snapshot.verses[v.id] = { ref: v.sefariaRef, text: b };
  let line = `${ok ? "✓" : "✗"} ${v.id.padEnd(10)} sefaria:${ok ? "match" : "DIFF"}`;
  if (useUxlc) {
    const c = normalizeHebrew(await fetchUxlc(v.sefariaRef));
    const ok2 = a === c;
    line += ` uxlc:${ok2 ? "match" : "DIFF"}`;
    if (!ok2) failures++;
  }
  if (!ok) {
    failures++;
    const i = [...a].findIndex((ch, idx) => ch !== [...b][idx]);
    line += `\n    first difference at index ${i}: local U+${(a.codePointAt(i) ?? 0).toString(16)} vs source U+${(b.codePointAt(i) ?? 0).toString(16)}\n    local : ${v.text}\n    source: ${sef.text}`;
  }
  console.log(line);
}

if (write) {
  writeFileSync(join(dataDir, "verses.wlc.json"), JSON.stringify(snapshot, null, 2) + "\n");
  console.log(`snapshot written → src/data/verses.wlc.json`);
}
if (failures) {
  console.error(`\n${failures} mismatch(es)`);
  process.exit(1);
}
console.log(`\nall ${verses.length} verses match ${VERSION}`);
