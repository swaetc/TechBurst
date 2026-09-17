// ============================================================
// SimulatedSource
// Pretends to be the ESP32 node. It simulates a physical tank
// (water going in and out), simulates the HC-SR04 reading that
// tank badly (noise, spikes, missed echoes), then runs the EXACT
// firmware safety logic on those readings.
//
// The rest of the app never knows this is fake. It exposes the
// same interface as MqttSource:
//   start(), stop(), onReading(cb), onConnectionChange(cb)
// ============================================================

import { FIRMWARE, SIM, SCENARIOS, TELEMETRY } from "../config.js";

// Small helper: median of an array of numbers.
function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

// Rough gaussian noise from two uniform samples.
function noise(amount) {
  return (Math.random() + Math.random() - 1) * amount;
}

function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v));
}

export class SimulatedSource {
  constructor() {
    // ----- callbacks -----
    this.readingHandlers = [];
    this.connectionHandlers = [];

    // ----- simulated physical world -----
    this.trueLevel = 5.0;        // real water height in the container, cm
    this.scenario = "calm";
    this.scenarioStart = Date.now();
    this.calmTarget = 5.0;       // calm mode drifts towards this
    this.manualLevel = null;     // set by the slider, overrides physics

    // ----- simulated firmware state -----
    this.rawBuffer = [];         // last 5 raw samples for the median filter
    this.window = [];            // last WINDOW filtered levels, for rise
    this.alert = false;          // the latching alert flag
    this.lastReading = null;     // most recent published payload

    // ----- simulated link state -----
    this.connected = false;
    this.linkDownUntil = 0;      // timestamp while the network is "dropped"

    this.bootTime = Date.now();
    this.lastPublish = 0;
    this.timer = null;
  }

  // ---------- public interface ----------

  start() {
    if (this.timer) return;
    this.bootTime = Date.now();
    this.lastPublish = 0;
    this.setConnected(true);
    // The firmware loop runs every SAMPLE_MS, telemetry is published
    // less often, exactly like the real device.
    this.timer = setInterval(() => this.tick(), FIRMWARE.SAMPLE_MS);
  }

  stop() {
    clearInterval(this.timer);
    this.timer = null;
    this.setConnected(false);
  }

  onReading(callback) {
    this.readingHandlers.push(callback);
  }

  onConnectionChange(callback) {
    this.connectionHandlers.push(callback);
  }

  // ---------- simulator only controls ----------
  // These do not exist on MqttSource. main.js checks for them
  // before wiring up the scenario buttons.

  setScenario(name) {
    if (!SCENARIOS[name]) return;
    this.scenario = name;
    this.scenarioStart = Date.now();
    if (name === "netdrop") {
      // Kill the telemetry link for a while. The device keeps running.
      this.linkDownUntil = Date.now() + SIM.NETWORK_DROP_MS;
      this.setConnected(false);
    }
    if (name === "surge") {
      // A surge only proves the rate of rise trip if it starts low.
      this.trueLevel = Math.min(this.trueLevel, 3.0);
    }
  }

  setManualLevel(cm) {
    this.manualLevel = cm === null ? null : clamp(cm, 0, FIRMWARE.TANK_HEIGHT_CM);
    if (this.manualLevel !== null) this.trueLevel = this.manualLevel;
  }

  // ---------- internals ----------

  setConnected(value) {
    if (this.connected === value) return;
    this.connected = value;
    this.connectionHandlers.forEach((cb) => cb(value));
  }

  // One firmware cycle: move the water, read the sensor, decide.
  tick() {
    const now = Date.now();
    const dt = FIRMWARE.SAMPLE_MS / 1000;

    this.updatePhysics(dt);

    // --- simulate the HC-SR04 ---
    // Sometimes there is no echo at all. The firmware skips the whole
    // cycle when that happens, so we do too.
    if (Math.random() < SIM.DROPOUT_CHANCE) return;

    let raw = this.trueLevel + noise(SIM.NOISE_CM);
    // Ultrasonic sensors occasionally return nonsense off a ripple.
    if (Math.random() < SIM.SPIKE_CHANCE) raw += SIM.SPIKE_CM * (Math.random() < 0.5 ? -1 : 1);
    raw = clamp(raw, 0, FIRMWARE.TANK_HEIGHT_CM);

    // --- median of 5 filter, exactly like the firmware ---
    this.rawBuffer.push(raw);
    if (this.rawBuffer.length > 5) this.rawBuffer.shift();
    const level = median(this.rawBuffer);

    // --- rate of rise over the last WINDOW samples ---
    this.window.push(level);
    if (this.window.length > FIRMWARE.WINDOW) this.window.shift();
    const rise = this.window.length === FIRMWARE.WINDOW ? level - this.window[0] : 0;

    // --- the safety decision (this is the part that runs on the edge) ---
    const tooHigh = level >= FIRMWARE.CRITICAL_LEVEL_CM;
    const tooFast = rise >= FIRMWARE.RISE_THRESHOLD_CM;
    if (tooHigh || tooFast) {
      this.alert = true;                                  // latch on
    } else if (this.alert && level < FIRMWARE.SAFE_RESET_LEVEL_CM) {
      this.alert = false;                                 // hysteresis clear
    }

    // --- build the telemetry payload (the data contract) ---
    const payload = {
      device: "ashx-01",
      level: Number(level.toFixed(2)),
      rise: Number(rise.toFixed(2)),
      state: this.alert ? "CRITICAL" : "OK",
      gate: this.alert ? "OPEN" : "CLOSED",
      pump: this.alert ? "ON" : "OFF",
      pct: Number(((level / FIRMWARE.TANK_HEIGHT_CM) * 100).toFixed(1)),
      uptime: now - this.bootTime
    };
    this.lastReading = payload;

    // --- publish about once per second ---
    if (now - this.lastPublish < TELEMETRY.PUBLISH_MS) return;
    this.lastPublish = now;

    // During a simulated network drop the device still did all of the
    // above, the dashboard just never receives it.
    if (now < this.linkDownUntil) return;
    if (!this.connected) this.setConnected(true);

    this.readingHandlers.forEach((cb) => cb(payload));
  }

  // Move water in and out of the simulated container.
  updatePhysics(dt) {
    if (this.manualLevel !== null) {
      this.trueLevel = this.manualLevel; // slider is in charge
      return;
    }

    let inflow = SCENARIOS[this.scenario].inflow;

    if (this.scenario === "surge") {
      // A rain burst is not forever. Let it fade so the pump can win
      // and the demo shows the alert clearing again.
      const secondsIn = (Date.now() - this.scenarioStart) / 1000;
      inflow = inflow * Math.exp(-secondsIn / 12);
    }

    if (this.scenario === "calm") {
      // Wander the target slowly between 4 and 6 cm, then chase it.
      this.calmTarget += noise(0.35) * dt;
      this.calmTarget = clamp(this.calmTarget, 4.0, 6.0);
      inflow = (this.calmTarget - this.trueLevel) * 0.6;
    }

    // The firmware turned the pump on, so water leaves the dam.
    const outflow = this.alert ? SIM.PUMP_OUTFLOW_CM_S : 0;

    this.trueLevel += (inflow - outflow - SIM.LEAK_CM_S) * dt;
    this.trueLevel = clamp(this.trueLevel, 0, FIRMWARE.TANK_HEIGHT_CM);
  }
}
