"use client";

/**
 * Header navigation: a compact button showing the current reference that opens a
 * bottom sheet with (1) quick search and (2) three cascading native selects
 * Book → Chapter/Parasha → Verse. Every change navigates immediately; the sheet
 * stays open so the user can keep adjusting. Native <select>s open the OS picker on
 * phones, which is the most touch-friendly control available.
 */
import { useState, type FormEvent } from "react";
import {
  BOOKS,
  SECTION_LABELS_HE,
  chapterCount,
  formatRefHe,
  parashaStartRef,
  parashotOf,
  verseCount,
  type Section,
  type VerseRef,
} from "@/lib/scripture";
import { toHebrewNumeral } from "@/lib/scripture/hebrew-numerals";
import { parseReference } from "@/lib/scripture/parse-reference";
import { BottomSheet } from "./BottomSheet";

const SECTIONS: Section[] = ["torah", "neviim", "ketuvim"];
const SELECT =
  "min-h-12 w-full rounded-lg border border-navy-700 bg-navy px-3 text-base text-parchment focus:border-gold focus:outline-none";

export function ScriptureNav({ current, onNavigate }: { current: VerseRef; onNavigate: (ref: VerseRef) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [searchError, setSearchError] = useState<string | null>(null);

  const parashot = parashotOf(current.book);
  const chapters = chapterCount(current.book);
  const verses = verseCount(current.book, current.chapter);

  const submitSearch = (e: FormEvent) => {
    e.preventDefault();
    const parsed = parseReference(query);
    if (parsed.kind === "error") {
      setSearchError(parsed.message);
      return;
    }
    setSearchError(null);
    setQuery("");
    onNavigate(parsed.ref);
    setOpen(false);
  };

  const onChapterOrParasha = (value: string) => {
    const [kind, id] = value.split(":");
    if (kind === "p") {
      const p = parashot.find((x) => x.id === id);
      if (p) onNavigate(parashaStartRef(p));
    } else {
      onNavigate({ book: current.book, chapter: Number(id), verse: 1 });
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="flex min-h-11 items-center gap-1.5 rounded-full border border-gold/60 px-3 text-sm font-medium text-gold hover:bg-gold/10"
        data-testid="nav-trigger"
      >
        <span>{formatRefHe(current)}</span>
        <span aria-hidden className="text-xs">
          ▾
        </span>
      </button>

      <BottomSheet open={open} onClose={() => setOpen(false)} title="ניווט בתנ״ך">
        <form onSubmit={submitSearch} className="mb-4" data-testid="quick-search">
          <label htmlFor="quick-search" className="mb-1 block text-xs text-parchment/60">
            חיפוש מהיר — למשל: בראשית א א · שמות 20:2 · פרשת נח
          </label>
          <div className="flex gap-2">
            <input
              id="quick-search"
              type="search"
              inputMode="text"
              enterKeyHint="go"
              autoComplete="off"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                if (searchError) setSearchError(null);
              }}
              className={SELECT}
              placeholder="ספר פרק פסוק / פרשה"
            />
            <button type="submit" className="min-h-12 rounded-lg bg-gold px-4 font-semibold text-navy hover:bg-gold-300">
              עבור
            </button>
          </div>
          {searchError && (
            <p role="alert" className="mt-1 text-sm text-incorrect">
              {searchError}
            </p>
          )}
        </form>

        <div className="grid gap-3">
          <label className="block">
            <span className="mb-1 block text-xs text-parchment/60">ספר</span>
            <select
              className={SELECT}
              value={current.book}
              onChange={(e) => onNavigate({ book: e.target.value, chapter: 1, verse: 1 })}
              data-testid="select-book"
            >
              {SECTIONS.map((section) => (
                <optgroup key={section} label={SECTION_LABELS_HE[section]}>
                  {BOOKS.filter((b) => b.section === section).map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.heTitle}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1 block text-xs text-parchment/60">{parashot.length ? "פרק או פרשה" : "פרק"}</span>
            <select
              className={SELECT}
              value={`c:${current.chapter}`}
              onChange={(e) => onChapterOrParasha(e.target.value)}
              data-testid="select-chapter"
            >
              {parashot.length > 0 && (
                <optgroup label="פרשות">
                  {parashot.map((p) => (
                    <option key={p.id} value={`p:${p.id}`}>
                      פרשת {p.heTitle} — {formatRefHe(parashaStartRef(p))}
                    </option>
                  ))}
                </optgroup>
              )}
              <optgroup label="פרקים">
                {Array.from({ length: chapters }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={`c:${n}`}>
                    פרק {toHebrewNumeral(n)} ({n})
                  </option>
                ))}
              </optgroup>
            </select>
          </label>

          <label className="block">
            <span className="mb-1 block text-xs text-parchment/60">פסוק</span>
            <select
              className={SELECT}
              value={current.verse}
              onChange={(e) => onNavigate({ ...current, verse: Number(e.target.value) })}
              data-testid="select-verse"
            >
              {Array.from({ length: verses }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  פסוק {toHebrewNumeral(n)} ({n})
                </option>
              ))}
            </select>
          </label>
        </div>
      </BottomSheet>
    </>
  );
}
