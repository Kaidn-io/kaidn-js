import { describe, expect, it } from "vitest";
import { detectEngineMismatch, engineFromStack, expectedEngine } from "./engine.js";

const V8_STACK = "Error\n    at collect (https://site/fp.js:10:15)\n    at run (https://site/app.js:3:1)";
const GECKO_STACK = "collect@https://site/fp.js:10:15\nrun@https://site/app.js:3:1";

const CHROME_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const FIREFOX_UA = "Mozilla/5.0 (Windows NT 10.0; rv:126.0) Gecko/20100101 Firefox/126.0";
const IOS_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 CriOS/124.0 Mobile/15E148 Safari/604.1";

describe("engineFromStack", () => {
  it("recognises V8 (Chrome) stack frames", () => {
    expect(engineFromStack(V8_STACK)).toBe("v8");
  });
  it("recognises Gecko/JSC @-style frames as non-V8", () => {
    expect(engineFromStack(GECKO_STACK)).toBe("nonv8");
  });
  it("is unknown for an empty/unreadable stack", () => {
    expect(engineFromStack(undefined)).toBe("unknown");
    expect(engineFromStack("")).toBe("unknown");
  });
});

describe("expectedEngine", () => {
  it("maps Chromium brands to V8", () => {
    expect(expectedEngine(CHROME_UA)).toBe("v8");
  });
  it("maps Firefox/Safari to non-V8", () => {
    expect(expectedEngine(FIREFOX_UA)).toBe("nonv8");
  });
  it("treats ANY iOS UA as non-V8 (iOS forces WebKit)", () => {
    expect(expectedEngine(IOS_UA)).toBe("nonv8"); // an iOS 'CriOS/Chrome' is still WebKit
  });
});

describe("detectEngineMismatch", () => {
  it("flags a Chrome UA running on a non-V8 engine (spoofed UA)", () => {
    const r = detectEngineMismatch({ userAgent: CHROME_UA, stack: GECKO_STACK });
    expect(r.mismatch).toBe(true);
    expect(r.reason).toBe("ua_v8_engine_nonv8");
  });
  it("flags an iOS UA running on V8 (desktop tool emulating iOS)", () => {
    const r = detectEngineMismatch({ userAgent: IOS_UA, stack: V8_STACK });
    expect(r.mismatch).toBe(true);
    expect(r.reason).toBe("ua_nonv8_engine_v8");
  });
  it("does NOT flag a real Chrome-on-V8 or Firefox-on-Gecko", () => {
    expect(detectEngineMismatch({ userAgent: CHROME_UA, stack: V8_STACK }).mismatch).toBe(false);
    expect(detectEngineMismatch({ userAgent: FIREFOX_UA, stack: GECKO_STACK }).mismatch).toBe(false);
  });
  it("stays quiet when either side is unknown (fail-safe)", () => {
    expect(detectEngineMismatch({ userAgent: CHROME_UA, stack: undefined }).mismatch).toBe(false);
    expect(detectEngineMismatch({ userAgent: "weird/1.0", stack: V8_STACK }).mismatch).toBe(false);
  });
});
