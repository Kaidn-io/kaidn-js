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

describe("parseUserAgent — in-app browsers and WebViews", () => {
  it("X (Twitter) in-app on iOS — no brand token at all", () => {
    const ua =
      "Mozilla/5.0 (iPhone; CPU iPhone OS 26_5_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/23F84 Twitter for iPhone/12.8";
    expect(parseUserAgent(ua)).toEqual({ os: "iOS", browser: "X (Twitter) In-App", mobile: true });
  });

  it("Instagram in-app on Android is not misreported as Chrome", () => {
    const ua =
      "Mozilla/5.0 (Linux; Android 14; Pixel 8 Build/AD1A.240418.003; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/126.0.0.0 Mobile Safari/537.36 Instagram 334.0.0.42.95 Android";
    expect(parseUserAgent(ua).browser).toBe("Instagram In-App");
  });

  it("Facebook in-app on iOS (FBAN/FBAV tokens)", () => {
    const ua =
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/21F90 [FBAN/FBIOS;FBAV/467.0.0.36.109;FBBV/604948302]";
    expect(parseUserAgent(ua)).toEqual({ os: "iOS", browser: "Facebook In-App", mobile: true });
  });

  it("TikTok in-app on Android (musical_ly token)", () => {
    const ua =
      "Mozilla/5.0 (Linux; Android 13; SM-S908B Build/TP1A.220624.014; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/125.0.0.0 Mobile Safari/537.36 musical_ly_2022803040 JsSdk/1.0 NetType/WIFI Channel/googleplay";
    expect(parseUserAgent(ua).browser).toBe("TikTok In-App");
  });

  it("WeChat in-app (MicroMessenger)", () => {
    const ua =
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.49(0x18003129) NetType/WIFI Language/zh_CN";
    expect(parseUserAgent(ua).browser).toBe("WeChat In-App");
  });

  it("bare Android System WebView (wv token) is not misreported as Chrome", () => {
    const ua =
      "Mozilla/5.0 (Linux; Android 14; Pixel 8 Build/AD1A.240418.003; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/126.0.0.0 Mobile Safari/537.36";
    expect(parseUserAgent(ua)).toEqual({ os: "Android", browser: "Android WebView", mobile: true });
  });

  it("bare WKWebView on iOS (no Safari token, no app token) → iOS WebView", () => {
    const ua =
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/21F90";
    expect(parseUserAgent(ua)).toEqual({ os: "iOS", browser: "iOS WebView", mobile: true });
  });

  it("brand tokens still win over the WebView fallbacks", () => {
    const crios =
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.6478.54 Mobile/15E148 Safari/604.1";
    expect(parseUserAgent(crios).browser).toBe("Chrome");
    const fxios =
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/126.0 Mobile/15E148 Safari/605.1.15";
    expect(parseUserAgent(fxios).browser).toBe("Firefox");
  });
});
