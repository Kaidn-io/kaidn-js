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
  /** e.g. "Chrome", "Safari", "Firefox", "Edge", "Samsung Internet", or null */
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

function browserOf(ua: string): string | null {
  // Order matters: many browsers embed "Chrome"/"Safari" in their UA, so the
  // more specific brands are checked first.
  if (/edg(a|ios)?\//i.test(ua)) return "Edge";
  if (/opr\/|opera/i.test(ua)) return "Opera";
  if (/samsungbrowser/i.test(ua)) return "Samsung Internet";
  if (/firefox|fxios/i.test(ua)) return "Firefox";
  if (/chrome|crios|chromium/i.test(ua)) return "Chrome";
  if (/safari/i.test(ua)) return "Safari"; // real Safari has no Chrome/Firefox token
  return null;
}

function mobileOf(ua: string): boolean {
  return /mobile|android|iphone|ipod|ipad|windows phone|iemobile/i.test(ua);
}
