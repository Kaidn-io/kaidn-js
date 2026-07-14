import { describe, expect, it } from "vitest";
import { compareContexts } from "./context.js";

const main = {
  userAgent: "Mozilla/5.0 Chrome/124",
  hardwareConcurrency: 8,
  platform: "Win32",
  timezone: "America/New_York",
};

describe("compareContexts — main thread vs Web Worker", () => {
  it("flags when the worker reports a different userAgent (spoof missed the worker)", () => {
    const r = compareContexts(main, { ...main, userAgent: "Mozilla/5.0 Chrome/110" });
    expect(r.mismatch).toBe(true);
    expect(r.fields).toEqual(["userAgent"]);
  });

  it("flags a hardwareConcurrency or timezone disagreement", () => {
    expect(compareContexts(main, { ...main, hardwareConcurrency: 16 }).fields).toEqual(["hardwareConcurrency"]);
    expect(compareContexts(main, { ...main, timezone: "Europe/Moscow" }).fields).toEqual(["timezone"]);
  });

  it("does NOT flag an identical worker (a real browser is consistent)", () => {
    expect(compareContexts(main, { ...main }).mismatch).toBe(false);
  });

  it("fails safe when the worker snapshot is missing (no worker / CSP-blocked)", () => {
    expect(compareContexts(main, undefined)).toEqual({ mismatch: false, fields: [] });
  });

  it("ignores fields a context simply didn't expose (undefined ≠ a lie)", () => {
    const r = compareContexts(main, { userAgent: main.userAgent });
    expect(r.mismatch).toBe(false);
  });
});
