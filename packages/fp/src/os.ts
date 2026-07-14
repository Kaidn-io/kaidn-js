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

/**
 * Signature fonts that ship as SYSTEM fonts on exactly one OS family. A machine
 * of that OS always has them (they can't be removed); a machine of another OS
 * normally doesn't. Used for the asymmetry rule below — NOT a bare "has a Mac
 * font" check, which would false-positive on a Windows designer who installed
 * Helvetica Neue. Lowercased for exact-ish matching against the detected list.
 */
const OS_SIGNATURE_FONTS: Record<Exclude<OsFamily, "unknown" | "android">, string[]> = {
  apple: ["menlo", "helvetica neue", "geneva", "monaco", "lucida grande", "avenir", "avenir next", "sf pro text", "sf pro display", "gill sans"],
  windows: ["segoe ui", "calibri", "cambria", "consolas", "candara", "constantia", "corbel", "franklin gothic", "lucida console"],
  linux: ["dejavu sans", "liberation sans", "liberation serif", "ubuntu", "cantarell", "freesans", "nimbus sans"],
  chromeos: ["roboto"],
};

/** Which OS families have at least one signature font present in the list. */
function fontOsFamilies(fonts: readonly string[]): Set<OsFamily> {
  const lower = new Set(fonts.map((f) => f.trim().toLowerCase()));
  const fams = new Set<OsFamily>();
  for (const [fam, sig] of Object.entries(OS_SIGNATURE_FONTS)) {
    if (sig.some((s) => lower.has(s))) fams.add(fam as OsFamily);
  }
  return fams;
}

export interface OsInput {
  /** the OS the UA claims (from parseUserAgent().os), e.g. "Windows". */
  claimed?: string | null;
  /** installed speech-synthesis voices. */
  voices?: readonly VoiceLike[];
  /** navigator.userAgentData.platform, e.g. "macOS". */
  clientHintsPlatform?: string;
  /** detected font names (from the fingerprint's font probe). */
  fonts?: readonly string[];
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

  // Font identity (the A/B-validated tell): the machine shows another OS's system
  // fonts AND *none* of the claimed OS's. A genuine machine of the claimed OS
  // always carries its own unremovable system fonts, so this can't fire on it —
  // even a Windows designer who installed Mac fonts still has Segoe UI/Calibri.
  // Only a machine that is really OS Y while claiming OS X produces the asymmetry.
  if (input.fonts && input.fonts.length > 0) {
    const fams = fontOsFamilies(input.fonts);
    const claimedPresent = fams.has(claimed);
    const otherFam = [...fams].find((f) => f !== claimed);
    if (otherFam && !claimedPresent) reasons.push(`fonts_${otherFam}`);
  }

  return { mismatch: reasons.length > 0, reason: reasons.join(",") || undefined };
}
