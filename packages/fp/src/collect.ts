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
  return fp;
}
