import browser from "webextension-polyfill";
import type { ApifierGroup, ApplierApi } from "../core/applier";
import { isValidColor } from "./color";
import { FIREFOX_GROUP_COLORS } from "../core/types";
import { log } from "./log";

/**
 * Firefox implementation of ApplierApi.
 *
 * Firefox (>=138) exposes:
 *   - browser.tabs.group({ createProperties?, groupId?, tabIds }) -> groupId
 *   - browser.tabGroups.query({ windowId }) -> TabGroup[]
 *   - browser.tabGroups.update(groupId, { name, color, collapsed })
 *
 * There is no `tabs.ungroup()` on Firefox; tabs leave a group simply by being
 * grouped elsewhere, so we don't expose ungrouping here.
 */
export class FirefoxApplierApi implements ApplierApi {
  async queryGroups(windowId: number): Promise<ApifierGroup[]> {
    const groups = await browser.tabGroups.query({ windowId });
    return (groups as any[]).map((g) => ({
      id: g.id as number,
      // Firefox's tabGroups API exposes the label as `title`.
      title: (g.title ?? "") as string,
      color: g.color as string,
      collapsed: !!g.collapsed,
    }));
  }

  async group(opts: {
    windowId: number;
    tabIds: number[];
    groupId?: number;
    create?: { title: string; color: string };
  }): Promise<number> {
    // Per MDN, tabs.group createProperties only accepts windowId. The title
    // and color are applied separately via tabGroups.update() (see below).
    const req: any = { tabIds: opts.tabIds };
    if (opts.groupId !== undefined) {
      req.groupId = opts.groupId;
    } else {
      req.createProperties = { windowId: opts.windowId };
    }
    const groupId = await browser.tabs.group(req);
    return groupId as number;
  }

  async updateGroup(
    groupId: number,
    props: { title?: string; color?: string; collapsed?: boolean }
  ): Promise<void> {
    const update: any = {};
    if (props.title !== undefined) update.title = props.title;
    if (props.color !== undefined) update.color = sanitizeColor(props.color);
    if (props.collapsed !== undefined) update.collapsed = props.collapsed;
    if (Object.keys(update).length === 0) return;
    await browser.tabGroups.update(groupId, update);
  }

  async ungroup(tabIds: number[]): Promise<void> {
    if (tabIds.length === 0) return;
    // tabs.ungroup removes the tabs from their groups; empty groups are
    // deleted by Firefox automatically.
    await browser.tabs.ungroup(tabIds);
  }

  async moveTabs(tabIds: number[], index: number): Promise<void> {
    if (tabIds.length === 0) return;
    // tabs.move places the listed tabs into consecutive positions starting at
    // `index`. Used to reorder tabs within an already-formed group.
    await browser.tabs.move(tabIds, { index });
  }
}

function sanitizeColor(color: string): string {
  if (isValidColor(color)) return color;
  log.warn(`Invalid group color "${color}", falling back to grey.`);
  return "grey";
}

/** Coerce a raw tabs.query result row into the shared BrowserTab shape. */
export function toBrowserTab(raw: any): import("../core/types").BrowserTab {
  return {
    id: raw.id,
    windowId: raw.windowId,
    index: raw.index,
    pinned: !!raw.pinned,
    title: raw.title,
    url: raw.url,
    groupId: raw.groupId,
  };
}

export { FIREFOX_GROUP_COLORS };
