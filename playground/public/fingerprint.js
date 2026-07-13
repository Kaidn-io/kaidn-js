// Fingerprint test — client logic. Demonstrates @kaidn/fp running in the browser:
//   collect()  → a stable device_id + automation signals (no key)
//   beacon()   → sends it to /v1/fp so Kaidn captures the connection's JA4 (needs a pk)
// window.KaidnFp is the browser build the local server serves at /fp.js. In a real
// app you'd `import { collect, beacon } from "@kaidn/fp"` instead.
const cfg = window.KAIDN_CFG || { baseUrl: "https://api.kaidn.io", trackerPk: "" };
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>]/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[m]));
const bool = (v) => (v === true ? '<span class="pill bad">true</span>' : v === false ? '<span class="pill ok">false</span>' : '<span class="muted">—</span>');

if (cfg.trackerPk) $("pk").value = cfg.trackerPk; // pre-fill from .env / env

if (!window.KaidnFp) {
  $("fp").innerHTML = '<p class="err">@kaidn/fp could not load. Run the playground with `npm install` first.</p>';
} else {
  runCollect();
  $("recollect").onclick = runCollect;
  $("beacon").onclick = runBeacon;
}

async function runCollect() {
  $("fp").innerHTML = '<p class="muted">Collecting…</p>';
  try {
    const fp = await window.KaidnFp.collect();
    $("fp").innerHTML =
      '<div class="kv">' +
      row("device_id", '<code>' + esc(fp.device_id) + "</code>") +
      row("is_headless (automation)", bool(fp.device?.is_headless)) +
      row("ua_consistent", bool(fp.device?.ua_consistent)) +
      row("os", esc(fp.attributes?.os ?? "—")) +
      row("browser", esc(fp.attributes?.browser ?? "—")) +
      row("mobile", bool(fp.attributes?.mobile)) +
      row("anomalies", fp.anomalies?.length ? esc(fp.anomalies.join(", ")) : '<span class="muted">none</span>') +
      "</div>";
  } catch (e) {
    $("fp").innerHTML = '<p class="err">' + esc(String(e)) + "</p>";
  }
}

async function runBeacon() {
  const pk = $("pk").value.trim();
  const out = $("beaconOut");
  if (!pk) return void (out.innerHTML = '<p class="err">Enter a pk_live_… key first.</p>');
  out.innerHTML = '<p class="muted">Sending…</p>';
  try {
    // beacon() collects the fingerprint and POSTs it to /v1/fp; the response tells
    // us whether the edge captured a JA4 for this connection.
    const fp = await window.KaidnFp.beacon(cfg.baseUrl + "/v1/fp", pk);
    // read the raw response too, so the test shows ja4_seen
    const res = await fetch(cfg.baseUrl + "/v1/fp", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ pk, device_id: fp.device_id, device: fp.device, attributes: fp.attributes }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      out.innerHTML = '<p class="err">' + esc(body.error || res.status + " — is localhost an approved domain for this key?") + "</p>";
      return;
    }
    out.innerHTML =
      '<div class="kv">' +
      row("status", '<span class="pill ok">ok</span>') +
      row("device_id", "<code>" + esc(fp.device_id) + "</code>") +
      row("ja4_seen", bool(body.ja4_seen)) +
      "</div><p class='muted' style='margin-top:8px;font-size:12px'>A later /v1/score for this device_id now inherits the JA4.</p>";
  } catch (e) {
    out.innerHTML = '<p class="err">' + esc(String(e)) + "</p>";
  }
}

function row(k, v) {
  return '<div class="k">' + k + '</div><div class="v">' + v + "</div>";
}

$("usage").textContent = [
  'import { beacon } from "@kaidn/fp";',
  "",
  "// in the browser, on your signup / login / checkout page:",
  'const fp = await beacon("' + cfg.baseUrl + '/v1/fp", "pk_live_…");',
  "",
  "// submit fp.device_id with your form, then score it on your server:",
  "//   kaidn.score({ event: \"signup\", device_id: fp.device_id, ip, email })",
].join("\n");
