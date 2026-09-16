"use client";

/**
 * Navigation state for the practice engine: which verse is open and its text.
 *
 *   ref     — current VerseRef (book/chapter/verse)
 *   status  — "loading" | "ready" | "error"
 *   text    — the pointed verse text (feeds tokenizeVerse → rule engine)
 *
 * Initial ref: `?ref=Genesis.1.1` in the URL → last position in localStorage → Genesis 1:1.
 * Every navigation persists to both (history.replaceState keeps other params such as ?tune).
 * Chapters are fetched through loadChapter() (Sefaria WLC, cached).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { DEFAULT_REF, isValidRef, keyToRef, nextRef, prevRef, refToKey, sameRef, type VerseRef } from "./index";
import { loadChapter, type ChapterText } from "./loader";

const LAST_REF_KEY = "medaker.lastRef";
const URL_PARAM = "ref";

export type ScriptureStatus = "loading" | "ready" | "error";

export interface ScriptureState {
  ref: VerseRef;
  status: ScriptureStatus;
  /** Verse text when status === "ready". */
  text: string | null;
  error: string | null;
  hasNext: boolean;
  hasPrev: boolean;
  goTo: (ref: VerseRef) => void;
  next: () => void;
  prev: () => void;
  retry: () => void;
}

function readInitialRef(): VerseRef {
  try {
    const fromUrl = new URLSearchParams(window.location.search).get(URL_PARAM);
    const ref = fromUrl && keyToRef(fromUrl);
    if (ref) return ref;
  } catch {
    /* ignore */
  }
  try {
    const stored = window.localStorage.getItem(LAST_REF_KEY);
    const ref = stored && keyToRef(stored);
    if (ref) return ref;
  } catch {
    /* ignore */
  }
  return DEFAULT_REF;
}

function persistRef(ref: VerseRef) {
  const key = refToKey(ref);
  try {
    window.localStorage.setItem(LAST_REF_KEY, key);
  } catch {
    /* ignore */
  }
  try {
    const url = new URL(window.location.href);
    url.searchParams.set(URL_PARAM, key);
    window.history.replaceState(window.history.state, "", url);
  } catch {
    /* ignore */
  }
}

export function useScripture(): ScriptureState {
  const [ref, setRef] = useState<VerseRef>(DEFAULT_REF);
  /** Target of an in-flight navigation started by the user (shows "loading" + its label). */
  const [pending, setPending] = useState<VerseRef | null>(null);
  const [chapter, setChapter] = useState<{ key: string; text: ChapterText } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  /** Async only — every setState happens in a promise callback, never synchronously. */
  const load = useCallback((target: VerseRef) => {
    const id = ++requestId.current;
    loadChapter(target.book, target.chapter).then(
      (text) => {
        if (id !== requestId.current) return; // a newer navigation won
        setRef(target);
        setChapter({ key: `${target.book}.${target.chapter}`, text });
        setError(null);
        setPending(null);
        persistRef(target);
      },
      (err: unknown) => {
        if (id !== requestId.current) return;
        setRef(target);
        setChapter(null);
        setError(err instanceof Error ? err.message : String(err));
        setPending(null);
      },
    );
  }, []);

  /** User-initiated navigation: mark pending (event handler → sync setState is fine), then load. */
  const navigate = useCallback(
    (target: VerseRef) => {
      setPending(target);
      setError(null);
      load(target);
    },
    [load],
  );

  // Mount: resolve the starting verse (URL → storage → default) and load it.
  useEffect(() => {
    load(readInitialRef());
  }, [load]);

  const goTo = useCallback(
    (target: VerseRef) => {
      if (!isValidRef(target)) return;
      if (sameRef(target, ref) && chapter?.key === `${target.book}.${target.chapter}`) return;
      navigate(target);
    },
    [chapter?.key, navigate, ref],
  );

  const nxt = nextRef(ref);
  const prv = prevRef(ref);
  const chapterKey = `${ref.book}.${ref.chapter}`;
  const verseText = chapter?.key === chapterKey ? chapter.text[ref.verse - 1] : null;

  let status: ScriptureStatus = "loading";
  let text: string | null = null;
  let userError: string | null = null;
  if (pending) {
    status = "loading";
  } else if (error) {
    status = "error";
    userError = "לא ניתן לטעון את הפרק. בדוק את החיבור לאינטרנט ונסה שוב.";
  } else if (verseText !== null && verseText !== undefined) {
    if (verseText === "") {
      status = "error";
      userError = "הפסוק אינו זמין ללא חיבור לאינטרנט.";
    } else {
      status = "ready";
      text = verseText;
    }
  }

  return {
    ref: pending ?? ref,
    status,
    text,
    error: userError,
    hasNext: nxt !== null,
    hasPrev: prv !== null,
    goTo,
    next: () => nxt && navigate(nxt),
    prev: () => prv && navigate(prv),
    retry: () => navigate(ref),
  };
}
