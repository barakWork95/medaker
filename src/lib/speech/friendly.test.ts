import { describe, expect, it } from "vitest";
import { friendlyPronunciation, friendlyToken } from "./friendly";

const ids = (w: string) => friendlyPronunciation(w).hints.map((h) => h.id);

describe("friendlyPronunciation", () => {
  it("respells qamats as holam and segol as patah, dropping cantillation", () => {
    const r = friendlyPronunciation("הַשָּׁמַ֖יִם");
    expect(r.pointed).toBe("הַשָּׁמַיִם".normalize("NFD"));
    expect(r.respelled).toBe("הַשֹּׁמַיִם".normalize("NFD"));
    expect(r.changed).toBe(true);
    expect(friendlyPronunciation("אֶ֫רֶץ").respelled).toBe("אַרַץ".normalize("NFD"));
    expect(friendlyPronunciation("אֱלֹהִ֑ים").respelled).toBe("אַלֹהִים".normalize("NFD"));
  });

  it("keeps words without qamats/segol unchanged", () => {
    const r = friendlyPronunciation("בְּרֵאשִׁ֖ית");
    expect(r.changed).toBe(false);
    expect(r.respelled).toBe("בְּרֵאשִׁית".normalize("NFD"));
  });

  it("lists only the rules that apply to the word", () => {
    expect(ids("וַיֹּ֥אמֶר")).toEqual(["vav", "holam", "segol"]);
    expect(ids("קָד֑וֹשׁ")).toEqual(["qof", "qamats", "daletRafe", "holam"]); // holam-male ו is not W
    expect(ids("וְאֵ֥ת")).toEqual(["vav", "shva", "tavRafe"]); // וְ = w + vocal shva
    expect(ids("צִוָּ֥ה")).toEqual(["tsade", "vav", "qamats"]); // ו with dagesh + vowel is consonantal
    expect(ids("בְּרֵאשִׁ֖ית")).toEqual(["shva", "tavRafe"]);
    expect(ids("גָּד֑וֹל")).toEqual(["gimelDagesh", "qamats", "daletRafe", "holam"]);
    expect(ids("רֶ֫גֶל")).toEqual(["segol", "gimelRafe"]);
    expect(ids("חָכָ֑ם")).toEqual(["het", "qamats", "kafRafe"]);
    expect(ids("מִדְבָּ֑ר")).toEqual(["daletRafe", "qamats"]); // ב with dagesh → no rafe hint
    expect(ids("א֑וֹר")).toEqual(["holam"]); // holam-male ו is a vowel, not W
    expect(ids("ה֑וּא")).toEqual([]); // shuruq ו is a vowel, not W
  });

  it("handles maqaf tokens", () => {
    const r = friendlyToken("עַל־פְּנֵ֣י");
    expect(r.respelled).toBe("עַל־פְּנֵי".normalize("NFD"));
    expect(r.hints.map((h) => h.id)).toEqual(["ayin", "shva"]); // פְּנֵי starts with a vocal shva
  });
});
