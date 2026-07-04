import type {
  BrowserTab,
  CandidateTab,
  GroupPlan,
  Settings,
} from "./types";
import { hostnameFromUrl, registrableDomainFromHostname } from "../util/domain";
import { getStrategyOrThrow, registerStrategy } from "../strategies/grouping-strategy";
import { DomainGroupingStrategy } from "../strategies/domain-grouping";
import { trigramGroupingStrategies } from "../strategies/trigram-grouping";
import { registerTrigramSortStrategies } from "../strategies/sort-strategy";

let registered = false;
/** Idempotent: ensure the default strategies exist in the registries. */
export function ensureStrategiesRegistered(): void {
  if (registered) return;
  registerStrategy(new DomainGroupingStrategy());
  for (const s of trigramGroupingStrategies()) registerStrategy(s);
  registerTrigramSortStrategies();
  registered = true;
}

/** Decide whether a tab is a candidate for grouping under current settings. */
export function shouldConsider(
  tab: BrowserTab,
  settings: Settings
): boolean {
  if (!tab.id || tab.id < 0) return false;
  if (tab.pinned && !settings.includePinned) return false;
  if (!tab.url) return false;
  if (settings.excludedUrlPrefixes.some((p) => tab.url!.startsWith(p))) {
    return false;
  }
  const host = hostnameFromUrl(tab.url);
  if (!host) return false;
  return true;
}

/** Project a raw browser tab into an enriched candidate. */
export function toCandidate(tab: BrowserTab): CandidateTab {
  const hostname = hostnameFromUrl(tab.url);
  return {
    id: tab.id,
    windowId: tab.windowId,
    index: tab.index,
    pinned: tab.pinned,
    title: tab.title,
    url: tab.url,
    hostname,
    registrableDomain: hostname
      ? registrableDomainFromHostname(hostname)
      : undefined,
    groupId: tab.groupId,
  };
}

/**
 * Pure planner: turn a set of raw tabs into desired group plans using the
 * active strategy. Performs no mutation — the applier does that.
 */
export async function planGroups(
  tabs: BrowserTab[],
  settings: Settings
): Promise<{ plans: GroupPlan[]; candidates: CandidateTab[]; skipped: BrowserTab[] }> {
  ensureStrategiesRegistered();
  const strategy = getStrategyOrThrow(settings.activeStrategyId);

  const skipped: BrowserTab[] = [];
  const candidates: CandidateTab[] = [];
  for (const tab of tabs) {
    if (shouldConsider(tab, settings)) candidates.push(toCandidate(tab));
    else skipped.push(tab);
  }

  const plans = await strategy.buildGroups(candidates, settings);
  return { plans, candidates, skipped };
}

/** Compact summary for UI display. */
export function summarizePlans(
  plans: GroupPlan[],
  totalTabs: number
): string {
  const groupedTabs = plans.reduce((n, p) => n + p.tabIds.length, 0);
  return `${plans.length} group${plans.length === 1 ? "" : "s"} / ${groupedTabs} of ${totalTabs} tabs grouped`;
}
