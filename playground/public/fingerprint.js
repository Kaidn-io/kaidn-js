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
  $("startWatch").onclick = startWatch;
  $("stopWatch").onclick = stopWatch;
}

// ---- session heartbeat monitor (watch() + live observation timeline) ----
let watchHandle = null;
let pollTimer = null;
let watchDeviceId = null;

async function startWatch() {
  const pk = $("pk").value.trim();
  if (!pk) return void ($("watchStatus").innerHTML = '<span class="err">Enter a pk_live_… key above first.</span>');
  if (!window.KaidnFp.watch) return void ($("watchStatus").innerHTML = '<span class="err">Rebuild the playground — watch() not in this bundle.</span>');
  // a short interval so the demo is lively (prod default is ~60s)
  watchHandle = window.KaidnFp.watch(cfg.baseUrl + "/v1/fp", pk, { intervalMs: 20000 });
  const fp = await window.KaidnFp.collect();
  watchDeviceId = fp.device_id;
  $("startWatch").style.display = "none";
  $("stopWatch").style.display = "";
  $("watchStatus").innerHTML = 'heartbeat running · beaconing every 20s · <span class="muted">' + esc(fp.device_id) + "</span>";
  poll();
  pollTimer = setInterval(poll, 5000);
}

function stopWatch() {
  if (watchHandle) watchHandle.stop();
  if (pollTimer) clearInterval(pollTimer);
  watchHandle = pollTimer = null;
  $("startWatch").style.display = "";
  $("stopWatch").style.display = "none";
  $("watchStatus").innerHTML = '<span class="muted">stopped</span>';
}

async function poll() {
  if (!watchDeviceId) return;
  try {
    const r = await fetch("/observations?device_id=" + encodeURIComponent(watchDeviceId));
    const d = await r.json();
    if (d.error) return;
    renderAnomalies(d.session || {});
    renderTimeline(d.timeline || []);
  } catch {
    /* transient — the next poll retries */
  }
}

function renderAnomalies(s) {
  const flags = [
    ["vpnDrop", "vpn_drop"],
    ["ipCloaking", "ip_cloaking"],
    ["ja4Changed", "ja4_changed"],
    ["impossibleTravel", "impossible_travel"],
  ].filter(([k]) => s[k]);
  let h = "";
  if (flags.length) h += flags.map(([, code]) => '<span class="pill bad">' + code + "</span>").join(" ");
  if (s.distinctIps > 1) h += ' <span class="pill">distinct IPs: ' + s.distinctIps + "</span>";
  $("anomalies").innerHTML = h
    ? '<div class="muted" style="font-size:12px;margin-bottom:6px">Detected on this device:</div>' + h
    : '<span class="muted" style="font-size:12px">No abnormal changes yet — beacon from a datacenter/VPN then drop it (or switch networks) to see a flip.</span>';
}

function renderTimeline(rows) {
  if (!rows.length) return void ($("timeline").innerHTML = '<span class="muted" style="font-size:12px">Waiting for the first beacon…</span>');
  const head = '<div class="kv" style="grid-template-columns:auto auto auto 1fr;gap:6px 16px;font-size:12px">';
  const body = rows
    .slice(-8)
    .reverse()
    .map((o) => {
      const t = new Date(o.ts).toLocaleTimeString();
      const conn =
        o.connection === "datacenter"
          ? '<span class="pill bad">datacenter</span>'
          : o.connection === "residential"
            ? '<span class="pill ok">residential</span>'
            : '<span class="muted">—</span>';
      return (
        '<div class="muted">' + t + "</div><div>" + conn + '</div><div class="v">' +
        esc(o.ip || "—") + '</div><div class="muted" style="font-family:var(--mono)">' +
        esc(o.country || "") + (o.ja4 ? " · ja4 " + esc(o.ja4.slice(0, 10)) : "") + "</div>"
      );
    })
    .join("");
  $("timeline").innerHTML = head + body + "</div>";
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
