import { describe, expect, it } from "vitest";
import { planGroups, shouldConsider, toCandidate } from "../src/core/planner";
import { DomainGroupingStrategy } from "../src/strategies/domain-grouping";
import type {
  BrowserTab,
  CandidateTab,
  Settings,
} from "../src/core/types";
import { DEFAULT_SETTINGS } from "../src/core/types";

function tab(partial: Partial<BrowserTab>): BrowserTab {
  return {
    id: 1,
    windowId: 1,
    index: 0,
    pinned: false,
    ...partial,
  };
}

const baseSettings: Settings = { ...DEFAULT_SETTINGS };

describe("shouldConsider", () => {
  it("skips pinned tabs unless included", () => {
    expect(shouldConsider(tab({ id: 1, pinned: true, url: "https://x.com" }), baseSettings)).toBe(false);
    expect(
      shouldConsider(tab({ id: 1, pinned: true, url: "https://x.com" }), {
        ...baseSettings,
        includePinned: true,
      })
    ).toBe(true);
  });

  it("skips about: and other excluded prefixes", () => {
    expect(shouldConsider(tab({ id: 1, url: "about:blank" }), baseSettings)).toBe(false);
    expect(shouldConsider(tab({ id: 1, url: "moz-extension://x" }), baseSettings)).toBe(false);
  });

  it("keeps real http(s) tabs", () => {
    expect(shouldConsider(tab({ id: 1, url: "https://github.com" }), baseSettings)).toBe(true);
  });
});

describe("toCandidate", () => {
  it("derives hostname and registrable domain", () => {
    const c = toCandidate(tab({ id: 1, url: "https://Docs.GitHub.com/x" }));
    expect(c.hostname).toBe("docs.github.com");
    expect(c.registrableDomain).toBe("github.com");
  });
});

describe("planGroups (domain strategy)", () => {
  it("groups tabs by base domain when >=2 share it", async () => {
    const tabs: BrowserTab[] = [
      tab({ id: 1, url: "https://docs.github.com/a" }),
      tab({ id: 2, url: "https://github.com/b" }),
      tab({ id: 3, url: "https://example.com/c" }), // solo, no group
      tab({ id: 4, url: "https://example.com/d" }),
      tab({ id: 5, url: "about:blank" }),
    ];
    const { plans } = await planGroups(tabs, baseSettings);
    const keys = plans.map((p) => p.key).sort();
    expect(keys).toEqual(["example.com", "github.com"]);
    const gh = plans.find((p) => p.key === "github.com")!;
    expect(gh.tabIds.sort()).toEqual([1, 2]);
    expect(gh.title).toBe("github.com");
  });

  it("strategy derives group names via nameForGroup", () => {
    const strategy = new DomainGroupingStrategy();
    const settings = { ...baseSettings };
    expect(strategy.nameForGroup("github.com", settings)).toBe("github.com");
    // Plans should use nameForGroup as their title source of truth.
    expect(
      strategy.buildGroups(
        [
          { id: 1, windowId: 1, index: 0, pinned: false, hostname: "github.com", url: "https://github.com/a" },
          { id: 2, windowId: 1, index: 1, pinned: false, hostname: "github.com", url: "https://github.com/b" },
        ] as CandidateTab[],
        settings
      )[0].title
    ).toBe("github.com");
  });

  it("respects hostname mode", async () => {
    const settings: Settings = { ...baseSettings, normalizationMode: "hostname" };
    const tabs: BrowserTab[] = [
      tab({ id: 1, url: "https://docs.github.com/a" }),
      tab({ id: 2, url: "https://github.com/b" }),
      tab({ id: 3, url: "https://docs.github.com/c" }),
    ];
    const { plans } = await planGroups(tabs, settings);
    const keys = plans.map((p) => p.key).sort();
    // github.com (solo) is skipped; docs.github.com has 2
    expect(keys).toEqual(["docs.github.com"]);
  });

  it("honors excluded domains", async () => {
    const settings: Settings = {
      ...baseSettings,
      excludedDomains: ["github.com"],
    };
    const tabs: BrowserTab[] = [
      tab({ id: 1, url: "https://github.com/a" }),
      tab({ id: 2, url: "https://github.com/b" }),
      tab({ id: 3, url: "https://example.com/c" }),
      tab({ id: 4, url: "https://example.com/d" }),
    ];
    const { plans } = await planGroups(tabs, settings);
    expect(plans.map((p) => p.key)).toEqual(["example.com"]);
  });

  it("uses fixed color when configured", async () => {
    const settings: Settings = {
      ...baseSettings,
      colorMode: "fixed",
      fixedColor: "purple",
    };
    const tabs: BrowserTab[] = [
      tab({ id: 1, url: "https://x.com/a" }),
      tab({ id: 2, url: "https://x.com/b" }),
    ];
    const { plans } = await planGroups(tabs, settings);
    expect(plans[0].color).toBe("purple");
  });
});
