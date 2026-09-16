/**
 * Hebrew numerals (gematria) for chapter / verse numbers: 1 → א, 15 → ט״ו, 119 → קי״ט.
 * Formatting uses gershayim before the last letter for multi-letter numbers and no
 * geresh for single letters ("א", "י״א"). Parsing is lenient: any geresh/gershayim/quote
 * characters are ignored and final letters count like their regular forms.
 */
const VALUES: Record<string, number> = {
  א: 1, ב: 2, ג: 3, ד: 4, ה: 5, ו: 6, ז: 7, ח: 8, ט: 9,
  י: 10, כ: 20, ל: 30, מ: 40, נ: 50, ס: 60, ע: 70, פ: 80, צ: 90,
  ק: 100, ר: 200, ש: 300, ת: 400,
  ך: 20, ם: 40, ן: 50, ף: 80, ץ: 90,
};
const LETTERS: [number, string][] = [
  [400, "ת"], [300, "ש"], [200, "ר"], [100, "ק"], [90, "צ"], [80, "פ"], [70, "ע"], [60, "ס"],
  [50, "נ"], [40, "מ"], [30, "ל"], [20, "כ"], [10, "י"], [9, "ט"], [8, "ח"], [7, "ז"], [6, "ו"],
  [5, "ה"], [4, "ד"], [3, "ג"], [2, "ב"], [1, "א"],
];
const GERSHAYIM = "״";
const QUOTES_RE = /[׳״'"‘’“”`]/g;

export function toHebrewNumeral(n: number, { marks = true }: { marks?: boolean } = {}): string {
  if (!Number.isInteger(n) || n < 1 || n > 999) throw new RangeError(`toHebrewNumeral: ${n}`);
  let rest = n;
  let out = "";
  for (const [value, letter] of LETTERS) {
    while (rest >= value) {
      // 15 and 16 are written ט״ו / ט״ז, never י״ה / י״ו (divine-name avoidance)
      if (rest === 15 && value === 10) break;
      if (rest === 16 && value === 10) break;
      out += letter;
      rest -= value;
    }
    if (rest === 15) {
      out += "טו";
      rest = 0;
    } else if (rest === 16) {
      out += "טז";
      rest = 0;
    }
  }
  if (!marks || out.length === 1) return out;
  return out.slice(0, -1) + GERSHAYIM + out.slice(-1);
}

/** Returns the numeric value of a Hebrew numeral, or null if the text is not one. */
export function fromHebrewNumeral(text: string): number | null {
  const clean = text.replace(QUOTES_RE, "").trim();
  if (!clean) return null;
  let sum = 0;
  let prev = Infinity;
  for (const ch of clean) {
    const v = VALUES[ch];
    if (v === undefined) return null;
    // ט״ו / ט״ז are the only places a smaller letter precedes a larger one (9 then 6).
    if (v > prev && !(prev === 9 && (v === 6 || v === 7) && false)) {
      // allow "טו"/"טז" (9 before 6/7 is not ascending) — anything ascending is invalid
      return null;
    }
    sum += v;
    prev = v;
  }
  return sum > 0 ? sum : null;
}

/** True if every character is a Hebrew letter or a geresh/gershayim/quote. */
export function looksLikeHebrewNumeral(text: string): boolean {
  return /^[א-ת׳״'"]+$/.test(text);
}
