/**
 * URL / hostname normalization helpers. Pure and synchronous so they are easy
 * to unit-test. The registrable-domain step uses a small heuristic without a
 * Public Suffix List dependency; it is isolated in `registrableDomainFromHostname`
 * so it can be swapped for a PSL-based implementation later.
 */

/** Return a lowercased hostname for the URL, or undefined if unparseable. */
export function hostnameFromUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return undefined;
  }
  // Punycode ("xn--") is left as-is; just lowercase.
  const host = parsed.hostname.toLowerCase();
  return host || undefined;
}

/** Strip a leading "www." if present. Does not strip other subdomains. */
export function stripWww(hostname: string): string {
  return hostname.startsWith("www.") ? hostname.slice(4) : hostname;
}

/**
 * Heuristic registrable-domain reduction.
 *
 * Real registrable-domain lookup requires the Public Suffix List. To avoid the
 * dependency, we use a curated set of common multi-part suffixes (e.g. co.uk)
 * and otherwise fall back to "last two labels". This is intentionally
 * replaceable — swap this function for a PSL-backed one without touching
 * callers.
 */
const MULTI_PART_SUFFIXES = new Set([
  "co.uk",
  "gov.uk",
  "ac.uk",
  "org.uk",
  "com.au",
  "net.au",
  "org.au",
  "co.jp",
  "co.nz",
  "co.kr",
  "com.br",
  "com.cn",
  "com.tw",
  "com.hk",
  "co.in",
  "com.sg",
]);

export function registrableDomainFromHostname(hostname: string): string {
  const labels = hostname.split(".");
  if (labels.length <= 2) return hostname;
  const lastTwo = labels.slice(-2).join(".");
  const lastThree = labels.slice(-3).join(".");
  if (MULTI_PART_SUFFIXES.has(lastThree)) return lastThree;
  if (MULTI_PART_SUFFIXES.has(lastTwo)) {
    // e.g. host ending in co.uk → return last three labels
    return lastThree;
  }
  return lastTwo;
}

/**
 * Compute the grouping key for a hostname given a normalization mode.
 * Returns undefined for inputs that have no usable hostname.
 */
export function domainKey(
  hostname: string | undefined,
  mode: "hostname" | "registrableDomain",
  stripWwwPrefix: boolean
): string | undefined {
  if (!hostname) return undefined;
  let h = hostname.toLowerCase();
  if (stripWwwPrefix) h = stripWww(h);
  if (mode === "hostname") return h;
  return registrableDomainFromHostname(h);
}

/** True if the scheme / URL should never be grouped. */
