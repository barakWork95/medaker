import { describe, expect, it } from "vitest";
import { fromHebrewNumeral, toHebrewNumeral } from "./hebrew-numerals";

describe("toHebrewNumeral", () => {
  it("formats with gershayim and the 15/16 exceptions", () => {
    expect(toHebrewNumeral(1)).toBe("א");
    expect(toHebrewNumeral(10)).toBe("י");
    expect(toHebrewNumeral(11)).toBe("י״א");
    expect(toHebrewNumeral(15)).toBe("ט״ו");
    expect(toHebrewNumeral(16)).toBe("ט״ז");
    expect(toHebrewNumeral(17)).toBe("י״ז");
    expect(toHebrewNumeral(20)).toBe("כ");
    expect(toHebrewNumeral(50)).toBe("נ");
    expect(toHebrewNumeral(115)).toBe("קט״ו");
    expect(toHebrewNumeral(119)).toBe("קי״ט");
    expect(toHebrewNumeral(150)).toBe("ק״נ");
    expect(toHebrewNumeral(176)).toBe("קע״ו");
    expect(toHebrewNumeral(11, { marks: false })).toBe("יא");
  });

  it("rejects out-of-range input", () => {
    expect(() => toHebrewNumeral(0)).toThrow(RangeError);
    expect(() => toHebrewNumeral(1000)).toThrow(RangeError);
  });
});

describe("fromHebrewNumeral", () => {
  it("parses with or without marks", () => {
    expect(fromHebrewNumeral("א")).toBe(1);
    expect(fromHebrewNumeral("י״א")).toBe(11);
    expect(fromHebrewNumeral("יא")).toBe(11);
    expect(fromHebrewNumeral('י"א')).toBe(11);
    expect(fromHebrewNumeral("טו")).toBe(15);
    expect(fromHebrewNumeral("ט״ז")).toBe(16);
    expect(fromHebrewNumeral("קי״ט")).toBe(119);
    expect(fromHebrewNumeral("קע״ו")).toBe(176);
  });

  it("rejects non-numerals and ascending sequences", () => {
    expect(fromHebrewNumeral("")).toBeNull();
    expect(fromHebrewNumeral("abc")).toBeNull();
    expect(fromHebrewNumeral("אי")).toBeNull(); // 1 before 10 is not a numeral
  });

  it("round-trips 1..176", () => {
    for (let n = 1; n <= 176; n++) expect(fromHebrewNumeral(toHebrewNumeral(n))).toBe(n);
  });
});
