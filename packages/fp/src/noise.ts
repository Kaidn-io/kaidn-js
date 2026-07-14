/**
 * Canvas/WebGL noise-injection detection — the tell that catches anti-detect
 * browsers the surface fingerprint can't. Multilogin, GoLogin, AdsPower, Dolphin
 * Anty and canvas-defender extensions randomise the canvas/WebGL readback so the
 * device hash differs per profile. But they inject that noise PER READ, and real
 * GPU hardware is bit-identical every time you read the same draw. So reading the
 * SAME deterministic render twice in one session exposes them: identical → real
 * hardware; different → active spoofing. This catches the *act* of spoofing, so
 * it survives the per-profile randomization those tools rely on to look unique.
 *
 * Brave's "farbling" also perturbs canvas for privacy (legitimately), so the
 * caller passes `isBrave` and we never flag it. Pure + DOM-free for unit testing;
 * the browser-coupled double-read lives in collect.ts.
 */
export interface NoiseInput {
  /** independent readings of the same deterministic render(s), pass 1. */
  first: readonly string[];
  /** the same renders read a SECOND time. Same order/length as `first`. */
  second: readonly string[];
  /** the browser is Brave (its farbling is legit privacy noise → never flag). */
  isBrave?: boolean;
}

/**
 * True when a deterministic render read back differently across two passes —
 * proof of per-read noise injection. Fails SAFE: if we couldn't probe (empty or
 * mismatched-length readings) or the browser is Brave, returns false so a missing
 * capability never manufactures a false positive.
 */
export function detectNoiseInjection(input: NoiseInput): boolean {
  if (input.isBrave) return false;
  const { first, second } = input;
  if (first.length === 0 || first.length !== second.length) return false;
  for (let i = 0; i < first.length; i++) {
    if (first[i] !== second[i]) return true;
  }
  return false;
}
