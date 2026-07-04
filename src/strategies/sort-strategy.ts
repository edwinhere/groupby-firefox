import type { CandidateTab } from "../core/types";
import { trigramSimilarity } from "../util/trigram";

/**
 * A pluggable within-group sort strategy. Implementations provide either:
 *   - `key`: an absolute per-tab value (sorted ascending), or
 *   - `sort`: a full-array reorder (for relative / pairwise strategies like
 *     trigram chaining, where "closeness" depends on the other tabs).
 *
 * Mirrors the GroupingStrategy pattern so future sort strategies (e.g.
 * "by last accessed", "by recency of visit", "custom rules") can plug in
 * without touching the controller.
 */
export interface SortStrategy {
  readonly id: string;
  readonly label: string;
  key?(tab: CandidateTab): string | number;
  sort?(tabs: CandidateTab[]): CandidateTab[];
}

const byDomain: SortStrategy = {
  id: "domain",
  label: "Domain",
  key: (t) => t.registrableDomain ?? t.hostname ?? "",
};

const byHostname: SortStrategy = {
  id: "hostname",
  label: "Hostname",
  key: (t) => t.hostname ?? "",
};

const byTitle: SortStrategy = {
  id: "title",
  label: "Tab title",
  key: (t) => (t.title ?? "").toLowerCase(),
};

const byUrl: SortStrategy = {
  id: "url",
  label: "URL",
  key: (t) => t.url ?? "",
};

const byIndex: SortStrategy = {
  id: "index",
  label: "Original tab order",
  key: (t) => t.index,
};

const ALL: SortStrategy[] = [byDomain, byHostname, byTitle, byUrl, byIndex];

const registry = new Map<string, SortStrategy>(ALL.map((s) => [s.id, s]));

export function registerSortStrategy(strategy: SortStrategy): void {
  registry.set(strategy.id, strategy);
}

export function getSortStrategy(id: string): SortStrategy | undefined {
  return registry.get(id);
}

export function listSortStrategies(): SortStrategy[] {
  return Array.from(registry.values());
}

/**
 * Pure: return a new array of tabs sorted ascending by the strategy's key,
 * or reordered via the strategy's `sort` for relative strategies. Stable for
 * equal keys (Array.prototype.sort is stable in modern engines). Throws if
 * the strategy id is unknown so misuse surfaces early.
 */
export function sortByStrategy(
  tabs: CandidateTab[],
  strategyId: string
): CandidateTab[] {
  const strategy = registry.get(strategyId);
  if (!strategy) throw new Error(`Unknown sort strategy: ${strategyId}`);
  if (strategy.sort) return strategy.sort([...tabs]);
  if (!strategy.key) return [...tabs];
  const keyed = tabs.map((t) => ({ t, k: strategy.key!(t) }));
  keyed.sort((a, b) => {
    if (typeof a.k === "number" && typeof b.k === "number") return a.k - b.k;
    const as = String(a.k);
    const bs = String(b.k);
    return as < bs ? -1 : as > bs ? 1 : 0;
  });
  return keyed.map((x) => x.t);
}

/**
 * Relative trigram-chain sort: greedily build a nearest-neighbour path so that
 * each consecutive pair of tabs is the most similar remaining option. Tabs that
 * resemble each other end up adjacent. O(n^2) — fine for tab-group sizes.
 */
function trigramChainSort(
  tabs: CandidateTab[],
  field: (t: CandidateTab) => string
): CandidateTab[] {
  if (tabs.length <= 1) return [...tabs];
  const remaining = [...tabs];
  const result: CandidateTab[] = [remaining.shift()!];
  while (remaining.length > 0) {
    const last = result[result.length - 1];
    const lastField = field(last) ?? "";
    let bestIdx = 0;
    let bestSim = -1;
    for (let i = 0; i < remaining.length; i++) {
      const sim = trigramSimilarity(lastField, field(remaining[i]) ?? "");
      if (sim > bestSim) {
        bestSim = sim;
        bestIdx = i;
      }
    }
    result.push(remaining.splice(bestIdx, 1)[0]);
  }
  return result;
}

/** Register the built-in trigram sort strategies. Idempotent. */
export function registerTrigramSortStrategies(): void {
  const make = (
    id: string,
    label: string,
    field: (t: CandidateTab) => string
  ): SortStrategy => ({
    id,
    label,
    sort: (tabs) => trigramChainSort(tabs, field),
  });
  registerSortStrategy(
    make("trigram-url", "URL similarity (trigrams)", (t) => t.url ?? "")
  );
  registerSortStrategy(
    make("trigram-title", "Title similarity (trigrams)", (t) => t.title ?? "")
  );
  registerSortStrategy(
    make(
      "trigram-domain",
      "Domain similarity (trigrams)",
      (t) => t.registrableDomain ?? t.hostname ?? ""
    )
  );
}
