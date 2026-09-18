import { describe, expect, it } from "vitest";
import { TAAMIM_BY_ID } from "./config";
import { CONTEXT_RULES, isMajorMark, markSequence, resolveGesture } from "./rules";
import { tokenizeVerse } from "./tokenize";
import { validateGesture, validateGestureInContext } from "./validate";

const GEN_1_1 = "בְּרֵאשִׁ֖ית בָּרָ֣א אֱלֹהִ֑ים אֵ֥ת הַשָּׁמַ֖יִם וְאֵ֥ת הָאָֽרֶץ׃";
const GEN_1_2 =
  "וְהָאָ֗רֶץ הָיְתָ֥ה תֹ֙הוּ֙ וָבֹ֔הוּ וְחֹ֖שֶׁךְ עַל־פְּנֵ֣י תְה֑וֹם וְר֣וּחַ אֱלֹהִ֔ים מְרַחֶ֖פֶת עַל־פְּנֵ֥י הַמָּֽיִם׃";
const GEN_19_16 =
  "וַֽיִּתְמַהְמָ֓הּ ׀ וַיַּחֲזִ֨קוּ הָאֲנָשִׁ֜ים בְּיָד֣וֹ וּבְיַד־אִשְׁתּ֗וֹ וּבְיַד֙ שְׁתֵּ֣י בְנֹתָ֔יו בְּחֶמְלַ֥ת יְהוָ֖ה עָלָ֑יו וַיֹּצִאֻ֥הוּ וַיַּנִּחֻ֖הוּ מִח֥וּץ לָעִֽיר׃";

const byDisplay = (verse: string, display: string) => {
  const tokens = tokenizeVerse(verse);
  const token = tokens.find((t) => t.display === display);
  if (!token) throw new Error(`no token "${display}"`);
  return { tokens, token };
};

describe("mapping table (from taamim.generated.json)", () => {
  it("carries the rule chains from the sheet, in sheet order", () => {
    const geresh = TAAMIM_BY_ID.get("geresh")!;
    expect(geresh.defaultGesture).toBe("LONG_PRESS");
    expect(geresh.rules.map((r) => [r.id, r.expectedGesture])).toEqual([
      ["LAST_MAJOR_BEFORE_SOF_PASUK", "SWIPE_DOWN"],
      ["NEXT_MAJOR_IS_REVIA_WITHOUT_PASEK", "DIAGONAL"],
    ]);
    for (const id of ["geresh-muqdam", "gershayim", "qarney-para", "telisha-gedola"]) {
      expect(TAAMIM_BY_ID.get(id)!.rules.map((r) => r.id)).toEqual([
        "LAST_MAJOR_BEFORE_SOF_PASUK",
        "NEXT_MAJOR_IS_REVIA_WITHOUT_PASEK",
      ]);
    }
    expect(TAAMIM_BY_ID.get("etnahta")!.rules.map((r) => r.id)).toEqual(["LAST_MAJOR_BEFORE_SOF_PASUK"]);
    expect(TAAMIM_BY_ID.get("revia")!.rules).toEqual([]); // the sheet gives revia no rule
    expect(TAAMIM_BY_ID.get("sof-pasuq")!.defaultGesture).toBe("LONG_PRESS");
    expect(TAAMIM_BY_ID.get("tipeha")!.defaultGesture).toBe("DIAGONAL");
    // 2026-09-18 sheet: pashta and qadma now carry a diagonal; tarin pashtin is a compound row
    expect(TAAMIM_BY_ID.get("pashta")!.defaultGesture).toBe("DIAGONAL");
    expect(TAAMIM_BY_ID.get("qadma")!.defaultGesture).toBe("DIAGONAL");
    const tarin = TAAMIM_BY_ID.get("tarin-pashtin")!;
    expect(tarin.compound).toBe(true);
    expect(tarin.codePoints).toEqual([0x05a8, 0x0599]);
    expect(tarin.defaultGesture).toBe("DIAGONAL");
    expect(TAAMIM_BY_ID.get("munah")!.defaultGesture).toBe("NONE");
  });

  it("every rule id in the table has an evaluator", () => {
    for (const def of TAAMIM_BY_ID.values()) {
      for (const rule of def.rules) expect(CONTEXT_RULES[rule.id]).toBeDefined();
    }
  });

  it("defines 'major' as a triple-tap / long-press default", () => {
    expect(isMajorMark(TAAMIM_BY_ID.get("etnahta")!)).toBe(true);
    expect(isMajorMark(TAAMIM_BY_ID.get("revia")!)).toBe(true);
    expect(isMajorMark(TAAMIM_BY_ID.get("tipeha")!)).toBe(false); // diagonal
    // sof pasuq is long-press by default but it is the verse terminator, never a "major accent"
    expect(isMajorMark(TAAMIM_BY_ID.get("sof-pasuq")!)).toBe(false);
    expect(isMajorMark(TAAMIM_BY_ID.get("qadma")!)).toBe(false); // diagonal
    expect(isMajorMark(TAAMIM_BY_ID.get("munah")!)).toBe(false);
  });
});

describe("standard (no-override) evaluation", () => {
  it("uses the default gesture when no rule fires", () => {
    const { token } = byDisplay(GEN_1_1, "בראשית"); // tipeha — no rules
    expect(token.requiredGesture).toBe("DIAGONAL");
    expect(token.appliedRule).toBeNull();
    const revia = byDisplay(GEN_1_2, "והארץ").token; // revia — has no rules
    expect(revia.requiredGesture).toBe("LONG_PRESS");
    expect(revia.appliedRule).toBeNull();
  });

  it("keeps a major mark on its default when another major mark follows", () => {
    const { tokens } = byDisplay(GEN_1_2, "תהום");
    const etnahta = tokens.find((t) => t.display === "תהום")!; // followed by zaqef on אלהים
    expect(etnahta.requiredGesture).toBe("TRIPLE_TAP");
    expect(etnahta.appliedRule).toBeNull();
    const zaqef1 = tokens.find((t) => t.display === "ובהו")!;
    expect(zaqef1.requiredGesture).toBe("LONG_PRESS");
  });

  it("sof pasuq requires a long press; conjunctives without a gesture require nothing", () => {
    expect(byDisplay(GEN_1_1, "הארץ").token.requiredGesture).toBe("LONG_PRESS");
    expect(byDisplay(GEN_1_1, "הארץ").token.appliedRule).toBeNull();
    expect(byDisplay(GEN_1_1, "ברא").token.requiredGesture).toBe("NONE"); // munah
  });

  it("qadma and pashta require a diagonal", () => {
    expect(byDisplay(GEN_19_16, "ויחזקו").token.primaryMark?.id).toBe("qadma");
    expect(byDisplay(GEN_19_16, "ויחזקו").token.requiredGesture).toBe("DIAGONAL");
    expect(byDisplay(GEN_19_16, "וביד").token.primaryMark?.id).toBe("pashta");
    expect(byDisplay(GEN_19_16, "וביד").token.requiredGesture).toBe("DIAGONAL");
  });

  it("recognises tarin pashtin in both encodings as ONE compound mark", () => {
    const wlc = byDisplay(GEN_1_2, "תהו").token; // תֹ֙הוּ֙ — U+0599 twice (WLC)
    expect(wlc.marks.map((m) => m.id)).toEqual(["tarin-pashtin"]);
    expect(wlc.requiredGesture).toBe("DIAGONAL");
    const sheet = tokenizeVerse("תֹ֨הוּ֙")[0]; // U+05A8 + U+0599 (sheet encoding)
    expect(sheet.marks.map((m) => m.id)).toEqual(["tarin-pashtin"]);
    expect(sheet.requiredGesture).toBe("DIAGONAL");
    // a lone qadma or lone pashta stays itself
    expect(tokenizeVerse("אָ֨")[0].marks.map((m) => m.id)).toEqual(["qadma"]);
    expect(tokenizeVerse("אָ֙")[0].marks.map((m) => m.id)).toEqual(["pashta"]);
  });

  it("a disjunctive on the same word outranks qadma", () => {
    const token = tokenizeVerse("אָ֨בְּ֜ גֽ׃")[0]; // qadma + geresh on one word
    expect(token.marks.map((m) => m.id)).toEqual(["qadma", "geresh"]);
    expect(token.primaryMark?.id).toBe("geresh");
  });
});

describe("LAST_MAJOR_BEFORE_SOF_PASUK", () => {
  it("overrides the last major mark of the verse with a swipe-down", () => {
    const { token } = byDisplay(GEN_1_1, "אלהים"); // etnahta; only tipeha (diagonal) follows
    expect(token.requiredGesture).toBe("SWIPE_DOWN");
    expect(token.appliedRule).toBe("LAST_MAJOR_BEFORE_SOF_PASUK");

    const zaqef = byDisplay(GEN_1_2, "אלהים").token; // zaqef qatan on the second אלהים
    expect(zaqef.requiredGesture).toBe("SWIPE_DOWN");

    const etnahta = byDisplay(GEN_19_16, "עליו").token; // only tipeha + conjunctives follow
    expect(etnahta.requiredGesture).toBe("SWIPE_DOWN");
  });

  it("still fires although sof pasuq itself is a long-press mark (terminator, not an accent)", () => {
    const tokens = tokenizeVerse(GEN_1_1);
    const last = tokens[tokens.length - 1];
    expect(last.primaryMark?.id).toBe("sof-pasuq");
    expect(last.primaryMark?.defaultGesture).toBe("LONG_PRESS");
    expect(tokens.find((t) => t.display === "אלהים")!.requiredGesture).toBe("SWIPE_DOWN");
  });

  it("does not fire without a sof pasuq later in the verse", () => {
    const tokens = tokenizeVerse("אָ֜ בְּ֖");
    expect(tokens[0].requiredGesture).toBe("LONG_PRESS");
    expect(tokens[0].appliedRule).toBeNull();
  });

  it("only applies to marks the sheet gives the rule to (revia has none)", () => {
    const tokens = tokenizeVerse("אָ֗ בְּ֖ גֽ׃"); // revia is the last major mark
    expect(tokens[0].requiredGesture).toBe("LONG_PRESS");
    expect(tokens[0].appliedRule).toBeNull();
  });
});

describe("NEXT_MAJOR_IS_REVIA_WITHOUT_PASEK", () => {
  it("turns geresh before revia into a diagonal (Gen 19:16 האנשים)", () => {
    const { token } = byDisplay(GEN_19_16, "האנשים"); // geresh … munah … revia
    expect(token.primaryMark?.id).toBe("geresh");
    expect(token.requiredGesture).toBe("DIAGONAL");
    expect(token.appliedRule).toBe("NEXT_MAJOR_IS_REVIA_WITHOUT_PASEK");
  });

  it("ignores diagonal marks (qadma, pashta) between geresh and revia", () => {
    const tokens = tokenizeVerse("אָ֜ בְּ֨ גּ֙ דָּ֗ הֽ׃");
    expect(tokens[0].requiredGesture).toBe("DIAGONAL");
    expect(tokens[0].appliedRule).toBe("NEXT_MAJOR_IS_REVIA_WITHOUT_PASEK");
  });

  it("is blocked by a paseq between geresh and revia", () => {
    const tokens = tokenizeVerse("אָ֜ ׀ בְּ֗ גֽ׃");
    expect(tokens[0].marks.map((m) => m.id)).toEqual(["geresh", "paseq"]);
    expect(tokens[0].requiredGesture).toBe("LONG_PRESS");
    expect(tokens[0].appliedRule).toBeNull();
  });

  it("is not blocked by a paseq that comes after the revia", () => {
    const tokens = tokenizeVerse("אָ֜ בְּ֗ ׀ גֽ׃");
    expect(tokens[0].requiredGesture).toBe("DIAGONAL");
  });

  it("does not fire when the next major mark is not revia", () => {
    const tokens = tokenizeVerse("אָ֜ בְּ֔ גֽ׃"); // geresh then zaqef qatan
    expect(tokens[0].requiredGesture).toBe("LONG_PRESS");
    expect(tokens[0].appliedRule).toBeNull();
  });

  it("evaluates the chain in sheet order: last-major wins when both could apply", () => {
    // geresh with nothing major after it → LAST_MAJOR (rule 1); revia rule cannot fire anyway
    const tokens = tokenizeVerse("אָ֜ בְּ֖ גֽ׃");
    expect(tokens[0].requiredGesture).toBe("SWIPE_DOWN");
    expect(tokens[0].appliedRule).toBe("LAST_MAJOR_BEFORE_SOF_PASUK");
  });
});

describe("resolveGesture / validation in verse context", () => {
  it("resolveGesture agrees with the tokenizer's precomputed values", () => {
    const tokens = tokenizeVerse(GEN_19_16);
    for (const t of tokens) {
      const r = resolveGesture(tokens, t.index);
      expect(r.gesture).toBe(t.requiredGesture);
      expect(r.rule).toBe(t.appliedRule);
    }
  });

  it("markSequence flattens marks in reading order", () => {
    const seq = markSequence(tokenizeVerse("אָ֜ ׀ בְּ֗"));
    expect(seq.map((p) => [p.tokenIndex, p.mark.id])).toEqual([
      [0, "geresh"],
      [0, "paseq"],
      [1, "revia"],
    ]);
  });

  it("validateGestureInContext accepts the override and rejects the default", () => {
    const tokens = tokenizeVerse(GEN_1_1);
    const i = tokens.findIndex((t) => t.display === "אלהים");
    const ok = validateGestureInContext(tokens, i, "SWIPE_DOWN");
    expect(ok.correct).toBe(true);
    expect(ok.rule).toBe("LAST_MAJOR_BEFORE_SOF_PASUK");
    expect(ok.message).toContain(CONTEXT_RULES.LAST_MAJOR_BEFORE_SOF_PASUK.labelHe);
    const bad = validateGestureInContext(tokens, i, "TRIPLE_TAP");
    expect(bad.correct).toBe(false);
    expect(bad.expected).toBe("SWIPE_DOWN");
    expect(validateGesture(tokens[i], "SWIPE_DOWN")).toEqual(ok);
  });

  it("the same word validates differently in a different verse context", () => {
    // geresh word in isolation (no sof pasuq) vs. before revia vs. last before sof pasuq
    const alone = tokenizeVerse("אָ֜ בְּ֖");
    const beforeRevia = tokenizeVerse("אָ֜ בְּ֗ גֽ׃");
    const last = tokenizeVerse("אָ֜ בְּ֖ גֽ׃");
    expect(validateGestureInContext(alone, 0, "LONG_PRESS").correct).toBe(true);
    expect(validateGestureInContext(beforeRevia, 0, "LONG_PRESS").correct).toBe(false);
    expect(validateGestureInContext(beforeRevia, 0, "DIAGONAL").correct).toBe(true);
    expect(validateGestureInContext(last, 0, "SWIPE_DOWN").correct).toBe(true);
  });
});
