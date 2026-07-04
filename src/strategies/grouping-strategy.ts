import type { GroupingStrategy } from "../core/types";

/**
 * Strategy registry. New strategies register themselves here; the planner and
 * UI resolve the active strategy by id. To add a strategy, push an instance
 * into the array in `registerDefaultStrategies`.
 */

const strategies = new Map<string, GroupingStrategy>();

export function registerStrategy(strategy: GroupingStrategy): void {
  if (strategies.has(strategy.id)) {
    throw new Error(`Duplicate strategy id: ${strategy.id}`);
  }
  strategies.set(strategy.id, strategy);
}

export function getStrategy(id: string): GroupingStrategy | undefined {
  return strategies.get(id);
}

export function listStrategies(): GroupingStrategy[] {
  return Array.from(strategies.values());
}

export function getStrategyOrThrow(id: string): GroupingStrategy {
  const s = strategies.get(id);
  if (!s) throw new Error(`Unknown strategy: ${id}`);
  return s;
}
