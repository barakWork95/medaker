import { describe, expect, it } from "vitest";
import { parseReference } from "./parse-reference";

const verse = (book: string, chapter: number, verse: number) => ({ kind: "verse", ref: { book, chapter, verse }, book });

describe("parseReference — verses", () => {
  it("parses Hebrew numerals with every separator", () => {
    expect(parseReference("בראשית א א")).toMatchObject(verse("Genesis", 1, 1));
    expect(parseReference("בראשית א, א")).toMatchObject(verse("Genesis", 1, 1));
    expect(parseReference("בראשית א:א")).toMatchObject(verse("Genesis", 1, 1));
    expect(parseReference("בראשית א.ב")).toMatchObject(verse("Genesis", 1, 2));
    expect(parseReference("בראשית י״ט, ט״ז")).toMatchObject(verse("Genesis", 19, 16));
    expect(parseReference("תהלים קיט קעו")).toMatchObject(verse("Psalms", 119, 176));
  });

  it("parses digits and English names", () => {
    expect(parseReference("בראשית 1:1")).toMatchObject(verse("Genesis", 1, 1));
    expect(parseReference("Genesis 1:1")).toMatchObject(verse("Genesis", 1, 1));
    expect(parseReference("gen 2 3")).toMatchObject(verse("Genesis", 2, 3));
    expect(parseReference("  Exodus  20:2 ")).toMatchObject(verse("Exodus", 20, 2));
  });

  it("defaults a missing verse or chapter to 1", () => {
    expect(parseReference("שמות כ")).toMatchObject(verse("Exodus", 20, 1));
    expect(parseReference("ויקרא")).toMatchObject(verse("Leviticus", 1, 1));
  });

  it("handles multi-word and numbered book names", () => {
    expect(parseReference("שמואל א ג ב")).toMatchObject(verse("I Samuel", 3, 2));
    expect(parseReference("שמואל ב א א")).toMatchObject(verse("II Samuel", 1, 1));
    expect(parseReference("שמואל א ב")).toMatchObject(verse("I Samuel", 2, 1)); // documented ambiguity
    expect(parseReference("מלכים ב ד ז")).toMatchObject(verse("II Kings", 4, 7));
    expect(parseReference("שיר השירים ב ד")).toMatchObject(verse("Song of Songs", 2, 4));
    expect(parseReference("דברי הימים ב לו כג")).toMatchObject(verse("II Chronicles", 36, 23));
    expect(parseReference("1 Samuel 3:2")).toMatchObject(verse("I Samuel", 3, 2));
  });

  it("ignores פרק/פסוק words and quotes", () => {
    expect(parseReference("בראשית פרק א פסוק ב")).toMatchObject(verse("Genesis", 1, 2));
    expect(parseReference("ישעיה פרק מ״א")).toMatchObject(verse("Isaiah", 41, 1));
  });
});

describe("parseReference — parashot", () => {
  it("resolves explicit and bare parasha names to their first verse", () => {
    expect(parseReference("פרשת נח")).toMatchObject({ kind: "parasha", ref: { book: "Genesis", chapter: 6, verse: 9 } });
    expect(parseReference("נח")).toMatchObject({ kind: "parasha", ref: { book: "Genesis", chapter: 6, verse: 9 } });
    expect(parseReference("לך לך")).toMatchObject({ kind: "parasha", ref: { book: "Genesis", chapter: 12, verse: 1 } });
    expect(parseReference("Noach")).toMatchObject({ kind: "parasha" });
    expect(parseReference("parashat vayera")).toMatchObject({ kind: "parasha", ref: { book: "Genesis", chapter: 18, verse: 1 } });
    expect(parseReference("פרשת וזאת הברכה")).toMatchObject({ kind: "parasha", ref: { book: "Deuteronomy", chapter: 33, verse: 1 } });
  });

  it("prefers the book when a name is both a book and a parasha", () => {
    expect(parseReference("בראשית")).toMatchObject(verse("Genesis", 1, 1));
    expect(parseReference("דברים ג")).toMatchObject(verse("Deuteronomy", 3, 1));
  });
});

describe("parseReference — errors", () => {
  it("reports unknown names and out-of-range numbers in Hebrew", () => {
    expect(parseReference("")).toMatchObject({ kind: "error" });
    expect(parseReference("ספר הזוהר א א")).toMatchObject({ kind: "error", message: "לא זוהה ספר או פרשה" });
    expect(parseReference("פרשת אבגד")).toMatchObject({ kind: "error", message: "פרשה לא מוכרת" });
    expect(parseReference("בראשית נא")).toMatchObject({ kind: "error", message: "אין פרק כזה בספר" });
    expect(parseReference("בראשית א לב")).toMatchObject({ kind: "error", message: "אין פסוק כזה בפרק" });
    expect(parseReference("בראשית א ב ג")).toMatchObject({ kind: "error" });
  });
});
