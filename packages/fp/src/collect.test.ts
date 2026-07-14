import { afterEach, describe, expect, it, vi } from "vitest";
import { watch } from "./collect.js";

// collect() calls getThumbmark (ThumbmarkJS) which needs a DOM; stub it so the
// watch() heartbeat logic can be tested in isolation (Node, no browser).
vi.mock("@thumbmarkjs/thumbmarkjs", () => ({
  getThumbmark: async () => ({ thumbmark: "testhash", components: {} }),
}));

/** flush the microtask queue so collect()'s promise chain settles. */
async function flush() {
  for (let i = 0; i < 5; i++) await Promise.resolve();
}

describe("watch() — session heartbeat", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("beacons immediately, re-beacons on the interval, and stops cleanly", async () => {
    vi.useFakeTimers();
    const calls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (u: string) => { calls.push(u); return { ok: true } as Response; }));
    vi.stubGlobal("navigator", { userAgent: "test", languages: ["en"] });

    const handle = watch("https://api.test/v1/fp", "pk_live_x", { intervalMs: 60000 });
    await flush();
    expect(calls.length).toBe(1); // immediate first observation

    await vi.advanceTimersByTimeAsync(60000);
    expect(calls.length).toBe(2); // one heartbeat

    await vi.advanceTimersByTimeAsync(60000);
    expect(calls.length).toBe(3);

    handle.stop();
    await vi.advanceTimersByTimeAsync(180000);
    expect(calls.length).toBe(3); // silent after stop
  });

  it("clamps the interval to a 20s floor", async () => {
    vi.useFakeTimers();
    const calls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (u: string) => { calls.push(u); return { ok: true } as Response; }));
    vi.stubGlobal("navigator", { userAgent: "test", languages: ["en"] });

    const handle = watch("https://api.test/v1/fp", "pk_live_x", { intervalMs: 1000 }); // too low
    await flush();
    expect(calls.length).toBe(1);
    await vi.advanceTimersByTimeAsync(1000); // would fire if the floor were ignored
    expect(calls.length).toBe(1);
    await vi.advanceTimersByTimeAsync(19000); // 20s total → the clamped interval fires
    expect(calls.length).toBe(2);
    handle.stop();
  });
});
