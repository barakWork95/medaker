"use client";

/** Tiny SVG: the user's pitch contour (gold) over the accent template (dashed), in semitones. */
import type { ContourPoint } from "@/lib/speech/contour";

export function ContourSparkline({ user, template, width = 220, height = 56 }: { user: ContourPoint[]; template: ContourPoint[]; width?: number; height?: number }) {
  const all = [...user, ...template].map((p) => p.st);
  if (!all.length) return null;
  const lo = Math.min(-1, ...all);
  const hi = Math.max(1, ...all);
  const y = (st: number) => height - 4 - ((st - lo) / (hi - lo)) * (height - 8);
  const x = (t: number) => 4 + t * (width - 8);
  const path = (pts: ContourPoint[]) => pts.map((p, i) => `${i ? "L" : "M"}${x(p.t).toFixed(1)},${y(p.st).toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-14 w-full" role="img" aria-label="תנועת הגובה מול התבנית" data-testid="contour-sparkline">
      <line x1="0" x2={width} y1={y(0)} y2={y(0)} stroke="currentColor" strokeOpacity="0.15" />
      <path d={path(template)} fill="none" stroke="var(--color-parchment)" strokeOpacity="0.45" strokeWidth="2" strokeDasharray="4 3" />
      {user.length > 0 && <path d={path(user)} fill="none" stroke="var(--color-gold)" strokeWidth="2.5" strokeLinejoin="round" />}
    </svg>
  );
}
