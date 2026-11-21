// Admin dashboard: talks only to /api/admin/* (same origin, relative URLs).
const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const nf = new Intl.NumberFormat("en-US");

function toast(msg, err = false) {
  const t = $("#toast"); t.textContent = msg; t.className = "show" + (err ? " err" : "");
  clearTimeout(toast.id); toast.id = setTimeout(() => (t.className = ""), 2600);
}
async function http(url, opts = {}) {
  const res = await fetch(url, opts);
  if (!res.ok) {
    let m = res.statusText;
    try { const b = await res.json(); m = typeof b.detail === "string" ? b.detail : b.detail?.map((d) => `${d.loc.at(-1)}: ${d.msg}`).join("; ") || m; } catch {}
    throw new Error(m);
  }
  if (res.status === 204) return null;
  return (res.headers.get("content-type") || "").includes("json") ? res.json() : res.text();
}
const post = (url, body, method = "POST") => http(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

// ---- Tabs ----
document.querySelectorAll("[data-tab]").forEach((b) => b.addEventListener("click", () => {
  document.querySelectorAll("[data-tab]").forEach((x) => x.setAttribute("aria-selected", x === b));
  $("#analytics").hidden = b.dataset.tab !== "analytics";
  $("#theme").hidden = b.dataset.tab !== "theme";
}));

// ---- Analytics ----
async function loadAnalytics() {
  const [c, recent] = await Promise.all([http("/api/admin/analytics/countries"), http("/api/admin/analytics/recent?limit=12")]);
  const top = c.countries[0];
  $("#kpis").innerHTML = [
    [nf.format(c.total_visits), "Total visits"], [nf.format(c.unique_ips), "Unique IP addresses"],
    [c.countries.length, "Countries"], [top ? top.country_name : "–", top ? `Top country (${top.percent}%)` : "Top country"],
  ].map(([b, s]) => `<div class="kpi"><b>${esc(b)}</b><span>${esc(s)}</span></div>`).join("");

  const max = top ? top.visits : 1;
  $("#dist").innerHTML = c.countries.length ? c.countries.map((r) => `
    <div class="dist-row"><span class="code">${esc(r.country_code)}</span><span>${esc(r.country_name)}</span>
      <div class="track" role="img" aria-label="${esc(r.country_name)}: ${r.percent}%"><div class="fill" style="width:${(100 * r.visits / max).toFixed(1)}%"></div></div>
      <span class="num">${nf.format(r.visits)} · ${r.percent}%</span></div>`).join("")
    : '<p class="empty">No traffic yet. Click “Simulate traffic” to generate visits from different IP addresses.</p>';

  $("#recent").innerHTML = recent.length ? `<tr><th>Time (UTC)</th><th>IP address</th><th>Country</th><th>Request</th><th>Source</th></tr>` +
    recent.map((r) => `<tr><td>${esc(r.created_at)}</td><td>${esc(r.ip)}</td><td>${esc(r.country_name)} <span class="code">${esc(r.country_code)}</span></td><td>${esc(r.path)}</td><td>${esc(r.source)}</td></tr>`).join("")
    : '<tr><td class="empty">Nothing recorded.</td></tr>';
}
$("#simulate").onclick = async () => {
  try {
    const r = await post("/api/admin/simulate", { count: +$("#sim-count").value, days: +$("#sim-days").value });
    toast(`Added ${nf.format(r.inserted)} simulated visits`); loadAnalytics();
  } catch (e) { toast(e.message, true); }
};
$("#clear").onclick = async () => {
  if (!confirm("Delete all recorded visits?")) return;
  await http("/api/admin/analytics", { method: "DELETE" }); toast("Analytics cleared"); loadAnalytics();
};
$("#lookup-form").onsubmit = async (e) => {
  e.preventDefault();
  try {
    const r = await http("/api/admin/lookup?ip=" + encodeURIComponent($("#ip").value));
    $("#lookup-result").textContent = `${r.country} (${r.country_code})`;
  } catch (err) { $("#lookup-result").textContent = ""; toast(err.message, true); }
};

// ---- Theme ----
const COLORS = [["bg", "Page background"], ["card", "Cards"], ["ink", "Text"], ["muted", "Muted text"], ["line", "Borders"],
  ["accent", "Accent"], ["accent_ink", "Text on accent"], ["header_bg", "Header"], ["header_ink", "Header text"]];
const form = $("#theme-form");
let presets = {}, timer;

const read = () => {
  const t = {};
  COLORS.forEach(([k]) => (t[k] = form.elements[k].value));
  ["font_body", "font_heading"].forEach((k) => (t[k] = form.elements[k].value));
  ["base_size", "radius"].forEach((k) => (t[k] = +form.elements[k].value));
  return t;
};
const write = (t) => {
  Object.entries(t).forEach(([k, v]) => { if (form.elements[k]) form.elements[k].value = v; });
  $("#o-size").textContent = t.base_size + "px"; $("#o-radius").textContent = t.radius + "px";
};
async function refreshPreview() {
  try {
    const css = await post("/api/admin/theme/css", read());
    $("#css").textContent = css;
    const doc = $("#frame").contentDocument;
    if (doc?.head) {
      let s = doc.getElementById("preview-theme");
      if (!s) { s = doc.createElement("style"); s.id = "preview-theme"; doc.head.appendChild(s); }
      s.textContent = css;
    }
    return css;
  } catch (e) { toast(e.message, true); }
}
const schedule = () => { clearTimeout(timer); timer = setTimeout(refreshPreview, 120); };

async function initTheme() {
  const d = await http("/api/admin/theme");
  presets = d.presets;
  $("#colors").innerHTML = COLORS.map(([k, l]) => `<label>${l}<input type="color" name="${k}"></label>`).join("");
  const fonts = Object.entries(d.fonts).map(([k, l]) => `<option value="${k}">${esc(l)}</option>`).join("");
  form.elements.font_body.innerHTML = fonts; form.elements.font_heading.innerHTML = fonts;
  $("#preset").innerHTML = Object.keys(presets).map((k) => `<option value="${k}">${k[0].toUpperCase() + k.slice(1)}</option>`).join("");
  write(d.theme); refreshPreview();
}
form.addEventListener("input", (e) => {
  if (e.target.id !== "preset") { write(read()); schedule(); }
});
$("#preset").onchange = (e) => { write(presets[e.target.value]); refreshPreview(); };
$("#frame").addEventListener("load", refreshPreview);
$("#save").onclick = async () => {
  try { await post("/api/admin/theme", read(), "PUT"); toast("Saved. The storefront now uses this theme."); } catch (e) { toast(e.message, true); }
};
$("#reset").onclick = async () => {
  await http("/api/admin/theme", { method: "DELETE" }); write(presets.default); await refreshPreview(); toast("Theme reset to default");
};
$("#download").onclick = async () => {
  const css = await refreshPreview(); if (!css) return;
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([css], { type: "text/css" })); a.download = "theme.css"; a.click();
  URL.revokeObjectURL(a.href); toast("theme.css downloaded");
};

loadAnalytics().catch((e) => toast(e.message, true));
initTheme().catch((e) => toast(e.message, true));
