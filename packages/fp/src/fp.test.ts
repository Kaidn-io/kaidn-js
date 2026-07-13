import { describe, expect, it } from "vitest";
import { detectAutomation } from "./automation.js";
import { checkUaConsistency } from "./consistency.js";
import { flattenComponents, pickWebglRenderer } from "./components.js";

const REAL_CHROME_WIN =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const HEADLESS_CHROME =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/126.0.0.0 Safari/537.36";
const REAL_SAFARI_IOS =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";

describe("detectAutomation — high-precision only", () => {
  it("flags navigator.webdriver", () => {
    const r = detectAutomation({ webdriver: true, userAgent: REAL_CHROME_WIN, languages: ["en-US"] });
    expect(r.isHeadless).toBe(true);
    expect(r.anomalies).toContain("webdriver");
  });

  it("flags a headless User-Agent", () => {
    const r = detectAutomation({ userAgent: HEADLESS_CHROME, languages: ["en-US"] });
    expect(r.isHeadless).toBe(true);
    expect(r.anomalies).toContain("headless_ua");
  });

  it("flags an explicitly empty navigator.languages", () => {
    const r = detectAutomation({ userAgent: REAL_CHROME_WIN, languages: [] });
    expect(r.isHeadless).toBe(true);
    expect(r.anomalies).toContain("no_languages");
  });

  it("does NOT flag a normal desktop browser", () => {
    const r = detectAutomation({
      webdriver: false,
      userAgent: REAL_CHROME_WIN,
      languages: ["en-US", "en"],
      pluginCount: 5,
      hardwareConcurrency: 8,
    });
    expect(r.isHeadless).toBe(false);
    expect(r.anomalies).toEqual([]);
  });

  it("surfaces no-plugins as a SOFT anomaly on desktop Chrome, not a headless verdict", () => {
    const r = detectAutomation({
      userAgent: REAL_CHROME_WIN,
      languages: ["en-US"],
      pluginCount: 0,
      hardwareConcurrency: 8,
    });
    expect(r.isHeadless).toBe(false); // soft tell alone must not block a real user
    expect(r.anomalies).toContain("no_plugins");
  });

  it("does not treat zero plugins on MOBILE as anomalous", () => {
    const r = detectAutomation({ userAgent: REAL_SAFARI_IOS, languages: ["en-US"], pluginCount: 0 });
    expect(r.isHeadless).toBe(false);
    expect(r.anomalies).not.toContain("no_plugins");
  });

  it("undefined languages (not provided) is not a tell", () => {
    const r = detectAutomation({ userAgent: REAL_CHROME_WIN });
    expect(r.isHeadless).toBe(false);
  });
});

describe("checkUaConsistency — flags cross-family OS spoofing only", () => {
  it("Windows UA on a Linux platform is inconsistent (headless farm tell)", () => {
    const r = checkUaConsistency({ userAgent: REAL_CHROME_WIN, platform: "Linux x86_64" });
    expect(r.consistent).toBe(false);
    expect(r.reason).toBe("ua_win_platform_linux");
  });

  it("matching Windows UA + Win32 platform is consistent", () => {
    expect(checkUaConsistency({ userAgent: REAL_CHROME_WIN, platform: "Win32" }).consistent).toBe(true);
  });

  it("real macOS is consistent", () => {
    const mac =
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
    expect(checkUaConsistency({ userAgent: mac, platform: "MacIntel" }).consistent).toBe(true);
  });

  it("Android UA on a Linux platform is consistent (Android platform is Linux-based)", () => {
    const android =
      "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36";
    expect(checkUaConsistency({ userAgent: android, platform: "Linux armv8l" }).consistent).toBe(true);
  });

  it("iOS UA on a Mac platform is consistent (iPadOS reports MacIntel)", () => {
    expect(checkUaConsistency({ userAgent: REAL_SAFARI_IOS, platform: "MacIntel" }).consistent).toBe(true);
  });

  it("treats unknown UA or platform as consistent (never punish a niche device)", () => {
    expect(checkUaConsistency({ userAgent: REAL_CHROME_WIN, platform: undefined }).consistent).toBe(true);
    expect(checkUaConsistency({ userAgent: undefined, platform: "Win32" }).consistent).toBe(true);
    expect(checkUaConsistency({ userAgent: "some-weird-ua", platform: "SomethingOS" }).consistent).toBe(true);
  });
});

describe("component readers", () => {
  it("flattens a nested tree and joins arrays", () => {
    const flat = flattenComponents({
      webgl: { renderer: "ANGLE (Apple M2)", vendor: "Apple" },
      fonts: ["Arial", "Helvetica"],
      screen: { color_depth: 24 },
    });
    expect(flat["webgl.renderer"]).toBe("ANGLE (Apple M2)");
    expect(flat["fonts"]).toBe("Arial,Helvetica");
    expect(flat["screen.color_depth"]).toBe("24");
  });

  it("finds the WebGL renderer regardless of nesting", () => {
    expect(pickWebglRenderer({ webgl: { renderer: "ANGLE (NVIDIA)" } })).toBe("ANGLE (NVIDIA)");
    expect(pickWebglRenderer({ gpu: { unmasked_renderer: "Mali-G78" } })).toBe("Mali-G78");
    expect(pickWebglRenderer({ nothing: "here" })).toBeUndefined();
    expect(pickWebglRenderer(undefined)).toBeUndefined();
  });
});
