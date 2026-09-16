import { afterEach, describe, expect, it, vi } from "vitest";
import { clearChapterCache, fetchChapterFromSefaria, loadChapter, normalizeVerseText } from "./loader";
import { verseCount } from "./index";

const jsonResponse = (body: unknown, ok = true, status = 200) =>
  ({ ok, status, json: async () => body }) as unknown as Response;

const fakeChapter = (book: string, chapter: number, prefix = "v") =>
  Array.from({ length: verseCount(book, chapter) }, (_, i) => `${prefix}${i + 1}`);

const sefariaPayload = (text: string[]) => ({
  versions: [
    { versionTitle: "Miqra according to the Masorah", text: text.map((t) => `<b>${t}</b>`) },
    { versionTitle: "Tanach with Ta'amei Hamikra", text },
  ],
});

afterEach(() => {
  clearChapterCache();
  vi.restoreAllMocks();
});

describe("normalizeVerseText", () => {
  it("strips markup, entities, CGJ and spaces after maqaf", () => {
    expect(normalizeVerseText("<big>בְּ</big>רֵאשִׁ֖ית&thinsp;<b>׀</b> עַל־ פְּנֵ֣י͏")).toBe("בְּרֵאשִׁ֖ית ׀ עַל־פְּנֵ֣י");
  });
});

describe("fetchChapterFromSefaria", () => {
  it("requests the WLC version and picks it out of the payload", async () => {
    const text = fakeChapter("Genesis", 2);
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      expect(String(url)).toContain("/api/v3/texts/Genesis.2");
      expect(String(url)).toContain(encodeURIComponent("Tanach with Ta'amei Hamikra"));
      return jsonResponse(sefariaPayload(text));
    });
    await expect(fetchChapterFromSefaria("Genesis", 2, fetchImpl as unknown as typeof fetch)).resolves.toEqual(text);
  });

  it("encodes multi-word books and rejects bad responses", async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      expect(String(url)).toContain(encodeURIComponent("I.Samuel.3"));
      return jsonResponse({}, false, 500);
    });
    await expect(fetchChapterFromSefaria("I Samuel", 3, fetchImpl as unknown as typeof fetch)).rejects.toThrow(/HTTP 500/);
  });

  it("rejects a chapter with the wrong verse count", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(sefariaPayload(["only one"])));
    await expect(fetchChapterFromSefaria("Genesis", 1, fetchImpl as unknown as typeof fetch)).rejects.toThrow(/expected 31/);
  });
});

describe("loadChapter", () => {
  it("caches in memory and de-duplicates concurrent loads", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(sefariaPayload(fakeChapter("Exodus", 20))));
    const opts = { fetchImpl: fetchImpl as unknown as typeof fetch, noStorage: true };
    const [a, b] = await Promise.all([loadChapter("Exodus", 20, opts), loadChapter("Exodus", 20, opts)]);
    expect(a).toBe(b);
    await loadChapter("Exodus", 20, opts);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("falls back to the bundled seed verses when the network fails", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("offline");
    });
    const text = await loadChapter("Genesis", 1, { fetchImpl: fetchImpl as unknown as typeof fetch, noStorage: true });
    expect(text).toHaveLength(31);
    expect(text[0]).toBe("בְּרֵאשִׁ֖ית בָּרָ֣א אֱלֹהִ֑ים אֵ֥ת הַשָּׁמַ֖יִם וְאֵ֥ת הָאָֽרֶץ׃".normalize("NFD"));
    expect(text[6]).toContain("הָרָקִיעַ֒"); // Gen 1:7 seed
    expect(text[3]).toBe(""); // not seeded
    // seeds are not cached: the next call retries the network
    await loadChapter("Genesis", 1, { fetchImpl: fetchImpl as unknown as typeof fetch, noStorage: true });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("propagates the error when offline and no seed exists", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("offline");
    });
    await expect(loadChapter("Ruth", 1, { fetchImpl: fetchImpl as unknown as typeof fetch, noStorage: true })).rejects.toThrow("offline");
  });
});
