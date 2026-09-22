"use client";

/** Live time-domain waveform drawn from the recorder's AnalyserNode via requestAnimationFrame. */
import { useEffect, useRef } from "react";

export function WaveformCanvas({
  active,
  getWaveform,
  size,
  className = "",
}: {
  active: boolean;
  getWaveform: (target: Uint8Array<ArrayBuffer>) => boolean;
  size: number;
  className?: string;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const ctx = el.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const w = el.clientWidth;
    const h = el.clientHeight;
    el.width = Math.round(w * dpr);
    el.height = Math.round(h * dpr);
    ctx.scale(dpr, dpr);

    const styles = getComputedStyle(document.documentElement);
    const gold = styles.getPropertyValue("--color-gold").trim() || "#d4af37";
    const dim = styles.getPropertyValue("--color-navy-700").trim() || "#334155";

    const buf = new Uint8Array(new ArrayBuffer(size));
    let raf = 0;

    const drawIdle = () => {
      ctx.clearRect(0, 0, w, h);
      ctx.strokeStyle = dim;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, h / 2);
      ctx.lineTo(w, h / 2);
      ctx.stroke();
    };

    const draw = () => {
      if (!getWaveform(buf)) {
        drawIdle();
      } else {
        ctx.clearRect(0, 0, w, h);
        ctx.strokeStyle = gold;
        ctx.lineWidth = 2;
        ctx.beginPath();
        const step = w / buf.length;
        for (let i = 0; i < buf.length; i++) {
          const y = ((buf[i] - 128) / 128) * (h / 2) * 0.95 + h / 2;
          if (i === 0) ctx.moveTo(0, y);
          else ctx.lineTo(i * step, y);
        }
        ctx.stroke();
      }
      raf = requestAnimationFrame(draw);
    };

    if (active) raf = requestAnimationFrame(draw);
    else drawIdle();
    return () => cancelAnimationFrame(raf);
  }, [active, getWaveform, size]);

  return <canvas ref={canvas} className={`block h-16 w-full ${className}`} aria-hidden />;
}
