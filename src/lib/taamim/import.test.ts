import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseTaamimRows, parseTaamimWorkbook } from "../../../scripts/import-taamim.mjs";
import generated from "./taamim.generated.json";

describe("scripts/import-taamim.mjs", () => {
  it("parses data/taamim-mapping.xlsx and the committed JSON is up to date", () => {
    const marks = parseTaamimWorkbook(readFileSync("data/taamim-mapping.xlsx"));
    expect(marks).toHaveLength(36); // 35 single marks + the compound תרין פשטין
    expect(marks.reduce((n: number, m: { rules: unknown[] }) => n + m.rules.length, 0)).toBe(18);
    expect(generated.marks).toEqual(marks); // run `npm run import:taamim` if this fails
  });

  it("merges continuation rows (empty name/Unicode) into the previous mark's rule chain", () => {
    const rows = [
      { A: "name", B: "Unicode", C: "example", D: "defaultGesture", E: "contextRule", F: "expectedGesture" },
      { A: "גרש", B: "059C", C: "ב֜", D: "long-press", E: "במקרה שהוא הטעם האחרון מסוג (triple-tap / long-press) עד לסוף הפסוק (׃)", F: "swipe-down" },
      { E: "במקרה שהטעם מסוג triple-tap / long-press הבא אחריו הוא רביע (597) ואין ביניהם פסק (05C0)", F: "diagonal" },
      { A: "סוף פסוק", B: 5, C: "ב׃", D: "swipe-down", E: "none", F: "none" },
      { A: "אתנחתא", B: 591, C: "ב֑", D: "triple-tap", E: "none", F: "none" },
    ];
    const marks = parseTaamimRows(rows);
    expect(marks.map((m: { hex: string }) => m.hex)).toEqual(["059C", "0005", "0591"]);
    expect(marks[0].rules.map((r: { id: string; expectedGesture: string }) => [r.id, r.expectedGesture])).toEqual([
      ["LAST_MAJOR_BEFORE_SOF_PASUK", "SWIPE_DOWN"],
      ["NEXT_MAJOR_IS_REVIA_WITHOUT_PASEK", "DIAGONAL"],
    ]);
    expect(marks[1].defaultGesture).toBe("SWIPE_DOWN");
    expect(marks[1].rules).toEqual([]);
  });

  it("parses compound Unicode cells and still accepts the previous sheet's rule wording", () => {
    const header = { A: "name", B: "Unicode", C: "example", D: "defaultGesture", E: "contextRule", F: "expectedGesture" };
    const marks = parseTaamimRows([
      header,
      { A: "תרין פשטין", B: "05A8 + 0599", D: "diagonal", E: "none", F: "none" },
      { A: "קדמא", B: "05A8", D: "diagonal", E: "none", F: "none" },
      { A: "אתנחתא", B: 591, D: "triple-tap", E: "במקרה שהוא הטעם האחרון מסוג (triple-tap / long-press) עד לסוף הפסוק (swipe-down)", F: "swipe-down" },
    ]);
    expect(marks[0]).toMatchObject({ hex: "05A8+0599", codePoints: [0x05a8, 0x0599], codePoint: 0x05a8, defaultGesture: "DIAGONAL" });
    expect(marks[1]).toMatchObject({ hex: "05A8", codePoints: [0x05a8] });
    expect(marks[2].rules[0].id).toBe("LAST_MAJOR_BEFORE_SOF_PASUK");
    expect(() => parseTaamimRows([header, { A: "x", B: "05A8 + ZZ", D: "none", E: "none", F: "none" }])).toThrow(/bad Unicode/);
  });

  it("rejects unregistered rule text and unknown gesture labels", () => {
    const header = { A: "name", B: "Unicode", C: "example", D: "defaultGesture", E: "contextRule", F: "expectedGesture" };
    expect(() =>
      parseTaamimRows([header, { A: "x", B: "0591", D: "triple-tap", E: "כלל חדש שלא נרשם", F: "diagonal" }]),
    ).toThrow(/unregistered contextRule/);
    expect(() => parseTaamimRows([header, { A: "x", B: "0591", D: "wiggle", E: "none", F: "none" }])).toThrow(
      /unknown gesture label/,
    );
    // "double swipe-down" left the vocabulary with the 2026-09-18 sheet
    expect(() => parseTaamimRows([header, { A: "x", B: "0591", D: "double swipe-down", E: "none", F: "none" }])).toThrow(
      /unknown gesture label/,
    );
    expect(() => parseTaamimRows([header, { E: "none", F: "none" }])).toThrow(/continuation row/);
  });
});
