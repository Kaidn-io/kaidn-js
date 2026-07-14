/** Verdicts the engine can return. */
export type Verdict = "allow" | "review" | "block";

/** One detector's finding, with the raw evidence behind it. */
export interface CheckResult {
  check: string;
  weight: number;
  reason: string;
  message: string;
  evidence: Record<string, unknown>;
}

/** Client device-integrity signals from @kaidn/fp (the browser fingerprint SDK).
 *  Pass the `device` object @kaidn/fp's collect() returns straight through. */
export interface DeviceSignals {
  /** high-confidence automation: webdriver / headless UA / no languages */
  is_headless?: boolean;
  /** the UA's claimed OS matches the real platform (`false` = a spoofing tell) */
  ua_consistent?: boolean;
  /** emulated / anti-detect environment (software or VM GPU, farm hardware) */
  is_emulated?: boolean;
  /** canvas/WebGL/audio readback was non-deterministic within the session —
   *  active fingerprint spoofing by an anti-detect / canvas-defender browser */
  is_noise_injected?: boolean;
  /** a native fingerprinting API was overridden (no longer `[native code]`) —
   *  a session-stable anti-detect browser (Multilogin/GoLogin/AdsPower) */
  is_tampered?: boolean;
  /** navigator/timezone differs between the main thread and a Web Worker —
   *  a spoofed window.navigator that missed the worker context */
  is_context_mismatch?: boolean;
  /** the real JS engine (V8 vs Gecko/JSC) contradicts the browser the UA claims */
  is_engine_mismatch?: boolean;
  /** an OS-truth signal (speech voices / Client Hints / Sec-CH-UA-Platform)
   *  reveals a different OS than the UA claims — a consistent OS spoof */
  is_os_mismatch?: boolean;
}

/** A scoring event — the body of POST /v1/score. `event` is the only required
 *  field; everything else is optional and improves the signal when present. */
export interface ScoreEvent {
  /** event-agnostic type: "signup" | "cashout" | "trial_start" | … */
  event: string;
  user_id?: string;
  ip?: string;
  email?: string;
  device_id?: string;
  device?: DeviceSignals;
  /** the client's IANA browser timezone (e.g. "Europe/London") from @kaidn/fp —
   *  checked server-side against the IP's country to catch a cloaked profile */
  timezone?: string;
  phone?: string;
  /** ISO country to parse a national `phone` against (e.g. "US") */
  phone_country?: string;
  /** ISO country the event should originate from (offer/payout geo) */
  event_country?: string;
  /** ISO country of the caller's IP, e.g. from your CDN header */
  ip_country?: string;
  source?: string;
  site?: string;
  campaign?: string;
  affiliate?: string;
  link?: string;
}

/** Server-side device intelligence returned alongside a score. */
export interface DeviceBlock {
  id: string;
  account_count: number;
  distinct_ips: number;
  unique: boolean;
  connection_type: "datacenter" | "residential" | null;
  os: string | null;
  browser: string | null;
  mobile: boolean | null;
  is_headless: boolean | null;
  ua_consistent: boolean | null;
  is_emulated: boolean | null;
  is_noise_injected: boolean | null;
  is_tampered: boolean | null;
  is_context_mismatch: boolean | null;
  is_engine_mismatch: boolean | null;
  is_os_mismatch: boolean | null;
  /** the client's IANA browser timezone, echoed back for triage */
  timezone: string | null;
  ja4: boolean;
  ja4_known_tool: string | null;
}

/** Response from POST /v1/score. */
export interface ScoreResponse {
  event_id: string;
  score: number;
  verdict: Verdict;
  reasons: string[];
  reason_text: string;
  checks: CheckResult[];
  device?: DeviceBlock;
  /** dropped/malformed optional fields, reported not rejected */
  warnings?: string[];
}

/** In-house network reputation for a checked entity (fraud graph + honeypot). */
export interface Reputation {
  recent_abuse: boolean;
  network_risk: number;
  network_operators: number;
  honeypot_hits: number;
}

/** Enrichment reports. The full field set is large and evolves, so these are
 *  open records with the guaranteed `fraud_score` surfaced. */
export type EnrichmentReport = { fraud_score: number } & Record<string, unknown>;

export interface EmailCheckResponse {
  email: EnrichmentReport;
  reputation: Reputation;
  summary: string;
}
export interface IpCheckResponse {
  ip: EnrichmentReport;
  reputation: Reputation;
  summary: string;
}
export interface PhoneCheckResponse {
  phone: EnrichmentReport;
  reputation: Reputation;
  summary: string;
}

/** Allow/blocklist primitives. */
export type ListKind = "allow" | "block";
export type EntityType = "ip" | "email" | "device" | "user";
export interface ListEntry {
  id: number;
  list: ListKind;
  type: EntityType;
  value: string;
  createdAt: string;
}
export interface ListImportRow {
  list: ListKind;
  type: EntityType;
  value: string;
}

/** Batch envelope. Every /v1/batch/* route returns this shape; `results[i]`
 *  carries `row` (index in the posted array), `ok`, and either the per-row
 *  output fields or `{ ok:false, error }`. */
export interface BatchRow {
  row: number;
  ok: boolean;
  error?: string;
  [k: string]: unknown;
}
export interface BatchResponse {
  summary: Record<string, number>;
  results: BatchRow[];
}

/** Feedback labels for the fraud graph. */
export type Label = "fraud" | "chargeback" | "legit";
export interface LabelInput {
  label: Label;
  /** reference a scored event (proof-of-observation, required to contribute a
   *  confirmed cross-tenant flag) */
  event_id?: string;
  /** or label explicit entities (audited locally, not propagated) */
  entities?: { ip?: string; email?: string; device_id?: string };
  note?: string;
}
export interface LabelResponse {
  ok: true;
  label: Label;
  entities: number;
  contributed: boolean;
  note?: string;
}

/** GDPR erasure input — at least one field required. */
export interface ForgetInput {
  email?: string;
  ip?: string;
  device_id?: string;
}
export interface ForgetResponse {
  ok: true;
  deleted_events: number;
  suppressed_entities: number;
}

export interface Suppression {
  action: string;
  entityType: string;
  valueHash: string;
  eventId?: string;
  createdAt?: string;
  [k: string]: unknown;
}

export interface EventRecord {
  id: string;
  event: string;
  userId?: string;
  ip?: string;
  emailDomain?: string;
  deviceId?: string;
  score: number;
  verdict: Verdict;
  reasons: string[];
  reasonText?: string;
  createdAt: string;
  [k: string]: unknown;
}
export interface EventsQuery {
  limit?: number;
  offset?: number;
  verdict?: Verdict;
  event?: string;
}

export interface Stats {
  total: number;
  byVerdict: { allow: number; review: number; block: number };
  avgScore: number;
  topReasons: { reason: string; count: number }[];
  ja4Count?: number;
  [k: string]: unknown;
}

export interface ConfigResponse {
  overrides: Record<string, unknown>;
  effective: Record<string, unknown>;
}

/** Options for `new Kaidn(...)`. */
export interface KaidnOptions {
  /** your secret API key (kaidn_…). Never expose this in a browser. */
  apiKey: string;
  /** API base URL. Defaults to https://api.kaidn.io */
  baseUrl?: string;
  /** per-request timeout in ms (default 10000) */
  timeoutMs?: number;
  /** retries on 429 / 5xx / network error (default 2) */
  retries?: number;
  /** inject a fetch implementation (tests, or Node < 18 with a polyfill) */
  fetch?: typeof fetch;
}
