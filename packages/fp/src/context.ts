/**
 * Cross-context fingerprint comparison — the second CreepJS technique that
 * catches session-stable anti-detect browsers. These tools inject their spoofed
 * navigator/UA into the main `window`, but a page also runs script in OTHER
 * JS contexts — Web Workers, ServiceWorkers, nested iframes — each with its own
 * `navigator`. Patching every context consistently is hard, so anti-detect tools
 * routinely miss the Worker: it reports the REAL userAgent / hardwareConcurrency /
 * platform / timezone while `window` reports the spoofed ones. A real browser is
 * always identical across contexts, so ANY disagreement is a spoof — an extremely
 * low-false-positive tell (no legitimate browser reports a different UA in its
 * own worker).
 *
 * Pure + DOM-free: takes two snapshots, returns the mismatch. The browser-coupled
 * worker spawning lives in collect.ts.
 */
export interface ContextSnapshot {
  userAgent?: string;
  hardwareConcurrency?: number;
  platform?: string;
  /** IANA timezone as resolved INSIDE that context. */
  timezone?: string | null;
}

export interface ContextResult {
  mismatch: boolean;
  /** which fields disagreed across contexts — evidence. */
  fields: string[];
}

/**
 * Compare the main-thread snapshot against a worker (or iframe) snapshot. Only
 * fields BOTH contexts reported are compared — a value absent in one context is
 * normal (not every API is exposed everywhere), never a lie. Returns no mismatch
 * when the worker snapshot is missing (couldn't spawn / CSP-blocked) so a missing
 * capability can never manufacture a false positive.
 */
export function compareContexts(
  main: ContextSnapshot,
  worker: ContextSnapshot | undefined
): ContextResult {
  if (!worker) return { mismatch: false, fields: [] };
  const fields: string[] = [];
  const keys: (keyof ContextSnapshot)[] = ["userAgent", "hardwareConcurrency", "platform", "timezone"];
  for (const k of keys) {
    const a = main[k];
    const b = worker[k];
    if (a != null && b != null && String(a) !== String(b)) fields.push(k);
  }
  return { mismatch: fields.length > 0, fields };
}
