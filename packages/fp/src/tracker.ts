import type { CollectOptions } from "./collect.js";
import type { FpResult } from "./types.js";

/**
 * The drop-in tracker: a small `window.Kaidn` API a customer wires onto their
 * signup / login / checkout page with one <script> tag. It collects the device
 * fingerprint, beacons it to the edge (so JA4 is captured), and — the ergonomic
 * win over a bare beacon — auto-appends the device_id to the submitted form, so
 * the customer's backend receives it with zero manual wiring.
 *
 * Deliberately DIFFERENT from IPQS in one way: afterResult() hands back a
 * COLLECTION result ({ device_id, ... }), never a fraud score. The verdict comes
 * from the customer's server-side /v1/score call — the browser never sees or can
 * reverse-engineer it. That split is Kaidn's security model, not an oversight.
 *
 * This module is the testable core: DOM + network are injected, so the
 * orchestration (store → collect → append → callbacks → proceed) unit-tests
 * without a browser. `bootstrap()` (browser.ts) wires the real DOM and fetch.
 */

/** minimal element surface the tracker needs — a real HTMLElement satisfies it */
export interface TrackerElement {
  addEventListener(type: string, handler: (event: TrackerEvent) => void): void;
  /** append a hidden field carrying a value (real impl injects <input type=hidden>) */
  appendHiddenField(name: string, value: string): void;
  /** re-run the element's native action (submit the form / follow the click) */
  proceed(): void;
}

export interface TrackerEvent {
  preventDefault(): void;
}

/** how the tracker finds elements + makes hidden fields — injected for testing */
export interface TrackerDom {
  select(selector: string): TrackerElement | null;
}

export interface TrackerDeps {
  collect: (opts?: CollectOptions) => Promise<FpResult>;
  /** POST the payload to the beacon endpoint; resolves when sent (best-effort) */
  send: (endpoint: string, payload: TrackerPayload) => Promise<void>;
  dom: TrackerDom;
  endpoint: string;
  /** field name prefix for appended form inputs (default "kaidn_") */
  fieldPrefix?: string;
}

export interface TrackerPayload {
  device_id: string;
  device: FpResult["device"];
  attributes: FpResult["attributes"];
  /** custom tracking vars set via store() (user_id, transaction_id, …) */
  vars: Record<string, string>;
}

export interface TrackerResult extends FpResult {
  /** custom vars that were attached to this request */
  vars: Record<string, string>;
}

export interface Tracker {
  /** attach a custom tracking variable (e.g. user_id, transaction_id) */
  store(key: string, value: string): void;
  /** bind to a form/element; on submit|click, fingerprint first, then proceed.
   *  `before` runs on the event first (call preventDefault there if desired). */
  trigger(selector: string, before?: (event: TrackerEvent) => void): void;
  /** run after a successful collect (gets the collection result, NOT a score) */
  afterResult(fn: (result: TrackerResult) => void): void;
  /** run if collection/beacon fails (ad-blocker, blocked script, timeout) */
  afterFailure(fn: (reason: unknown) => void): void;
  /** hold the page-load fingerprint until resume() — lets you store() late data first */
  pause(): void;
  resume(): void;
  /** start: fingerprints immediately unless paused */
  init(): void;
}

export function createTracker(deps: TrackerDeps): Tracker {
  const prefix = deps.fieldPrefix ?? "kaidn_";
  const vars: Record<string, string> = {};
  const onResult: ((r: TrackerResult) => void)[] = [];
  const onFailure: ((e: unknown) => void)[] = [];
  let paused = false;
  let initialized = false;
  /** the last successful collection — reused so a trigger doesn't recompute needlessly */
  let cached: FpResult | undefined;

  async function run(): Promise<FpResult> {
    const fp = await deps.collect();
    cached = fp;
    // Beacon is best-effort: a blocked network call must not break the host page.
    await deps
      .send(deps.endpoint, { device_id: fp.device_id, device: fp.device, attributes: fp.attributes, vars: { ...vars } })
      .catch(() => {});
    return fp;
  }

  function fire(fp: FpResult): void {
    const result: TrackerResult = { ...fp, vars: { ...vars } };
    for (const fn of onResult) safely(() => fn(result));
  }
  function fail(reason: unknown): void {
    for (const fn of onFailure) safely(() => fn(reason));
  }

  return {
    store(key, value) {
      vars[key] = value;
    },
    afterResult(fn) {
      onResult.push(fn);
    },
    afterFailure(fn) {
      onFailure.push(fn);
    },
    pause() {
      paused = true;
    },
    resume() {
      paused = false;
      if (initialized) void collectAndFire();
    },
    init() {
      initialized = true;
      if (!paused) void collectAndFire();
    },
    trigger(selector, before) {
      const el = deps.dom.select(selector);
      if (!el) return; // nothing to bind — no-op, matches IPQS console-warn behaviour minus the noise
      el.addEventListener("submit", (event) => handleTrigger(el, event, before));
      el.addEventListener("click", (event) => handleTrigger(el, event, before));
    },
  };

  async function collectAndFire(): Promise<void> {
    try {
      fire(await run());
    } catch (e) {
      fail(e);
    }
  }

  // On a bound submit/click: stop the native action, fingerprint, append the
  // device_id (+ custom vars) as hidden fields, then let the form proceed.
  async function handleTrigger(
    el: TrackerElement,
    event: TrackerEvent,
    before?: (event: TrackerEvent) => void
  ): Promise<void> {
    if (before) safely(() => before(event));
    event.preventDefault();
    try {
      const fp = cached ?? (await run());
      el.appendHiddenField(`${prefix}device_id`, fp.device_id);
      for (const [k, v] of Object.entries(vars)) el.appendHiddenField(`${prefix}${k}`, v);
      fire(fp);
    } catch (e) {
      fail(e); // fail-open: still submit, so a fingerprint failure never blocks signup
    } finally {
      el.proceed();
    }
  }
}

function safely(fn: () => void): void {
  try {
    fn();
  } catch {
    // a customer callback throwing must never break the tracker
  }
}
