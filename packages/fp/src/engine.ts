/**
 * JS-engine ↔ claimed-UA consistency. Every browser ships a specific JavaScript
 * engine — Chrome/Edge/Opera use V8, Firefox uses SpiderMonkey (Gecko), Safari
 * uses JavaScriptCore (WebKit) — and the engine leaves an unspoofable tell in the
 * shape of an Error stack: V8 formats frames as "    at fn (url)", while Gecko
 * and JSC use "fn@url". An anti-detect / emulation setup that claims one browser
 * in its User-Agent while running on another engine (e.g. a desktop Chromium tool
 * emulating an iOS Safari UA, or a Gecko-based tool spoofing Chrome) can't hide
 * the engine — the stack format betrays it. Deterministic, offline, and the stack
 * is far harder to patch consistently than a UA string.
 *
 * Coarse V8-vs-non-V8 on purpose (that's all the mismatch needs) with the one
 * critical carve-out: iOS forces every browser onto WebKit, so an iOS "Chrome"
 * UA legitimately runs non-V8 and must NOT flag. Unknown either side → quiet
 * (fail-safe). Pure + DOM-free for testing.
 */
export type EngineFamily = "v8" | "nonv8" | "unknown";

export interface EngineInput {
  userAgent?: string;
  /** a fresh `new Error().stack` captured in the page context. */
  stack?: string;
}

export interface EngineResult {
  mismatch: boolean;
  /** e.g. "ua_v8_engine_nonv8" — evidence when flagged. */
  reason?: string;
}

/** The engine family implied by an Error stack's frame format. */
export function engineFromStack(stack: string | undefined): EngineFamily {
  if (!stack) return "unknown";
  // V8: "\n    at fn (url:line:col)". Gecko/JSC: "fn@url:line:col".
  if (/\n\s+at\s/.test(stack)) return "v8";
  if (/@/.test(stack)) return "nonv8";
  return "unknown";
}

/** The engine family a User-Agent claims. iOS is always WebKit (non-V8). */
export function expectedEngine(ua: string | undefined): EngineFamily {
  if (!ua) return "unknown";
  // iOS forces WebKit for EVERY browser brand — an iOS Chrome/Firefox UA is
  // legitimately non-V8, so short-circuit before the brand checks.
  if (/iphone|ipad|ipod/i.test(ua)) return "nonv8";
  if (/edg(a|ios)?\//i.test(ua)) return "v8"; // Edge (Chromium)
  if (/opr\/|opera/i.test(ua)) return "v8"; // Opera (Chromium)
  if (/samsungbrowser/i.test(ua)) return "v8"; // Samsung Internet (Chromium)
  if (/firefox|fxios/i.test(ua)) return "nonv8"; // fxios already handled by iOS above
  if (/chrome|crios|chromium/i.test(ua)) return "v8";
  if (/safari/i.test(ua)) return "nonv8"; // desktop Safari → JSC
  return "unknown";
}

/**
 * True when the JS engine (from the Error stack) contradicts the engine the UA
 * claims — a spoofed User-Agent. Only fires when BOTH sides are known, so a niche
 * engine or an empty stack can never manufacture a false positive.
 */
export function detectEngineMismatch(input: EngineInput): EngineResult {
  const engine = engineFromStack(input.stack);
  if (engine === "unknown") return { mismatch: false };
  const expected = expectedEngine(input.userAgent);
  if (expected === "unknown") return { mismatch: false };
  if (expected !== engine) return { mismatch: true, reason: `ua_${expected}_engine_${engine}` };
  return { mismatch: false };
}
