import { describe, expect, it } from "vitest";
import {
  applyPlans,
  ApifierGroup,
  ApplierApi,
  clearApplied,
  groupedTabIds,
  hashPlans,
} from "../src/core/applier";
import type { GroupPlan } from "../src/core/types";

/** In-memory fake of the Firefox tabGroups/tabs.group API for apply tests. */
function makeFakeApi(): ApplierApi & {
  groups: ApifierGroup[];
  calls: { op: string; args: unknown }[];
} {
  const groups: ApifierGroup[] = [];
  const calls: { op: string; args: unknown }[] = [];
  let nextId = 100;

  const api: ApplierApi = {
    async queryGroups() {
      calls.push({ op: "query", args: undefined });
      return groups.map((g) => ({ ...g }));
    },
    async group(opts) {
      calls.push({ op: "group", args: opts });
      if (opts.groupId !== undefined) {
        return opts.groupId;
      }
      const id = nextId++;
      groups.push({
        id,
        title: opts.create?.title ?? "",
        color: opts.create?.color ?? "grey",
        collapsed: false,
      });
      return id;
    },
    async updateGroup(groupId, props) {
      calls.push({ op: "update", args: { groupId, props } });
      const g = groups.find((x) => x.id === groupId);
      if (g) {
        if (props.title !== undefined) g.title = props.title;
        if (props.color !== undefined) g.color = props.color;
        if (props.collapsed !== undefined) g.collapsed = props.collapsed;
      }
    },
    async ungroup(tabIds) {
      calls.push({ op: "ungroup", args: tabIds });
      // Simulate Firefox: empty groups are deleted after ungrouping.
      // (The fake doesn't track membership, so this is purely a call record.)
    },
    async moveTabs(tabIds, index) {
      calls.push({ op: "move", args: { tabIds, index } });
    },
  };
  return Object.assign(api, { groups, calls });
}

function plan(key: string, ids: number[], color = "blue"): GroupPlan {
  return { key, title: key, color, collapsed: false, tabIds: ids };
}

describe("groupedTabIds", () => {
  it("keeps only tabs whose groupId is a real group id", () => {
    const ids = groupedTabIds([
      { id: 1, groupId: 5 },
      { id: 2, groupId: -1 },
      { id: 3 },
      { id: 4, groupId: 9 },
    ]);
    expect(ids).toEqual([1, 4]);
  });
});

describe("hashPlans", () => {
  it("is order-independent across groups and within tabIds", () => {
    const a: GroupPlan[] = [
      plan("a", [1, 2]),
      plan("b", [3]),
    ];
    const b: GroupPlan[] = [
      plan("b", [3]),
      plan("a", [2, 1]),
    ];
    // hashPlans sorts internally, so these are equal despite input order
    expect(hashPlans(a)).toBe(hashPlans(b));
  });

  it("changes when membership changes", () => {
    expect(hashPlans([plan("a", [1, 2])])).not.toBe(
      hashPlans([plan("a", [1, 2, 3])])
    );
  });
});

describe("applyPlans", () => {
  it("creates new groups when none exist", async () => {
    clearApplied();
    const api = makeFakeApi();
    const res = await applyPlans(1, [plan("github.com", [1, 2], "blue")], api);
    expect(res.applied).toBe(true);
    expect(res.createdGroups).toBe(1);
    expect(api.groups.length).toBe(1);
    expect(api.groups[0].title).toBe("github.com");
  });

  it("skips no-op reapplication by hash", async () => {
    clearApplied();
    const api = makeFakeApi();
    await applyPlans(1, [plan("github.com", [1, 2])], api);
    const res = await applyPlans(1, [plan("github.com", [1, 2])], api);
    expect(res.applied).toBe(false);
  });

  it("reuses an existing group with matching name", async () => {
    clearApplied();
    const api = makeFakeApi();
    api.groups.push({
      id: 7,
      title: "github.com",
      color: "red",
      collapsed: false,
    });
    const res = await applyPlans(
      1,
      [plan("github.com", [1, 2], "blue")],
      api,
      { force: true }
    );
    expect(res.reusedGroups).toBe(1);
    expect(res.createdGroups).toBe(0);
    // Update should have synced color to the plan's color.
    const updateCall = api.calls.find(
      (c) => c.op === "update"
    ) as { args: { groupId: number; props: any } };
    expect(updateCall.args.groupId).toBe(7);
    expect(updateCall.args.props.color).toBe("blue");
  });

  it("force overrides the hash guard", async () => {
    clearApplied();
    const api = makeFakeApi();
    await applyPlans(1, [plan("a", [1, 2])], api);
    const res = await applyPlans(1, [plan("a", [1, 2])], api, { force: true });
    expect(res.applied).toBe(true);
  });
});
