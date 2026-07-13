import { describe, expect, it, vi } from "vitest";
import { Kaidn } from "./client.js";
import { KaidnError } from "./errors.js";

/** a fetch stub that records calls and returns a queued sequence of responses */
function stubFetch(responses: Array<{ status?: number; body?: unknown; headers?: Record<string, string> }>) {
  const calls: Array<{ url: string; method: string; headers: Record<string, string>; body?: unknown }> = [];
  let i = 0;
  const fn = vi.fn(async (url: string, init: RequestInit) => {
    const r = responses[Math.min(i, responses.length - 1)]!;
    i++;
    calls.push({
      url,
      method: init.method ?? "GET",
      headers: init.headers as Record<string, string>,
      body: init.body ? JSON.parse(init.body as string) : undefined,
    });
    const status = r.status ?? 200;
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => r.body ?? {},
      text: async () => (r.body === undefined ? "" : JSON.stringify(r.body)),
      headers: { get: (k: string) => r.headers?.[k.toLowerCase()] ?? null },
    } as unknown as Response;
  });
  return { fn: fn as unknown as typeof fetch, calls };
}

function client(fetchImpl: typeof fetch, extra: Partial<ConstructorParameters<typeof Kaidn>[0]> = {}) {
  return new Kaidn({ apiKey: "kaidn_test", fetch: fetchImpl, retries: 0, ...extra });
}

describe("Kaidn client — construction", () => {
  it("requires an apiKey", () => {
    // @ts-expect-error missing apiKey
    expect(() => new Kaidn({})).toThrow(/apiKey/);
  });
  it("throws when no fetch is available and none injected", () => {
    const saved = globalThis.fetch;
    // @ts-expect-error force-remove for the test
    globalThis.fetch = undefined;
    try {
      expect(() => new Kaidn({ apiKey: "k" })).toThrow(/fetch/);
    } finally {
      globalThis.fetch = saved;
    }
  });
  it("trims a trailing slash from baseUrl", async () => {
    const { fn, calls } = stubFetch([{ body: { status: "ok" } }]);
    await client(fn, { baseUrl: "https://x.test/" }).stats();
    expect(calls[0]!.url.startsWith("https://x.test/v1/stats")).toBe(true);
  });
});

describe("Kaidn client — requests", () => {
  it("scores with the x-api-key header and POST body", async () => {
    const { fn, calls } = stubFetch([{ body: { event_id: "e1", score: 12, verdict: "allow", reasons: [] } }]);
    const r = await client(fn).score({ event: "signup", ip: "8.8.8.8" });
    expect(r.verdict).toBe("allow");
    expect(calls[0]!.method).toBe("POST");
    expect(calls[0]!.url).toContain("/v1/score");
    expect(calls[0]!.headers["x-api-key"]).toBe("kaidn_test");
    expect(calls[0]!.body).toEqual({ event: "signup", ip: "8.8.8.8" });
  });

  it("maps the check namespace to the right paths", async () => {
    const { fn, calls } = stubFetch([{ body: {} }, { body: {} }, { body: {} }]);
    const k = client(fn);
    await k.check.email("a@b.com");
    await k.check.ip("1.2.3.4");
    await k.check.phone("+15551234567", "US");
    expect(calls.map((c) => c.url.replace(/^https:\/\/[^/]+/, ""))).toEqual([
      "/v1/check/email",
      "/v1/check/ip",
      "/v1/check/phone",
    ]);
    expect(calls[2]!.body).toEqual({ phone: "+15551234567", country: "US" });
  });

  it("batch.score posts a rows envelope", async () => {
    const { fn, calls } = stubFetch([{ body: { summary: { total: 2 }, results: [] } }]);
    await client(fn).batch.score([{ event: "signup" }, { event: "cashout" }]);
    expect(calls[0]!.url).toContain("/v1/batch/score");
    expect(calls[0]!.body).toEqual({ rows: [{ event: "signup" }, { event: "cashout" }] });
  });

  it("lists.add / lists.remove hit the right method+path", async () => {
    const { fn, calls } = stubFetch([{ status: 201, body: { entry: {} } }, { body: { removed: true } }]);
    const k = client(fn);
    await k.lists.add("block", "ip", "203.0.113.5");
    await k.lists.remove(42);
    expect(calls[0]!.method).toBe("POST");
    expect(calls[0]!.body).toEqual({ list: "block", type: "ip", value: "203.0.113.5" });
    expect(calls[1]!.method).toBe("DELETE");
    expect(calls[1]!.url).toContain("/v1/lists/42");
  });

  it("serializes query params and drops undefined", async () => {
    const { fn, calls } = stubFetch([{ body: { events: [] } }]);
    await client(fn).events({ limit: 50, verdict: "block" });
    const u = new URL(calls[0]!.url);
    expect(u.searchParams.get("limit")).toBe("50");
    expect(u.searchParams.get("verdict")).toBe("block");
    expect(u.searchParams.has("offset")).toBe(false);
  });

  it("config.set uses PUT", async () => {
    const { fn, calls } = stubFetch([{ body: { overrides: {}, effective: {} } }]);
    await client(fn).config.set({ weights: { datacenterIp: 50 } });
    expect(calls[0]!.method).toBe("PUT");
    expect(calls[0]!.url).toContain("/v1/config");
  });
});

describe("Kaidn client — errors + retries", () => {
  it("throws a KaidnError carrying status + the API error message", async () => {
    const { fn } = stubFetch([{ status: 400, body: { error: "requires an event" } }]);
    await expect(client(fn).score({ event: "" })).rejects.toMatchObject({
      name: "KaidnError",
      status: 400,
      message: "requires an event",
    });
  });

  it("surfaces a 429 as a retryable KaidnError", async () => {
    const { fn } = stubFetch([{ status: 429, body: { error: "monthly quota exceeded" } }]);
    const err = await client(fn).score({ event: "signup" }).catch((e) => e);
    expect(err).toBeInstanceOf(KaidnError);
    expect(err.status).toBe(429);
    expect(err.retryable).toBe(true);
  });

  it("does NOT retry a 4xx", async () => {
    const { fn, calls } = stubFetch([{ status: 400, body: { error: "bad" } }]);
    await client(fn, { retries: 3 }).score({ event: "signup" }).catch(() => {});
    expect(calls).toHaveLength(1);
  });

  it("retries a 5xx up to `retries` then succeeds", async () => {
    const { fn, calls } = stubFetch([
      { status: 503, body: { error: "unavailable" } },
      { body: { event_id: "e", score: 0, verdict: "allow", reasons: [] } },
    ]);
    const r = await client(fn, { retries: 2 }).score({ event: "signup" });
    expect(r.event_id).toBe("e");
    expect(calls).toHaveLength(2);
  });

  it("retries a network error then throws status 0 if it never recovers", async () => {
    let n = 0;
    const fn = vi.fn(async () => {
      n++;
      throw new Error("ECONNRESET");
    }) as unknown as typeof fetch;
    const err = await client(fn, { retries: 1 }).score({ event: "signup" }).catch((e) => e);
    expect(err).toBeInstanceOf(KaidnError);
    expect(err.status).toBe(0);
    expect(n).toBe(2); // initial + 1 retry
  });
});
