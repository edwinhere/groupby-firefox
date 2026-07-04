import type { GroupPlan, CandidateTab } from "./types";
import { log } from "../util/log";

/**
 * Adapter abstraction over the Firefox tabGroups / tabs.group APIs.
 *
 * Real code uses `FirefoxApplierApi`; tests pass a fake. Keeping this seam is
 * what lets apply logic be unit-tested without a browser.
 */
export interface ApplierApi {
  /** Return existing tab groups for a window. */
  queryGroups(windowId: number): Promise<ApifierGroup[]>;
  /** Group tabIds into an existing group or create one. Returns groupId. */
  group(opts: {
    windowId: number;
    tabIds: number[];
    groupId?: number;
    create?: { title: string; color: string };
  }): Promise<number>;
  /** Update title/color/collapsed on an existing group. */
  updateGroup(
    groupId: number,
    props: { title?: string; color?: string; collapsed?: boolean }
  ): Promise<void>;
  /** Remove the given tab ids from whatever groups they are in. */
  ungroup(tabIds: number[]): Promise<void>;
  /** Move tabs to consecutive positions starting at `index`. */
  moveTabs(tabIds: number[], index: number): Promise<void>;
}

export interface ApifierGroup {
  id: number;
  /** Firefox calls this `title` in the tabGroups API. */
  title: string;
  color: string;
  collapsed: boolean;
}

/**
 * Compute a stable hash of a set of plans so we can skip no-op reapplications.
 * Order-independent: tab ids are sorted within each group, and groups are
 * sorted by key before hashing.
 */
export function hashPlans(plans: GroupPlan[]): string {
  const norm = plans
    .map((p) => ({
      k: p.key,
      t: [...p.tabIds].sort((a, b) => a - b).join(","),
      title: p.title,
      color: p.color,
    }))
    .sort((a, b) => (a.k < b.k ? -1 : a.k > b.k ? 1 : 0));
  return JSON.stringify(norm);
}

/**
 * The no-op guard keeps the last applied plan hash per window so we don't
 * reshuffle tabs that are already grouped the way we want. Persisted in-memory
 * only; reset on extension reload.
 */
const lastAppliedHash = new Map<number, string>();

export function rememberApplied(windowId: number, hash: string): void {
  lastAppliedHash.set(windowId, hash);
}

export function clearApplied(windowId?: number): void {
  if (windowId === undefined) lastAppliedHash.clear();
  else lastAppliedHash.delete(windowId);
}

/**
 * Pure helper: pick the tab ids currently in a group (groupId !== -1 and set),
 * i.e. the candidates for ungrouping.
 */
export function groupedTabIds(
  tabs: Array<{ id: number; groupId?: number }>
): number[] {
  return tabs
    .filter(
      (t) => typeof t.groupId === "number" && (t.groupId as number) !== -1
    )
    .map((t) => t.id);
}

/**
 * Apply a set of desired plans to a window.
 *
 * Strategy:
 *   1. Skip entirely if the desired plan hash matches the last applied one.
 *   2. For each plan, try to reuse an existing group whose name equals the
 *      plan title. Otherwise create a new group.
 *   3. Always sync name/color/collapsed with tabGroups.update — cheap and
 *      idempotent.
 *
 * Tabs not present in any plan are intentionally left alone: we never ungroup
 * or move tabs the strategy didn't speak to. This is what makes the applier
 * non-destructive.
 */
export async function applyPlans(
  windowId: number,
  plans: GroupPlan[],
  api: ApplierApi,
  options?: { candidates?: CandidateTab[]; force?: boolean }
): Promise<{ applied: boolean; createdGroups: number; reusedGroups: number }> {
  const desiredHash = hashPlans(plans);
  if (!options?.force && lastAppliedHash.get(windowId) === desiredHash) {
    log.debug("applyPlans: no-op (hash match)", windowId);
    return { applied: false, createdGroups: 0, reusedGroups: 0 };
  }

  const existing = await api.queryGroups(windowId);

  let created = 0;
  let reused = 0;

  for (const plan of plans) {
    // Prefer a group with matching name; fall back to any group already
    // containing one of this plan's tabs.
    const byName = existing.find((g) => g.title === plan.title);

    let groupId: number;
    if (byName) {
      groupId = await api.group({
        windowId,
        tabIds: plan.tabIds,
        groupId: byName.id,
      });
      reused++;
    } else {
      groupId = await api.group({
        windowId,
        tabIds: plan.tabIds,
        create: { title: plan.title, color: plan.color },
      });
      created++;
      existing.push({
        id: groupId,
        title: plan.title,
        color: plan.color,
        collapsed: plan.collapsed,
      });
    }

    // Sync display properties. Failures here are non-fatal.
    try {
      await api.updateGroup(groupId, {
        title: plan.title,
        color: plan.color,
        collapsed: plan.collapsed,
      });
    } catch (err) {
      log.warn("updateGroup failed (non-fatal):", err);
    }
  }

  rememberApplied(windowId, desiredHash);
  log.info(
    `applyPlans: window=${windowId} created=${created} reused=${reused} plans=${plans.length}`
  );
  return { applied: true, createdGroups: created, reusedGroups: reused };
}
