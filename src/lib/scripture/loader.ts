/**
 * Chapter text loader.
 *
 * Source: Sefaria API v3, version "Tanach with Ta'amei Hamikra" (Westminster Leningrad
 * Codex, public domain) — the same text `scripts/verify-verses.mjs` verifies against.
 * Fetched per chapter on demand (CORS is open), normalised, and cached:
 *   memory → localStorage ("medaker.chapter.<Book>.<n>") → network.
 * The bundled sample verses (src/data/verses.json) act as an offline seed so the app
 * still opens on Genesis 1 with no network.
 */
import { VERSES } from "@/data/verses";
import { chapterApiRef, verseCount } from "./index";

export const SEFARIA_VERSION = "Tanach with Ta'amei Hamikra";
const STORAGE_PREFIX = "medaker.chapter.";

/** Strip Sefaria markup/entities and normalise like verify-verses.mjs does. */
export function normalizeVerseText(raw: string): string {
  return raw
    .replace(/<[^>]+>/g, "")
    .replace(/&thinsp;|&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/͏/g, "")
    .replace(/־\s+/g, "־")
    .normalize("NFD")
    .replace(/\s+/g, " ")
    .trim();
}

export type ChapterText = string[]; // index 0 = verse 1

const memory = new Map<string, ChapterText>();
const inflight = new Map<string, Promise<ChapterText>>();

const cacheKey = (book: string, chapter: number) => `${book}.${chapter}`;

function readStorage(key: string): ChapterText | null {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_PREFIX + key);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.every((v) => typeof v === "string") ? (parsed as string[]) : null;
  } catch {
    return null;
  }
}

function writeStorage(key: string, text: ChapterText) {
  try {
    globalThis.localStorage?.setItem(STORAGE_PREFIX + key, JSON.stringify(text));
  } catch {
    /* quota / private mode — memory cache still works */
  }
}

/** Seed from the bundled sample verses: a sparse chapter (missing verses are ""). */
function seedChapter(book: string, chapter: number): ChapterText | null {
  const hits = VERSES.map((v) => {
    const m = /^(.+) (\d+):(\d+)$/.exec(v.sefariaRef);
    return m && m[1] === book && Number(m[2]) === chapter ? { verse: Number(m[3]), text: v.text } : null;
  }).filter((x): x is { verse: number; text: string } => x !== null);
  if (!hits.length) return null;
  const out: string[] = Array.from({ length: verseCount(book, chapter) }, () => "");
  for (const h of hits) out[h.verse - 1] = normalizeVerseText(h.text);
  return out;
}

export interface LoaderOptions {
  fetchImpl?: typeof fetch;
  /** Skip localStorage (tests). */
  noStorage?: boolean;
}

export async function fetchChapterFromSefaria(book: string, chapter: number, fetchImpl: typeof fetch = fetch): Promise<ChapterText> {
  const ref = chapterApiRef(book, chapter).replace(/ /g, ".");
  const url = `https://www.sefaria.org/api/v3/texts/${encodeURIComponent(ref)}?version=hebrew%7C${encodeURIComponent(SEFARIA_VERSION)}`;
  const res = await fetchImpl(url, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`Sefaria ${ref}: HTTP ${res.status}`);
  const json = (await res.json()) as { versions?: { versionTitle: string; text: unknown }[] };
  const version = json.versions?.find((v) => v.versionTitle === SEFARIA_VERSION) ?? json.versions?.[0];
  if (!version || !Array.isArray(version.text)) throw new Error(`Sefaria ${ref}: unexpected payload`);
  const text = (version.text as unknown[]).map((v) => (typeof v === "string" ? normalizeVerseText(v) : ""));
  const expected = verseCount(book, chapter);
  if (text.length !== expected) throw new Error(`Sefaria ${ref}: ${text.length} verses, expected ${expected}`);
  return text;
}

/**
 * Load a chapter. Resolution: memory → localStorage → network → (on network failure) seed.
 * A seeded chapter is not cached, so the next call retries the network.
 */
export function loadChapter(book: string, chapter: number, opts: LoaderOptions = {}): Promise<ChapterText> {
  const key = cacheKey(book, chapter);
  const cached = memory.get(key);
  if (cached) return Promise.resolve(cached);
  const pending = inflight.get(key);
  if (pending) return pending;

  const p = (async () => {
    if (!opts.noStorage) {
      const stored = readStorage(key);
      if (stored && stored.length === verseCount(book, chapter)) {
        memory.set(key, stored);
        return stored;
      }
    }
    try {
      const text = await fetchChapterFromSefaria(book, chapter, opts.fetchImpl);
      memory.set(key, text);
      if (!opts.noStorage) writeStorage(key, text);
      return text;
    } catch (err) {
      const seed = seedChapter(book, chapter);
      if (seed) return seed;
      throw err;
    }
  })().finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

/** Test helper. */
export function clearChapterCache() {
  memory.clear();
  inflight.clear();
}
