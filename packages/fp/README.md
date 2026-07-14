# @kaidn/fp

Browser device-fingerprint client for [Kaidn](https://kaidn.io). Computes a stable
`device_id` plus automation signals (headless / UA-spoofing) and beacons them to the
Kaidn edge so the connection's JA4 TLS fingerprint is captured against that device.

> **Browser-only, and safe there.** This package holds no secret — the beacon uses a
> **publishable** key (`pk_live_…`) that is domain-locked in your Kaidn dashboard. Your
> _server_ then scores with the same `device_id` using [`@kaidn/sdk`](https://www.npmjs.com/package/@kaidn/sdk)
> and your secret API key. Never put your API key in the browser.

## Install

```bash
npm install @kaidn/fp
```

Or drop the pre-built tag in — no build step, `window.Kaidn` is set for you:

```html
<script src="https://api.kaidn.io/fp/pk_live_xxx.js" defer></script>
```

## Usage (bundler / SPA)

```ts
import { beacon } from "@kaidn/fp";

// on your signup / login / checkout page, from the END USER's browser:
const fp = await beacon("https://api.kaidn.io/v1/fp", "pk_live_xxx");

// submit fp.device_id alongside your form; your backend passes it to /v1/score
form.elements.namedItem("device_id").value = fp.device_id;
```

`collect()` computes the fingerprint without any network call:

```ts
import { collect } from "@kaidn/fp";
const { device_id, device, attributes, anomalies } = await collect();
```

## Why the browser call matters

JA4 is the fingerprint of whoever opens the TLS connection. Only a **direct
browser→edge** request (this beacon) captures the real end user's TLS stack; a
server-to-server call would capture your own backend's. The beacon associates the
JA4 with `device_id`, and your later `/v1/score` lookup inherits it.

## Exports

- `collect(options?)` — compute `{ device_id, device, attributes, anomalies }` (no network)
- `beacon(endpoint, pk, options?)` — `collect()` + best-effort POST to `/v1/fp`
- `watch(endpoint, pk, options?)` — session heartbeat: fingerprints once, then re-beacons
  the same `device_id` every ~60s (and on tab refocus) so Kaidn sees the connection's IP
  **over time**. Because `device_id` + JA4 stay constant across a VPN change, a beacon whose
  IP flips connection type mid-session (a dropped VPN leaking the real home IP, or a device
  that starts cloaking) is caught by scoring. Returns `{ stop() }`.
- `createTracker(deps)` — the testable core behind the `window.Kaidn` drop-in tag
- `detectAutomation`, `checkUaConsistency`, `parseUserAgent`, `flattenComponents`, `pickWebglRenderer` — the pure signal helpers

The verdict never comes back to the browser (by design) — scoring stays server-side.

## Server side

Pair this with [`@kaidn/sdk`](https://www.npmjs.com/package/@kaidn/sdk):

```ts
import { Kaidn } from "@kaidn/sdk";
const kaidn = new Kaidn({ apiKey: process.env.KAIDN_API_KEY! });
const { verdict } = await kaidn.score({ event: "signup", device_id, ip, email });
```
