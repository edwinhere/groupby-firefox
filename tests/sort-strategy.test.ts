import { describe, expect, it } from "vitest";
import {
  listSortStrategies,
  registerSortStrategy,
  registerTrigramSortStrategies,
  sortByStrategy,
} from "../src/strategies/sort-strategy";
import type { CandidateTab } from "../src/core/types";

function tab(partial: Partial<CandidateTab>): CandidateTab {
  return {
    id: 0,
    windowId: 1,
    index: 0,
    pinned: false,
    ...partial,
  };
}

describe("sortByStrategy", () => {
  const tabs: CandidateTab[] = [
    tab({ id: 1, index: 0, hostname: "z.example.com", registrableDomain: "example.com", title: "Zebra", url: "https://z.example.com/z" }),
    tab({ id: 2, index: 1, hostname: "a.example.com", registrableDomain: "example.com", title: "apple", url: "https://a.example.com/a" }),
    tab({ id: 3, index: 2, hostname: "m.example.com", registrableDomain: "example.com", title: "Monkey", url: "https://m.example.com/m" }),
  ];

  it("sorts by hostname ascending", () => {
    const ids = sortByStrategy(tabs, "hostname").map((t) => t.id);
    expect(ids).toEqual([2, 3, 1]);
  });

  it("sorts by title case-insensitively", () => {
    const ids = sortByStrategy(tabs, "title").map((t) => t.id);
    // apple, Monkey, Zebra
    expect(ids).toEqual([2, 3, 1]);
  });

  it("sorts by url ascending", () => {
    const ids = sortByStrategy(tabs, "url").map((t) => t.id);
    expect(ids).toEqual([2, 3, 1]);
  });

  it("sorts by original index", () => {
    const ids = sortByStrategy([...tabs].reverse(), "index").map((t) => t.id);
    expect(ids).toEqual([1, 2, 3]);
  });

  it("is stable for equal keys", () => {
    // All same domain key -> input order preserved.
    const ids = sortByStrategy(tabs, "domain").map((t) => t.id);
    expect(ids).toEqual([1, 2, 3]);
  });

  it("throws on unknown strategy", () => {
    expect(() => sortByStrategy(tabs, "nope")).toThrow();
  });
});

describe("trigram sort strategies", () => {
  it("chain-sorts tabs by URL similarity so adjacent tabs are similar", () => {
    registerTrigramSortStrategies();
    const tabs: CandidateTab[] = [
      tab({ id: 1, url: "https://github.com/a" }),
      tab({ id: 2, url: "https://weather.com/w" }),
      tab({ id: 3, url: "https://github.com/a/b" }),
      tab({ id: 4, url: "https://weather.com/w/x" }),
    ];
    const sorted = sortByStrategy(tabs, "trigram-url").map((t) => t.id);
    // First tab is the seed (id 1). Nearest neighbor chains alternate gh/w.
    expect(sorted[0]).toBe(1);
    // The two github tabs should be adjacent and the two weather adjacent.
    const gh = sorted.filter((id) => [1, 3].includes(id));
    const w = sorted.filter((id) => [2, 4].includes(id));
    expect(gh).toEqual([1, 3]);
    expect(w).toEqual([2, 4]);
  });

  it("chain-sorts by domain similarity", () => {
    registerTrigramSortStrategies();
    const tabs: CandidateTab[] = [
      tab({ id: 1, hostname: "mail.google.com", registrableDomain: "google.com" }),
      tab({ id: 2, hostname: "docs.example.com", registrableDomain: "example.com" }),
      tab({ id: 3, hostname: "drive.google.com", registrableDomain: "google.com" }),
      tab({ id: 4, hostname: "www.example.com", registrableDomain: "example.com" }),
    ];
    const sorted = sortByStrategy(tabs, "trigram-domain").map((t) => t.id);
    expect(sorted[0]).toBe(1);
    // google tabs adjacent, example tabs adjacent
    expect(sorted).toEqual([1, 3, 2, 4]);
  });
});

describe("sort strategy registry", () => {
  it("lists built-in strategies", () => {
    const ids = listSortStrategies().map((s) => s.id);
    expect(ids).toContain("domain");
    expect(ids).toContain("title");
    expect(ids).not.toContain("none");
  });

  it("supports registering a custom strategy", () => {
    registerSortStrategy({
      id: "custom-test",
      label: "Test",
      key: (t) => -t.index, // descending index
    });
    const tabs: CandidateTab[] = [
      tab({ id: 1, index: 0 }),
      tab({ id: 2, index: 5 }),
      tab({ id: 3, index: 2 }),
    ];
    const ids = sortByStrategy(tabs, "custom-test").map((t) => t.id);
    expect(ids).toEqual([2, 3, 1]);
  });
});
