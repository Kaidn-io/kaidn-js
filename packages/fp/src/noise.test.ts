import { describe, expect, it } from "vitest";
import { detectNoiseInjection } from "./noise.js";

describe("detectNoiseInjection — canvas/WebGL spoof-noise tell", () => {
  it("flags when a deterministic render reads back differently across passes", () => {
    expect(
      detectNoiseInjection({ first: ["canvasA", "12345"], second: ["canvasB", "12345"] })
    ).toBe(true);
  });

  it("does NOT flag identical readings (real deterministic hardware)", () => {
    expect(
      detectNoiseInjection({ first: ["canvasA", "12345"], second: ["canvasA", "12345"] })
    ).toBe(false);
  });

  it("never flags Brave (its farbling is legitimate privacy noise)", () => {
    expect(
      detectNoiseInjection({ first: ["a"], second: ["b"], isBrave: true })
    ).toBe(false);
  });

  it("fails safe when nothing could be probed (empty readings)", () => {
    expect(detectNoiseInjection({ first: [], second: [] })).toBe(false);
  });

  it("fails safe on a length mismatch (partial probe)", () => {
    expect(detectNoiseInjection({ first: ["a"], second: ["a", "b"] })).toBe(false);
  });
});
