/**
 * Native-code lie detection — the CreepJS-style tell that catches *session-stable*
 * anti-detect browsers (Multilogin, GoLogin, AdsPower, Dolphin Anty, Kameleo).
 *
 * Those tools don't render broken fingerprints — they present a believable, fixed
 * per-profile one, so comparing fingerprint VALUES (even re-reading canvas twice)
 * can't catch them: the profile's noise seed is constant within a session on
 * purpose. But to spoof canvas/WebGL/audio/navigator they must OVERRIDE the
 * browser's native functions and getters — and a JS override leaks: its
 * `Function.prototype.toString()` no longer reports `{ [native code] }`. So we
 * don't grade the value, we detect the override. This catches the ACT of
 * spoofing, which is what survives per-profile randomization.
 *
 * Layered against sophistication: a tool that also patches its overrides to fake
 * `[native code]` must patch `Function.prototype.toString` itself — which is
 * damning on its own (nothing legitimate does that) and is checked separately.
 *
 * Brave "farbles" canvas/audio at the C++ engine level, NOT via JS wrappers, so
 * it shows ZERO lies here — a real advantage over naive canvas-noise checks that
 * false-positive Brave. We still pass `isBrave` and hard-skip, defensively.
 *
 * Pure + DOM-free: takes probe results (booleans), returns a verdict. The
 * browser-coupled probe gathering lives in collect.ts.
 */
export interface TamperProbe {
  /** the API probed, e.g. "canvas.toDataURL" — surfaces as evidence. */
  name: string;
  /** true = the function/getter reports native code (untampered). */
  native: boolean;
}

export interface TamperInput {
  probes: readonly TamperProbe[];
  /** `Function.prototype.toString` itself reports native code. If false, the
   *  spoofing framework patched the very tool used to detect it — definitive. */
  toStringIntact: boolean;
  /** Brave (engine-level farbling, not JS wrappers) — never flag. */
  isBrave?: boolean;
}

export interface TamperResult {
  tampered: boolean;
  /** the probes that lied (+ "function_tostring" if the meta-check failed). */
  lies: string[];
}

/**
 * True when the browser's native fingerprinting APIs have been overridden — the
 * signature of an anti-detect / fingerprint-spoofing browser. Requires either a
 * patched `Function.prototype.toString` (definitive on its own) or 2+ surface
 * lies, so a single benign extension wrapper can't manufacture a false positive.
 * Fails SAFE: no probes (couldn't run) → not tampered.
 */
export function detectTamper(input: TamperInput): TamperResult {
  if (input.isBrave) return { tampered: false, lies: [] };
  const lies = input.probes.filter((p) => !p.native).map((p) => p.name);
  if (!input.toStringIntact) lies.unshift("function_tostring");
  if (input.probes.length === 0 && input.toStringIntact) return { tampered: false, lies: [] };
  const tampered = !input.toStringIntact || lies.length >= 2;
  return { tampered, lies };
}
