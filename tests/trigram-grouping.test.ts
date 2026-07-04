import { describe, expect, it } from "vitest";
import { planGroups } from "../src/core/planner";
import type { BrowserTab, Settings } from "../src/core/types";
import { DEFAULT_SETTINGS } from "../src/core/types";

function tab(partial: Partial<BrowserTab>): BrowserTab {
  return { id: 1, windowId: 1, index: 0, pinned: false, ...partial };
}

const baseSettings: Settings = { ...DEFAULT_SETTINGS };

describe("TrigramGroupingStrategy", () => {
  it("clusters similar URLs together above threshold", async () => {
    const settings: Settings = {
      ...baseSettings,
      activeStrategyId: "trigram-url",
      trigramThreshold: 0.4,
    };
    const tabs: BrowserTab[] = [
      tab({ id: 1, url: "https://github.com/torvalds/linux", title: "linux" }),
      tab({ id: 2, url: "https://github.com/torvalds/linux/blob/main/README", title: "readme" }),
      tab({ id: 3, url: "https://example.com/something-unrelated", title: "other" }),
      tab({ id: 4, url: "https://example.com/something-unrelated-also", title: "other2" }),
    ];
    const { plans } = await planGroups(tabs, settings);
    // Expect a github cluster and an example cluster.
    expect(plans.length).toBe(2);
    const github = plans.find((p) => p.tabIds.includes(1))!;
    const example = plans.find((p) => p.tabIds.includes(3))!;
    expect(github.tabIds.sort()).toEqual([1, 2]);
    expect(example.tabIds.sort()).toEqual([3, 4]);
  });

  it("produces deterministic keys for the same input (stable hash)", async () => {
    const settings: Settings = {
      ...baseSettings,
      activeStrategyId: "trigram-title",
      trigramThreshold: 0.3,
    };
    const tabs: BrowserTab[] = [
      tab({ id: 10, url: "https://a.com/x", title: "Recipe: pancake" }),
      tab({ id: 11, url: "https://b.com/y", title: "Recipe: pancake toppings" }),
      tab({ id: 12, url: "https://c.com/z", title: "Weather forecast" }),
    ];
    const a = await planGroups(tabs, settings);
    const b = await planGroups(tabs, settings);
    expect(a.plans.map((p) => p.key)).toEqual(b.plans.map((p) => p.key));
    // Two recipe tabs cluster together; weather is a singleton (dropped).
    expect(a.plans.length).toBe(1);
    expect(a.plans[0].tabIds.sort()).toEqual([10, 11]);
  });

  it("respects a higher threshold by splitting clusters", async () => {
    const low: Settings = {
      ...baseSettings,
      activeStrategyId: "trigram-domain",
      trigramThreshold: 0.2,
    };
    const high: Settings = { ...low, trigramThreshold: 0.9 };
    const tabs: BrowserTab[] = [
      tab({ id: 1, url: "https://docs.github.com", title: "docs" }),
      tab({ id: 2, url: "https://github.com", title: "gh" }),
      tab({ id: 3, url: "https://github.com", title: "gh2" }),
    ];
    // domains: docs.github.com vs github.com — share "github.com" so low thr merges.
    const lowPlans = (await planGroups(tabs, low)).plans;
    const highPlans = (await planGroups(tabs, high)).plans;
    expect(lowPlans.length).toBeGreaterThanOrEqual(highPlans.length);
  });
});
