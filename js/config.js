// ============================================================
// AshX - central configuration
// Every constant the dashboard needs lives here.
// To move from simulated data to the real ESP32, change
// DATA_SOURCE from "SIM" to "MQTT" and fill in MQTT_CONFIG.
// ============================================================

// Which data source to use: "SIM" (simulator) or "MQTT" (real device).
export const DATA_SOURCE = "SIM";

// ---------- Firmware constants ----------
// These MUST match the values compiled into the ESP32 firmware,
// otherwise the dashboard will draw its threshold lines in the
// wrong places.
export const FIRMWARE = {
  TANK_HEIGHT_CM: 15.0,     // distance from sensor face to tank floor
  CRITICAL_LEVEL_CM: 10.0,  // at or above this the alert latches on
  SAFE_RESET_LEVEL_CM: 7.0, // alert only clears below this (hysteresis)
  RISE_THRESHOLD_CM: 3.0,   // cm of rise across the window = too fast
  WINDOW: 10,               // samples kept for the rate of rise check
  SAMPLE_MS: 500            // firmware loop period, about 0.5 s
};

// ---------- Telemetry ----------
export const TELEMETRY = {
  PUBLISH_MS: 1000,      // device publishes roughly once per second
  OFFLINE_AFTER_MS: 3000 // no reading for this long = show offline
};

// ---------- MQTT (not active until DATA_SOURCE is "MQTT") ----------
export const MQTT_CONFIG = {
  // Public test broker, websocket + TLS port. Works from a browser.
  url: "wss://broker.hivemq.com:8884/mqtt",
  team: "demo",                       // change to your team name
  topic: "ashx/demo/telemetry",       // must equal ashx/<team>/telemetry
  clientIdPrefix: "ashx-dashboard-",
  reconnectPeriodMs: 2000
};

// ---------- Simulator tuning ----------
// Only used when DATA_SOURCE is "SIM". Rates are cm per second.
export const SIM = {
  PUMP_OUTFLOW_CM_S: 1.2,   // how fast the 3V pump pulls the level down
  LEAK_CM_S: 0.01,          // tiny constant loss, keeps calm mode alive
  NOISE_CM: 0.05,           // gaussian-ish sensor noise
  SPIKE_CHANCE: 0.04,       // chance of a wild reading the median removes
  SPIKE_CM: 6.0,            // how wild that spike is
  DROPOUT_CHANCE: 0.02,     // chance of "no echo", firmware skips the cycle
  NETWORK_DROP_MS: 10000    // length of the simulated network outage
};

// ---------- Scenarios ----------
// inflow is cm per second added to the true tank level.
export const SCENARIOS = {
  calm:    { label: "Calm",            inflow: 0.0,  note: "Level drifts gently between 4 and 6 cm." },
  overfill:{ label: "Slow overfill",   inflow: 0.35, note: "Steady inflow until it crosses 10 cm." },
  surge:   { label: "Rain surge",      inflow: 1.6,  note: "Fast inflow, trips on rate of rise first." },
  drain:   { label: "Drain / recovery",inflow: -0.5, note: "Inflow stopped, water drains out and the pump helps." },
  netdrop: { label: "Network drop",    inflow: 0.35, note: "Dashboard loses telemetry for 10 s." }
};

// ---------- Colours ----------
// Shared by the CSS theme and the Three.js scene so the twin and the
// dashboard always agree on what OK and CRITICAL look like.
export const COLORS = {
  bg:        "#080b0f",
  panel:     "#0f151c",
  line:      "#1d2732",
  text:      "#c9d6e2",
  muted:     "#6b7d90",
  ok:        "#34d399",
  warn:      "#f5b642",
  critical:  "#f4525c",
  accent:    "#4ec9d9",
  water:     "#2f7fd4",
  waterHigh: "#c8434e",
  frame:     "#39424e",
  metal:     "#8a97a6"
};
