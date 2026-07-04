import { FIREFOX_GROUP_COLORS, type FirefoxGroupColor } from "../core/types";

/**
 * Deterministic color selection from a string key via FNV-1a hash. Stable
 * across runs and machines, so a given domain always maps to the same color.
 */
export function hashString(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    // h *= 0x01000193 (FNV prime), kept in 32-bit space.
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h >>> 0;
}

/** Validate that a color name is accepted by the Firefox tabGroups API. */
export function isValidColor(color: string): color is FirefoxGroupColor {
  return (FIREFOX_GROUP_COLORS as readonly string[]).includes(color);
}

/** Deterministic color for a key. */
export function colorForKey(key: string): FirefoxGroupColor {
  const idx = hashString(key) % FIREFOX_GROUP_COLORS.length;
  return FIREFOX_GROUP_COLORS[idx];
}
