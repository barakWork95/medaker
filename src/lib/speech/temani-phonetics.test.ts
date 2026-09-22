import { describe, expect, it } from "vitest";
import { transcribeTemani, transcribeToken } from "./temani-phonetics";

const ipa = (w: string) => transcribeTemani(w).ipa;
const roman = (w: string) => transcribeTemani(w).roman;
const nuclei = (w: string) => transcribeTemani(w).syllables.map((s) => s.vowel.ipa);

describe("Temani consonants", () => {
  it("ו is w, ק is g, ג with dagesh is ǧ and soft ג is ġ", () => {
    expect(ipa("וַיֹּ֥אמֶר")).toBe("wa.jjø.mar");
    expect(roman("וַיֹּ֥אמֶר")).toBe("waˈyyömar");
    expect(ipa("קָד֑וֹשׁ")).toBe("gɔ.ðøʃ");
    expect(ipa("גָּד֑וֹל")).toBe("dʒɔ.ðøl");
    expect(ipa("הַגָּמָ֑ל")).toBe("ha.ddʒɔ.mɔl"); // dagesh forte doubles
    expect(ipa("רֶ֫גֶל")).toBe("ra.ɣal");
  });

  it("BGDKPT rafe: v ḏ ḵ f ṯ; ח ḥ, ע ʿ, ט ṭ, צ ṣ, שׂ s", () => {
    expect(ipa("בְּרֵאשִׁ֖ית")).toBe("bə.re.ʃiθ");
    expect(ipa("אָב֑וֹת")).toBe("ʔɔ.vøθ");
    expect(ipa("מִדְבָּ֑ר")).toBe("mið.bɔr");
    expect(ipa("מֶ֫לֶךְ")).toBe("ma.lax");
    expect(ipa("יָפֶ֑ה")).toBe("jɔ.fa");
    expect(ipa("חָכָ֑ם")).toBe("ħɔ.xɔm");
    expect(ipa("עֶ֑בֶד")).toBe("ʕa.vað");
    expect(ipa("טוֹב")).toBe("tˤøv");
    expect(ipa("צֶ֑דֶק")).toBe("sˤa.ðag");
    expect(ipa("שָׂרָ֑ה")).toBe("sɔ.rɔ");
  });
});

describe("Temani vowels", () => {
  it("segol and hataf-segol become a; qamats is å; holam is ö", () => {
    expect(nuclei("אֱלֹהִ֑ים")).toEqual(["a", "ø", "i"]);
    expect(ipa("אֱלֹהִ֑ים")).toBe("ʔa.lø.him");
    expect(nuclei("הָאָ֫רֶץ")).toEqual(["ɔ", "ɔ", "a"]);
    expect(nuclei("כֹּ֑ל")).toEqual(["ø"]);
    expect(nuclei("אוֹר")).toEqual(["ø"]); // holam male
    expect(nuclei("הוּא")).toEqual(["u"]); // shuruq
  });

  it("pronounces shva na at word start, after another shva and under dagesh forte; silent otherwise", () => {
    expect(nuclei("בְּרֵאשִׁ֖ית")).toEqual(["ə", "e", "i"]);
    expect(nuclei("יִשְׁמְע֑וּ")).toEqual(["i", "ə", "u"]); // second of two shvas
    expect(nuclei("מִדְבָּ֑ר")).toEqual(["i", "ɔ"]); // shva nach
    expect(nuclei("הַמְּלָכִ֑ים")).toEqual(["a", "ə", "ɔ", "i"]); // dagesh forte → shva na
    expect(nuclei("אַ֫תְּ")).toEqual(["a"]); // final shva silent
  });

  it("furtive patah before final ח/ע/הּ comes before the consonant", () => {
    expect(ipa("רָקִ֫יעַ")).toBe("rɔ.gi.aʕ");
    expect(ipa("נֹ֫חַ")).toBe("nø.aħ");
    expect(ipa("גָּבֹ֑הַּ")).toBe("dʒɔ.vø.ah");
  });
});

describe("stress", () => {
  it("uses the cantillation mark position", () => {
    expect(transcribeTemani("וַיֹּ֥אמֶר").stressIndex).toBe(1); // vay-YO-mer (mil'el)
    expect(transcribeTemani("אֱלֹהִ֑ים").stressIndex).toBe(2);
    expect(transcribeTemani("הָאָ֫רֶץ").stressIndex).toBe(1);
  });

  it("defaults to the last syllable without a mark or with a post-positive mark", () => {
    expect(transcribeTemani("בָּרָא").stressIndex).toBe(1);
    expect(transcribeTemani("אֱלֹהִים֮").stressIndex).toBe(2); // zarqa/zinor is post-positive
    expect(transcribeTemani("הָרָקִיעַ֒").stressIndex).toBe(3); // segolta post-positive → milra (hɔ.rɔ.gi.aʕ)
  });

  it("uses the first of a doubled pashta", () => {
    expect(transcribeTemani("תֹ֙הוּ֙").stressIndex).toBe(0); // TO-hu
    expect(transcribeTemani("וּבְיַד֙").stressIndex).toBe(1); // single pashta → milra (uv.jað)
    expect(transcribeTemani("וּבְיַד֙").ipa).toBe("uv.jað");
  });
});

describe("tokens", () => {
  it("splits maqaf groups and strips paseq / sof pasuq", () => {
    const parts = transcribeToken("עַל־פְּנֵ֣י");
    expect(parts.map((p) => p.ipa)).toEqual(["ʕal", "pə.ne"]);
    expect(transcribeToken("הָאָֽרֶץ׃").map((p) => p.ipa)).toEqual(["hɔ.ʔɔ.rasˤ"]);
    expect(transcribeToken("וַֽיִּתְמַהְמָ֓הּ ׀").map((p) => p.ipa)).toEqual(["wa.jjiθ.mah.mɔh"]);
  });
});
