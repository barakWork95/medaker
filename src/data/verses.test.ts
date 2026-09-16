import { describe, expect, it } from "vitest";
import { VERSES } from "./verses";
import snapshot from "./verses.wlc.json";

/** Same normalisation as scripts/verify-verses.mjs. */
const norm = (s: string) =>
  s.replace(/͏/g, "").replace(/־\s+/g, "־").normalize("NFD").replace(/\s+/g, " ").trim();

describe("sample verses match the WLC snapshot (refresh with `npm run verify:verses -- --write`)", () => {
  for (const v of VERSES) {
    it(`${v.id} (${v.sefariaRef})`, () => {
      const canonical = (snapshot.verses as Record<string, { ref: string; text: string }>)[v.id];
      expect(canonical, `no snapshot for ${v.id}`).toBeDefined();
      expect(canonical.ref).toBe(v.sefariaRef);
      expect(norm(v.text)).toBe(norm(canonical.text));
    });
  }
});
