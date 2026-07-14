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
