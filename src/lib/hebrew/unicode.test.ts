import { describe, expect, it } from "vitest";
import { extractCantillation, stripCantillation, stripPoints, toStamDisplay } from "./unicode";
import { tokenizeVerse } from "@/lib/taamim/tokenize";

const GEN_1_1 = "בְּרֵאשִׁ֖ית בָּרָ֣א אֱלֹהִ֑ים אֵ֥ת הַשָּׁמַ֖יִם וְאֵ֥ת הָאָֽרֶץ׃";

describe("unicode utils", () => {
  it("strips everything for the STAM layer", () => {
    expect(toStamDisplay(GEN_1_1)).toBe("בראשית ברא אלהים את השמים ואת הארץ");
  });

  it("renders maqaf as a space and drops paseq/sof pasuq", () => {
    expect(toStamDisplay("עַל־פְּנֵ֣י תְה֑וֹם׃")).toBe("על פני תהום");
    expect(toStamDisplay("וַיֹּ֣אמֶר ׀ ה")).toBe("ויאמר ה");
  });

  it("removes only cantillation when asked", () => {
    expect(stripCantillation("בְּרֵאשִׁ֖ית")).toBe("בְּרֵאשִׁית");
    expect(stripPoints("בְּרֵאשִׁ֖ית")).toBe("בראש֖ית");
  });

  it("extracts cantillation code points", () => {
    expect(extractCantillation("הָאָֽרֶץ׃")).toEqual([]); // meteg is a point, sof pasuq is punctuation
    expect(extractCantillation("אֱלֹהִ֑ים")).toEqual([0x0591]);
    expect(extractCantillation("הַמַּ֙יִם֙")).toEqual([0x0599]); // doubled pashta deduplicated
  });
});

describe("tokenizeVerse", () => {
  const tokens = tokenizeVerse(GEN_1_1);

  it("maps every word to its required gesture", () => {
    expect(tokens.map((t) => t.requiredGesture)).toEqual([
      "DIAGONAL", // בראשית — tipeha
      "NONE", // ברא — munah
      "SWIPE_DOWN", // אלהים — etnahta, last major mark before sof pasuq (context rule)
      "NONE", // את — merkha
      "DIAGONAL", // השמים — tipeha
      "NONE", // ואת — merkha
      "LONG_PRESS", // הארץ׃ — sof pasuq (meteg is NONE, sof pasuq wins by rank)
    ]);
  });

  it("attaches standalone paseq and sof pasuq to the previous word", () => {
    const t = tokenizeVerse("וַֽיִּתְמַהְמָ֓הּ ׀ וַיַּחֲזִ֨קוּ ׃");
    expect(t).toHaveLength(2);
    expect(t[0].marks.map((m) => m.id)).toEqual(["meteg", "shalshelet", "paseq"]);
    expect(t[0].requiredGesture).toBe("ZIGZAG"); // shalshelet (rank 1) beats paseq (rank 4)
    expect(t[1].marks.map((m) => m.id)).toEqual(["qadma", "sof-pasuq"]);
    expect(t[1].requiredGesture).toBe("LONG_PRESS"); // sof pasuq (rank 0) governs over qadma
  });

  it("keeps maqaf groups as a single token", () => {
    const t = tokenizeVerse("עַל־פְּנֵ֣י תְה֑וֹם");
    expect(t.map((x) => x.display)).toEqual(["על פני", "תהום"]);
    expect(t[0].requiredGesture).toBe("NONE");
  });
});
