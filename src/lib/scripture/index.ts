/**
 * Tanakh structure + reference arithmetic.
 *
 * Data comes from `index.generated.json` (built by scripts/build-scripture-index.mjs from
 * Sefaria): every book's Hebrew title and verses-per-chapter, and every parasha's range.
 * A `VerseRef` is { book (Sefaria English id), chapter, verse } — 1-based.
 */
import generated from "./index.generated.json";
import { toHebrewNumeral } from "./hebrew-numerals";

export type Section = "torah" | "neviim" | "ketuvim";

export interface Book {
  /** Sefaria title, e.g. "Genesis", "I Samuel". Used in API calls and URLs. */
  id: string;
  heTitle: string;
  section: Section;
  /** Verse count per chapter (index 0 = chapter 1). */
  chapters: number[];
}

export interface Parasha {
  id: string; // slug, e.g. "lech-lecha"
  title: string;
  heTitle: string;
  book: string;
  start: { chapter: number; verse: number };
  end: { chapter: number; verse: number };
  aliases: string[];
}

export interface VerseRef {
  book: string;
  chapter: number;
  verse: number;
}

export const BOOKS: readonly Book[] = generated.books as Book[];
export const PARASHOT: readonly Parasha[] = generated.parashot as Parasha[];
export const BOOKS_BY_ID: ReadonlyMap<string, Book> = new Map(BOOKS.map((b) => [b.id, b]));
export const PARASHOT_BY_ID: ReadonlyMap<string, Parasha> = new Map(PARASHOT.map((p) => [p.id, p]));

export const SECTION_LABELS_HE: Record<Section, string> = { torah: "תורה", neviim: "נביאים", ketuvim: "כתובים" };

export const DEFAULT_REF: VerseRef = { book: "Genesis", chapter: 1, verse: 1 };

export function getBook(id: string): Book {
  const b = BOOKS_BY_ID.get(id);
  if (!b) throw new RangeError(`unknown book "${id}"`);
  return b;
}

export function chapterCount(book: string): number {
  return getBook(book).chapters.length;
}

export function verseCount(book: string, chapter: number): number {
  const b = getBook(book);
  const n = b.chapters[chapter - 1];
  if (n === undefined) throw new RangeError(`${book} has no chapter ${chapter}`);
  return n;
}

export function isValidRef(ref: VerseRef): boolean {
  const b = BOOKS_BY_ID.get(ref.book);
  if (!b) return false;
  const n = b.chapters[ref.chapter - 1];
  return n !== undefined && Number.isInteger(ref.verse) && ref.verse >= 1 && ref.verse <= n;
}

export function sameRef(a: VerseRef, b: VerseRef): boolean {
  return a.book === b.book && a.chapter === b.chapter && a.verse === b.verse;
}

/** Next verse, crossing chapter and book boundaries; null after the last verse of II Chronicles. */
export function nextRef(ref: VerseRef): VerseRef | null {
  const b = getBook(ref.book);
  if (ref.verse < b.chapters[ref.chapter - 1]) return { ...ref, verse: ref.verse + 1 };
  if (ref.chapter < b.chapters.length) return { book: ref.book, chapter: ref.chapter + 1, verse: 1 };
  const i = BOOKS.findIndex((x) => x.id === ref.book);
  const nb = BOOKS[i + 1];
  return nb ? { book: nb.id, chapter: 1, verse: 1 } : null;
}

/** Previous verse, crossing chapter and book boundaries; null before Genesis 1:1. */
export function prevRef(ref: VerseRef): VerseRef | null {
  if (ref.verse > 1) return { ...ref, verse: ref.verse - 1 };
  if (ref.chapter > 1) {
    const ch = ref.chapter - 1;
    return { book: ref.book, chapter: ch, verse: verseCount(ref.book, ch) };
  }
  const i = BOOKS.findIndex((x) => x.id === ref.book);
  const pb = BOOKS[i - 1];
  if (!pb) return null;
  const ch = pb.chapters.length;
  return { book: pb.id, chapter: ch, verse: pb.chapters[ch - 1] };
}

/** Parashot of a book (Torah only), in order. */
export function parashotOf(book: string): Parasha[] {
  return PARASHOT.filter((p) => p.book === book);
}

/** The parasha containing a verse, if the book has parashot. */
export function parashaOf(ref: VerseRef): Parasha | null {
  const pos = ref.chapter * 1000 + ref.verse;
  return (
    PARASHOT.find(
      (p) => p.book === ref.book && pos >= p.start.chapter * 1000 + p.start.verse && pos <= p.end.chapter * 1000 + p.end.verse,
    ) ?? null
  );
}

export function parashaStartRef(parasha: Parasha): VerseRef {
  return { book: parasha.book, chapter: parasha.start.chapter, verse: parasha.start.verse };
}

/** "בראשית א, א" */
export function formatRefHe(ref: VerseRef, { chapterOnly = false } = {}): string {
  const b = getBook(ref.book);
  const ch = toHebrewNumeral(ref.chapter);
  return chapterOnly ? `${b.heTitle} ${ch}` : `${b.heTitle} ${ch}, ${toHebrewNumeral(ref.verse)}`;
}

/** Sefaria-style key, URL-safe: "Genesis.1.1", "I_Samuel.3.2". */
export function refToKey(ref: VerseRef): string {
  return `${ref.book.replace(/ /g, "_")}.${ref.chapter}.${ref.verse}`;
}

export function keyToRef(key: string): VerseRef | null {
  const m = /^([A-Za-z_ ]+)\.(\d+)\.(\d+)$/.exec(key.trim());
  if (!m) return null;
  const ref = { book: m[1].replace(/_/g, " "), chapter: Number(m[2]), verse: Number(m[3]) };
  return isValidRef(ref) ? ref : null;
}

/** Sefaria API reference for a whole chapter: "Genesis 1", "I Samuel 3". */
export function chapterApiRef(book: string, chapter: number): string {
  return `${book} ${chapter}`;
}
