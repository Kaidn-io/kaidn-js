/**
 * Minimal, dependency-free User-Agent parse → human-readable device context for
 * fraud triage (os / browser / mobile). Not a full UA database — just the coarse
 * buckets a reviewer wants at a glance. Pure, so it unit-tests without a browser.
 * Runs client-side in @kaidn/fp because the END USER's UA is only known there (a
 * server-to-server /v1/score call would parse the customer's backend instead).
 */
export interface UaAttributes {
  /** e.g. "Windows", "macOS", "Android", "iOS", "Linux", or null if unknown */
  os: string | null;
  /**
   * e.g. "Chrome", "Safari", "Firefox", "Edge", "Samsung Internet"; in-app
   * browsers report the host app ("X (Twitter) In-App", "Instagram In-App", …)
   * and unbranded embedded views report "iOS WebView" / "Android WebView".
   * null only when the UA carries no browser signal at all.
   */
  browser: string | null;
  /** true if a phone/tablet UA, false if desktop, null if unknown */
  mobile: boolean | null;
}

export function parseUserAgent(ua: string | undefined): UaAttributes {
  if (!ua) return { os: null, browser: null, mobile: null };
  return { os: osOf(ua), browser: browserOf(ua), mobile: mobileOf(ua) };
}

function osOf(ua: string): string | null {
  if (/iphone|ipad|ipod/i.test(ua)) return "iOS";
  if (/android/i.test(ua)) return "Android"; // before Linux: Android UAs contain "Linux"
  if (/windows/i.test(ua)) return "Windows";
  if (/mac os x|macintosh/i.test(ua)) return "macOS";
  if (/cros/i.test(ua)) return "ChromeOS";
  if (/linux|x11/i.test(ua)) return "Linux";
  return null;
}

/**
 * In-app browsers append (or substitute) the host app's token, so they must be
 * matched before the brand checks — an Instagram-on-Android UA also contains
 * "Chrome", and an X-on-iOS UA contains NO brand token at all (which is how
 * these UAs previously fell through to null).
 */
const IN_APP: Array<[RegExp, string]> = [
  [/twitter for iphone|twitterandroid/i, "X (Twitter) In-App"],
  [/instagram/i, "Instagram In-App"],
  [/fb_iab|fban|fbav/i, "Facebook In-App"],
  [/musical_ly|bytedance/i, "TikTok In-App"],
  [/snapchat/i, "Snapchat In-App"],
  [/linkedinapp/i, "LinkedIn In-App"],
  [/pinterest/i, "Pinterest In-App"],
  [/micromessenger/i, "WeChat In-App"],
  [/\bline\//i, "LINE In-App"],
  [/\bgsa\//i, "Google App In-App"],
];

function browserOf(ua: string): string | null {
  // Order matters: many browsers embed "Chrome"/"Safari" in their UA, so the
  // more specific brands are checked first, and in-app tokens before those.
  for (const [re, name] of IN_APP) if (re.test(ua)) return name;
  if (/duckduckgo/i.test(ua)) return "DuckDuckGo";
  if (/edg(a|ios)?\//i.test(ua)) return "Edge";
  if (/opr\/|opera/i.test(ua)) return "Opera";
  if (/samsungbrowser/i.test(ua)) return "Samsung Internet";
  // Android System WebView marks itself with "; wv)" and would otherwise
  // report as Chrome (its UA carries the Chrome token).
  if (/;\s*wv\)/i.test(ua)) return "Android WebView";
  if (/firefox|fxios/i.test(ua)) return "Firefox";
  if (/chrome|crios|chromium/i.test(ua)) return "Chrome";
  if (/safari/i.test(ua)) return "Safari"; // real Safari has no Chrome/Firefox token
  // WebKit with no Safari token = an embedded WKWebView whose host app doesn't
  // identify itself (Telegram, many link previews). On iOS every such view is
  // WKWebView; elsewhere it's some embedded WebKit shell.
  if (/applewebkit/i.test(ua)) return /iphone|ipad|ipod/i.test(ua) ? "iOS WebView" : "WebView";
  return null;
}

function mobileOf(ua: string): boolean {
  return /mobile|android|iphone|ipod|ipad|windows phone|iemobile/i.test(ua);
}
