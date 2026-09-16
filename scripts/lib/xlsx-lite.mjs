/**
 * Dependency-free reader for the parts of .xlsx we need (zip + shared strings + one sheet).
 * Supports stored (0) and deflated (8) zip entries, shared / inline / numeric cells.
 */
import { inflateRawSync } from "node:zlib";

export function readZip(buf) {
  let eocd = buf.length - 22;
  while (eocd >= 0 && buf.readUInt32LE(eocd) !== 0x06054b50) eocd--;
  if (eocd < 0) throw new Error("not a zip file (no end-of-central-directory)");
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const files = new Map();
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error("bad central directory entry");
    const method = buf.readUInt16LE(p + 10);
    const compSize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOffset = buf.readUInt32LE(p + 42);
    const name = buf.toString("utf8", p + 46, p + 46 + nameLen);
    const ln = buf.readUInt16LE(localOffset + 26);
    const le = buf.readUInt16LE(localOffset + 28);
    const start = localOffset + 30 + ln + le;
    const data = buf.subarray(start, start + compSize);
    if (method === 0) files.set(name, data);
    else if (method === 8) files.set(name, inflateRawSync(data));
    else throw new Error(`unsupported zip method ${method} for ${name}`);
    p += 46 + nameLen + extraLen + commentLen;
  }
  return files;
}

const decode = (s) =>
  s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&amp;/g, "&");

const textOf = (xml) => decode([...xml.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((m) => m[1]).join(""));

function sharedStrings(files) {
  const xml = files.get("xl/sharedStrings.xml")?.toString("utf8") ?? "";
  return [...xml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => textOf(m[1]));
}

/**
 * Returns rows as objects keyed by column letter: [{A:"name", B:"Unicode", ...}, ...].
 * Numeric cells come back as numbers, everything else as strings; empty cells are absent.
 */
export function readSheet(buf, sheetPath = "xl/worksheets/sheet1.xml") {
  const files = readZip(buf);
  const strings = sharedStrings(files);
  const xml = files.get(sheetPath)?.toString("utf8");
  if (!xml) throw new Error(`${sheetPath} not found in workbook`);
  const rows = [];
  for (const [, rowXml] of xml.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
    const row = {};
    for (const [, ref, attrs, body] of rowXml.matchAll(/<c r="([A-Z]+)\d+"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      if (!body) continue;
      const type = /t="([^"]+)"/.exec(attrs)?.[1];
      const v = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1];
      let value;
      if (type === "s" && v !== undefined) value = strings[Number(v)];
      else if (type === "inlineStr") value = textOf(body);
      else if (type === "str" || type === "b" || type === "e") value = decode(v ?? "");
      else if (v !== undefined) value = Number(v);
      if (value === undefined || value === "") continue;
      row[ref] = value;
    }
    if (Object.keys(row).length) rows.push(row);
  }
  return rows;
}
