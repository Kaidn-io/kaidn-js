import { getThumbmark } from "@thumbmarkjs/thumbmarkjs";
import { detectAutomation } from "./automation.js";
import { checkUaConsistency } from "./consistency.js";
import { detectEnvironment } from "./environment.js";
import { detectNoiseInjection } from "./noise.js";
import { detectTamper, type TamperProbe } from "./tamper.js";
import { compareContexts, type ContextSnapshot } from "./context.js";
import { detectEngineMismatch } from "./engine.js";
import { detectOsMismatch, type VoiceLike } from "./os.js";
import { pickWebglRenderer, countFonts, listFonts, type ComponentTree } from "./components.js";
import { parseUserAgent } from "./useragent.js";
import type { FpResult } from "./types.js";

export interface CollectOptions {
  /** per-component timeout for ThumbmarkJS, ms (default 3000). */
  timeoutMs?: number;
}

/**
 * Browser entry point. Computes a stable device fingerprint (via ThumbmarkJS —
 * its hash already stabilizes across incognito/VPN and survives cookie clears)
 * and layers on the fraud signals ThumbmarkJS OSS does not provide: automation
 * and UA-vs-platform consistency. This is the only browser-coupled module; all
 * scoring logic it calls is pure and unit-tested.
 *
 * @example
 *   const fp = await collect();
 *   await fetch("/score", { method: "POST", body: JSON.stringify({
 *     event: "signup", device_id: fp.device_id, device: fp.device,
 *   }) });
 */
export async function collect(options: CollectOptions = {}): Promise<FpResult> {
  const res = await getThumbmark({ timeout: options.timeoutMs ?? 3000 });
  const nav: Navigator | undefined = typeof navigator !== "undefined" ? navigator : undefined;
  const webglRenderer = pickWebglRenderer(res.components as ComponentTree);

  const automation = detectAutomation({
    webdriver: nav?.webdriver,
    userAgent: nav?.userAgent,
    languages: nav?.languages,
    pluginCount: nav?.plugins?.length,
    hardwareConcurrency: nav?.hardwareConcurrency,
  });

  const consistency = checkUaConsistency({
    userAgent: nav?.userAgent,
    platform: nav?.platform,
    webglRenderer,
  });

  // Anti-detect / VM detection — the deeper signals: software/VM GPU, farm-grade
  // hardware, sparse fonts. `deviceMemory` is a non-standard Chrome field.
  const environment = detectEnvironment({
    webglRenderer,
    hardwareConcurrency: nav?.hardwareConcurrency,
    deviceMemory: (nav as unknown as { deviceMemory?: number })?.deviceMemory,
    userAgent: nav?.userAgent,
    fontCount: countFonts(res.components as ComponentTree),
    maxTouchPoints: nav?.maxTouchPoints,
  });

  // Noise injection: render the same canvas + WebGL (+ audio) twice and compare.
  // Real hardware is deterministic; a difference means an anti-detect / canvas-
  // defender browser is randomising the fingerprint per read. Brave's farbling
  // does this legitimately, so it's suppressed.
  const first = renderSignatures();
  const second = renderSignatures();
  // AudioContext is another deterministic surface anti-detect tools farble; a
  // per-render OfflineAudioContext hash differs only if noise is injected.
  const audio1 = await audioSignature();
  const audio2 = await audioSignature();
  if (audio1 != null && audio2 != null) {
    first.push(audio1);
    second.push(audio2);
  }
  const noiseInjected = detectNoiseInjection({ first, second, isBrave: isBraveBrowser(nav) });

  const timezone = resolveTimezone();

  // Native-code lie detection: the spoofed canvas/WebGL/navigator APIs an anti-
  // detect browser overrides no longer report `[native code]`. Catches session-
  // stable tools (Multilogin/GoLogin/AdsPower) that fixed per-profile noise hides
  // from the value-comparison checks above. Brave farbles at engine level (no JS
  // wrappers) so it stays clean.
  const isBrave = isBraveBrowser(nav);
  const tamper = detectTamper({ probes: gatherTamperProbes(), toStringIntact: fnToStringIntact(), isBrave });

  // Cross-context comparison: an anti-detect tool patches window.navigator but
  // usually misses the Web Worker's, so the worker reports the real UA/CPU/tz.
  const workerCtx = await workerSnapshot();
  const mainCtx: ContextSnapshot = {
    userAgent: nav?.userAgent,
    hardwareConcurrency: nav?.hardwareConcurrency,
    platform: nav?.platform,
    timezone,
  };
  const context = compareContexts(mainCtx, workerCtx);

  // JS-engine vs claimed UA: an Error stack's frame format reveals the real
  // engine (V8 vs Gecko/JSC), which a spoofed User-Agent can't hide — catches
  // engine/UA emulation (e.g. a Chromium tool claiming an iOS Safari UA).
  const engine = detectEngineMismatch({ userAgent: nav?.userAgent, stack: new Error().stack });

  // OS-truth cross-check: catch a CONSISTENT OS spoof (ua_consistent passes) by
  // reading signals that leak the real OS — speech-synthesis voices + Client
  // Hints — against the OS the UA claims. The strongest surface (the edge
  // Sec-CH-UA-Platform header) is checked server-side.
  const uaAttrs = parseUserAgent(nav?.userAgent);
  const os = detectOsMismatch({
    claimed: uaAttrs.os,
    voices: await loadVoices(),
    clientHintsPlatform: (nav as unknown as { userAgentData?: { platform?: string } })?.userAgentData?.platform,
    fonts: listFonts(res.components as ComponentTree),
  });

  return {
    device_id: `fp_${res.thumbmark}`,
    device: {
      // All detection results are explicit booleans (false = ran, not detected),
      // matching is_headless/is_emulated — so a clean device reports `false`, not
      // an ambiguous absent value. The engine treats absent and false the same
      // (it only acts on `=== true`), so this stays "quiet unless true" downstream.
      is_headless: automation.isHeadless,
      ua_consistent: consistency.consistent,
      is_emulated: environment.isEmulated,
      is_noise_injected: noiseInjected,
      is_tampered: tamper.tampered,
      is_context_mismatch: context.mismatch,
      is_engine_mismatch: engine.mismatch,
      is_os_mismatch: os.mismatch,
    },
    attributes: { ...uaAttrs, timezone },
    anomalies: automation.anomalies
      .concat(consistency.reason ? [consistency.reason] : [])
      .concat(environment.anomalies)
      .concat(noiseInjected ? ["noise_injected"] : [])
      .concat(tamper.lies.map((l) => `tamper:${l}`))
      .concat(context.fields.map((f) => `ctx:${f}`))
      .concat(engine.reason ? [engine.reason] : [])
      .concat(os.reason ? [`os:${os.reason}`] : []),
  };
}

/**
 * Load the speech-synthesis voice list, waiting briefly for the async
 * `voiceschanged` population (getVoices() is often empty on first call). Bounded
 * + fail-safe: returns [] when the API is unavailable or the timeout elapses, so
 * a missing voice list can never manufacture a false positive.
 */
async function loadVoices(timeoutMs = 500): Promise<VoiceLike[]> {
  const synth = (globalThis as unknown as { speechSynthesis?: SpeechSynthesis }).speechSynthesis;
  if (!synth || typeof synth.getVoices !== "function") return [];
  const map = (vs: SpeechSynthesisVoice[]): VoiceLike[] => vs.map((v) => ({ name: v.name, voiceURI: v.voiceURI }));
  const now = synth.getVoices();
  if (now.length) return map(now);
  return new Promise<VoiceLike[]>((resolve) => {
    const finish = () => resolve(map(synth.getVoices()));
    const t = setTimeout(finish, timeoutMs);
    try {
      synth.addEventListener("voiceschanged", () => {
        clearTimeout(t);
        finish();
      }, { once: true });
    } catch {
      clearTimeout(t);
      finish();
    }
  });
}

/**
 * A deterministic OfflineAudioContext render → compact signature. Real browsers
 * return bit-identical output across renders; an anti-detect browser injecting
 * per-render audio noise does not. Returns null when the API is unavailable
 * (fail-safe: no signature can't manufacture a false positive).
 */
async function audioSignature(): Promise<string | null> {
  try {
    const OAC =
      (globalThis as unknown as { OfflineAudioContext?: typeof OfflineAudioContext }).OfflineAudioContext ||
      (globalThis as unknown as { webkitOfflineAudioContext?: typeof OfflineAudioContext }).webkitOfflineAudioContext;
    if (!OAC) return null;
    const ctx = new OAC(1, 4410, 44100);
    const osc = ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.value = 10000;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -50;
    comp.knee.value = 40;
    comp.ratio.value = 12;
    comp.attack.value = 0;
    comp.release.value = 0.25;
    osc.connect(comp);
    comp.connect(ctx.destination);
    osc.start(0);
    const buf = await ctx.startRendering();
    const data = buf.getChannelData(0);
    let sum = 0;
    for (let i = 0; i < data.length; i += 100) sum += Math.abs(data[i]!);
    return sum.toFixed(6);
  } catch {
    return null;
  }
}

const NATIVE_RE = /\{\s*\[native code\]\s*\}\s*$/;

/** True if a function reports native code (untampered). Safe on anything. */
function isNativeFn(fn: unknown): boolean {
  if (typeof fn !== "function") return true; // absent API isn't a lie
  try {
    return NATIVE_RE.test(Function.prototype.toString.call(fn));
  } catch {
    return false;
  }
}

/** True if a prototype getter reports native code; true when there's no getter. */
function isNativeGetter(proto: object | undefined, prop: string): boolean {
  if (!proto) return true;
  try {
    const d = Object.getOwnPropertyDescriptor(proto, prop);
    return d?.get ? isNativeFn(d.get) : true;
  } catch {
    return true;
  }
}

/** `Function.prototype.toString` itself reports native — false = the detector's
 *  own tool was patched, which is definitive spoofing. */
function fnToStringIntact(): boolean {
  return isNativeFn(Function.prototype.toString);
}

/**
 * Probe the native functions/getters an anti-detect browser must override to
 * spoof a fingerprint. Each returns whether it still reports native code. Never
 * throws; a missing API resolves to `native: true` (absence isn't a lie).
 */
function gatherTamperProbes(): TamperProbe[] {
  if (typeof globalThis === "undefined") return [];
  const g = globalThis as unknown as Record<string, { prototype?: Record<string, unknown> }>;
  const probes: TamperProbe[] = [];
  const fnProbe = (name: string, fn: unknown) => probes.push({ name, native: isNativeFn(fn) });

  fnProbe("canvas.toDataURL", g.HTMLCanvasElement?.prototype?.toDataURL);
  fnProbe("canvas.toBlob", g.HTMLCanvasElement?.prototype?.toBlob);
  fnProbe("canvas.getContext", g.HTMLCanvasElement?.prototype?.getContext);
  fnProbe("ctx2d.getImageData", g.CanvasRenderingContext2D?.prototype?.getImageData);
  fnProbe("webgl.getParameter", g.WebGLRenderingContext?.prototype?.getParameter);
  fnProbe("webgl2.getParameter", g.WebGL2RenderingContext?.prototype?.getParameter);
  fnProbe("audio.getChannelData", g.AudioBuffer?.prototype?.getChannelData);

  const navProto = (g.Navigator as { prototype?: object } | undefined)?.prototype;
  for (const p of ["hardwareConcurrency", "platform", "userAgent", "languages", "deviceMemory"]) {
    probes.push({ name: `navigator.${p}`, native: isNativeGetter(navProto, p) });
  }
  return probes;
}

/**
 * Read navigator + timezone inside a Web Worker so it can be compared to the main
 * thread. An anti-detect tool that patched `window` but not the worker leaks the
 * real values here. Bounded + fail-safe: returns undefined when Workers/Blob URLs
 * are unavailable or CSP-blocked, or on timeout.
 */
async function workerSnapshot(timeoutMs = 700): Promise<ContextSnapshot | undefined> {
  if (
    typeof Worker === "undefined" ||
    typeof Blob === "undefined" ||
    typeof URL === "undefined" ||
    typeof URL.createObjectURL !== "function"
  ) {
    return undefined;
  }
  const code =
    "self.onmessage=function(){var n=self.navigator;var tz=null;" +
    "try{tz=Intl.DateTimeFormat().resolvedOptions().timeZone}catch(e){}" +
    "postMessage({userAgent:n.userAgent,hardwareConcurrency:n.hardwareConcurrency,platform:n.platform,timezone:tz})};";
  let url: string | undefined;
  let worker: Worker | undefined;
  try {
    url = URL.createObjectURL(new Blob([code], { type: "text/javascript" }));
    worker = new Worker(url);
    const w = worker;
    return await new Promise<ContextSnapshot | undefined>((resolve) => {
      const done = (v: ContextSnapshot | undefined) => resolve(v);
      const t = setTimeout(() => done(undefined), timeoutMs);
      w.onmessage = (e: MessageEvent) => {
        clearTimeout(t);
        done(e.data as ContextSnapshot);
      };
      w.onerror = () => {
        clearTimeout(t);
        done(undefined);
      };
      w.postMessage(0);
    });
  } catch {
    return undefined;
  } finally {
    try {
      worker?.terminate();
      if (url) URL.revokeObjectURL(url);
    } catch {
      /* ignore */
    }
  }
}

/** The browser's IANA timezone, or null if the Intl API is unavailable. */
function resolveTimezone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
}

/** Brave exposes `navigator.brave`; its farbling perturbs canvas legitimately. */
function isBraveBrowser(nav: Navigator | undefined): boolean {
  return !!(nav as unknown as { brave?: unknown })?.brave;
}

/**
 * Read a fixed, deterministic canvas + WebGL render into signature strings.
 * Called twice per collect(); a real GPU returns identical strings both times,
 * an injected-noise browser does not. Returns [] when the DOM/canvas isn't
 * available so detectNoiseInjection stays quiet (fail-safe).
 */
function renderSignatures(): string[] {
  if (typeof document === "undefined") return [];
  const sigs: string[] = [];
  const canvas2d = read2dCanvas();
  if (canvas2d) sigs.push(canvas2d);
  const webgl = readWebgl();
  if (webgl) sigs.push(webgl);
  return sigs;
}

/** A fixed 2D canvas render → data URL. Same input ⇒ same bytes on real HW. */
function read2dCanvas(): string | null {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 240;
    canvas.height = 60;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = "#f60";
    ctx.fillRect(10, 10, 100, 40);
    ctx.fillStyle = "#069";
    ctx.font = "16px 'Arial'";
    ctx.fillText("Kaidn \u{1F512} fp", 12, 32);
    ctx.strokeStyle = "rgba(102,204,0,0.7)";
    ctx.arc(60, 30, 20, 0, Math.PI * 2);
    ctx.stroke();
    return canvas.toDataURL();
  } catch {
    return null;
  }
}

/** A fixed WebGL pixel readback → string. Same draw ⇒ same pixels on real HW. */
function readWebgl(): string | null {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 64;
    const gl = (canvas.getContext("webgl") ||
      canvas.getContext("experimental-webgl")) as WebGLRenderingContext | null;
    if (!gl) return null;
    gl.clearColor(0.2, 0.5, 0.7, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    const pixels = new Uint8Array(64 * 64 * 4);
    gl.readPixels(0, 0, 64, 64, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    // Sum sampled pixels into a compact signature (avoids a huge string compare).
    let sum = 0;
    for (let i = 0; i < pixels.length; i += 97) sum = (sum + pixels[i]!) % 1_000_000;
    return `${sum}`;
  } catch {
    return null;
  }
}

/**
 * Collect the fingerprint AND post it to the Kaidn edge so the connection's JA4
 * TLS fingerprint is captured server-side against this device_id. Call this from
 * the END USER's browser (e.g. on your signup page) — that direct browser→edge
 * request is what makes the JA4 the user's, not your backend's. Your server then
 * calls /v1/score with the same device_id and inherits the captured signals.
 *
 * @param endpoint absolute URL of the beacon, e.g. "https://api.kaidn.io/v1/fp".
 * @param pk your tracker's publishable key (pk_live_…) from the Kaidn dashboard —
 *   required: the beacon is per-tenant and domain-locked.
 * @returns the same FpResult as collect(); the network POST is best-effort.
 *
 * @example
 *   const fp = await beacon("https://api.kaidn.io/v1/fp", "pk_live_xxx");
 *   myForm.dataset.deviceId = fp.device_id; // submit alongside the signup
 */
export async function beacon(endpoint: string, pk: string, options: CollectOptions = {}): Promise<FpResult> {
  const fp = await collect(options);
  await postBeacon(endpoint, pk, fp);
  return fp;
}

/** POST an already-collected fingerprint to the edge. Best-effort. */
async function postBeacon(endpoint: string, pk: string, fp: FpResult): Promise<void> {
  try {
    await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ pk, device_id: fp.device_id, device: fp.device, attributes: fp.attributes }),
      credentials: "omit",
      keepalive: true,
    });
  } catch {
    // best-effort: a failed beacon must never break the host page's signup flow.
  }
}

export interface WatchOptions extends CollectOptions {
  /** heartbeat interval in ms (default 60000). Clamped to a 20s floor. */
  intervalMs?: number;
}

/** Stop a running watch(). */
export type WatchHandle = { stop: () => void };

/**
 * Session heartbeat. Fingerprints ONCE, then re-beacons the same device_id on an
 * interval (and whenever the tab becomes visible again) so Kaidn sees the IP the
 * connection is coming from OVER TIME. The device_id + JA4 are constant across a
 * VPN change, so a beacon whose IP flips connection type on the same device is
 * the tell — a dropped VPN leaking the real home IP, or a device that started
 * cloaking mid-session. Call once when your page loads a logged-in/session view.
 *
 * @example
 *   const watch = Kaidn.watch("https://api.kaidn.io/v1/fp", "pk_live_xxx");
 *   // later, e.g. on logout / route change:
 *   watch.stop();
 */
export function watch(endpoint: string, pk: string, options: WatchOptions = {}): WatchHandle {
  const interval = Math.max(20_000, options.intervalMs ?? 60_000);
  let stopped = false;
  let fp: FpResult | undefined;
  let timer: ReturnType<typeof setInterval> | undefined;

  const ping = () => {
    if (stopped || !fp) return;
    // only beacon when the tab is actually visible — a hidden/background tab
    // isn't a live session and would add noise to the observation timeline.
    if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
    void postBeacon(endpoint, pk, fp);
  };

  const onVisible = () => {
    if (typeof document !== "undefined" && document.visibilityState === "visible") ping();
  };

  void collect(options).then((res) => {
    if (stopped) return;
    fp = res;
    void postBeacon(endpoint, pk, fp); // immediate first observation
    timer = setInterval(ping, interval);
    if (typeof document !== "undefined") document.addEventListener("visibilitychange", onVisible);
  });

  return {
    stop() {
      stopped = true;
      if (timer) clearInterval(timer);
      if (typeof document !== "undefined") document.removeEventListener("visibilitychange", onVisible);
    },
  };
}
