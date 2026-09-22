/**
 * Calibration words — one per major Yemenite (Temani) cantillation pattern the learner will
 * later be assessed on. Each is a real Torah word (WLC pointing) carrying the mark.
 *
 * ⚠ `guidanceHe` describes the melodic shape in plain words as a PLACEHOLDER: the exact Temani
 * melody per accent must be confirmed by a domain expert before Phase 3 (assessment).
 */
import { toStamDisplay } from "@/lib/hebrew/unicode";

export interface CalibrationWord {
  id: string;
  /** Mark id from taamim config (for the profile record + future assessment). */
  markId: string;
  markNameHe: string;
  /** Fully pointed word (WLC). */
  pointed: string;
  /** Bare letters, for the STAM layer. */
  display: string;
  /** Source reference, for display. */
  sourceHe: string;
  guidanceHe: string;
}

const W = (id: string, markId: string, markNameHe: string, pointed: string, sourceHe: string, guidanceHe: string): CalibrationWord => ({
  id,
  markId,
  markNameHe,
  pointed,
  display: toStamDisplay(pointed),
  sourceHe,
  guidanceHe,
});

export const CALIBRATION_WORDS: readonly CalibrationWord[] = [
  W("etnahta", "etnahta", "אתנחתא", "אֱלֹהִ֑ים", "בראשית א, א", "הפסקה אמצעית: הטעמה ברורה על ההברה המוטעמת וירידה בסוף המילה."),
  W("zaqef-qatan", "zaqef-qatan", "זקף קטון", "וָבֹ֔הוּ", "בראשית א, ב", "עלייה קצרה על ההברה המוטעמת ואחריה נפילה — ניגון של הפסקה משנית."),
  W("segolta", "segol", "סגולתא", "הָרָקִיעַ֒", "בראשית א, ז", "ניגון מתגלגל ומתמשך על ההברה האחרונה, בטווח הקול הטבעי."),
];

/** Rough total calibration time shown in the intro (3 takes of ~2–3 s + instructions). */
export const CALIBRATION_ESTIMATE_SECONDS = 30;
