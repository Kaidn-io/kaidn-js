// Local playground for @kaidn/sdk. Run: `npm run playground` (from the repo root),
// then open http://127.0.0.1:8787, paste your API key, and score events against the
// live Kaidn API. Your key stays on this local server — it is never sent anywhere
// except to the Kaidn API by the SDK.
//
// Bound to localhost only. This is a dev tool, not something to expose publicly.
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { Kaidn, KaidnError } from "@kaidn/sdk";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const PORT = Number(process.env.PORT ?? 8787);
const ENV_KEY = process.env.KAIDN_API_KEY ?? "";
const BASE_URL = process.env.KAIDN_BASE_URL ?? "https://api.kaidn.io";

const PAGE = readFileSync(join(HERE, "index.html"), "utf8")
  .replace("%%ENV_KEY%%", ENV_KEY.replace(/"/g, "&quot;"))
  .replace("%%BASE_URL%%", BASE_URL);
const JSON_HEADERS = { "content-type": "application/json" };

// Bundle @kaidn/fp's collect() for the browser so the page can auto-detect a
// device_id. Best-effort: if esbuild/@kaidn/fp isn't available, device_id just
// stays manual — the rest of the playground still works.
let FP_BUNDLE = "window.KaidnFp=null;";
try {
  const { build } = await import("esbuild");
  const out = await build({
    stdin: {
      // resolve fp from source so no build step is needed (esbuild maps .js→.ts)
      contents: `import { collect } from "./packages/fp/src/index.js"; window.KaidnFp = { collect };`,
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
  console.warn("  (device_id auto-detect off — could not bundle @kaidn/fp:", err?.message ?? err, ")");
}

const server = createServer(async (req, res) => {
  if (req.method === "GET" && req.url === "/") {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(PAGE);
    return;
  }
  if (req.method === "GET" && req.url === "/fp.js") {
    res.writeHead(200, { "content-type": "application/javascript" });
    res.end(FP_BUNDLE);
    return;
  }
  if (req.method === "POST" && req.url === "/score") {
    try {
      const { apiKey, ...event } = JSON.parse(await readBody(req));
      if (!apiKey) {
        res.writeHead(400, JSON_HEADERS);
        res.end(JSON.stringify({ error: "Enter your Kaidn API key first." }));
        return;
      }
      const result = await new Kaidn({ apiKey, baseUrl: BASE_URL }).score(event);
      res.writeHead(200, JSON_HEADERS);
      res.end(JSON.stringify(result));
    } catch (err) {
      const status = err instanceof KaidnError ? err.status || 500 : 500;
      res.writeHead(status, JSON_HEADERS);
      res.end(JSON.stringify({ error: err?.message ?? "request failed" }));
    }
    return;
  }
  res.writeHead(404, JSON_HEADERS);
  res.end(JSON.stringify({ error: "not found" }));
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(
    `\n  Kaidn playground → http://127.0.0.1:${PORT}\n  scoring against ${BASE_URL}${ENV_KEY ? "  (API key loaded from env)" : ""}\n`
  );
});

function readBody(req) {
  return new Promise((resolve, reject) => {
    let d = "";
    req.on("data", (c) => (d += c));
    req.on("end", () => resolve(d || "{}"));
    req.on("error", reject);
  });
}
