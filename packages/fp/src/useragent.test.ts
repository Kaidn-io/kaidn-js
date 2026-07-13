import { describe, expect, it } from "vitest";
import { parseUserAgent } from "./useragent.js";

describe("parseUserAgent — coarse triage buckets", () => {
  it("desktop Chrome on Windows", () => {
    const ua =
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
    expect(parseUserAgent(ua)).toEqual({ os: "Windows", browser: "Chrome", mobile: false });
  });

  it("Safari on iPhone is mobile", () => {
    const ua =
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
    expect(parseUserAgent(ua)).toEqual({ os: "iOS", browser: "Safari", mobile: true });
  });

  it("Chrome on Android is mobile", () => {
    const ua =
      "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36";
    expect(parseUserAgent(ua)).toEqual({ os: "Android", browser: "Chrome", mobile: true });
  });

  it("Firefox on macOS", () => {
    const ua = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:124.0) Gecko/20100101 Firefox/124.0";
    expect(parseUserAgent(ua)).toEqual({ os: "macOS", browser: "Firefox", mobile: false });
  });

  it("Edge is not misreported as Chrome", () => {
    const ua =
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.0.0";
    expect(parseUserAgent(ua).browser).toBe("Edge");
  });

  it("real Safari (no Chrome token) on macOS is Safari, not Chrome", () => {
    const ua =
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15";
    expect(parseUserAgent(ua).browser).toBe("Safari");
  });

  it("unknown / empty UA yields all nulls (never guesses)", () => {
    expect(parseUserAgent(undefined)).toEqual({ os: null, browser: null, mobile: null });
    expect(parseUserAgent("some-scraper/1.0")).toEqual({ os: null, browser: null, mobile: false });
  });
});
