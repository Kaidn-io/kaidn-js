import { getThumbmark } from "@thumbmarkjs/thumbmarkjs";
import { detectAutomation } from "./automation.js";
import { checkUaConsistency } from "./consistency.js";
import { detectEnvironment } from "./environment.js";
import { pickWebglRenderer, countFonts, type ComponentTree } from "./components.js";
import { parseUserAgent } from "./useragent.js";
import type { FpResult } from "./types.js";

export interface CollectOptions {
  /** per-component timeout for ThumbmarkJS, ms (default 3000). */
  timeoutMs?: number;
}

/**
 * Browser entry point. Computes a stable device fingerprint (via ThumbmarkJS —
 * its hash already stabilizes across incognito/VPN and survives cookie clears)
 * and layers on the fraud signals ThumbmarkJS OSS does not provide: automation
 * and UA-vs-platform consistency. This is the only browser-coupled module; all
 * scoring logic it calls is pure and unit-tested.
 *
 * @example
 *   const fp = await collect();
 *   await fetch("/score", { method: "POST", body: JSON.stringify({
 *     event: "signup", device_id: fp.device_id, device: fp.device,
 *   }) });
 */
export async function collect(options: CollectOptions = {}): Promise<FpResult> {
  const res = await getThumbmark({ timeout: options.timeoutMs ?? 3000 });
  const nav: Navigator | undefined = typeof navigator !== "undefined" ? navigator : undefined;
  const webglRenderer = pickWebglRenderer(res.components as ComponentTree);

  const automation = detectAutomation({
    webdriver: nav?.webdriver,
    userAgent: nav?.userAgent,
    languages: nav?.languages,
    pluginCount: nav?.plugins?.length,
    hardwareConcurrency: nav?.hardwareConcurrency,
  });

  const consistency = checkUaConsistency({
    userAgent: nav?.userAgent,
    platform: nav?.platform,
    webglRenderer,
  });

  // Anti-detect / VM detection — the deeper signals: software/VM GPU, farm-grade
  // hardware, sparse fonts. `deviceMemory` is a non-standard Chrome field.
  const environment = detectEnvironment({
    webglRenderer,
    hardwareConcurrency: nav?.hardwareConcurrency,
    deviceMemory: (nav as unknown as { deviceMemory?: number })?.deviceMemory,
    userAgent: nav?.userAgent,
    fontCount: countFonts(res.components as ComponentTree),
    maxTouchPoints: nav?.maxTouchPoints,
  });

  return {
    device_id: `fp_${res.thumbmark}`,
    device: {
      is_headless: automation.isHeadless,
      ua_consistent: consistency.consistent,
      is_emulated: environment.isEmulated,
    },
    attributes: parseUserAgent(nav?.userAgent),
    anomalies: automation.anomalies
      .concat(consistency.reason ? [consistency.reason] : [])
      .concat(environment.anomalies),
  };
}

/**
 * Collect the fingerprint AND post it to the Kaidn edge so the connection's JA4
 * TLS fingerprint is captured server-side against this device_id. Call this from
 * the END USER's browser (e.g. on your signup page) — that direct browser→edge
 * request is what makes the JA4 the user's, not your backend's. Your server then
 * calls /v1/score with the same device_id and inherits the captured signals.
 *
 * @param endpoint absolute URL of the beacon, e.g. "https://api.kaidn.io/v1/fp".
 * @param pk your tracker's publishable key (pk_live_…) from the Kaidn dashboard —
 *   required: the beacon is per-tenant and domain-locked.
 * @returns the same FpResult as collect(); the network POST is best-effort.
 *
 * @example
 *   const fp = await beacon("https://api.kaidn.io/v1/fp", "pk_live_xxx");
 *   myForm.dataset.deviceId = fp.device_id; // submit alongside the signup
 */
export async function beacon(endpoint: string, pk: string, options: CollectOptions = {}): Promise<FpResult> {
  const fp = await collect(options);
  await postBeacon(endpoint, pk, fp);
  return fp;
}

/** POST an already-collected fingerprint to the edge. Best-effort. */
async function postBeacon(endpoint: string, pk: string, fp: FpResult): Promise<void> {
  try {
    await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ pk, device_id: fp.device_id, device: fp.device, attributes: fp.attributes }),
      credentials: "omit",
      keepalive: true,
    });
  } catch {
    // best-effort: a failed beacon must never break the host page's signup flow.
  }
}

export interface WatchOptions extends CollectOptions {
  /** heartbeat interval in ms (default 60000). Clamped to a 20s floor. */
  intervalMs?: number;
}

/** Stop a running watch(). */
export type WatchHandle = { stop: () => void };

/**
 * Session heartbeat. Fingerprints ONCE, then re-beacons the same device_id on an
 * interval (and whenever the tab becomes visible again) so Kaidn sees the IP the
 * connection is coming from OVER TIME. The device_id + JA4 are constant across a
 * VPN change, so a beacon whose IP flips connection type on the same device is
 * the tell — a dropped VPN leaking the real home IP, or a device that started
 * cloaking mid-session. Call once when your page loads a logged-in/session view.
 *
 * @example
 *   const watch = Kaidn.watch("https://api.kaidn.io/v1/fp", "pk_live_xxx");
 *   // later, e.g. on logout / route change:
 *   watch.stop();
 */
export function watch(endpoint: string, pk: string, options: WatchOptions = {}): WatchHandle {
  const interval = Math.max(20_000, options.intervalMs ?? 60_000);
  let stopped = false;
  let fp: FpResult | undefined;
  let timer: ReturnType<typeof setInterval> | undefined;

  const ping = () => {
    if (stopped || !fp) return;
    // only beacon when the tab is actually visible — a hidden/background tab
    // isn't a live session and would add noise to the observation timeline.
    if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
    void postBeacon(endpoint, pk, fp);
  };

  const onVisible = () => {
    if (typeof document !== "undefined" && document.visibilityState === "visible") ping();
  };

  void collect(options).then((res) => {
    if (stopped) return;
    fp = res;
    void postBeacon(endpoint, pk, fp); // immediate first observation
    timer = setInterval(ping, interval);
    if (typeof document !== "undefined") document.addEventListener("visibilitychange", onVisible);
  });

  return {
    stop() {
      stopped = true;
      if (timer) clearInterval(timer);
      if (typeof document !== "undefined") document.removeEventListener("visibilitychange", onVisible);
    },
  };
}
