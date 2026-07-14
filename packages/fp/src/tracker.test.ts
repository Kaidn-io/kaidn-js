import { describe, expect, it, vi } from "vitest";
import { createTracker, type TrackerDeps, type TrackerElement, type TrackerEvent, type TrackerPayload } from "./tracker.js";
import type { FpResult } from "./types.js";

const FP: FpResult = {
  device_id: "fp_abc123",
  device: { is_headless: false, ua_consistent: true },
  attributes: { os: "Windows", browser: "Chrome", mobile: false, timezone: "America/New_York" },
  anomalies: [],
};

/** a fake bindable element that records appended fields + whether it proceeded */
function fakeElement() {
  const listeners: Record<string, ((e: TrackerEvent) => void)[]> = {};
  const fields: Record<string, string> = {};
  let proceeded = false;
  const el: TrackerElement = {
    addEventListener: (type, h) => void (listeners[type] ??= []).push(h),
    appendHiddenField: (name, value) => void (fields[name] = value),
    proceed: () => void (proceeded = true),
  };
  return {
    el,
    fields,
    get proceeded() {
      return proceeded;
    },
    async emit(type: string) {
      const e: TrackerEvent = { preventDefault: vi.fn() };
      for (const h of listeners[type] ?? []) await h(e);
      return e;
    },
  };
}

function setup(overrides: Partial<TrackerDeps> = {}) {
  const target = fakeElement();
  const collect = vi.fn(async () => FP);
  const send = vi.fn(async (_endpoint: string, _payload: TrackerPayload) => {});
  const deps: TrackerDeps = {
    collect,
    send,
    endpoint: "https://api.kaidn.io/v1/fp",
    dom: { select: () => target.el },
    ...overrides,
  };
  return { deps, target, collect, send, tracker: createTracker(deps) };
}

describe("createTracker — init / beacon", () => {
  it("fingerprints and beacons on init()", async () => {
    const { tracker, collect, send } = setup();
    tracker.init();
    await flush();
    expect(collect).toHaveBeenCalledOnce();
    expect(send).toHaveBeenCalledWith("https://api.kaidn.io/v1/fp", {
      device_id: "fp_abc123",
      device: FP.device,
      attributes: FP.attributes,
      vars: {},
    });
  });

  it("afterResult receives the collection result — and NO score field", async () => {
    const { tracker } = setup();
    const cb = vi.fn();
    tracker.afterResult(cb);
    tracker.init();
    await flush();
    expect(cb).toHaveBeenCalledOnce();
    const result = cb.mock.calls[0]![0];
    expect(result.device_id).toBe("fp_abc123");
    expect(result).not.toHaveProperty("score");
    expect(result).not.toHaveProperty("verdict");
    expect(result).not.toHaveProperty("fraud_chance");
  });

  it("pause() holds collection until resume()", async () => {
    const { tracker, collect } = setup();
    tracker.pause();
    tracker.init();
    await flush();
    expect(collect).not.toHaveBeenCalled();
    tracker.resume();
    await flush();
    expect(collect).toHaveBeenCalledOnce();
  });

  it("store() vars are attached to the beacon", async () => {
    const { tracker, send } = setup();
    tracker.store("user_id", "u_42");
    tracker.store("transaction_id", "t_99");
    tracker.init();
    await flush();
    expect(send.mock.calls[0]![1].vars).toEqual({ user_id: "u_42", transaction_id: "t_99" });
  });

  it("afterFailure fires when collect throws; afterResult does not", async () => {
    const boom = new Error("blocked");
    const { tracker } = setup({ collect: vi.fn(async () => { throw boom; }) });
    const ok = vi.fn();
    const bad = vi.fn();
    tracker.afterResult(ok);
    tracker.afterFailure(bad);
    tracker.init();
    await flush();
    expect(bad).toHaveBeenCalledWith(boom);
    expect(ok).not.toHaveBeenCalled();
  });

  it("a blocked beacon (send rejects) still fires afterResult — collection succeeded", async () => {
    const { tracker } = setup({ send: vi.fn(async () => { throw new Error("network"); }) });
    const ok = vi.fn();
    tracker.afterResult(ok);
    tracker.init();
    await flush();
    expect(ok).toHaveBeenCalledOnce();
  });
});

describe("createTracker — trigger (form auto-append)", () => {
  it("on submit: prevents default, appends device_id, then proceeds", async () => {
    const { tracker, target } = setup();
    tracker.trigger("#form");
    const e = await target.emit("submit");
    expect(e.preventDefault).toHaveBeenCalled();
    expect(target.fields["kaidn_device_id"]).toBe("fp_abc123");
    expect(target.proceeded).toBe(true);
  });

  it("appends stored custom vars as prefixed hidden fields", async () => {
    const { tracker, target } = setup();
    tracker.store("user_id", "u_42");
    tracker.trigger("#form");
    await target.emit("submit");
    expect(target.fields["kaidn_device_id"]).toBe("fp_abc123");
    expect(target.fields["kaidn_user_id"]).toBe("u_42");
  });

  it("fails OPEN: a collect error still proceeds with the submit (never blocks signup)", async () => {
    const { tracker, target } = setup({ collect: vi.fn(async () => { throw new Error("boom"); }) });
    tracker.trigger("#form");
    await target.emit("submit");
    expect(target.fields["kaidn_device_id"]).toBeUndefined();
    expect(target.proceeded).toBe(true); // still submits
  });

  it("reuses the init() fingerprint instead of recomputing on submit", async () => {
    const { tracker, collect, target } = setup();
    tracker.init();
    await flush();
    expect(collect).toHaveBeenCalledOnce();
    tracker.trigger("#form");
    await target.emit("submit");
    expect(collect).toHaveBeenCalledOnce(); // cached, not called again
    expect(target.fields["kaidn_device_id"]).toBe("fp_abc123");
  });

  it("runs the optional before() hook before preventing default", async () => {
    const { tracker, target } = setup();
    const before = vi.fn();
    tracker.trigger("#form", before);
    await target.emit("submit");
    expect(before).toHaveBeenCalledOnce();
  });

  it("binding a missing selector is a no-op, not a throw", () => {
    const { tracker } = setup({ dom: { select: () => null } });
    expect(() => tracker.trigger("#nope")).not.toThrow();
  });
});

/** let queued microtasks (the async init/trigger handlers) settle */
async function flush() {
  await new Promise((r) => setTimeout(r, 0));
}
