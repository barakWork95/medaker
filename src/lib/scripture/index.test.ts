import { describe, expect, it } from "vitest";
import {
  BOOKS,
  PARASHOT,
  chapterCount,
  formatRefHe,
  isValidRef,
  keyToRef,
  nextRef,
  parashaOf,
  parashotOf,
  prevRef,
  refToKey,
  verseCount,
} from "./index";

describe("scripture index (generated from Sefaria)", () => {
  it("has the 39 books of the Tanakh in canonical order with 929 chapters", () => {
    expect(BOOKS).toHaveLength(39);
    expect(BOOKS[0].id).toBe("Genesis");
    expect(BOOKS[0].heTitle).toBe("בראשית");
    expect(BOOKS[38].id).toBe("II Chronicles");
    expect(BOOKS.reduce((n, b) => n + b.chapters.length, 0)).toBe(929);
    expect(chapterCount("Psalms")).toBe(150);
    expect(verseCount("Genesis", 1)).toBe(31);
    expect(verseCount("Psalms", 119)).toBe(176);
  });

  it("has 54 parashot with correct starts", () => {
    expect(PARASHOT).toHaveLength(54);
    const noach = PARASHOT.find((p) => p.id === "noach")!;
    expect(noach.heTitle).toBe("נח");
    expect(noach.start).toEqual({ chapter: 6, verse: 9 });
    expect(noach.end).toEqual({ chapter: 11, verse: 32 });
    const vayelech = PARASHOT.find((p) => p.book === "Deuteronomy" && p.start.chapter === 31)!;
    expect(vayelech.end).toEqual({ chapter: 31, verse: 30 });
    expect(parashotOf("Genesis")).toHaveLength(12);
    expect(parashotOf("Psalms")).toHaveLength(0);
  });

  it("finds the parasha of a verse", () => {
    expect(parashaOf({ book: "Genesis", chapter: 6, verse: 8 })?.id).toBe("bereshit");
    expect(parashaOf({ book: "Genesis", chapter: 6, verse: 9 })?.id).toBe("noach");
    expect(parashaOf({ book: "Psalms", chapter: 1, verse: 1 })).toBeNull();
  });
});

describe("reference arithmetic", () => {
  it("validates refs", () => {
    expect(isValidRef({ book: "Genesis", chapter: 1, verse: 31 })).toBe(true);
    expect(isValidRef({ book: "Genesis", chapter: 1, verse: 32 })).toBe(false);
    expect(isValidRef({ book: "Genesis", chapter: 51, verse: 1 })).toBe(false);
    expect(isValidRef({ book: "Nope", chapter: 1, verse: 1 })).toBe(false);
  });

  it("steps across chapter and book boundaries", () => {
    expect(nextRef({ book: "Genesis", chapter: 1, verse: 31 })).toEqual({ book: "Genesis", chapter: 2, verse: 1 });
    expect(nextRef({ book: "Genesis", chapter: 50, verse: 26 })).toEqual({ book: "Exodus", chapter: 1, verse: 1 });
    expect(nextRef({ book: "II Chronicles", chapter: 36, verse: 23 })).toBeNull();
    expect(prevRef({ book: "Genesis", chapter: 2, verse: 1 })).toEqual({ book: "Genesis", chapter: 1, verse: 31 });
    expect(prevRef({ book: "Exodus", chapter: 1, verse: 1 })).toEqual({ book: "Genesis", chapter: 50, verse: 26 });
    expect(prevRef({ book: "Genesis", chapter: 1, verse: 1 })).toBeNull();
  });

  it("formats Hebrew references and URL keys", () => {
    expect(formatRefHe({ book: "Genesis", chapter: 1, verse: 1 })).toBe("בראשית א, א");
    expect(formatRefHe({ book: "I Samuel", chapter: 17, verse: 45 })).toBe("שמואל א י״ז, מ״ה");
    expect(formatRefHe({ book: "Psalms", chapter: 119, verse: 1 }, { chapterOnly: true })).toBe("תהילים קי״ט");
    expect(refToKey({ book: "I Samuel", chapter: 3, verse: 2 })).toBe("I_Samuel.3.2");
    expect(keyToRef("I_Samuel.3.2")).toEqual({ book: "I Samuel", chapter: 3, verse: 2 });
    expect(keyToRef("Genesis.99.1")).toBeNull();
    expect(keyToRef("garbage")).toBeNull();
  });
});
