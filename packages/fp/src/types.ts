/**
 * The payload @kaidn/fp produces in the browser. The integrator passes
 * `device_id` as the `device_id` field of POST /v1/score (so it flows straight
 * into the existing deviceReuse / velocity / fraud-graph machinery, all of which
 * already key on device_id) and `device` as the score body's `device` object.
 */
export interface FpDeviceSignals {
  /** high-confidence browser automation: webdriver flag, a headless UA, or no
   *  navigator.languages — tells a real user's browser never exhibits. */
  is_headless: boolean;
  /** the OS claimed by the User-Agent matches the real platform. `false` is a
   *  spoofing tell (e.g. a Windows UA on a Linux box — classic headless farm). */
  ua_consistent: boolean;
  /** an emulated / anti-detect environment: a software or VM GPU (SwiftShader,
   *  llvmpipe, VMware…) or farm-grade hardware. `true` is a strong VM / evasion
   *  tell that survives per-profile fingerprint randomization. */
  is_emulated?: boolean;
  /** canvas/WebGL readback was non-deterministic within the session — the same
   *  draw produced different bytes twice, which real GPU hardware never does.
   *  A high-precision tell that an anti-detect / canvas-defender browser is
   *  actively randomising the fingerprint (catches the ACT of spoofing, so it
   *  survives per-profile randomization). Suppressed for Brave (legit farbling). */
  is_noise_injected?: boolean;
}

/** human-readable device context surfaced for triage (the "richer payload"). */
export interface FpAttributes {
  os: string | null;
  browser: string | null;
  mobile: boolean | null;
  /** the browser's IANA timezone (e.g. "Europe/London"), or null if unavailable.
   *  The server checks it against the IP's country to catch a cloaked profile. */
  timezone: string | null;
}

export interface FpResult {
  /** stable device fingerprint. Pass as `device_id` to POST /v1/score. */
  device_id: string;
  /** automation signals for the score body's `device` object. */
  device: FpDeviceSignals;
  /** coarse device context (os/browser/mobile) parsed from the end-user's UA. */
  attributes: FpAttributes;
  /** soft anomaly codes (evidence/debugging only; the API does not require them). */
  anomalies: string[];
}
