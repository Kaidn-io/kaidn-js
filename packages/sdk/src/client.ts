import { KaidnError } from "./errors.js";
import type {
  BatchResponse,
  ConfigResponse,
  EmailCheckResponse,
  EventRecord,
  EventsQuery,
  ForgetInput,
  ForgetResponse,
  IpCheckResponse,
  KaidnOptions,
  LabelInput,
  LabelResponse,
  ListEntry,
  ListImportRow,
  ListKind,
  EntityType,
  PhoneCheckResponse,
  ScoreEvent,
  ScoreResponse,
  Stats,
  Suppression,
} from "./types.js";

const DEFAULT_BASE_URL = "https://api.kaidn.io";
const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_RETRIES = 2;

interface RequestOptions {
  body?: unknown;
  query?: Record<string, string | number | undefined>;
}

/**
 * Server-side client for the Kaidn API. Holds your secret API key — construct
 * it in your backend only, never ship it to a browser (use @kaidn/fp there).
 *
 * @example
 *   import { Kaidn } from "@kaidn/sdk";
 *   const kaidn = new Kaidn({ apiKey: process.env.KAIDN_API_KEY! });
 *   const r = await kaidn.score({ event: "signup", ip, email, device_id });
 *   if (r.verdict === "block") denySignup();
 */
export class Kaidn {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly retries: number;
  private readonly fetchImpl: typeof fetch;

  constructor(options: KaidnOptions) {
    if (!options?.apiKey) throw new Error("Kaidn: `apiKey` is required");
    this.apiKey = options.apiKey;
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.retries = options.retries ?? DEFAULT_RETRIES;
    const f = options.fetch ?? globalThis.fetch;
    if (!f) {
      throw new Error(
        "Kaidn: no global fetch found. Use Node 18+, or pass `fetch` in the options."
      );
    }
    this.fetchImpl = f;
  }

  // ---- scoring ----------------------------------------------------------

  /** Score a single event. The core `/v1/score` call. */
  score(event: ScoreEvent): Promise<ScoreResponse> {
    return this.request<ScoreResponse>("POST", "/v1/score", { body: event });
  }

  /** Keyed single-entity enrichment lookups (`/v1/check/*`). */
  readonly check = {
    email: (email: string): Promise<EmailCheckResponse> =>
      this.request("POST", "/v1/check/email", { body: { email } }),
    ip: (ip: string): Promise<IpCheckResponse> =>
      this.request("POST", "/v1/check/ip", { body: { ip } }),
    phone: (phone: string, country?: string): Promise<PhoneCheckResponse> =>
      this.request("POST", "/v1/check/phone", { body: { phone, ...(country ? { country } : {}) } }),
  };

  // ---- bulk (CSV/JSON) --------------------------------------------------

  /** Bulk variants of scoring, the checks, and lists import. Each row consumes
   *  one unit of monthly quota, just like the single-row calls; up to 1000 rows
   *  per request (chunk larger inputs yourself). */
  readonly batch = {
    score: (rows: ScoreEvent[]): Promise<BatchResponse> =>
      this.request("POST", "/v1/batch/score", { body: { rows } }),
    check: {
      email: (rows: { email: string }[]): Promise<BatchResponse> =>
        this.request("POST", "/v1/batch/check/email", { body: { rows } }),
      ip: (rows: { ip: string }[]): Promise<BatchResponse> =>
        this.request("POST", "/v1/batch/check/ip", { body: { rows } }),
      phone: (rows: { phone: string; country?: string }[]): Promise<BatchResponse> =>
        this.request("POST", "/v1/batch/check/phone", { body: { rows } }),
    },
    lists: (rows: ListImportRow[]): Promise<BatchResponse> =>
      this.request("POST", "/v1/batch/lists", { body: { rows } }),
  };

  // ---- allow / blocklists ----------------------------------------------

  readonly lists = {
    /** all entries for the tenant */
    list: (): Promise<{ entries: ListEntry[] }> => this.request("GET", "/v1/lists"),
    /** add one entry */
    add: (list: ListKind, type: EntityType, value: string): Promise<{ entry: ListEntry }> =>
      this.request("POST", "/v1/lists", { body: { list, type, value } }),
    /** remove one entry by id */
    remove: (id: number): Promise<{ removed: boolean }> =>
      this.request("DELETE", `/v1/lists/${encodeURIComponent(String(id))}`),
    /** bulk import (alias of batch.lists) */
    import: (rows: ListImportRow[]): Promise<BatchResponse> => this.batch.lists(rows),
  };

  // ---- feedback loop + privacy -----------------------------------------

  /** Report a real outcome (fraud / chargeback / legit) to sharpen the graph. */
  label(input: LabelInput): Promise<LabelResponse> {
    return this.request("POST", "/v1/label", { body: input });
  }

  /** GDPR erasure: purge a data subject from this tenant + suppress the entity. */
  forget(input: ForgetInput): Promise<ForgetResponse> {
    return this.request("POST", "/v1/forget", { body: input });
  }

  /** Audit trail of local suppressions (legit labels + forgets). */
  suppressions(limit?: number): Promise<{ suppressions: Suppression[] }> {
    return this.request("GET", "/v1/suppressions", { query: { limit } });
  }

  // ---- analytics --------------------------------------------------------

  /** Scored events, newest first. */
  events(query: EventsQuery = {}): Promise<{ events: EventRecord[] }> {
    return this.request("GET", "/v1/events", {
      query: {
        limit: query.limit,
        offset: query.offset,
        verdict: query.verdict,
        event: query.event,
      },
    });
  }

  /** Verdict/score/reason rollups over a rolling window (default 24h). */
  stats(windowHours?: number): Promise<Stats> {
    return this.request("GET", "/v1/stats", { query: { window_hours: windowHours } });
  }

  // ---- tenant config ----------------------------------------------------

  readonly config = {
    /** current overrides + the effective (merged) engine config */
    get: (): Promise<ConfigResponse> => this.request("GET", "/v1/config"),
    /** replace the tenant's weight/threshold overrides */
    set: (overrides: Record<string, unknown>): Promise<ConfigResponse> =>
      this.request("PUT", "/v1/config", { body: overrides }),
  };

  /** Opt this tenant's data into / out of the cross-operator fraud graph. */
  graphSharing(enabled: boolean): Promise<{ graphShared: boolean }> {
    return this.request("POST", "/auth/graph-sharing", { body: { enabled } });
  }

  // ---- transport --------------------------------------------------------

  private async request<T>(method: string, path: string, opts: RequestOptions = {}): Promise<T> {
    const url = new URL(this.baseUrl + path);
    if (opts.query) {
      for (const [k, v] of Object.entries(opts.query)) {
        if (v !== undefined && v !== "") url.searchParams.set(k, String(v));
      }
    }
    const headers: Record<string, string> = { "x-api-key": this.apiKey };
    let payload: string | undefined;
    if (opts.body !== undefined) {
      headers["content-type"] = "application/json";
      payload = JSON.stringify(opts.body);
    }

    let lastError: KaidnError | undefined;
    for (let attempt = 0; attempt <= this.retries; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      let res: Response;
      try {
        res = await this.fetchImpl(url.toString(), {
          method,
          headers,
          body: payload,
          signal: controller.signal,
        });
      } catch (err) {
        // network error or timeout → status 0, retryable
        lastError = new KaidnError(0, err instanceof Error ? err.message : "network error");
        clearTimeout(timer);
        if (attempt < this.retries) {
          await sleep(backoffMs(attempt));
          continue;
        }
        throw lastError;
      } finally {
        clearTimeout(timer);
      }

      if (res.ok) return (await res.json()) as T;

      const { message, body } = await readError(res);
      const error = new KaidnError(res.status, message, body);
      if (error.retryable && attempt < this.retries) {
        lastError = error;
        await sleep(retryAfterMs(res) ?? backoffMs(attempt));
        continue;
      }
      throw error;
    }
    // unreachable in practice; the loop either returns or throws
    throw lastError ?? new KaidnError(0, "request failed");
  }
}

/** Prefer the API's JSON `{ error }` string; fall back to raw text. */
async function readError(res: Response): Promise<{ message: string; body?: unknown }> {
  const text = await res.text().catch(() => "");
  try {
    const parsed = JSON.parse(text) as { error?: unknown };
    if (parsed && typeof parsed.error === "string") return { message: parsed.error, body: parsed };
    return { message: text.slice(0, 300) || `request failed (${res.status})`, body: parsed };
  } catch {
    return { message: text.slice(0, 300) || `request failed (${res.status})` };
  }
}

/** Honour a `Retry-After` header (seconds) when the server sends one. */
function retryAfterMs(res: Response): number | undefined {
  const h = res.headers.get("retry-after");
  if (!h) return undefined;
  const secs = Number(h);
  return Number.isFinite(secs) ? Math.max(0, secs * 1000) : undefined;
}

/** Exponential backoff with jitter: ~0.5s, 1s, 2s, … */
function backoffMs(attempt: number): number {
  const base = 500 * 2 ** attempt;
  return base + Math.floor(Math.random() * 250);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
