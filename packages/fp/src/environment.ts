/**
 * Environment / anti-detect detection. Pure functions over plain values (no DOM)
 * so they unit-test cleanly. The goal is NOT another stable ID — anti-detect
 * browsers (Multilogin, GoLogin, AdsPower, Incogniton) and VM farms randomize
 * the JS fingerprint per profile on purpose, so a stable hash is impossible
 * there. Instead we detect the *environment itself* via the tells those tools
 * can't easily hide: a software/VM GPU, farm-grade hardware, and a spoofed-thin
 * font list. Paired with the server-side JA4 TLS fingerprint (which anti-detect
 * browsers rarely spoof), this is what survives against evasion tooling.
 *
 * Same discipline as automation.ts: only HIGH-PRECISION tells set a boolean the
 * engine weights; everything softer is an `anomaly` (evidence, never a verdict).
 */

/** Known SOFTWARE / VM WebGL renderers. A real GPU-backed browser reports a real
 *  adapter ("ANGLE (NVIDIA…", "Apple GPU", "Mali-G…"); these strings mean the GL
 *  is software-emulated — headless Chrome's default, a VM, or GPU disabled. */
const SOFTWARE_RENDERERS = [
  "swiftshader", // Google's software GL — headless Chrome default
  "llvmpipe", // Mesa software rasterizer (Linux VMs)
  "softpipe",
  "mesa offscreen",
  "microsoft basic render", // Windows software fallback / RDP / some VMs
  "vmware",
  "virtualbox",
  "vbox",
  "parallels",
  "qemu",
  "gallium", // often a VM/software Mesa path
  "google swiftshader",
];

/** true when the WebGL renderer string is a software/VM adapter, not real GPU. */
export function isSoftwareRenderer(renderer: string | undefined | null): boolean {
  if (!renderer) return false;
  const r = renderer.toLowerCase();
  return SOFTWARE_RENDERERS.some((s) => r.includes(s));
}

export interface HardwareInput {
  /** navigator.hardwareConcurrency (logical CPU cores) */
  hardwareConcurrency?: number;
  /** navigator.deviceMemory (GiB, Chrome only; undefined elsewhere) */
  deviceMemory?: number;
  /** navigator.userAgent — to tell desktop from mobile (mobiles run low cores) */
  userAgent?: string;
}

/** Farm VMs are provisioned tiny (1–2 vCPU, ≤1 GiB). A *desktop* browser
 *  reporting that is implausible — real desktops are ≥4 cores today. Only fires
 *  on desktop UAs (phones legitimately report 2–4 cores / low memory). */
export function isFarmHardware(hw: HardwareInput): boolean {
  const ua = hw.userAgent ?? "";
  const mobile = /mobile|android|iphone|ipad|ipod/i.test(ua);
  if (mobile || !ua) return false;
  const lowCpu = typeof hw.hardwareConcurrency === "number" && hw.hardwareConcurrency > 0 && hw.hardwareConcurrency <= 2;
  const lowMem = typeof hw.deviceMemory === "number" && hw.deviceMemory > 0 && hw.deviceMemory <= 1;
  // require BOTH to keep precision high (a single low value is common enough)
  return lowCpu && lowMem;
}

export interface EnvironmentInput {
  webglRenderer?: string | null;
  hardwareConcurrency?: number;
  deviceMemory?: number;
  userAgent?: string;
  /** number of fonts detected (from ThumbmarkJS's font component). */
  fontCount?: number;
  /** touch points; a "mobile" UA with 0 is a spoof tell, and vice-versa. */
  maxTouchPoints?: number;
  /** Brave farbles font metrics for privacy (legit) → never flag font_evasion. */
  isBrave?: boolean;
}

export interface EnvironmentResult {
  /** high-confidence: a software/VM GPU or farm-grade hardware — an emulated /
   *  anti-detect environment, not a normal residential device. Contributing
   *  signal (reviews; blocks when stacked), never a hard block alone. */
  isEmulated: boolean;
  /** a DESKTOP browser exposing almost no fonts (<5) — a real desktop OS exposes
   *  dozens, so this is font-enumeration SUPPRESSION, the tell an anti-detect
   *  browser (Multilogin/GoLogin) leaves when it blocks font fingerprinting
   *  rather than convincingly spoofing it. Brave excluded (it farbles fonts for
   *  privacy). Contributing. */
  fontEvasion: boolean;
  /** soft, individually-spoofable tells — evidence for an investigator. */
  anomalies: string[];
}

export function detectEnvironment(env: EnvironmentInput): EnvironmentResult {
  const anomalies: string[] = [];
  const strong: string[] = [];

  if (isSoftwareRenderer(env.webglRenderer)) strong.push("software_gpu");
  if (isFarmHardware({ hardwareConcurrency: env.hardwareConcurrency, deviceMemory: env.deviceMemory, userAgent: env.userAgent })) {
    strong.push("farm_hardware");
  }

  // Font-enumeration suppression: a real DESKTOP OS exposes dozens of fonts; a
  // spoofed/anti-detect profile that blocks font fingerprinting exposes almost
  // none. Scored as font_evasion on desktop (mobiles legitimately expose few),
  // excluding Brave (privacy farbling). Also surfaced as the sparse_fonts anomaly.
  const ua = env.userAgent ?? "";
  const mobile = /mobile|android|iphone|ipad|ipod/i.test(ua);
  const sparseFonts = typeof env.fontCount === "number" && env.fontCount > 0 && env.fontCount < 5;
  if (sparseFonts) anomalies.push("sparse_fonts");
  const fontEvasion = sparseFonts && !mobile && !!ua && !env.isBrave;

  // ---- soft tells → evidence only ----
  // UA claims mobile but the device reports no touch support (or the reverse).
  const claimsMobile = /mobile|android|iphone|ipod/i.test(ua);
  if (typeof env.maxTouchPoints === "number") {
    if (claimsMobile && env.maxTouchPoints === 0) anomalies.push("mobile_no_touch");
    if (!claimsMobile && /desktop/i.test(ua) && env.maxTouchPoints > 0) anomalies.push("desktop_touch");
  }

  return { isEmulated: strong.length > 0, fontEvasion, anomalies: strong.concat(anomalies) };
}
