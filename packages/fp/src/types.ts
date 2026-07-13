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
}

/** human-readable device context surfaced for triage (the "richer payload"). */
export interface FpAttributes {
  os: string | null;
  browser: string | null;
  mobile: boolean | null;
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
