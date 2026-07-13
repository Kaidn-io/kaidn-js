/**
 * Thrown on any non-2xx response (and on a network/timeout failure, with
 * `status: 0`). `message` is the API's `{ error }` string when present. Quota
 * exhaustion surfaces as `status: 429` — check `err.status === 429` to prompt
 * an upgrade or back off.
 */
export class KaidnError extends Error {
  readonly status: number;
  /** the parsed JSON error body, when the response had one */
  readonly body?: unknown;

  constructor(status: number, message: string, body?: unknown) {
    super(message);
    this.name = "KaidnError";
    this.status = status;
    this.body = body;
  }

  /** true when the failure is worth retrying (transient): network, timeout,
   *  rate limit, or a 5xx. A 4xx (bad input, bad key) is not. */
  get retryable(): boolean {
    return this.status === 0 || this.status === 429 || this.status >= 500;
  }
}
