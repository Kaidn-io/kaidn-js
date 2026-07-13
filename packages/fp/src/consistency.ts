/**
 * User-Agent vs. real-platform consistency. A spoofed browser (or a farm that
 * swaps its UA string) claims one OS in the UA while `navigator.platform` — and
 * the WebGL renderer — betray another. Pure and DOM-free for testing.
 *
 * Conservative by design: we only flag CLEAR cross-family disagreements that a
 * legitimate device cannot produce, and treat "unknown" as consistent so a niche
 * platform never gets punished. `ua_consistent` is a soft/medium signal, not a
 * hard block.
 */
export interface ConsistencyInput {
  userAgent?: string;
  /** navigator.platform, e.g. "Win32", "MacIntel", "Linux x86_64". */
  platform?: string;
  /** unmasked WebGL renderer string, if available. */
  webglRenderer?: string;
}

export interface ConsistencyResult {
  consistent: boolean;
  /** why it was flagged, when inconsistent. */
  reason?: string;
}

type OsFamily = "win" | "mac" | "linux" | "android" | "ios" | "unknown";

export function checkUaConsistency(input: ConsistencyInput): ConsistencyResult {
  const uaOs = osFromUserAgent(input.userAgent);
  const platformOs = osFromPlatform(input.platform);
  if (uaOs === "unknown" || platformOs === "unknown") return { consistent: true };

  // Only flag combinations a real device cannot produce. Linux platform is
  // compatible with both Linux and Android UAs (Android's platform reports
  // "Linux ..."), and iPadOS can report a Mac platform — so those pairs pass.
  if (disagrees(uaOs, platformOs)) {
    return { consistent: false, reason: `ua_${uaOs}_platform_${platformOs}` };
  }
  return { consistent: true };
}

/** True only for cross-family pairs that indicate spoofing, not quirks. */
function disagrees(ua: OsFamily, platform: OsFamily): boolean {
  switch (ua) {
    case "win":
      return platform === "mac" || platform === "linux" || platform === "ios" || platform === "android";
    case "mac":
      return platform === "win" || platform === "linux" || platform === "android";
    case "android":
      return platform === "win" || platform === "mac" || platform === "ios";
    case "ios":
      // iPadOS reports a Mac platform, so ios-vs-mac is NOT a disagreement.
      return platform === "win" || platform === "linux" || platform === "android";
    case "linux":
      // desktop Linux UA on a Windows/Mac platform is a spoof; Android platform
      // is Linux-based, so linux-vs-android passes.
      return platform === "win" || platform === "mac";
    default:
      return false;
  }
}

function osFromUserAgent(ua?: string): OsFamily {
  if (!ua) return "unknown";
  if (/iphone|ipad|ipod/i.test(ua)) return "ios";
  if (/android/i.test(ua)) return "android"; // before "linux": Android UAs contain "Linux"
  if (/windows/i.test(ua)) return "win";
  if (/mac os x|macintosh/i.test(ua)) return "mac";
  if (/linux|x11/i.test(ua)) return "linux";
  return "unknown";
}

function osFromPlatform(platform?: string): OsFamily {
  if (!platform) return "unknown";
  const p = platform.toLowerCase();
  if (/iphone|ipad|ipod/.test(p)) return "ios";
  if (/win/.test(p)) return "win";
  if (/mac/.test(p)) return "mac";
  // Android exposes platform strings like "Linux armv8l" / "Linux aarch64".
  if (/android/.test(p)) return "android";
  if (/linux/.test(p)) return "linux";
  return "unknown";
}
