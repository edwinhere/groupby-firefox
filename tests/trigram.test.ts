import { describe, expect, it } from "vitest";
import {
  trigramIntersection,
  trigramSimilarity,
  trigrams,
} from "../src/util/trigram";

describe("trigrams", () => {
  it("produces overlapping 3-char windows with padding", () => {
    expect([...trigrams("abc")]).toEqual([" ab", "abc", "bc "]);
  });

  it("normalizes case and whitespace before splitting", () => {
    expect([...trigrams("Hello   World")]).toEqual([...trigrams("hello world")]);
  });

  it("handles empty input", () => {
    expect(trigrams("").size).toBe(0);
    expect(trigrams("   ").size).toBe(0);
  });
});

describe("trigramSimilarity (Dice)", () => {
  it("is 1 for identical strings", () => {
    expect(trigramSimilarity("github.com/x", "github.com/x")).toBe(1);
  });

  it("is 0 for disjoint strings", () => {
    expect(trigramSimilarity("xyz", "qqq")).toBe(0);
  });

  it("is high for very similar URLs", () => {
    const s = trigramSimilarity(
      "https://github.com/torvalds/linux",
      "https://github.com/torvalds/linux/blob/main/README"
    );
    expect(s).toBeGreaterThan(0.6);
  });

  it("is moderate-to-low for unrelated domains", () => {
    expect(
      trigramSimilarity("github.com", "example.com")
    ).toBeLessThan(0.6);
  });

  it("treats two empty inputs as identical", () => {
    expect(trigramSimilarity("", "")).toBe(1);
  });

  it("is symmetric", () => {
    const a = trigramSimilarity("alpha beta", "beta gamma");
    const b = trigramSimilarity("beta gamma", "alpha beta");
    expect(a).toBeCloseTo(b, 10);
  });
});

describe("trigramIntersection", () => {
  it("counts shared trigrams", () => {
    // " abc " vs " abd " share " ab"; differ on the rest
    const n = trigramIntersection("abc", "abd");
    expect(n).toBeGreaterThan(0);
  });
});
