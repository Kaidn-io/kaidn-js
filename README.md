# kaidn-js

Official JavaScript / TypeScript client libraries for [**Kaidn**](https://kaidn.io) — the AI
fraud-scoring API. *Rules catch it, AI explains it.*

| Package | What it is | Runs in |
| --- | --- | --- |
| [`@kaidn/sdk`](./packages/sdk) | Server-side API client — score events, run checks, batch, lists, labels, analytics, config. | Node 18+ (your backend) |
| [`@kaidn/fp`](./packages/fp) | Browser device-fingerprint client — stable `device_id` + automation signals + JA4 beacon. | The browser |

```bash
npm install @kaidn/sdk   # server
npm install @kaidn/fp    # browser
```

## How they fit together

```mermaid
flowchart LR
    FP["@kaidn/fp<br/><small>browser</small>"]
    SDK["@kaidn/sdk<br/><small>your server</small>"]
    FPE["POST /v1/fp<br/><small>captures JA4</small>"]
    SCORE["POST /v1/score<br/><small>verdict + reasons</small>"]

    FP -- "beacon(pk_live_…)" --> FPE
    FP -- "device_id (via your form)" --> SDK
    SDK -- "secret API key" --> SCORE

    subgraph client [" open client (this repo) "]
        FP
        SDK
    end
    subgraph kaidn [" Kaidn — closed engine "]
        FPE
        SCORE
    end
```

1. **`@kaidn/fp`** runs in the browser and beacons a publishable, domain-locked key
   (`pk_live_…`) to `/v1/fp` — no secret in client code. It returns a `device_id`.
2. Your form submits that `device_id` to your backend.
3. **`@kaidn/sdk`** scores the event with your **secret** API key and gets back the verdict.

The scoring **engine** is closed — this repo is the *open client*.

## Examples

- `packages/sdk/examples/` — [score a signup](./packages/sdk/examples/score-signup.ts),
  [batch + lists](./packages/sdk/examples/batch-and-lists.ts)
- `packages/fp/examples/` — [browser beacon](./packages/fp/examples/browser-beacon.ts)

## Playground

Try scoring locally with your own API key — no code to write:

```bash
npm install
npm run playground     # → http://127.0.0.1:8787
```

Open the page, paste your `kaidn_…` API key, fill in an event (or hit **Clean user** /
**Likely fraud**), and **Run score**. You'll see the live verdict, reasons, and device
intel, plus copy-paste `@kaidn/sdk` and cURL snippets for your exact inputs. Your key
stays on the local server — it's only ever sent to the Kaidn API by the SDK.

> Prefer not to type the key each time? `KAIDN_API_KEY=kaidn_… npm run playground`
> pre-fills it. Point at a different environment with `KAIDN_BASE_URL=…`.

## Develop

```bash
npm install        # installs both workspaces
npm test           # runs each package's vitest suite
npm run typecheck
```

## Docs & license

Full API reference: [kaidn.io/docs](https://kaidn.io/docs). Both packages are MIT-licensed.
