const API_URL = "http://localhost:8000";
const $ = (id) => document.getElementById(id);
const state = { lastInputs: { pm25_lag_1: 188.25, at: 25, rh: 60 }, lastPrediction: null, history: [] };

function bandFor(value) {
  // This is a simple PM2.5 concentration label for this prototype, not an official AQI conversion.
  if (value <= 30) return ["Lower concentration", "Lower predicted PM2.5 concentration", "var(--green)"];
  if (value <= 60) return ["Moderate concentration", "Moderate predicted PM2.5 concentration", "var(--cyan)"];
  if (value <= 90) return ["Elevated concentration", "Elevated predicted PM2.5 concentration", "var(--amber)"];
  if (value <= 120) return ["High concentration", "High predicted PM2.5 concentration", "var(--amber)"];
  if (value <= 250) return ["Very high concentration", "Very high predicted PM2.5 concentration", "var(--red)"];
  return ["Extremely high concentration", "Extremely high predicted PM2.5 concentration", "var(--red)"];
}
function setApiStatus(online, modelLoaded = false) {
  [$("sideStatus"), $("topStatus")].forEach(el => { el.classList.toggle("online", online); el.classList.toggle("offline", !online); });
  $("sideStatusText").textContent = online ? "API connected" : "API unavailable";
  $("topStatusText").textContent = online ? "API ONLINE" : "API OFFLINE";
  $("modelState").textContent = online && modelLoaded ? "MODEL READY" : online ? "BUNDLE CHECK" : "OFFLINE";
  $("apiIntegrity").textContent = online ? "Reachable" : "Offline";
  $("bundleIntegrity").textContent = online && modelLoaded ? "Found" : online ? "Not confirmed" : "Unknown";
  document.querySelectorAll(".integrity-bullet").forEach((el, i) => el.classList.toggle("ok", online && (i === 0 || modelLoaded)));
}
async function checkHealth() {
  try { const r = await fetch(`${API_URL}/health`); if (!r.ok) throw new Error("health failed"); const d = await r.json(); setApiStatus(true, !!d.model_loaded); }
  catch { setApiStatus(false, false); }
}
function fmt(value, digits = 2) { return Number(value).toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: 0 }); }
function navigate(page) {
  document.querySelectorAll(".page").forEach(el => el.classList.toggle("active", el.id === `page-${page}`));
  document.querySelectorAll(".nav-item").forEach(el => el.classList.toggle("active", el.dataset.page === page));
  const active = document.querySelector(`.nav-item[data-page="${page}"]`);
  $("crumbCurrent").textContent = active ? active.innerText.trim() : "Overview";
  $("sidebar").classList.remove("open"); window.scrollTo({ top: 0, behavior: "smooth" });
}
document.querySelectorAll(".nav-item").forEach(btn => btn.addEventListener("click", () => navigate(btn.dataset.page)));
document.querySelectorAll("[data-goto]").forEach(btn => btn.addEventListener("click", () => navigate(btn.dataset.goto)));
$("menuToggle").addEventListener("click", () => $("sidebar").classList.toggle("open"));
$("todayStamp").textContent = new Date().toLocaleDateString(undefined, { month: "short", day: "2-digit", year: "numeric" }).toUpperCase();

function updateOverview(value) {
  const [label, note, color] = bandFor(value);
  $("heroPrediction").innerHTML = `${fmt(value, 1)}<small>µg/m³</small>`;
  $("qualityLabel").textContent = label; $("qualityNote").textContent = note; $("qualityDot").style.background = color;
  const score = Math.max(0, Math.min(100, value / 250 * 100));
  $("radialScore").textContent = Math.round(score);
  $("radialProgress").style.strokeDashoffset = String(352 - 352 * score / 100);
  $("radialProgress").style.stroke = color;
}
function updateInputViews(inputs) {
  $("engineInputVector").textContent = `${fmt(inputs.pm25_lag_1)} · ${fmt(inputs.at)} °C · ${fmt(inputs.rh)}%`;
  $("envPm").innerHTML = `${fmt(inputs.pm25_lag_1)} <small>µg/m³</small>`;
  $("envAt").innerHTML = `${fmt(inputs.at)} <small>°C</small>`;
  $("envRh").innerHTML = `${fmt(inputs.rh)} <small>%</small>`;
}
function renderHistory() {
  const html = state.history.length ? state.history.map(item => `<div class="history-item"><div><b>${fmt(item.inputs.pm25_lag_1)} µg/m³ · ${fmt(item.inputs.at)}°C · ${fmt(item.inputs.rh)}% RH</b><small>${item.time} · 3-hour forecast · ANFIS</small></div><div class="history-value">${fmt(item.prediction, 1)}<small> µg/m³</small></div></div>`).join("") : '<div class="empty-state">Your successful predictions will appear here.</div>';
  $("historyList").innerHTML = html; $("researchHistory").innerHTML = html;
}
function svgMembership(title, values, colors) {
  // Render model-returned degrees at the queried point as bars; this is not a fabricated membership curve.
  const width = 300, height = 92, x0 = 12, y0 = 14, chartW = 276, chartH = 52;
  const bars = values.map((v, i) => { const x = x0 + i * 144 + 28, h = Math.max(1, chartH * Math.max(0, Math.min(1, v))); return `<rect x="${x}" y="${y0 + chartH - h}" width="76" height="${h}" rx="5" fill="${colors[i]}" opacity=".9"/><text x="${x + 38}" y="${y0 + chartH + 16}" text-anchor="middle" fill="#91a1b8" font-size="10">MF ${i + 1}</text><text x="${x + 38}" y="${y0 + chartH - h - 5}" text-anchor="middle" fill="#eaf3ff" font-size="9">${Number(v).toFixed(3)}</text>`; }).join("");
  return `<div class="membership-card"><div class="membership-card-head"><b>${title}</b><span>μ(x)</span></div><svg class="membership-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Membership degrees for ${title}"><line x1="${x0}" y1="${y0 + chartH}" x2="${x0 + chartW}" y2="${y0 + chartH}" stroke="#334158"/>${bars}</svg><div class="membership-legend"><span><i class="legend-line" style="background:${colors[0]}"></i>MF 1</span><span><i class="legend-line" style="background:${colors[1]}"></i>MF 2</span></div></div>`;
}
function renderExplanation(explanation) {
  if (!explanation || !Array.isArray(explanation.memberships) || !Array.isArray(explanation.rules)) {
    $("membershipCharts").innerHTML = '<div class="chart-placeholder">Prediction succeeded, but this API response has no membership explanation yet. Update backend/main.py with the expanded version in the project bundle, then restart Uvicorn.</div>';
    $("ruleChart").innerHTML = '<div class="chart-placeholder">Real rule firing strengths are not present in the current API response.</div>';
    $("ruleTable").innerHTML = '<tr><td colspan="5" class="empty-cell">Explanation endpoint data not available.</td></tr>';
    return;
  }
  const inputNames = { PM25_lag_1: "PM2.5 lag 1", AT: "Temperature (AT)", RH: "Relative humidity (RH)" };
  const colors = [["#9f91ff", "#5de1e6"], ["#ffc77a", "#a99bff"], ["#5de1e6", "#7fa8ff"]];
  $("membershipCharts").innerHTML = explanation.memberships.map((m, i) => svgMembership(inputNames[m.feature] || m.feature, m.values, colors[i] || colors[0])).join("");
  const rules = explanation.rules;
  $("ruleChart").innerHTML = rules.map(r => `<div class="rule-bar-row"><label>R${r.rule}</label><div class="rule-track"><i style="width:${Math.max(0, Math.min(100, r.firing_strength * 100))}%"></i></div><b>${Number(r.firing_strength).toFixed(4)}</b></div>`).join("");
  $("ruleTable").innerHTML = rules.map(r => `<tr><td><b>R${r.rule}</b></td><td>${r.antecedent}</td><td>${Number(r.firing_strength).toFixed(5)}</td><td>${Number(r.local_output).toFixed(3)}</td><td>${Number(r.weighted_contribution).toFixed(3)}</td></tr>`).join("");
  const sum = rules.reduce((acc, r) => acc + Number(r.firing_strength), 0);
  $("ruleTotal").textContent = `Σ = ${sum.toFixed(4)}`;
}
$("predictForm").addEventListener("submit", async event => {
  event.preventDefault(); $("error").classList.add("hidden"); $("predictBtn").disabled = true; $("predictBtn").querySelector("span").textContent = "Calculating with ANFIS…";
  const inputs = { pm25_lag_1: Number($("pm").value), at: Number($("at").value), rh: Number($("rh").value) };
  try {
    const response = await fetch(`${API_URL}/predict`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(inputs) });
    const data = await response.json(); if (!response.ok) throw new Error(data.detail || "Prediction request failed.");
    if (!Number.isFinite(Number(data.prediction))) throw new Error("The API did not return a finite prediction.");
    state.lastInputs = inputs; state.lastPrediction = Number(data.prediction); updateOverview(state.lastPrediction); updateInputViews(inputs);
    state.history.unshift({ inputs, prediction: state.lastPrediction, time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) }); state.history = state.history.slice(0, 8); renderHistory(); renderExplanation(data.explanation);
    await checkHealth();
  } catch (err) {
    $("error").textContent = err.message.includes("Failed to fetch") ? "Cannot reach the API. Make sure FastAPI is running on port 8000." : err.message;
    $("error").classList.remove("hidden");
  } finally { $("predictBtn").disabled = false; $("predictBtn").querySelector("span").textContent = "Run ANFIS prediction"; }
});
$("clearHistory").addEventListener("click", () => { state.history = []; renderHistory(); });
updateInputViews(state.lastInputs); renderHistory(); checkHealth();
