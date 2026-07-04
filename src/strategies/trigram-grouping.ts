import type {
  CandidateTab,
  GroupPlan,
  GroupingStrategy,
  Settings,
} from "../core/types";
import { colorForKey } from "../util/color";
import { trigramSimilarity } from "../util/trigram";

/**
 * Grouping strategies that cluster tabs by character-trigram similarity of a
 * per-tab field (URL, title, or domain). Uses greedy "leader" clustering:
 *
 *   1. Process tabs in a stable order (by id).
 *   2. For each tab, attach it to the first existing cluster whose seed it
 *      resembles at or above `settings.trigramThreshold`.
 *   3. Otherwise it starts a new cluster.
 *
 * Leader clustering is O(n*k) where k is the number of clusters — fine for
 * realistic tab counts — and deterministic given a stable input order, which
 * is what the applier's no-op hash guard relies on.
 *
 * The strategy id encodes the field ("trigram-url", "trigram-title",
 * "trigram-domain"); one class, three registered instances.
 */
export class TrigramGroupingStrategy implements GroupingStrategy {
  readonly id: string;
  readonly label: string;
  private readonly field: (tab: CandidateTab) => string;

  constructor(
    id: string,
    label: string,
    field: (tab: CandidateTab) => string
  ) {
    this.id = id;
    this.label = label;
    this.field = field;
  }

  nameForGroup(key: string, _settings: Settings): string {
    // Keys are encoded as "<seedLabel>::<seedId>"; show the human part.
    return key.split("::")[0] || key;
  }

  buildGroups(tabs: CandidateTab[], settings: Settings): GroupPlan[] {
    const threshold = clamp(settings.trigramThreshold, 0, 1);

    // Stable input order => deterministic clustering.
    const ordered = [...tabs].sort((a, b) => a.id - b.id);

    const clusters: { seed: CandidateTab; members: CandidateTab[] }[] = [];
    for (const tab of ordered) {
      const fieldValue = this.field(tab) ?? "";
      let placed = false;
      for (const c of clusters) {
        if (
          trigramSimilarity(fieldValue, this.field(c.seed) ?? "") >= threshold
        ) {
          c.members.push(tab);
          placed = true;
          break;
        }
      }
      if (!placed) clusters.push({ seed: tab, members: [tab] });
    }

    const plans: GroupPlan[] = [];
    for (const c of clusters) {
      if (c.members.length < 2) continue; // singleton clusters add no value
      const seedLabel = labelFor(this.field(c.seed));
      const key = `${seedLabel}::${c.seed.id}`;
      const tabIds = c.members.map((m) => m.id).sort((a, b) => a - b);
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

    plans.sort((a, b) => Math.min(...a.tabIds) - Math.min(...b.tabIds));
    return plans;
  }
}

/** Trim a long field value into a usable group label. */
function labelFor(value: string): string {
  const v = (value ?? "").trim();
  if (!v) return "similar";
  return v.length > 40 ? v.slice(0, 37) + "…" : v;
}

function clamp(n: number, lo: number, hi: number): number {
  if (!Number.isFinite(n)) return lo;
  return Math.max(lo, Math.min(hi, n));
}

/** Factory: the three built-in trigram grouping strategies. */
export function trigramGroupingStrategies(): TrigramGroupingStrategy[] {
  return [
    new TrigramGroupingStrategy(
      "trigram-url",
      "By URL similarity (trigrams)",
      (t) => t.url ?? ""
    ),
    new TrigramGroupingStrategy(
      "trigram-title",
      "By title similarity (trigrams)",
      (t) => t.title ?? ""
    ),
    new TrigramGroupingStrategy(
      "trigram-domain",
      "By domain similarity (trigrams)",
      (t) => t.registrableDomain ?? t.hostname ?? ""
    ),
  ];
}
