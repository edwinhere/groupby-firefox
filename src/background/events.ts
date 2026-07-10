import type { Settings } from "../core/types";
import type { CandidateTab } from "../core/types";
import { planGroups, toCandidate } from "../core/planner";
import { applyPlans, clearApplied, groupedTabIds } from "../core/applier";
import { FirefoxApplierApi, toBrowserTab } from "../util/firefox-api";
import { sortByStrategy } from "../strategies/sort-strategy";
import { debounce } from "../util/debounce";
import { log } from "../util/log";

/**
 * Event wiring. Manual grouping is always available; auto-grouping listeners
 * are attached/removed when settings change so we never react to events the
 * user has disabled.
 *
 * Guardrails:
 *   - All event triggers funnel through a single debounced "scheduleGrouping"
 *     for the active window, so bursts of tab events produce one regroup.
 *   - We track an in-flight flag to avoid re-entrant applies.
 *   - The applier's plan-hash guard prevents no-op reapplication even when an
 *     event does slip through, which is what stops feedback loops: grouping
 *     tabs does fire tab move/attach events, but the next apply is a no-op.
 */

export interface GroupingController {
  /** Group tabs in a specific window now. */
  runForWindow(windowId: number, opts?: { force?: boolean }): Promise<void>;
  /** Group tabs in the currently active window now. */
  runForActiveWindow(opts?: { force?: boolean }): Promise<void>;
  /** Remove every grouped tab in the window from its group. Returns count. */
  ungroupWindow(windowId: number): Promise<number>;
  /** Same, for the currently active window. */
  ungroupActiveWindow(): Promise<number>;
  /** Re-sort tabs within each group in the window per settings.sortMode. */
  sortWindow(windowId: number): Promise<number>;
  /** Same, for the currently active window. */
  sortActiveWindow(): Promise<number>;
  /** Dry-run: return plans without mutating anything. */
  preview(windowId: number): Promise<{ groups: number; tabs: number; summary: string }>;
  /** Reconfigure listeners after settings change. */
  attach(settings: Settings): void;
  dispose(): void;
}

export function createController(): GroupingController {
  const api = new FirefoxApplierApi();
  let currentSettings: Settings | null = null;
  let inFlight = false;

  // Bound listeners we can remove later.
  const listeners: Array<{ add: () => void; remove: () => void }> = [];

  let scheduleTimer: ReturnType<typeof setTimeout> | null = null;

  const scheduleGrouping = (windowId: number) => {
    if (!currentSettings) return;
    const wait = Math.max(0, currentSettings.debounceMs | 0);
    if (scheduleTimer) clearTimeout(scheduleTimer);
    scheduleTimer = setTimeout(() => {
      scheduleTimer = null;
      void runForWindow(windowId);
    }, wait);
  };

  async function runForWindow(
    windowId: number,
    opts?: { force?: boolean }
  ): Promise<void> {
    if (!currentSettings) return;
    if (inFlight) {
      log.debug("runForWindow: skipping, already in flight");
      return;
    }
    inFlight = true;
    try {
      // Optional clean slate: clear existing groups first. We must force the
      // apply afterwards (the plan hash would otherwise suppress it).
      let force = opts?.force ?? false;
      if (currentSettings.ungroupBeforeApply) {
        await ungroupWindow(windowId);
        force = true;
      }
      const rawTabs = await browser.tabs.query({ windowId });
      const tabs = (rawTabs as any[]).map(toBrowserTab);
      const { plans, candidates } = await planGroups(tabs, currentSettings);
      await applyPlans(windowId, plans, api, { force, candidates });
      if (currentSettings.sortMode !== "none") {
        await sortWindow(windowId);
      }
    } catch (err) {
      log.error("runForWindow failed:", err);
    } finally {
      inFlight = false;
    }
  }

  /**
   * Reorder tabs within each existing group according to settings.sortMode.
   * Operates on the current on-screen state: re-queries tabs, groups them by
   * their current groupId, and moves each group's tabs to its own minimum
   * index in sorted order. Groups are processed left-to-right so moves don't
   * invalidate later indexes.
   */
  async function sortWindow(windowId: number): Promise<number> {
    if (!currentSettings || currentSettings.sortMode === "none") return 0;
    try {
      const rawTabs = (await browser.tabs.query({ windowId })) as any[];
      const candidates: CandidateTab[] = rawTabs
        .map(toBrowserTab)
        .filter(
          (t) => typeof t.groupId === "number" && (t.groupId as number) !== -1
        )
        .map(toCandidate);

      const byGroup = new Map<number, CandidateTab[]>();
      for (const c of candidates) {
        const gid = c.groupId as number;
        const arr = byGroup.get(gid) ?? [];
        arr.push(c);
        byGroup.set(gid, arr);
      }

      // Left-to-right by each group's leftmost tab.
      const entries = [...byGroup.entries()].sort(
        (a, b) =>
          Math.min(...a[1].map((t) => t.index)) -
          Math.min(...b[1].map((t) => t.index))
      );

      let moved = 0;
      for (const [, groupTabs] of entries) {
        const sorted = sortByStrategy(groupTabs, currentSettings.sortMode);
        const minIndex = Math.min(...groupTabs.map((t) => t.index));
        const ids = sorted.map((t) => t.id);
        if (ids.length > 1) {
          await api.moveTabs(ids, minIndex);
          moved += ids.length;
        }
      }
      log.info(
        `sortWindow: window=${windowId} mode=${currentSettings.sortMode} moved=${moved}`
      );
      return moved;
    } catch (err) {
      log.error("sortWindow failed:", err);
      return 0;
    }
  }

  async function ungroupWindow(windowId: number): Promise<number> {
    try {
      const rawTabs = await browser.tabs.query({ windowId });
      const ids = groupedTabIds((rawTabs as any[]).map(toBrowserTab));
      if (ids.length === 0) return 0;
      await api.ungroup(ids);
      // Invalidate the no-op guard: the window no longer matches last plan.
      clearApplied(windowId);
      log.info(`ungroupWindow: window=${windowId} removed ${ids.length} tabs from groups`);
      return ids.length;
    } catch (err) {
      log.error("ungroupWindow failed:", err);
      return 0;
    }
  }

  async function ungroupActiveWindow(): Promise<number> {
    const wins = await browser.windows.getAll({
      windowTypes: ["normal"],
    });
    const active = (wins as any[]).find((w) => w.focused) ?? wins[0];
    if (!active) return 0;
    return ungroupWindow(active.id);
  }

  async function sortActiveWindow(): Promise<number> {
    const wins = await browser.windows.getAll({
      windowTypes: ["normal"],
    });
    const active = (wins as any[]).find((w) => w.focused) ?? wins[0];
    if (!active) return 0;
    return sortWindow(active.id);
  }

  async function runForActiveWindow(opts?: { force?: boolean }): Promise<void> {
    const wins = await browser.windows.getAll({
      windowTypes: ["normal"],
    });
    const active = (wins as any[]).find((w) => w.focused) ?? wins[0];
    if (!active) return;
    await runForWindow(active.id, opts);
  }

  async function preview(windowId: number) {
    if (!currentSettings) throw new Error("Controller not attached");
    const rawTabs = await browser.tabs.query({ windowId });
    const tabs = (rawTabs as any[]).map(toBrowserTab);
    const { plans } = await planGroups(tabs, currentSettings);
    const grouped = plans.reduce((n, p) => n + p.tabIds.length, 0);
    return {
      groups: plans.length,
      tabs: grouped,
      summary: `${plans.length} groups / ${grouped} of ${tabs.length} tabs grouped`,
    };
  }

  function attach(settings: Settings): void {
    currentSettings = settings;
    // Remove any previously attached listeners.
    for (const l of listeners) l.remove();
    listeners.length = 0;

    if (!settings.autoGroup) return;

    if (settings.groupOnCreate) {
      const onCreate = (tab: { windowId?: number; id?: number }) => {
        if (typeof tab.windowId === "number") scheduleGrouping(tab.windowId);
      };
      browser.tabs.onCreated.addListener(onCreate);
      listeners.push({
        add: () => browser.tabs.onCreated.addListener(onCreate),
        remove: () => browser.tabs.onCreated.removeListener(onCreate),
      });
    }

    if (settings.groupOnUpdated) {
      const onUpdated = (
        _tabId: number,
        _info: unknown,
        tab: { windowId?: number }
      ) => {
        if (typeof tab.windowId === "number") scheduleGrouping(tab.windowId);
      };
      browser.tabs.onUpdated.addListener(onUpdated);
      listeners.push({
        add: () => browser.tabs.onUpdated.addListener(onUpdated),
        remove: () => browser.tabs.onUpdated.removeListener(onUpdated),
      });
    }

    if (settings.groupOnMoved) {
      const onMoved = (tab: { windowId?: number }) => {
        if (typeof tab.windowId === "number") scheduleGrouping(tab.windowId);
      };
      browser.tabs.onMoved.addListener(onMoved);
      listeners.push({
        add: () => browser.tabs.onMoved.addListener(onMoved),
        remove: () => browser.tabs.onMoved.removeListener(onMoved),
      });
    }

    if (settings.groupOnFocusChange) {
      const onFocus = (windowId: number) => {
        scheduleGrouping(windowId);
      };
      browser.windows.onFocusChanged.addListener(onFocus);
      listeners.push({
        add: () => browser.windows.onFocusChanged.addListener(onFocus),
        remove: () => browser.windows.onFocusChanged.removeListener(onFocus),
      });
    }
  }

  function dispose(): void {
    for (const l of listeners) l.remove();
    listeners.length = 0;
    if (scheduleTimer) clearTimeout(scheduleTimer);
    currentSettings = null;
  }

  return {
    runForWindow,
    runForActiveWindow,
    ungroupWindow,
    ungroupActiveWindow,
    sortWindow,
    sortActiveWindow,
    preview,
    attach,
    dispose,
  };
}

/** Unused but kept available: explicit trailing-edge scheduler helper. */
export function makeScheduler(wait: number, fn: () => void) {
  return debounce(fn, wait);
}
