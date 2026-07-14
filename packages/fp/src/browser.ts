import { collect, watch, type WatchHandle, type WatchOptions } from "./collect.js";
import {
  createTracker,
  type Tracker,
  type TrackerDom,
  type TrackerElement,
  type TrackerPayload,
} from "./tracker.js";

/**
 * Browser entry point for the <script>-tag drop-in. Wires the real DOM + fetch
 * into the testable tracker core and exposes `window.Kaidn`. Built to an IIFE
 * bundle (see build.mjs) that a customer includes with one tag:
 *
 *   <script src="https://api.kaidn.io/fp.js" defer></script>
 *   <script>
 *     Kaidn.store('user_id', currentUser.id);
 *     Kaidn.trigger('#signup-form');   // appends kaidn_device_id on submit
 *     Kaidn.init();
 *   </script>
 *
 * The beacon endpoint defaults to the same origin the script was served from
 * (so the JA4 is captured on a request to our edge); override with
 * `data-endpoint` on the script tag.
 */

function realDom(): TrackerDom {
  return {
    select(selector) {
      const node = document.querySelector(selector);
      return node ? wrap(node as HTMLElement) : null;
    },
  };
}

function wrap(node: HTMLElement): TrackerElement {
  // Prefer the enclosing form for submit semantics + hidden-field injection.
  const form = node instanceof HTMLFormElement ? node : node.closest("form");
  return {
    addEventListener(type, handler) {
      node.addEventListener(type, (e) => handler(e as unknown as { preventDefault(): void }));
    },
    appendHiddenField(name, value) {
      const target = form ?? node;
      const input = document.createElement("input");
      input.type = "hidden";
      input.name = name;
      input.value = value;
      target.appendChild(input);
    },
    proceed() {
      // Re-run the native action now that fingerprint fields are attached.
      if (form) form.submit();
      else node.click();
    },
  };
}

function beaconEndpoint(): string {
  const current = document.currentScript as HTMLScriptElement | null;
  const override = current?.getAttribute("data-endpoint");
  if (override) return override;
  try {
    return new URL("/v1/fp", current?.src ?? window.location.origin).toString();
  } catch {
    return "/v1/fp";
  }
}

/** the tracker's publishable key, baked into the served /fp/<pk>.js by the API */
function publishableKey(): string {
  return (window as unknown as { __KAIDN_PK__?: string }).__KAIDN_PK__ ?? "";
}

function makeSend(pk: string) {
  return async function send(endpoint: string, payload: TrackerPayload): Promise<void> {
    await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      // pk attributes the beacon to the tenant; the server also domain-locks it
      // against the browser's Origin. vars are reserved for future attribution.
      body: JSON.stringify({
        pk,
        device_id: payload.device_id,
        device: payload.device,
        attributes: payload.attributes,
      }),
      credentials: "omit",
      keepalive: true,
    });
  };
}

export function bootstrap(): Tracker {
  const pk = publishableKey();
  const endpoint = beaconEndpoint();
  const tracker = createTracker({
    collect,
    send: makeSend(pk),
    dom: realDom(),
    endpoint,
  });
  // Expose the session heartbeat on the drop-in tag too: Kaidn.watch() re-beacons
  // the same device_id over time so a mid-session IP flip (VPN drop) is caught.
  const api = tracker as Tracker & { watch: (options?: WatchOptions) => WatchHandle };
  api.watch = (options?: WatchOptions) => watch(endpoint, pk, options);
  (window as unknown as { Kaidn: typeof api }).Kaidn = api;
  return tracker;
}

// Auto-install on load so `window.Kaidn` exists for the inline config script.
if (typeof window !== "undefined") bootstrap();
