import type {
  CandidateTab,
  GroupPlan,
  GroupingStrategy,
  Settings,
} from "../core/types";
import { colorForKey } from "../util/color";
import { domainKey } from "../util/domain";

/**
 * The reference strategy: groups tabs by normalized domain.
 *
 * Planning is pure — no Firefox API calls here. Tabs that should be skipped
 * (per settings) are assumed already filtered by the planner; this strategy
 * only decides how to bucket the candidates it receives.
 */
export class DomainGroupingStrategy implements GroupingStrategy {
  readonly id = "domain";
  readonly label = "By domain";

  /** Domain keys are already human-readable — return as-is. */
  nameForGroup(key: string, _settings: Settings): string {
    return key;
  }

  buildGroups(tabs: CandidateTab[], settings: Settings): GroupPlan[] {
    const buckets = new Map<string, number[]>();

    for (const tab of tabs) {
      const key = domainKey(
        tab.hostname,
        settings.normalizationMode,
        settings.stripWww
      );
      if (!key) continue;

      if (settings.excludedDomains.includes(key)) continue;
      if (
        settings.excludedUrlPrefixes.some((prefix) =>
          tab.url?.startsWith(prefix)
        )
      ) {
        continue;
      }

      const bucket = buckets.get(key);
      if (bucket) bucket.push(tab.id);
      else buckets.set(key, [tab.id]);
    }

    const plans: GroupPlan[] = [];
    for (const [key, tabIds] of buckets) {
      // A single tab need not form its own group — that would just add chrome
      // without benefit. (Configurable later; default to grouping >=2.)
      if (tabIds.length < 2) continue;

      plans.push({
        key,
        title: this.nameForGroup(key, settings),
        color:
          settings.colorMode === "fixed" && settings.fixedColor
            ? settings.fixedColor
            : colorForKey(key),
        collapsed: settings.groupCollapsedByDefault,
        tabIds,
      });
    }

    // Stable order by first tab id so plans are comparable across runs.
    plans.sort((a, b) => Math.min(...a.tabIds) - Math.min(...b.tabIds));
    return plans;
  }
}
