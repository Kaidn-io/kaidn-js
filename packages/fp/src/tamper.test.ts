import { describe, expect, it } from "vitest";
import { detectTamper } from "./tamper.js";

const native = (name: string) => ({ name, native: true });
const lie = (name: string) => ({ name, native: false });

describe("detectTamper — native-code lie detection", () => {
  it("flags when 2+ native APIs were overridden (anti-detect browser)", () => {
    const r = detectTamper({
      probes: [native("canvas.getContext"), lie("canvas.toDataURL"), lie("webgl.getParameter")],
      toStringIntact: true,
    });
    expect(r.tampered).toBe(true);
    expect(r.lies).toEqual(["canvas.toDataURL", "webgl.getParameter"]);
  });

  it("is definitive when Function.prototype.toString itself is patched", () => {
    const r = detectTamper({ probes: [native("canvas.toDataURL")], toStringIntact: false });
    expect(r.tampered).toBe(true);
    expect(r.lies[0]).toBe("function_tostring");
  });

  it("does NOT flag a single benign wrapper (needs 2+ to avoid false positives)", () => {
    const r = detectTamper({ probes: [lie("canvas.toDataURL"), native("webgl.getParameter")], toStringIntact: true });
    expect(r.tampered).toBe(false);
  });

  it("never flags Brave (engine-level farbling, no JS wrappers)", () => {
    const r = detectTamper({ probes: [lie("a"), lie("b"), lie("c")], toStringIntact: false, isBrave: true });
    expect(r.tampered).toBe(false);
  });

  it("fails safe when nothing could be probed", () => {
    expect(detectTamper({ probes: [], toStringIntact: true }).tampered).toBe(false);
  });

  it("clean native browser produces no lies", () => {
    const r = detectTamper({
      probes: [native("canvas.toDataURL"), native("webgl.getParameter"), native("navigator.platform")],
      toStringIntact: true,
    });
    expect(r).toEqual({ tampered: false, lies: [] });
  });
});
