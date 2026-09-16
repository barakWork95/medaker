"use client";

/** Mobile-first modal: slides up from the bottom, full width, safe-area aware. */
import { useEffect, useRef, type ReactNode } from "react";

export function BottomSheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panel.current?.querySelector<HTMLElement>("input, select, button")?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="presentation">
      <button type="button" aria-label="סגור" onClick={onClose} className="absolute inset-0 bg-black/60" />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative max-h-[88vh] w-full max-w-lg overflow-y-auto rounded-t-2xl border-t border-gold/50 bg-navy-800 px-4 pt-3 text-parchment shadow-2xl sm:rounded-2xl sm:border"
        style={{ paddingBottom: "calc(1rem + env(safe-area-inset-bottom))" }}
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-parchment/25 sm:hidden" aria-hidden />
        <header className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold text-gold">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="grid size-11 place-items-center rounded-lg text-parchment/70 hover:bg-navy hover:text-gold"
            aria-label="סגור"
          >
            ✕
          </button>
        </header>
        {children}
      </div>
    </div>
  );
}
