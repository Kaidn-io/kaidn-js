import { describe, expect, it } from "vitest";
import { isSoftwareRenderer, isFarmHardware, detectEnvironment } from "./environment.js";

const DESKTOP_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36";
const MOBILE_UA = "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36";

describe("isSoftwareRenderer", () => {
  it("flags known software / VM renderers", () => {
    expect(isSoftwareRenderer("Google SwiftShader")).toBe(true);
    expect(isSoftwareRenderer("ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device))")).toBe(true);
    expect(isSoftwareRenderer("Mesa/llvmpipe (LLVM 15.0.0)")).toBe(true);
    expect(isSoftwareRenderer("VMware SVGA 3D")).toBe(true);
    expect(isSoftwareRenderer("VirtualBox Graphics Adapter")).toBe(true);
    expect(isSoftwareRenderer("Microsoft Basic Render Driver")).toBe(true);
  });
  it("passes real GPUs through", () => {
    expect(isSoftwareRenderer("ANGLE (NVIDIA, NVIDIA GeForce RTX 3070 Direct3D11)")).toBe(false);
    expect(isSoftwareRenderer("ANGLE (Intel, Intel(R) UHD Graphics 630)")).toBe(false);
    expect(isSoftwareRenderer("Apple GPU")).toBe(false);
    expect(isSoftwareRenderer("Mali-G78")).toBe(false);
    expect(isSoftwareRenderer(undefined)).toBe(false);
    expect(isSoftwareRenderer(null)).toBe(false);
  });
});

describe("isFarmHardware", () => {
  it("flags a desktop with 1-2 cores AND ≤1 GiB (farm VM)", () => {
    expect(isFarmHardware({ hardwareConcurrency: 2, deviceMemory: 1, userAgent: DESKTOP_UA })).toBe(true);
    expect(isFarmHardware({ hardwareConcurrency: 1, deviceMemory: 0.5, userAgent: DESKTOP_UA })).toBe(true);
  });
  it("does NOT flag a normal desktop", () => {
    expect(isFarmHardware({ hardwareConcurrency: 8, deviceMemory: 8, userAgent: DESKTOP_UA })).toBe(false);
    // a single low value isn't enough (kept high-precision)
    expect(isFarmHardware({ hardwareConcurrency: 2, deviceMemory: 8, userAgent: DESKTOP_UA })).toBe(false);
  });
  it("never flags mobile (phones legitimately report low cores/memory)", () => {
    expect(isFarmHardware({ hardwareConcurrency: 2, deviceMemory: 1, userAgent: MOBILE_UA })).toBe(false);
  });
  it("stays quiet when values are absent", () => {
    expect(isFarmHardware({ userAgent: DESKTOP_UA })).toBe(false);
  });
});

describe("detectEnvironment", () => {
  it("sets isEmulated on a software GPU (the headless/VM default)", () => {
    const r = detectEnvironment({ webglRenderer: "Google SwiftShader", userAgent: DESKTOP_UA });
    expect(r.isEmulated).toBe(true);
    expect(r.anomalies).toContain("software_gpu");
  });
  it("sets isEmulated on farm hardware", () => {
    const r = detectEnvironment({
      webglRenderer: "ANGLE (Intel, UHD 630)",
      hardwareConcurrency: 1,
      deviceMemory: 1,
      userAgent: DESKTOP_UA,
    });
    expect(r.isEmulated).toBe(true);
    expect(r.anomalies).toContain("farm_hardware");
  });
  it("stays quiet for a normal residential desktop", () => {
    const r = detectEnvironment({
      webglRenderer: "ANGLE (NVIDIA, RTX 3070 Direct3D11)",
      hardwareConcurrency: 12,
      deviceMemory: 16,
      userAgent: DESKTOP_UA,
      fontCount: 40,
      maxTouchPoints: 0,
    });
    expect(r.isEmulated).toBe(false);
    expect(r.anomalies).toEqual([]);
  });
  it("flags font_evasion on a desktop suppressing font enumeration (<5 fonts)", () => {
    const r = detectEnvironment({
      webglRenderer: "ANGLE (NVIDIA, RTX 3070)",
      userAgent: DESKTOP_UA,
      fontCount: 2,
    });
    expect(r.isEmulated).toBe(false); // contributing, not a hard VM tell
    expect(r.fontEvasion).toBe(true);
    expect(r.anomalies).toContain("sparse_fonts");
  });
  it("does NOT flag font_evasion for a normal desktop, Brave, or mobile", () => {
    expect(detectEnvironment({ userAgent: DESKTOP_UA, fontCount: 40 }).fontEvasion).toBe(false);
    expect(detectEnvironment({ userAgent: DESKTOP_UA, fontCount: 2, isBrave: true }).fontEvasion).toBe(false);
    const mobileUa = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148";
    expect(detectEnvironment({ userAgent: mobileUa, fontCount: 2 }).fontEvasion).toBe(false);
  });
});
