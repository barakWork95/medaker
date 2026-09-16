"use client";

import { useSyncExternalStore } from "react";

function subscribe(fn: () => void) {
  window.addEventListener("popstate", fn);
  return () => window.removeEventListener("popstate", fn);
}

/** True when `?name` (or `?name=…`) is present in the URL. Always false during SSR/hydration. */
export function useUrlFlag(name: string): boolean {
  return useSyncExternalStore(
    subscribe,
    () => new URLSearchParams(window.location.search).has(name),
    () => false,
  );
}
