/**
 * Shared domain types. Kept free of Firefox API imports so that planning and
 * strategy code can be unit tested without a browser environment.
 */

export type NormalizationMode = "hostname" | "registrableDomain";
export type ColorMode = "deterministic" | "fixed";

/** How (or whether) to order tabs within each group after grouping. */
export type SortMode = "none" | "domain" | "hostname" | "title" | "url" | "index";

/** Versioned settings object persisted to extension storage. */
export interface Settings {
  schemaVersion: number;
  activeStrategyId: string;
  autoGroup: boolean;
  includePinned: boolean;
  normalizationMode: NormalizationMode;
  /** Lowercased hostnames never to group, e.g. "mail.google.com". */
  excludedDomains: string[];
  /** URL prefixes never to group, e.g. "about:". */
  excludedUrlPrefixes: string[];
  colorMode: ColorMode;
  /** Required when colorMode === "fixed". */
  fixedColor?: string;
  groupCollapsedByDefault: boolean;
  stripWww: boolean;
  /** Clear all tab groups in the window before applying fresh groups. */
  ungroupBeforeApply: boolean;
  /** How to order tabs within each group after grouping. "none" keeps order. */
  sortMode: SortMode;
  /** Similarity threshold in [0,1] used by trigram grouping strategies. */
  trigramThreshold: number;
  // Event-driven grouping controls.
  groupOnCreate: boolean;
  groupOnUpdated: boolean;
  groupOnMoved: boolean;
  groupOnFocusChange: boolean;
  /** Debounce window (ms) for event-driven regrouping. */
  debounceMs: number;
}

/** A minimal browser tab projection used by planners and strategies. */
export interface BrowserTab {
  id: number;
  windowId: number;
  index: number;
  pinned: boolean;
  title?: string;
  url?: string;
  groupId?: number;
}

/** A BrowserTab enriched with derived domain metadata. */
export interface CandidateTab {
  id: number;
  windowId: number;
  index: number;
  pinned: boolean;
  title?: string;
  url?: string;
  hostname?: string;
  registrableDomain?: string;
  groupId?: number;
}

/** Desired output of a strategy: one Firefox tab group worth of tabs. */
export interface GroupPlan {
  /** Stable strategy-specific key (e.g. normalized domain). */
  key: string;
  title: string;
  /** One of the Firefox tab group color names. */
  color: string;
  collapsed: boolean;
  tabIds: number[];
}

/**
 * A pluggable grouping strategy. Domain grouping is the first implementation;
 * future strategies (semantic topic, project, rule-based) implement this.
 */
export interface GroupingStrategy {
  readonly id: string;
  readonly label: string;
  /**
   * Turn a group key produced by this strategy into a human-readable name.
   * Each strategy owns this mapping: domain strategy returns the domain,
   * a future topic strategy might return "Travel ✈️", etc.
   */
  nameForGroup(key: string, settings: Settings): string;
  buildGroups(
    tabs: CandidateTab[],
    settings: Settings
  ): Promise<GroupPlan[]> | GroupPlan[];
}

/** Firefox tab-group colors, per the tabGroups API. */
export const FIREFOX_GROUP_COLORS = [
  "grey",
  "blue",
  "cyan",
  "green",
  "orange",
  "red",
  "pink",
  "purple",
] as const;

export type FirefoxGroupColor = (typeof FIREFOX_GROUP_COLORS)[number];

export const DEFAULT_SETTINGS: Settings = {
  schemaVersion: 1,
  activeStrategyId: "domain",
  autoGroup: false,
  includePinned: false,
  normalizationMode: "registrableDomain",
  excludedDomains: [],
  excludedUrlPrefixes: ["about:", "moz-extension:", "browser-extension:", "file:"],
  colorMode: "deterministic",
  groupCollapsedByDefault: false,
  stripWww: false,
  ungroupBeforeApply: false,
  sortMode: "none",
  trigramThreshold: 0.4,
  groupOnCreate: true,
  groupOnUpdated: false,
  groupOnMoved: false,
  groupOnFocusChange: false,
  debounceMs: 400,
};
