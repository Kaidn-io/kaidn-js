/**
 * Browser-automation detection. Pure: takes plain navigator values, returns a
 * verdict — so it unit-tests without a DOM. We deliberately keep `isHeadless`
 * to HIGH-PRECISION tells only (each is something a genuine user's browser never
 * shows), because a false positive here blocks a real signup. Softer, spoofable
 * hints are surfaced as `anomalies` for evidence but never flip the verdict alone.
 */
export interface AutomationInput {
  /** navigator.webdriver — true under WebDriver/CDP automation. */
  webdriver?: boolean;
  userAgent?: string;
  /** navigator.languages — empty/undefined is a classic headless-Chrome tell. */
  languages?: readonly string[];
  /** navigator.plugins.length. */
  pluginCount?: number;
  hardwareConcurrency?: number;
}

export interface AutomationResult {
  /** high-confidence automation — safe to weight heavily in the engine. */
  isHeadless: boolean;
  /** soft, individually-spoofable tells; context for an investigator. */
  anomalies: string[];
}

const HEADLESS_UA = /headless|phantomjs|electron|slimerjs/i;

export function detectAutomation(nav: AutomationInput): AutomationResult {
  const anomalies: string[] = [];

  // ---- high-precision tells → isHeadless ----
  const strong: string[] = [];
  if (nav.webdriver === true) strong.push("webdriver");
  if (nav.userAgent && HEADLESS_UA.test(nav.userAgent)) strong.push("headless_ua");
  // A real browser always exposes at least one language. An explicitly empty
  // list (length 0) is a headless tell; `undefined` (not provided) is not.
  if (Array.isArray(nav.languages) && nav.languages.length === 0) strong.push("no_languages");

  // ---- soft tells → evidence only ----
  if (nav.pluginCount === 0 && nav.userAgent && isDesktopChrome(nav.userAgent)) {
    anomalies.push("no_plugins");
  }
  if (nav.hardwareConcurrency === 0) anomalies.push("zero_cpu");

  return { isHeadless: strong.length > 0, anomalies: strong.concat(anomalies) };
}

/** Desktop Chrome/Chromium UA (excludes mobile, where 0 plugins is normal). */
function isDesktopChrome(ua: string): boolean {
  return /chrome\/\d/i.test(ua) && !/mobile|android/i.test(ua);
}
