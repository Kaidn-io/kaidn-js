// Score playground — client logic. Builds a /v1/score request from the form and
// posts it to the local server (which calls @kaidn/sdk with your key), then
// renders the verdict and shows the equivalent SDK / cURL code.
const cfg = window.KAIDN_CFG || { baseUrl: "https://api.kaidn.io", apiKey: "" };
const FIELDS = ["user_id", "ip", "email", "device_id", "phone", "phone_country", "event_country", "ip_country"];
const PRESETS = {
  clean: { event: "signup", user_id: "u_1001", ip: "8.8.8.8", email: "jane@gmail.com", event_country: "US", ip_country: "US" },
  risky: { event: "cashout", user_id: "u_9002", ip: "45.155.205.100", email: "x9f2kq@mailinator.com", device_id: "fp_farm01" },
};
let curTab = "result";
let lastResult = null;
const $ = (id) => document.getElementById(id);

if (cfg.apiKey) $("apiKey").value = cfg.apiKey; // pre-fill from .env / env

function preset(k) {
  clearFields();
  const p = PRESETS[k];
  $("event").value = p.event || "signup";
  for (const f of FIELDS) if (p[f]) $(f).value = p[f];
}
function clearFields() {
  for (const f of FIELDS) $(f).value = "";
  lastResult = null;
  render();
}
function payload() {
  const b = { event: $("event").value.trim() || "signup" };
  for (const f of FIELDS) {
    const v = $(f).value.trim();
    if (v) b[f] = v;
  }
  return b;
}
async function run() {
  const apiKey = $("apiKey").value.trim();
  $("run").disabled = true;
  $("run").textContent = "Scoring…";
  try {
    const r = await fetch("/score", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ apiKey, ...payload() }),
    });
    lastResult = await r.json();
    setTab("result");
  } catch (e) {
    lastResult = { error: String(e) };
    render();
  } finally {
    $("run").disabled = false;
    $("run").textContent = "Run score";
  }
}
function setTab(t) {
  curTab = t;
  document.querySelectorAll(".tabs button").forEach((x) => x.classList.toggle("on", x.dataset.tab === t));
  render();
}
function render() {
  const out = $("out");
  if (curTab !== "result") {
    out.innerHTML = "<pre>" + esc(snippet(curTab)) + "</pre><button class='copybtn' id='copyBtn'>copy</button>";
    $("copyBtn").onclick = (e) => copyPre(e.target);
    return;
  }
  if (!lastResult) return void (out.innerHTML = '<p class="muted">Fill in an event and hit Run score.</p>');
  if (lastResult.error) return void (out.innerHTML = '<p class="err">' + esc(lastResult.error) + "</p>");
  const r = lastResult;
  const c = r.verdict === "allow" ? "var(--good)" : r.verdict === "review" ? "var(--warn)" : "var(--crit)";
  let h =
    '<div class="verdict" style="background:color-mix(in srgb,' + c + ' 15%,transparent);color:' + c + '">' +
    '<span class="dot" style="background:' + c + '"></span>' + esc(r.verdict) + "</div> " +
    '<b style="color:' + c + ';font-family:ui-monospace,monospace;font-size:20px">' + r.score +
    '<span class="muted" style="font-size:13px">/100</span></b>';
  if (r.reason_text) h += '<p style="color:var(--ink2);margin:10px 0">' + esc(r.reason_text) + "</p>";
  (r.checks || []).forEach((x) => {
    h += '<div class="reason"><span class="w">+' + x.weight + "</span><span><code>" + esc(x.reason) + "</code> — " + esc(x.message) + "</span></div>";
  });
  if (r.device)
    h += '<p class="muted" style="margin-top:12px;font-size:12px">device: ' + r.device.account_count + " account(s) · " +
      r.device.distinct_ips + " IP(s) · " + (r.device.connection_type || "—") + (r.device.ja4 ? " · JA4 seen" : "") + "</p>";
  h += '<p class="muted" style="margin-top:10px;font-size:11px">event_id: ' + esc(r.event_id || "") + "</p>";
  out.innerHTML = h;
}
function snippet(kind) {
  const p = payload();
  const j = JSON.stringify(p, null, 2);
  if (kind === "sdk") {
    return [
      'import { Kaidn } from "@kaidn/sdk";',
      "",
      "const kaidn = new Kaidn({ apiKey: process.env.KAIDN_API_KEY });",
      "",
      "const result = await kaidn.score(" + j + ");",
      'if (result.verdict === "block") denySignup(result.reasons);',
    ].join("\n");
  }
  return [
    "curl -X POST " + cfg.baseUrl + "/v1/score \\",
    '  -H "x-api-key: $KAIDN_API_KEY" \\',
    '  -H "content-type: application/json" \\',
    "  -d '" + JSON.stringify(p) + "'",
  ].join("\n");
}
function copyPre(btn) {
  navigator.clipboard.writeText(btn.previousElementSibling.textContent);
  btn.textContent = "copied";
  setTimeout(() => (btn.textContent = "copy"), 1200);
}
function esc(s) {
  return String(s).replace(/[&<>]/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[m]));
}

// wire up + auto-detect the visitor's IP and (via @kaidn/fp) a device_id
$("run").onclick = run;
$("clear").onclick = clearFields;
$("preClean").onclick = () => preset("clean");
$("preRisky").onclick = () => preset("risky");
document.querySelectorAll(".tabs button").forEach((b) => (b.onclick = () => setTab(b.dataset.tab)));

fetch(cfg.baseUrl + "/v1/ip")
  .then((r) => r.json())
  .then((d) => { if (d && d.ip && !$("ip").value) $("ip").value = d.ip; })
  .catch(() => {});

if (window.KaidnFp && window.KaidnFp.collect) {
  $("dhint").textContent = "detecting…";
  window.KaidnFp.collect()
    .then((fp) => { if (!$("device_id").value) $("device_id").value = fp.device_id; $("dhint").textContent = "auto-detected"; })
    .catch(() => { $("dhint").textContent = ""; });
}
