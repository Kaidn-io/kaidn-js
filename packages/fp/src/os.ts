/**
 * OS-truth cross-check — the tell that catches a *consistent* OS spoof, which the
 * value/consistency checks miss. A compiled-fork anti-detect browser (Multilogin's
 * Mimic engine, etc.) can set the UA, navigator.platform AND the WebGL renderer to
 * one OS in lockstep — so ua_consistent passes — while the machine underneath is
 * really another OS. To catch it we read signals that leak the REAL OS regardless
 * of what those APIs claim, because they're expensive to fake in sync:
 *
 *  - Speech-synthesis voices. `speechSynthesis.getVoices()` returns OS-specific
 *    voices: macOS/iOS ship Apple voices (voiceURI "com.apple.*"), Windows ships
 *    "Microsoft David/Zira/…", Linux ships espeak. Virtualising the whole OS
 *    speech engine is hard, so a "Windows" UA whose voice list is Apple = spoof.
 *  - Client Hints. `navigator.userAgentData.platform` is a 4th OS surface many
 *    tools forget to keep in sync with the UA string.
 *
 * (The strongest OS-truth signal — the `Sec-CH-UA-Platform` HTTP header, which
 * page JS cannot touch — is checked server-side at the edge, see the API.)
 *
 * Coarse OS families, POSITIVE-contradiction only: we flag when a truth signal
 * clearly identifies a DIFFERENT OS than the UA claims, never on absence — so a
 * stripped/Google-only voice list or a browser without Client Hints stays quiet
 * (fail-safe, no false positive). Pure + DOM-free for testing.
 */
export type OsFamily = "windows" | "apple" | "linux" | "android" | "chromeos" | "unknown";

/** Map a human OS label (UA parse or Client-Hints platform) to a coarse family. */
export function osFamily(label: string | undefined | null): OsFamily {
  if (!label) return "unknown";
  const l = label.toLowerCase();
  if (l.includes("win")) return "windows";
  if (l.includes("mac") || l.includes("ios") || l.includes("iphone") || l.includes("ipad")) return "apple";
  if (l.includes("chrome os") || l.includes("chromeos") || l === "cros") return "chromeos";
  if (l.includes("android")) return "android";
  if (l.includes("linux") || l.includes("x11")) return "linux";
  return "unknown";
}

export interface VoiceLike {
  name?: string;
  voiceURI?: string;
}

/**
 * Infer the real OS family from the installed speech-synthesis voices. Returns
 * the family only when a voice UNAMBIGUOUSLY belongs to one OS; a list with no
 * OS-specific voice (e.g. only Google network voices) or a conflicting mix →
 * "unknown" (quiet). Network "Google …" voices appear on every OS so they're
 * ignored — only local OS voices carry OS truth.
 */
export function osFromVoices(voices: readonly VoiceLike[]): OsFamily {
  let apple = false;
  let windows = false;
  let linux = false;
  for (const v of voices) {
    const uri = (v.voiceURI ?? "").toLowerCase();
    const name = (v.name ?? "").toLowerCase();
    if (uri.includes("apple") || uri.includes("com.apple")) apple = true;
    else if (name.startsWith("microsoft ") || uri.includes("microsoft")) windows = true;
    else if (uri.includes("espeak") || name.includes("espeak")) linux = true;
  }
  const hits: OsFamily[] = [];
  if (apple) hits.push("apple");
  if (windows) hits.push("windows");
  if (linux) hits.push("linux");
  // Exactly one OS family present = a confident read. Zero (Google-only/empty) or
  // a contradictory mix (shouldn't happen on real hardware) → unknown.
  return hits.length === 1 ? hits[0]! : "unknown";
}

export interface OsInput {
  /** the OS the UA claims (from parseUserAgent().os), e.g. "Windows". */
  claimed?: string | null;
  /** installed speech-synthesis voices. */
  voices?: readonly VoiceLike[];
  /** navigator.userAgentData.platform, e.g. "macOS". */
  clientHintsPlatform?: string;
}

export interface OsResult {
  mismatch: boolean;
  /** which truth surfaces disagreed, e.g. "voices_apple,ch_apple". */
  reason?: string;
}

/**
 * True when a truth signal identifies a different OS than the UA claims — the
 * signature of a consistent OS spoof. Only fires on a positive contradiction with
 * a known claimed OS; unknown either side → quiet.
 */
export function detectOsMismatch(input: OsInput): OsResult {
  const claimed = osFamily(input.claimed);
  if (claimed === "unknown") return { mismatch: false };
  const reasons: string[] = [];

  const voiceOs = osFromVoices(input.voices ?? []);
  if (voiceOs !== "unknown" && voiceOs !== claimed) reasons.push(`voices_${voiceOs}`);

  const chOs = osFamily(input.clientHintsPlatform);
  if (chOs !== "unknown" && chOs !== claimed) reasons.push(`ch_${chOs}`);

  return { mismatch: reasons.length > 0, reason: reasons.join(",") || undefined };
}
