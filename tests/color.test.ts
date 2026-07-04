import { describe, expect, it } from "vitest";
import { colorForKey, hashString, isValidColor } from "../src/util/color";

describe("hashString", () => {
  it("is deterministic and stable", () => {
    expect(hashString("github.com")).toBe(hashString("github.com"));
    expect(hashString("a")).not.toBe(hashString("b"));
  });
});

describe("colorForKey", () => {
  it("returns a valid Firefox color", () => {
    const c = colorForKey("github.com");
    expect(isValidColor(c)).toBe(true);
  });

  it("is deterministic per key", () => {
    expect(colorForKey("example.com")).toBe(colorForKey("example.com"));
  });
});
