import { describe, expect, it } from "vitest";
import { detectOsMismatch, osFromVoices, osFamily } from "./os.js";

const appleVoices = [
  { name: "Samantha", voiceURI: "com.apple.voice.compact.en-US.Samantha" },
  { name: "Google US English", voiceURI: "Google US English" }, // network voice, ignored
];
const windowsVoices = [
  { name: "Microsoft David - English (United States)", voiceURI: "Microsoft David" },
  { name: "Google US English", voiceURI: "Google US English" },
];

describe("osFamily", () => {
  it("maps labels + Client-Hints platforms to coarse families", () => {
    expect(osFamily("Windows")).toBe("windows");
    expect(osFamily("macOS")).toBe("apple");
    expect(osFamily("iOS")).toBe("apple");
    expect(osFamily("Chrome OS")).toBe("chromeos");
    expect(osFamily("Android")).toBe("android");
    expect(osFamily("Linux")).toBe("linux");
    expect(osFamily(undefined)).toBe("unknown");
    expect(osFamily("Haiku")).toBe("unknown");
  });
});

describe("osFromVoices", () => {
  it("infers Apple from com.apple voiceURIs (ignoring Google network voices)", () => {
    expect(osFromVoices(appleVoices)).toBe("apple");
  });
  it("infers Windows from 'Microsoft …' voice names", () => {
    expect(osFromVoices(windowsVoices)).toBe("windows");
  });
  it("is unknown for a Google-only or empty voice list (fail-safe)", () => {
    expect(osFromVoices([{ name: "Google US English", voiceURI: "Google US English" }])).toBe("unknown");
    expect(osFromVoices([])).toBe("unknown");
  });
});

describe("detectOsMismatch", () => {
  it("flags Apple voices under a Windows UA (the Mac-spoofing-Windows case)", () => {
    const r = detectOsMismatch({ claimed: "Windows", voices: appleVoices });
    expect(r.mismatch).toBe(true);
    expect(r.reason).toBe("voices_apple");
  });
  it("flags a Client-Hints platform that contradicts the UA", () => {
    const r = detectOsMismatch({ claimed: "Windows", clientHintsPlatform: "macOS" });
    expect(r.mismatch).toBe(true);
    expect(r.reason).toBe("ch_apple");
  });
  it("does NOT flag a matching OS (real Mac)", () => {
    expect(detectOsMismatch({ claimed: "macOS", voices: appleVoices, clientHintsPlatform: "macOS" }).mismatch).toBe(false);
  });
  it("stays quiet when the claimed OS is unknown or no truth signal is present", () => {
    expect(detectOsMismatch({ claimed: undefined, voices: appleVoices }).mismatch).toBe(false);
    expect(detectOsMismatch({ claimed: "Windows", voices: [] }).mismatch).toBe(false);
  });
});

describe("detectOsMismatch — font identity (A/B validated on real Multilogin samples)", () => {
  // exact font list from BOTH real fingerprint.com samples (same M2 Mac)
  const MAC_FONTS = ["Arial Unicode MS", "Gill Sans", "Helvetica Neue", "Menlo"];
  // a genuine Windows machine always carries its system fonts
  const WIN_FONTS = ["Segoe UI", "Calibri", "Consolas", "Cambria", "Arial"];

  it("FLAGS Mac fonts under a Windows UA (the spoof, score 32)", () => {
    const r = detectOsMismatch({ claimed: "Windows", fonts: MAC_FONTS });
    expect(r.mismatch).toBe(true);
    expect(r.reason).toBe("fonts_apple");
  });

  it("stays SILENT on the same fonts under a Mac UA (the valid device, score 2)", () => {
    expect(detectOsMismatch({ claimed: "macOS", fonts: MAC_FONTS }).mismatch).toBe(false);
  });

  it("stays SILENT for a normal Windows machine (has its own system fonts)", () => {
    expect(detectOsMismatch({ claimed: "Windows", fonts: WIN_FONTS }).mismatch).toBe(false);
  });

  it("stays SILENT for a Windows DESIGNER who installed Mac fonts (still has Segoe UI/Calibri)", () => {
    // the key false-positive guard: claimed-OS system fonts present → never flag
    const r = detectOsMismatch({ claimed: "Windows", fonts: [...WIN_FONTS, "Helvetica Neue", "Menlo"] });
    expect(r.mismatch).toBe(false);
  });

  it("stays SILENT when no signature fonts are present either way (fail-safe)", () => {
    expect(detectOsMismatch({ claimed: "Windows", fonts: ["Arial", "Verdana", "Tahoma"] }).mismatch).toBe(false);
  });

  it("catches the reverse — Windows fonts under a Mac UA with no Mac fonts", () => {
    const r = detectOsMismatch({ claimed: "macOS", fonts: ["Segoe UI", "Calibri", "Consolas"] });
    expect(r.mismatch).toBe(true);
    expect(r.reason).toBe("fonts_windows");
  });

  it("ORs with the voice/CH surfaces into one signal", () => {
    const r = detectOsMismatch({ claimed: "Windows", fonts: MAC_FONTS, clientHintsPlatform: "macOS" });
    expect(r.mismatch).toBe(true);
    expect(r.reason).toContain("ch_apple");
    expect(r.reason).toContain("fonts_apple");
  });
});
