"use client";

/** The parchment "scroll" box: a row of TaamWords with the STAM typography. */
import type { ReactNode } from "react";

export function VerseScroll({ children, reference }: { children: ReactNode; reference?: string }) {
  return (
    <section
      dir="rtl"
      className="relative rounded-2xl border-2 border-gold bg-parchment px-5 py-8 shadow-[0_0_0_6px_var(--color-navy-800),0_20px_60px_-20px_rgba(0,0,0,0.8)] sm:px-10"
    >
      {reference && (
        <span className="absolute top-2 left-4 text-xs font-medium text-gold-700/80">{reference}</span>
      )}
      <p className="flex flex-wrap justify-center gap-x-3 gap-y-5 text-[2.1rem] font-bold leading-[1.5] text-ink sm:text-[2.6rem]">
        {children}
      </p>
    </section>
  );
}
