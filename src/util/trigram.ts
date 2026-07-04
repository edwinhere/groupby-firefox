/**
 * Character-trigram utilities for fuzzy "similar to" comparisons.
 *
 * A trigram set is built by left/right-padding the lowercased string with a
 * space and sliding a window of size 3. Similarity is the Dice coefficient:
 *
 *   sim = 2 * |A ∩ B| / (|A| + |B|)
 *
 * returning a value in [0, 1] where 1 means identical trigram sets. Dice is
 * cheap, symmetric, and tolerant of small typos / reordering, which is what we
 * want for grouping "similar" URLs, titles, or domains.
 *
 * Kept pure so it is trivially unit-testable.
 */

const PAD = " ";

/** Lowercase + collapse whitespace so comparison is forgiving. */
function normalize(input: string): string {
  return input.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Return the set of character trigrams for a string. */
export function trigrams(input: string): Set<string> {
  const s = PAD + normalize(input) + PAD;
  const out = new Set<string>();
  if (s.length < 3) {
    if (s.trim().length > 0) out.add(s.trim());
    return out;
  }
  for (let i = 0; i <= s.length - 3; i++) {
    out.add(s.slice(i, i + 3));
  }
  return out;
}

/** Number of shared trigrams between two strings. */
export function trigramIntersection(a: string, b: string): number {
  const A = trigrams(a);
  let n = 0;
  for (const g of trigrams(b)) if (A.has(g)) n++;
  return n;
}

/** Dice similarity coefficient over trigram sets, in [0, 1]. */
export function trigramSimilarity(a: string, b: string): number {
  const A = trigrams(a);
  const B = trigrams(b);
  if (A.size === 0 && B.size === 0) return 1;
  if (A.size === 0 || B.size === 0) return 0;
  let inter = 0;
  // Iterate the smaller set for speed.
  const [small, large] = A.size <= B.size ? [A, B] : [B, A];
  for (const g of small) if (large.has(g)) inter++;
  return (2 * inter) / (A.size + B.size);
}
