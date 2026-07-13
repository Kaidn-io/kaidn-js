# @kaidn/sdk

Official Node / TypeScript server-side client for the [Kaidn](https://kaidn.io) fraud-scoring API.

> **Server-side only.** This client holds your secret API key — use it in your backend.
> For the browser (device fingerprinting), use the `<script>` tracker or `@kaidn/fp`; never
> put your API key in client code.

## Install

```bash
npm install @kaidn/sdk
```

Requires Node 18+ (uses the built-in `fetch`).

## Quick start

```ts
import { Kaidn } from "@kaidn/sdk";

const kaidn = new Kaidn({ apiKey: process.env.KAIDN_API_KEY! });

const result = await kaidn.score({
  event: "signup",
  ip: "203.0.113.7",
  email: "user@example.com",
  device_id: "fp_abc123", // from @kaidn/fp in the browser
});

if (result.verdict === "block") denySignup(result.reasons);
```

## What's covered

Every keyed endpoint an API key can reach:

| Area | Method |
| --- | --- |
| Score an event | `kaidn.score(event)` |
| Enrichment lookups | `kaidn.check.email(email)` · `kaidn.check.ip(ip)` · `kaidn.check.phone(phone, country?)` |
| Bulk (CSV/JSON, ≤1000 rows) | `kaidn.batch.score(rows)` · `kaidn.batch.check.{email,ip,phone}(rows)` · `kaidn.batch.lists(rows)` |
| Allow / blocklists | `kaidn.lists.list()` · `kaidn.lists.add(list, type, value)` · `kaidn.lists.remove(id)` · `kaidn.lists.import(rows)` |
| Feedback loop | `kaidn.label({ label, event_id })` |
| GDPR erasure | `kaidn.forget({ email })` · `kaidn.suppressions()` |
| Analytics | `kaidn.events(query)` · `kaidn.stats(windowHours)` |
| Custom rules | `kaidn.config.get()` · `kaidn.config.set(overrides)` |
| Fraud-graph opt-in | `kaidn.graphSharing(enabled)` |

## Examples

```ts
// enrichment lookup
const { reputation, summary } = await kaidn.check.ip("203.0.113.7");

// bulk score a CSV you've parsed into rows (each row = 1 event of quota)
const { summary: s, results } = await kaidn.batch.score(rows);
console.log(`${s.block} blocked of ${s.total}`);

// report a confirmed chargeback to sharpen the shared graph
await kaidn.label({ label: "chargeback", event_id: result.event_id });

// bulk-import a blocklist
await kaidn.lists.import([
  { list: "block", type: "ip", value: "203.0.113.5" },
  { list: "block", type: "email", value: "fraud@example.com" },
]);
```

## Errors

Non-2xx responses throw a `KaidnError` with the HTTP `status` and the API's message.
Transient failures (network, timeout, `429`, `5xx`) are retried automatically (default 2,
honouring `Retry-After`).

```ts
import { KaidnError } from "@kaidn/sdk";

try {
  await kaidn.score({ event: "signup" });
} catch (err) {
  if (err instanceof KaidnError && err.status === 429) {
    // monthly quota exhausted — back off or upgrade
  }
}
```

## Options

```ts
new Kaidn({
  apiKey: "kaidn_…",           // required
  baseUrl: "https://api.kaidn.io", // default
  timeoutMs: 10_000,            // per-request timeout
  retries: 2,                   // on network / 429 / 5xx
  fetch: myFetch,               // inject a fetch impl (tests / polyfills)
});
```
