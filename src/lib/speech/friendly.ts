/**
 * Learner-facing rendering of the Temani pronunciation of a pointed word.
 *
 *  - `respelled`: the word re-pointed so an Israeli reader pronounces it the Temani way where
 *    Hebrew pointing can express it — qamats → holam (å sounds like "o"), segol / hataf-segol →
 *    patah. Cantillation is stripped. Consonant shifts (ו→W, ק→G …) cannot be written in
 *    Hebrew letters, so they become hint chips instead.
 *  - `hints`: the pronunciation rules that apply to THIS word, as short "letter = sound" chips
 *    with an explanation for a tooltip.
 */
import { letterUnits } from "./temani-phonetics";

export interface PronunciationHint {
  id: string;
  /** Chip text, e.g. "ו = W". */
  label: string;
  /** Tooltip / long form. */
  detail: string;
}

const HINTS: Record<string, PronunciationHint> = {
  vav: { id: "vav", label: "ו = W", detail: "ו נהגית W כמו באנגלית, לא V" },
  qof: { id: "qof", label: "ק = G", detail: "ק נהגית G (כמו ג׳ ישראלית)" },
  gimelDagesh: { id: "gimelDagesh", label: "גּ = J", detail: "ג דגושה נהגית ג׳ (J)" },
  gimelRafe: { id: "gimelRafe", label: "ג = GH", detail: "ג רפה נהגית ע׳ גרונית (GH, כמו غ)" },
  tavRafe: { id: "tavRafe", label: "ת = TH", detail: "ת רפה נהגית TH (כמו think)" },
  daletRafe: { id: "daletRafe", label: "ד = DH", detail: "ד רפה נהגית DH (כמו this)" },
  kafRafe: { id: "kafRafe", label: "כ = KH", detail: "כ רפה נהגית ח׳ עמוקה (KH)" },
  het: { id: "het", label: "ח = Ḥ", detail: "ח גרונית (כמו ح), לא כמו כ רפה" },
  ayin: { id: "ayin", label: "ע = ʿ", detail: "ע גרונית מובהקת (כמו ع)" },
  tet: { id: "tet", label: "ט = Ṭ", detail: "ט נחצית (כמו ط)" },
  tsade: { id: "tsade", label: "צ = Ṣ", detail: "צ נחצית (כמו ص), לא TS" },
  qamats: { id: "qamats", label: "קמץ = O", detail: "קמץ נהגה כ־O רחב (כמו חולם ישראלי)" },
  segol: { id: "segol", label: "סגול = A", detail: "סגול נהגה כפתח (A)" },
  holam: { id: "holam", label: "חולם = Ö", detail: "חולם נהגה בין O ל־E (כמו ö)" },
  shva: { id: "shva", label: "שווא נע = E קצר", detail: "שווא נע נשמע כתנועה קצרה" },
};

const QAMATS = 0x05b8;
const QAMATS_QATAN = 0x05c7;
const HOLAM = 0x05b9;
const SEGOL = 0x05b6;
const HATAF_SEGOL = 0x05b1;
const PATAH = 0x05b7;

export interface FriendlyPronunciation {
  original: string;
  /** Original without cantillation (nikkud kept). */
  pointed: string;
  respelled: string;
  /** True when respelled differs from pointed. */
  changed: boolean;
  hints: PronunciationHint[];
}

export function friendlyPronunciation(pointedWord: string): FriendlyPronunciation {
  const nfd = pointedWord.normalize("NFD").replace(/[͏‌-‏]/g, "");
  const pointed = nfd.replace(/[֑-֯׀׃׆]/g, "");
  const respelled = [...pointed]
    .map((ch) => {
      const cp = ch.codePointAt(0)!;
      if (cp === QAMATS || cp === QAMATS_QATAN) return String.fromCodePoint(HOLAM);
      if (cp === SEGOL || cp === HATAF_SEGOL) return String.fromCodePoint(PATAH);
      return ch;
    })
    .join("");

  const hints: PronunciationHint[] = [];
  const add = (id: keyof typeof HINTS) => {
    if (!hints.some((h) => h.id === id)) hints.push(HINTS[id]);
  };
  const units = letterUnits(pointed);
  units.forEach((u, i) => {
    const isLast = i === units.length - 1;
    if (u.letter === "ו") {
      const prev = units[i - 1];
      const shuruq = u.dagesh && u.vowel === null && !u.shva;
      const holamMale = u.vowel === HOLAM && !u.dagesh && !!prev && prev.vowel === null && !prev.shva;
      if ((u.vowel !== null || u.shva || u.dagesh) && !shuruq && !holamMale) add("vav");
    }
    if (u.letter === "ק") add("qof");
    if (u.letter === "ג") add(u.dagesh ? "gimelDagesh" : "gimelRafe");
    if (u.letter === "ת" && !u.dagesh) add("tavRafe");
    if (u.letter === "ד" && !u.dagesh) add("daletRafe");
    if (u.letter === "כ" && !u.dagesh) add("kafRafe");
    if (u.letter === "ח") add("het");
    if (u.letter === "ע") add("ayin");
    if (u.letter === "ט") add("tet");
    if (u.letter === "צ") add("tsade");
    if (u.vowel === QAMATS || u.vowel === QAMATS_QATAN || u.vowel === 0x05b3) add("qamats");
    if (u.vowel === SEGOL || u.vowel === HATAF_SEGOL) add("segol");
    if (u.vowel === HOLAM || u.vowel === 0x05ba) add("holam");
    if (u.shva && u.vowel === null && i === 0 && !isLast) add("shva");
  });
  return { original: pointedWord, pointed, respelled, changed: respelled !== pointed, hints };
}

/** Hints for a maqaf-joined token: union over its parts, in order. */
export function friendlyToken(pointedToken: string): FriendlyPronunciation {
  const parts = pointedToken.normalize("NFD").split("־");
  const results = parts.map(friendlyPronunciation);
  const hints: PronunciationHint[] = [];
  for (const r of results) for (const h of r.hints) if (!hints.some((x) => x.id === h.id)) hints.push(h);
  return {
    original: pointedToken,
    pointed: results.map((r) => r.pointed).join("־"),
    respelled: results.map((r) => r.respelled).join("־"),
    changed: results.some((r) => r.changed),
    hints,
  };
}

export const ALL_HINTS: readonly PronunciationHint[] = Object.values(HINTS);
