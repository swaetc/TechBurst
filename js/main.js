// ============================================================
// AshX dashboard entry point.
// It creates the data source, the 3D twin, the sidebar and the
// chart, then pipes every telemetry reading to all three.
//
// Read this file first: nothing clever happens anywhere else.
// ============================================================

import { DATA_SOURCE, SCENARIOS, SIM, FIRMWARE } from "./config.js";
import { createSource } from "./data/source.js";
import { Twin } from "./scene/twin.js";
import { Panel } from "./ui/panel.js";
import { LevelChart } from "./ui/chart.js";

// ---------- build the pieces ----------
const source = createSource();
const twin = new Twin(document.getElementById("viewport"));
const panel = new Panel();
const chart = new LevelChart("level-chart");

document.getElementById("source-pill").textContent = "source: " + DATA_SOURCE;

// ---------- telemetry in ----------
source.onReading((reading) => {
  twin.update(reading);
  panel.update(reading);
  chart.push(reading);
});

source.onConnectionChange((connected) => {
  panel.setConnected(connected);
  twin.setLinkState(connected);
  if (connected) {
    panel.log("link", "Telemetry link up. Receiving from " + DATA_SOURCE + ".");
  } else {
    panel.log("link", "Telemetry lost. The ESP32 keeps running its own safety logic.");
    chart.pushGap();
  }
});

// ---------- scenario buttons (simulator only) ----------
const buttonsHost = document.getElementById("scenario-buttons");
const noteEl = document.getElementById("scenario-note");
const isSimulator = typeof source.setScenario === "function";

if (isSimulator) {
  Object.entries(SCENARIOS).forEach(([key, scenario], index) => {
    const button = document.createElement("button");
    button.className = "scenario-btn" + (key === "calm" ? " active" : "");
    button.dataset.key = key;
    button.innerHTML = '<span class="idx">' + (index + 1) + "</span>" + scenario.label;
    button.addEventListener("click", () => selectScenario(key));
    buttonsHost.appendChild(button);
  });
  noteEl.textContent = SCENARIOS.calm.note;
} else {
  // With the real device there is nothing to stage, the dam does what it does.
  buttonsHost.innerHTML =
    '<p class="muted small">Scenarios are simulator only. ' +
    "This dashboard is showing the live device.</p>";
  document.getElementById("level-slider").disabled = true;
  document.getElementById("release-slider").disabled = true;
}

function selectScenario(key) {
  source.setScenario(key);
  releaseSlider(); // a scenario click takes the slider out of the way
  [...buttonsHost.children].forEach((b) =>
    b.classList.toggle("active", b.dataset.key === key)
  );
  noteEl.textContent = SCENARIOS[key].note;

  if (key === "netdrop") {
    panel.log("link", "Scenario: network drop for " +
      SIM.NETWORK_DROP_MS / 1000 + " s. Watch the device keep protecting itself.");
  } else {
    panel.log("info", "Scenario: " + SCENARIOS[key].label + ". " + SCENARIOS[key].note);
  }
}

// Number keys 1 to 5 also pick a scenario, handy while presenting.
window.addEventListener("keydown", (event) => {
  if (!isSimulator) return;
  const index = Number(event.key) - 1;
  const keys = Object.keys(SCENARIOS);
  if (index >= 0 && index < keys.length) selectScenario(keys[index]);
});

// ---------- manual level slider ----------
const slider = document.getElementById("level-slider");
const sliderValue = document.getElementById("slider-value");
slider.max = FIRMWARE.TANK_HEIGHT_CM;

function applySlider() {
  const cm = Number(slider.value);
  sliderValue.textContent = cm.toFixed(1) + " cm";
  if (isSimulator) source.setManualLevel(cm);
}

function releaseSlider() {
  if (isSimulator) source.setManualLevel(null);
  sliderValue.textContent = "released";
}

slider.addEventListener("input", applySlider);
document.getElementById("release-slider").addEventListener("click", () => {
  releaseSlider();
  panel.log("info", "Manual override released, back to the simulated inflow.");
});

// ---------- console ----------
document.getElementById("clear-log").addEventListener("click", () => panel.clearLog());

// ---------- go ----------
panel.log("info", "AshX dashboard ready. Watching device ashx-01 in read only mode.");
panel.log("info",
  "Edge rules: critical at " + FIRMWARE.CRITICAL_LEVEL_CM.toFixed(1) +
  " cm or a rise of " + FIRMWARE.RISE_THRESHOLD_CM.toFixed(1) +
  " cm in 5 s, clears below " + FIRMWARE.SAFE_RESET_LEVEL_CM.toFixed(1) + " cm.");
source.start();
