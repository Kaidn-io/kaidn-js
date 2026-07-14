// Local playground server for the Kaidn client libraries. Run `npm run playground`
// from the repo root, then open http://127.0.0.1:8787.
//
// It does three small things:
//   1. serves the static pages in ./public (the Score + Fingerprint playgrounds),
//   2. serves /fp.js — a browser build of @kaidn/fp (collect + beacon),
//   3. proxies POST /score through @kaidn/sdk so your SECRET api key stays here on
//      the server and is never exposed to the page.
//
// Bound to localhost only. This is a dev tool, not something to expose publicly.
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, extname, normalize } from "node:path";
import { Kaidn, KaidnError } from "@kaidn/sdk";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const PUBLIC = join(HERE, "public");

// Load .env (if present) so `npm run playground` picks up your keys. Node 20.12+.
if (typeof process.loadEnvFile === "function") {
  try {
    process.loadEnvFile(join(ROOT, ".env"));
  } catch {
    /* no .env — fine, use exported env vars or the in-page fields */
  }
}

const PORT = Number(process.env.PORT ?? 8787);
const ENV_KEY = process.env.KAIDN_API_KEY ?? "";
const ENV_PK = process.env.KAIDN_TRACKER_PK ?? "";
const BASE_URL = process.env.KAIDN_BASE_URL ?? "https://api.kaidn.io";

// Config the pages read (window.KAIDN_CFG). The api key is only here so the local
// pages can pre-fill their field for convenience — it never leaves your machine
// except to the Kaidn API via the SDK.
const CONFIG_JS = `window.KAIDN_CFG=${JSON.stringify({ baseUrl: BASE_URL, apiKey: ENV_KEY, trackerPk: ENV_PK })};`;

// Browser build of @kaidn/fp (from source, so no build step). Best-effort: if it
// can't bundle, the fingerprint page shows a clear message instead of breaking.
let FP_BUNDLE = "window.KaidnFp=null;";
try {
  const { build } = await import("esbuild");
  const out = await build({
    stdin: {
      contents: `import { collect, beacon, watch } from "./packages/fp/src/index.js"; window.KaidnFp = { collect, beacon, watch };`,
      resolveDir: ROOT,
      loader: "ts",
    },
    bundle: true,
    minify: true,
    format: "iife",
    platform: "browser",
    target: ["es2019"],
    write: false,
  });
  FP_BUNDLE = out.outputFiles[0].text;
} catch (err) {
  console.warn("  (fingerprint page limited — could not bundle @kaidn/fp:", err?.message ?? err, ")");
}

const TYPES = { ".html": "text/html; charset=utf-8", ".js": "application/javascript", ".css": "text/css" };

const server = createServer(async (req, res) => {
  const url = (req.url ?? "/").split("?")[0];

  if (req.method === "GET" && url === "/config.js") return send(res, 200, ".js", CONFIG_JS);
  if (req.method === "GET" && url === "/fp.js") return send(res, 200, ".js", FP_BUNDLE);

  if (req.method === "POST" && url === "/score") {
    try {
      const { apiKey, ...event } = JSON.parse(await readBody(req));
      const key = apiKey || ENV_KEY;
      if (!key) return send(res, 400, ".js", JSON.stringify({ error: "Enter your Kaidn API key (or set KAIDN_API_KEY)." }));
      const result = await new Kaidn({ apiKey: key, baseUrl: BASE_URL }).score(event);
      return send(res, 200, ".js", JSON.stringify(result));
    } catch (err) {
      const status = err instanceof KaidnError ? err.status || 500 : 500;
      return send(res, status, ".js", JSON.stringify({ error: err?.message ?? "request failed" }));
    }
  }

  // proxy the device observation timeline (heartbeat monitor). Keeps the API key
  // on the server; the page polls this while watch() beacons.
  if (req.method === "GET" && url === "/observations") {
    const deviceId = new URL(req.url, "http://x").searchParams.get("device_id");
    const key = ENV_KEY;
    if (!key) return send(res, 400, ".js", JSON.stringify({ error: "Set KAIDN_API_KEY to read the timeline." }));
    if (!deviceId) return send(res, 400, ".js", JSON.stringify({ error: "device_id required" }));
    try {
      const r = await fetch(`${BASE_URL}/v1/device/${encodeURIComponent(deviceId)}/observations`, {
        headers: { "x-api-key": key },
      });
      return send(res, r.status, ".js", await r.text());
    } catch (err) {
      return send(res, 502, ".js", JSON.stringify({ error: err?.message ?? "upstream error" }));
    }
  }

  // static files from ./public (path-traversal-safe)
  if (req.method === "GET") {
    const rel = url === "/" ? "index.html" : url.replace(/^\/+/, "");
    const file = normalize(join(PUBLIC, rel));
    if (file.startsWith(PUBLIC) && existsSync(file)) {
      return send(res, 200, extname(file), readFileSync(file));
    }
  }
  send(res, 404, ".js", JSON.stringify({ error: "not found" }));
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(
    `\n  Kaidn playground → http://127.0.0.1:${PORT}\n` +
      `    • Score        /            ${ENV_KEY ? "(api key from env)" : "(paste your api key in the page)"}\n` +
      `    • Fingerprint  /fingerprint\n` +
      `  scoring against ${BASE_URL}\n`
  );
});

function send(res, status, ext, body) {
  res.writeHead(status, { "content-type": TYPES[ext] ?? "application/octet-stream" });
  res.end(body);
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let d = "";
    req.on("data", (c) => (d += c));
    req.on("end", () => resolve(d || "{}"));
    req.on("error", reject);
  });
}
