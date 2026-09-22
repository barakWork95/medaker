/**
 * Expected pitch-movement templates per cantillation accent (Temani tradition).
 *
 * Each template is the melodic SHAPE from the accented syllable to the end of the word:
 * points are semitones relative to the pitch at the start of the region, spread evenly over
 * normalised time [0, 1]. `movement` is the expected total range (max − min) in semitones.
 *
 * ⚠ PLACEHOLDERS. These are stylised readings of the accents' textbook descriptions (a zaqef
 * "raises", an etnahta "rests" downward, a segolta "rolls", a shalshelet "chains", a pashta
 * "extends" upward …). They are the single place a Temani expert should edit — every score in
 * Phase 3 is computed against them. Add `variants` when the melody differs by context.
 */
export interface AccentTemplate {
  markId: string;
  nameHe: string;
  /** Semitones vs. region start, evenly spaced over the region. */
  points: number[];
  /** Expected range (semitones). */
  movement: number;
  /** Matching tolerance (semitones) for the shape distance. */
  tolerance: number;
  /** Short Hebrew description of the intended melody for the UI. */
  describeHe: string;
}

const T = (markId: string, nameHe: string, points: number[], describeHe: string, tolerance = 2.5): AccentTemplate => ({
  markId,
  nameHe,
  points,
  movement: Math.max(...points) - Math.min(...points),
  tolerance,
  describeHe,
});

export const ACCENT_TEMPLATES: readonly AccentTemplate[] = [
  T("etnahta", "אתנחתא", [0, 1, 0, -2, -4, -4], "עלייה קלה ואז ירידה מתמשכת למנוחה נמוכה"),
  T("sof-pasuq", "סוף פסוק", [0, -1, -3, -5, -5], "ירידה הדרגתית לצליל הנמוך ביותר, סיום"),
  T("zaqef-qatan", "זקף קטון", [0, 2, 3, 1, 0], "עלייה ('זקיפה') ואז חזרה"),
  T("zaqef-gadol", "זקף גדול", [0, 3, 4, 3, 0], "עלייה גדולה ומתמשכת ואז חזרה"),
  T("segol", "סגולתא", [0, 2, 0, 2, 0, -1], "ניגון מתגלגל, שני גלים"),
  T("revia", "רביע", [0, 1, 1, -1, -2], "החזקה ואז ירידה מתונה"),
  T("tipeha", "טיפחא", [0, -1, -2, -2], "ירידה קצרה ומדורגת"),
  T("shalshelet", "שלשלת", [0, 2, 0, 2, 0, 2, 0], "שרשרת של גלים עולים ויורדים", 3),
  T("zarqa", "זרקא", [0, 2, -1, 1, 0], "גל: עלייה, ירידה ועלייה קלה"),
  T("tsinnorit", "צינורית", [0, 2, -1, 1, 0], "גל קצר"),
  T("pashta", "פשטא", [0, 1, 2, 3], "עלייה מתמשכת ('פשיטה')"),
  T("tarin-pashtin", "תרין פשטין", [0, 1, 2, 3], "עלייה מתמשכת"),
  T("yetiv", "יתיב", [0, -1, -1, 0], "ירידה קלה וחזרה"),
  T("tevir", "תביר", [0, -2, -3, -1, 0], "שבירה: ירידה ועלייה"),
  T("geresh", "גרש", [0, 2, 4, 3], "עלייה חדה"),
  T("geresh-muqdam", "גרש מוקדם", [0, 2, 4, 3], "עלייה חדה"),
  T("gershayim", "גרשיים", [0, 2, 4, 2, 4, 3], "עלייה חדה כפולה"),
  T("pazer", "פזר", [0, 3, 1, 4, 2], "פיזור: עלייה, ירידה, עלייה"),
  T("telisha-gedola", "תלישא גדולה", [0, 4, 4, 2], "זינוק ('תלישה') והחזקה"),
  T("qarney-para", "קרני פרה", [0, 3, 1, 4, 2, 0], "שני 'קרניים' עולות"),
  T("atnah-hafukh", "אתנח הפוך", [0, -2, 0, 2, 1], "ירידה ואז עלייה"),
  T("yerah-ben-yomo", "ירח בן יומו", [0, 1, 1, 0], "החזקה מתונה"),
  T("dehi", "דחי", [0, -1, -2, -1], "ירידה קלה"),
  T("paseq", "פסק", [0, 0, -1, -1], "הפסקה קצרה"),
];

export const ACCENT_TEMPLATES_BY_MARK: ReadonlyMap<string, AccentTemplate> = new Map(ACCENT_TEMPLATES.map((t) => [t.markId, t]));
