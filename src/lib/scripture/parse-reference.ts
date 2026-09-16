/**
 * Quick-search reference parser.
 *
 * Accepts, in Hebrew or English, with any of " " "," ":" "." as separators:
 *   "בראשית א א"  "בראשית א, א"  "בראשית א:א"  "בראשית 1:1"  "Genesis 1:1"  "gen 1 1"
 *   "בראשית א"    → chapter 1, verse 1
 *   "שמואל א ג ב" → I Samuel 3:2 (book names may contain spaces / a book number)
 *   "פרשת נח"  "נח"  "Noach"  → first verse of the parasha
 *   "פרק א פסוק ב" words are ignored; geresh/gershayim/quotes are ignored.
 *
 * Resolution order: explicit "פרשת …" → book (longest name match first) → parasha name/alias.
 * Ambiguity note: "שמואל א ב" means I Samuel chapter 2, not Samuel 1:2.
 */
import { fromHebrewNumeral, looksLikeHebrewNumeral } from "./hebrew-numerals";
import { BOOKS, PARASHOT, isValidRef, parashaStartRef, type Parasha, type VerseRef } from "./index";

export type ParsedReference =
  | { kind: "verse"; ref: VerseRef; book: string }
  | { kind: "parasha"; ref: VerseRef; parasha: Parasha };

export interface ParseFailure {
  kind: "error";
  /** Hebrew, user-facing. */
  message: string;
}

/** Extra spellings on top of the Sefaria titles. Keys are normalised (see normalize()). */
const BOOK_ALIASES: Record<string, string[]> = {
  Genesis: ["בראשית", "gen", "genesis", "bereshit", "bereishit"],
  Exodus: ["שמות", "exo", "ex", "exodus", "shemot"],
  Leviticus: ["ויקרא", "lev", "leviticus", "vayikra"],
  Numbers: ["במדבר", "num", "numbers", "bamidbar"],
  Deuteronomy: ["דברים", "deut", "deuteronomy", "devarim"],
  Joshua: ["יהושע", "josh", "joshua"],
  Judges: ["שופטים", "judg", "judges"],
  "I Samuel": ["שמואל א", "שמואל 1", "שמא", "1 samuel", "i samuel", "1sam", "1 sam", "samuel 1"],
  "II Samuel": ["שמואל ב", "שמואל 2", "שמב", "2 samuel", "ii samuel", "2sam", "2 sam", "samuel 2"],
  "I Kings": ["מלכים א", "מלכים 1", "מלא", "1 kings", "i kings", "1kgs", "1 kgs", "kings 1"],
  "II Kings": ["מלכים ב", "מלכים 2", "מלב", "2 kings", "ii kings", "2kgs", "2 kgs", "kings 2"],
  Isaiah: ["ישעיהו", "ישעיה", "isa", "isaiah"],
  Jeremiah: ["ירמיהו", "ירמיה", "jer", "jeremiah"],
  Ezekiel: ["יחזקאל", "ezek", "ezekiel"],
  Hosea: ["הושע", "hos", "hosea"],
  Joel: ["יואל", "joel"],
  Amos: ["עמוס", "amos"],
  Obadiah: ["עובדיה", "עבדיה", "obad", "obadiah"],
  Jonah: ["יונה", "jonah"],
  Micah: ["מיכה", "mic", "micah"],
  Nahum: ["נחום", "nah", "nahum"],
  Habakkuk: ["חבקוק", "hab", "habakkuk"],
  Zephaniah: ["צפניה", "zeph", "zephaniah"],
  Haggai: ["חגי", "hag", "haggai"],
  Zechariah: ["זכריה", "zech", "zechariah"],
  Malachi: ["מלאכי", "mal", "malachi"],
  Psalms: ["תהלים", "תהילים", "ps", "psalm", "psalms", "tehillim"],
  Proverbs: ["משלי", "prov", "proverbs", "mishlei"],
  Job: ["איוב", "job", "iyov"],
  "Song of Songs": ["שיר השירים", "שהש", "song", "song of songs", "shir hashirim", "canticles"],
  Ruth: ["רות", "ruth"],
  Lamentations: ["איכה", "lam", "lamentations", "eicha"],
  Ecclesiastes: ["קהלת", "eccl", "ecclesiastes", "kohelet"],
  Esther: ["אסתר", "est", "esther"],
  Daniel: ["דניאל", "dan", "daniel"],
  Ezra: ["עזרא", "ezra"],
  Nehemiah: ["נחמיה", "neh", "nehemiah"],
  "I Chronicles": ["דברי הימים א", "דברי הימים 1", "דהא", "1 chronicles", "i chronicles", "1chr", "1 chr", "chronicles 1"],
  "II Chronicles": ["דברי הימים ב", "דברי הימים 2", "דהב", "2 chronicles", "ii chronicles", "2chr", "2 chr", "chronicles 2"],
};

const NOISE_WORDS = new Set(["פרק", "פסוק", "פ", "chapter", "ch", "verse", "v", "ספר"]);

/** Lower-case, strip quotes/geresh/gershayim and nikkud, unify separators to single spaces. */
export function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[֑-ׇ]/g, "")
    .replace(/[׳״'"‘’“”`]/g, "")
    .replace(/[,:.\-–—/]+/g, " ")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

interface NameEntry {
  name: string; // normalised
  tokens: number;
}

function buildBookNames(): { entry: NameEntry; book: string }[] {
  const out: { entry: NameEntry; book: string }[] = [];
  for (const b of BOOKS) {
    const names = new Set([b.id, b.heTitle, ...(BOOK_ALIASES[b.id] ?? [])]);
    for (const n of names) {
      const name = normalize(n);
      out.push({ entry: { name, tokens: name.split(" ").length }, book: b.id });
    }
  }
  // longest names first so "שמואל א" beats "שמואל"-style prefixes
  return out.sort((a, b) => b.entry.tokens - a.entry.tokens || b.entry.name.length - a.entry.name.length);
}

function buildParashaNames(): { name: string; parasha: Parasha }[] {
  const out: { name: string; parasha: Parasha }[] = [];
  for (const p of PARASHOT) {
    for (const n of [p.heTitle, p.title, p.id.replace(/-/g, " "), ...p.aliases]) {
      out.push({ name: normalize(n).replace(/^(parashat|parshat|פרשת) /, ""), parasha: p });
    }
  }
  return out.sort((a, b) => b.name.length - a.name.length);
}

const BOOK_NAMES = buildBookNames();
const PARASHA_NAMES = buildParashaNames();

function parseNumber(token: string): number | null {
  if (/^\d+$/.test(token)) return Number(token);
  if (looksLikeHebrewNumeral(token)) return fromHebrewNumeral(token);
  return null;
}

function numbersFrom(tokens: string[]): number[] | null {
  const nums: number[] = [];
  for (const t of tokens) {
    if (NOISE_WORDS.has(t)) continue;
    const n = parseNumber(t);
    if (n === null) return null;
    nums.push(n);
  }
  return nums;
}

function matchParasha(text: string): Parasha | null {
  const bare = text.replace(/^(parashat|parshat|פרשת) /, "");
  return PARASHA_NAMES.find((p) => p.name === bare)?.parasha ?? null;
}

export function parseReference(input: string): ParsedReference | ParseFailure {
  const text = normalize(input);
  if (!text) return { kind: "error", message: "הקלד מראה מקום, למשל: בראשית א א" };

  // 1. explicit parasha
  if (/^(parashat|parshat|פרשת) /.test(text)) {
    const p = matchParasha(text);
    return p ? { kind: "parasha", ref: parashaStartRef(p), parasha: p } : { kind: "error", message: "פרשה לא מוכרת" };
  }

  // 2. book (longest name match at the start), then numbers
  for (const { entry, book } of BOOK_NAMES) {
    if (text !== entry.name && !text.startsWith(entry.name + " ")) continue;
    const rest = text.slice(entry.name.length).trim();
    const nums = numbersFrom(rest ? rest.split(" ") : []);
    if (nums === null) continue; // e.g. "שמות" matched but rest is not numeric — try shorter names
    if (nums.length > 2) return { kind: "error", message: "יותר מדי מספרים — צפוי: ספר פרק פסוק" };
    const ref: VerseRef = { book, chapter: nums[0] ?? 1, verse: nums[1] ?? 1 };
    if (!isValidRef(ref)) {
      return { kind: "error", message: nums.length === 1 ? "אין פרק כזה בספר" : "אין פסוק כזה בפרק" };
    }
    return { kind: "verse", ref, book };
  }

  // 3. bare parasha name
  const p = matchParasha(text);
  if (p) return { kind: "parasha", ref: parashaStartRef(p), parasha: p };

  return { kind: "error", message: "לא זוהה ספר או פרשה" };
}
