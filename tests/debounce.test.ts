import { describe, expect, it } from "vitest";
import { debounce } from "../src/util/debounce";

describe("debounce", () => {
  it("coalesces rapid calls into one trailing invocation", async () => {
    let calls = 0;
    const fn = debounce((n: number) => {
      calls++;
      expect(n).toBe(3);
    }, 20);
    fn(1);
    fn(2);
    fn(3);
    await new Promise((r) => setTimeout(r, 60));
    expect(calls).toBe(1);
  });

  it("cancel prevents the trailing call", async () => {
    let calls = 0;
    const fn = debounce(() => calls++, 20);
    fn();
    fn.cancel();
    await new Promise((r) => setTimeout(r, 60));
    expect(calls).toBe(0);
  });

  it("flush invokes immediately", async () => {
    let calls = 0;
    const fn = debounce(() => calls++, 100);
    fn();
    fn.flush();
    expect(calls).toBe(1);
  });
});
