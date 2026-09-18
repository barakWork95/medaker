import { GESTURE_ICONS, GESTURE_LABELS_HE, type GestureType } from "@/lib/taamim/config";

const ORDER: GestureType[] = ["LONG_PRESS", "DIAGONAL", "TRIPLE_TAP", "ZIGZAG", "TILDE", "SWIPE_DOWN"];

export function GestureLegend() {
  return (
    <ul className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-parchment/70">
      {ORDER.map((g) => (
        <li key={g} className="flex items-center gap-1.5">
          <span className="grid size-6 place-items-center rounded-full border border-gold/50 font-mono text-gold">
            {GESTURE_ICONS[g]}
          </span>
          {GESTURE_LABELS_HE[g]}
        </li>
      ))}
    </ul>
  );
}
