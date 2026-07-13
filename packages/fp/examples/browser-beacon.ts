/**
 * Example: fingerprint the end user in the browser and beacon it to Kaidn, then
 * submit the device_id with your form so your backend can score it.
 *
 * This runs in the BROWSER (bundler / SPA). `pk_live_…` is a publishable,
 * domain-locked key — safe in client code. Your API key stays on the server.
 */
import { beacon, collect } from "@kaidn/fp";

// 1) On your signup / login / checkout page:
async function onPageLoad(form: HTMLFormElement) {
  const fp = await beacon("https://api.kaidn.io/v1/fp", "pk_live_xxx");

  // stash the device_id on a hidden field so it submits with the form
  const hidden = form.elements.namedItem("device_id") as HTMLInputElement;
  hidden.value = fp.device_id;

  // fp.device / fp.attributes / fp.anomalies are also available if you want them
  console.log("device:", fp.device_id, fp.attributes);
}

// 2) No network call needed? Just compute the fingerprint:
async function fingerprintOnly() {
  const { device_id, device, anomalies } = await collect();
  return { device_id, device, anomalies };
}

// Your BACKEND then scores with the same device_id (see @kaidn/sdk):
//   const { verdict } = await kaidn.score({ event: "signup", device_id, ip, email });

export { onPageLoad, fingerprintOnly };
