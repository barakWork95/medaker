/**
 * Temani (Yemenite, Sanʿani) phonetic transcription of pointed Hebrew.
 *
 * Input: one pointed word (letters + nikkud, cantillation optional).
 * Output: syllables with phonemes (IPA-ish), stress, and a romanisation for display.
 *
 * Consonant rules (dagesh-sensitive):
 *   ב b/v · ג ǧ [dʒ] / ġ [ɣ] · ד d/ḏ [ð] · ו w · ח ḥ [ħ] · ט ṭ · כ k/ḵ [x] · ע ʿ [ʕ] · פ p/f ·
 *   צ ṣ · ק g (Sanʿani) · ש š / שׂ s · ת t/ṯ [θ]
 * Vowel rules: segol = patah (a) · qamats = å [ɔ] (never o) · holam = ö [ø] (Sanʿani) ·
 *   shva na = ə (pronounced, short) · hataf-segol = a · furtive patah before final ח/ע/הּ.
 * Shva na heuristics: word-initial · second of two consecutive shvas · under a letter with
 *   dagesh forte (dagesh on a non-BGDKPT letter, or a BGDKPT letter not at word start) ·
 *   after a vowel + meteg. Otherwise shva nach (no syllable).
 * Stress: the cantillation mark sits on the stressed syllable, except pre/post-positive marks
 *   (pashta, segolta, telisha, zarqa/zinor, yetiv, dehi) → milra (final syllable) unless a
 *   doubled pashta marks the stressed syllable with its first occurrence. No mark → milra.
 *
 * These rules are a documented approximation for alignment/scoring; refine with a domain
 * expert (see CLAUDE.md §15).
 */

export interface Phoneme {
  /** IPA-like symbol. */
  ipa: string;
  /** Latin romanisation for display. */
  roman: string;
  kind: "consonant" | "vowel";
}

export interface Syllable {
  phonemes: Phoneme[];
  /** The vowel phoneme (nucleus). */
  vowel: Phoneme;
  stressed: boolean;
  /** Character offset (in the NFD word) of the nucleus vowel — for aligning marks. */
  offset: number;
}

export interface PhoneticWord {
  /** Original pointed input. */
  pointed: string;
  syllables: Syllable[];
  ipa: string;
  roman: string;
  stressIndex: number;
}

const DAGESH = 0x05bc;
const SHVA = 0x05b0;
const METEG = 0x05bd;
const RAFE = 0x05bf;
const SHIN_DOT = 0x05c1;
const SIN_DOT = 0x05c2;
const MAQAF = 0x05be; // mappiq shares DAGESH's code point (on ה)

const BGDKPT = new Set(["ב", "ג", "ד", "כ", "פ", "ת"]);
const FINAL_TO_REGULAR: Record<string, string> = { ך: "כ", ם: "מ", ן: "נ", ף: "פ", ץ: "צ" };

interface ConsonantSpec {
  hard: [string, string]; // [ipa, roman] with dagesh
  soft: [string, string]; // without dagesh (rafe)
}

const CONSONANTS: Record<string, ConsonantSpec> = {
  א: { hard: ["ʔ", "ʾ"], soft: ["ʔ", "ʾ"] },
  ב: { hard: ["b", "b"], soft: ["v", "v"] },
  ג: { hard: ["dʒ", "ǧ"], soft: ["ɣ", "ġ"] },
  ד: { hard: ["d", "d"], soft: ["ð", "ḏ"] },
  ה: { hard: ["h", "h"], soft: ["h", "h"] },
  ו: { hard: ["w", "w"], soft: ["w", "w"] },
  ז: { hard: ["z", "z"], soft: ["z", "z"] },
  ח: { hard: ["ħ", "ḥ"], soft: ["ħ", "ḥ"] },
  ט: { hard: ["tˤ", "ṭ"], soft: ["tˤ", "ṭ"] },
  י: { hard: ["j", "y"], soft: ["j", "y"] },
  כ: { hard: ["k", "k"], soft: ["x", "ḵ"] },
  ל: { hard: ["l", "l"], soft: ["l", "l"] },
  מ: { hard: ["m", "m"], soft: ["m", "m"] },
  נ: { hard: ["n", "n"], soft: ["n", "n"] },
  ס: { hard: ["s", "s"], soft: ["s", "s"] },
  ע: { hard: ["ʕ", "ʿ"], soft: ["ʕ", "ʿ"] },
  פ: { hard: ["p", "p"], soft: ["f", "f"] },
  צ: { hard: ["sˤ", "ṣ"], soft: ["sˤ", "ṣ"] },
  ק: { hard: ["g", "g"], soft: ["g", "g"] },
  ר: { hard: ["r", "r"], soft: ["r", "r"] },
  ש: { hard: ["ʃ", "š"], soft: ["ʃ", "š"] },
  ת: { hard: ["t", "t"], soft: ["θ", "ṯ"] },
};

/** Vowel code point → [ipa, roman]. */
const VOWELS: Record<number, [string, string]> = {
  0x05b1: ["a", "a"], // hataf segol → patah (Temani)
  0x05b2: ["a", "a"], // hataf patah
  0x05b3: ["ɔ", "å"], // hataf qamats
  0x05b4: ["i", "i"], // hiriq
  0x05b5: ["e", "e"], // tsere
  0x05b6: ["a", "a"], // segol → patah (Temani)
  0x05b7: ["a", "a"], // patah
  0x05b8: ["ɔ", "å"], // qamats
  0x05b9: ["ø", "ö"], // holam
  0x05ba: ["ø", "ö"], // holam haser for vav
  0x05bb: ["u", "u"], // qubuts
  0x05c7: ["ɔ", "å"], // qamats qatan → same as qamats in Temani
};

const SHVA_NA: [string, string] = ["ə", "ə"];

/** Marks placed on a syllable other than the stressed one. */
const NON_STRESS_MARKS = new Set([0x0599, 0x0592, 0x05a9, 0x05a0, 0x05ae, 0x059a, 0x05ad]);
const PASHTA = 0x0599;

export interface LetterUnit {
  letter: string; // regular form
  isFinal: boolean;
  dagesh: boolean;
  rafe: boolean;
  shinDot: boolean;
  sinDot: boolean;
  vowel: number | null; // vowel code point
  shva: boolean;
  meteg: boolean;
  marks: number[];
  offset: number;
  vowelOffset: number;
}

/** Letters with their pointing, in order (public for friendly.ts). */
export function letterUnits(pointed: string): LetterUnit[] {
  return parseUnits(pointed.normalize("NFD").replace(/[\u034F\u200C-\u200F]/g, ""));
}

function parseUnits(nfd: string): LetterUnit[] {
  const units: LetterUnit[] = [];
  let cur: LetterUnit | null = null;
  for (let i = 0; i < nfd.length; i++) {
    const cp = nfd.codePointAt(i)!;
    if (cp >= 0x05d0 && cp <= 0x05ea) {
      const ch = String.fromCodePoint(cp);
      cur = {
        letter: FINAL_TO_REGULAR[ch] ?? ch,
        isFinal: ch in FINAL_TO_REGULAR,
        dagesh: false,
        rafe: false,
        shinDot: false,
        sinDot: false,
        vowel: null,
        shva: false,
        meteg: false,
        marks: [],
        offset: i,
        vowelOffset: i,
      };
      units.push(cur);
      continue;
    }
    if (!cur) continue;
    if (cp === DAGESH) cur.dagesh = true;
    else if (cp === RAFE) cur.rafe = true;
    else if (cp === SHIN_DOT) cur.shinDot = true;
    else if (cp === SIN_DOT) cur.sinDot = true;
    else if (cp === SHVA) {
      cur.shva = true;
      cur.vowelOffset = i;
    } else if (cp in VOWELS) {
      cur.vowel = cp;
      cur.vowelOffset = i;
    } else if (cp === METEG) cur.meteg = true;
    else if (cp >= 0x0591 && cp <= 0x05af) cur.marks.push(cp);
    // maqaf / paseq / sof pasuq are word separators handled by the caller
  }
  return units;
}

function consonantOf(u: LetterUnit, index: number, units: LetterUnit[]): Phoneme[] {
  const spec = CONSONANTS[u.letter];
  if (!spec) return [];
  // matres lectionis: silent א at word end / without vowel; ה without mappiq at word end;
  // ו/י as vowel carriers are handled by the vowel logic (holam-vav, shuruq, hiriq-yod)
  const isLast = index === units.length - 1;
  if (u.letter === "א" && !u.vowel && !u.shva) return [];
  if (u.letter === "ה" && isLast && !u.dagesh) return [];
  // mater lectionis yod: vowelless י after hiriq / tsere / segol is silent (בְּרֵאשִׁית, פְּנֵי)
  if (u.letter === "י" && !u.vowel && !u.shva && !u.dagesh && isMaterYod(index, units)) return [];
  if (u.letter === "ו" && u.dagesh && !u.vowel && !u.shva) return [{ ipa: "u", roman: "u", kind: "vowel" }]; // shuruq
  if (u.letter === "ו" && u.vowel === 0x05b9 && !u.shva && !isPrecededByVowel(index, units)) {
    // holam male (וֹ) — vowel only; a consonantal ו with holam is preceded by a vowelless letter
  }
  let ipa: string;
  let roman: string;
  if (u.letter === "ש") {
    [ipa, roman] = u.sinDot ? ["s", "s"] : ["ʃ", "š"];
  } else {
    [ipa, roman] = u.dagesh && !u.rafe ? spec.hard : spec.soft;
  }
  const out: Phoneme[] = [{ ipa, roman, kind: "consonant" }];
  // dagesh forte (gemination): dagesh on a non-BGDKPT letter, or on a BGDKPT letter that
  // follows a full vowel (after a closed syllable / shva nach it is dagesh lene).
  // Affricates/digraphs geminate their first element only (dʒ → ddʒ).
  const forte = u.dagesh && u.letter !== "ה" && (!BGDKPT.has(u.letter) || (index > 0 && units[index - 1].vowel !== null));
  if (forte && index > 0) out.unshift({ ipa: ipa.length > 1 && !/[ˤ]/.test(ipa) ? ipa[0] : ipa, roman: roman[0], kind: "consonant" });
  return out;
}

function isMaterYod(index: number, units: LetterUnit[]): boolean {
  const prev = units[index - 1];
  if (!prev) return false;
  return prev.vowel === 0x05b4 || prev.vowel === 0x05b5 || prev.vowel === 0x05b6;
}

function isPrecededByVowel(index: number, units: LetterUnit[]): boolean {
  const prev = units[index - 1];
  return !!prev && (prev.vowel !== null || prev.shva);
}

function isShvaNa(index: number, units: LetterUnit[]): boolean {
  const u = units[index];
  if (!u.shva) return false;
  if (index === units.length - 1) return false; // final shva is always silent
  if (index === 0) return true;
  const prev = units[index - 1];
  if (prev.shva) return true; // second of two shvas
  if (prev.meteg) return true;
  const forte = u.dagesh && (!BGDKPT.has(u.letter) || (index > 0 && prev.vowel !== null));
  if (forte) return true;
  // shva after a long vowel (tsere, holam, shuruq, hiriq-yod, qamats) is commonly na
  return false;
}

export function transcribeTemani(pointed: string): PhoneticWord {
  const nfd = pointed.normalize("NFD").replace(/[͏‌-‏]/g, "");
  const units = parseUnits(nfd);
  const syllables: Syllable[] = [];
  let onset: Phoneme[] = [];

  units.forEach((u, i) => {
    const cons = consonantOf(u, i, units);
    const isShuruq = cons.length === 1 && cons[0].kind === "vowel";
    if (isShuruq) {
      syllables.push({ phonemes: [...onset, cons[0]], vowel: cons[0], stressed: false, offset: u.offset });
      onset = [];
      return;
    }
    // holam male: וֹ after a vowelless consonant → vowel ö only
    const holamMale = u.letter === "ו" && u.vowel === 0x05b9 && !u.dagesh && i > 0 && !units[i - 1].vowel && !units[i - 1].shva;
    if (holamMale) {
      const v: Phoneme = { ipa: "ø", roman: "ö", kind: "vowel" };
      syllables.push({ phonemes: [...onset, v], vowel: v, stressed: false, offset: u.vowelOffset });
      onset = [];
      return;
    }
    // shva nach (silent) closes the previous syllable: the consonant is its coda
    if (u.shva && !isShvaNa(i, units) && syllables.length) {
      syllables[syllables.length - 1].phonemes.push(...onset, ...cons);
      onset = [];
      return;
    }
    onset.push(...cons);

    let vowel: Phoneme | null = null;
    if (u.vowel !== null) {
      const [ipa, roman] = VOWELS[u.vowel];
      vowel = { ipa, roman, kind: "vowel" };
    } else if (isShvaNa(i, units)) {
      vowel = { ipa: SHVA_NA[0], roman: SHVA_NA[1], kind: "vowel" };
    }
    if (vowel) {
      syllables.push({ phonemes: [...onset, vowel], vowel, stressed: false, offset: u.vowelOffset });
      onset = [];
    }
    // furtive patah: patah under final ח / ע / הּ is pronounced BEFORE the consonant
    const isLast = i === units.length - 1;
    if (isLast && u.vowel === 0x05b7 && (u.letter === "ח" || u.letter === "ע" || (u.letter === "ה" && u.dagesh))) {
      const last = syllables[syllables.length - 1];
      if (last) {
        const consPh = last.phonemes.filter((p) => p.kind === "consonant" && p === cons[cons.length - 1]);
        // reorder: vowel before the guttural
        const idx = last.phonemes.indexOf(cons[cons.length - 1]);
        if (idx >= 0 && consPh.length) {
          last.phonemes.splice(idx, 1);
          last.phonemes.push(cons[cons.length - 1]);
        }
      }
    }
  });
  // trailing consonants (coda) attach to the last syllable
  if (onset.length && syllables.length) syllables[syllables.length - 1].phonemes.push(...onset);
  else if (onset.length) {
    // consonant-only token (should not happen for real words)
    const v: Phoneme = { ipa: "", roman: "", kind: "vowel" };
    syllables.push({ phonemes: onset, vowel: v, stressed: false, offset: 0 });
  }

  // stress
  let stressIndex = syllables.length - 1;
  const stressMarks: number[] = [];
  const pashtaOffsets: number[] = [];
  for (const u of units) {
    for (const m of u.marks) {
      if (m === PASHTA) pashtaOffsets.push(u.offset);
      else if (!NON_STRESS_MARKS.has(m)) stressMarks.push(u.offset);
    }
  }
  const markOffset = stressMarks.length ? stressMarks[0] : pashtaOffsets.length >= 2 ? pashtaOffsets[0] : null;
  if (markOffset !== null) {
    // the marked letter carries the stressed syllable's nucleus: pick the syllable whose
    // nucleus offset is the smallest one ≥ the letter offset (a mater/holam-male shifts it right)
    const letterIndex = units.findIndex((u) => u.offset === markOffset);
    const letter = units[letterIndex];
    const target = letter ? letter.vowelOffset : markOffset;
    let idx = syllables.findIndex((s) => s.offset >= (letter?.offset ?? markOffset));
    if (idx === -1) idx = syllables.length - 1;
    // a mark on a vowelless letter (e.g. holam-male ו) belongs to the preceding nucleus
    if (letter && !letter.vowel && !letter.shva && idx > 0 && syllables[idx].offset > target) idx -= 1;
    stressIndex = idx;
  }
  if (syllables[stressIndex]) syllables[stressIndex].stressed = true;

  const ipa = syllables.map((s) => s.phonemes.map((p) => p.ipa).join("")).join(".");
  const roman = syllables.map((s, i) => (i === stressIndex ? "ˈ" : "") + s.phonemes.map((p) => p.roman).join("")).join("");
  return { pointed, syllables, ipa, roman, stressIndex };
}

/** Transcribe a token that may contain maqaf-joined words: one PhoneticWord per part, in order. */
export function transcribeToken(pointed: string): PhoneticWord[] {
  return pointed
    .normalize("NFD")
    .split(String.fromCodePoint(MAQAF))
    .map((p) => p.replace(/[׀׃׆\s]/g, ""))
    .filter((p) => /[א-ת]/.test(p))
    .map(transcribeTemani);
}
