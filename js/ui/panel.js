// ============================================================
// Panel: the left sidebar and the console log.
// It is a pure viewer. It reads telemetry and writes text.
// It never sends anything back to the device.
// ============================================================

import { FIRMWARE, TELEMETRY } from "../config.js";

// Shorthand for document.getElementById.
const $ = (id) => document.getElementById(id);

export class Panel {
  constructor() {
    this.el = {
      stateBadge: $("state-badge"),
      stateText: $("state-text"),
      gaugeFill: $("gauge-fill"),
      gaugeValue: $("gauge-value"),
      gaugeTop: $("gauge-top"),
      markSafe: $("mark-safe"),
      markCrit: $("mark-crit"),
      level: $("v-level"),
      pct: $("v-pct"),
      rise: $("v-rise"),
      ttc: $("v-ttc"),
      gate: $("v-gate"),
      pump: $("v-pump"),
      uptimePill: $("uptime-pill"),
      linkPill: $("link-pill"),
      linkText: $("link-text"),
      banner: $("offline-banner"),
      crumbDevice: $("crumb-device"),
      log: $("log")
    };

    this.lastState = null;   // used to log only on a change
    this.lastGate = null;
    this.lastReadingAt = 0;

    // Put the threshold marks on the gauge at the right percentages.
    this.el.gaugeTop.textContent = FIRMWARE.TANK_HEIGHT_CM.toFixed(0) + " cm";
    this.el.markSafe.style.left =
      (FIRMWARE.SAFE_RESET_LEVEL_CM / FIRMWARE.TANK_HEIGHT_CM) * 100 + "%";
    this.el.markCrit.style.left =
      (FIRMWARE.CRITICAL_LEVEL_CM / FIRMWARE.TANK_HEIGHT_CM) * 100 + "%";

    // A watchdog: if telemetry stops arriving, say so even when the
    // source itself has not reported a disconnect.
    setInterval(() => this.checkStale(), 1000);
  }

  // ---------- main update, called for every reading ----------
  update(reading) {
    this.lastReadingAt = Date.now();
    const critical = reading.state === "CRITICAL";

    this.el.crumbDevice.textContent = reading.device;

    // state badge
    this.el.stateBadge.className = "state-badge " + (critical ? "critical" : "ok");
    this.el.stateText.textContent = reading.state;

    // gauge
    this.el.gaugeFill.style.width = Math.min(100, reading.pct) + "%";
    this.el.gaugeFill.classList.toggle("critical", critical);
    this.el.gaugeValue.textContent = reading.level.toFixed(2) + " cm";

    // cards
    this.el.level.textContent = reading.level.toFixed(2);
    this.el.level.className = "card-value " + this.levelClass(reading.level);
    this.el.pct.textContent = reading.pct.toFixed(1);
    this.el.rise.textContent = (reading.rise >= 0 ? "+" : "") + reading.rise.toFixed(2);
    this.el.rise.className =
      "card-value " + (reading.rise >= FIRMWARE.RISE_THRESHOLD_CM ? "critical"
        : reading.rise >= FIRMWARE.RISE_THRESHOLD_CM / 2 ? "warn" : "");

    this.el.gate.textContent = reading.gate;
    this.el.gate.className = "card-value " + (reading.gate === "OPEN" ? "critical" : "ok");
    this.el.pump.textContent = reading.pump;
    this.el.pump.className = "card-value " + (reading.pump === "ON" ? "critical" : "ok");

    // time to critical, computed in the browser from level and rise
    const ttc = this.timeToCritical(reading);
    this.el.ttc.textContent = ttc.text;
    this.el.ttc.className = "card-value " + ttc.cls;

    this.el.uptimePill.textContent = "uptime " + formatUptime(reading.uptime);

    // log only when something meaningful changes
    if (this.lastState !== reading.state) {
      if (this.lastState !== null && reading.state === "CRITICAL") {
        const why = reading.rise >= FIRMWARE.RISE_THRESHOLD_CM
          ? "rate of rise " + reading.rise.toFixed(2) + " cm / 5 s"
          : "level " + reading.level.toFixed(2) + " cm at or above critical";
        this.log("alarm", "CRITICAL latched, " + why + ". Gate open, pump on, siren on.");
      } else if (this.lastState !== null) {
        this.log("ok", "Alert cleared at " + reading.level.toFixed(2) +
          " cm, below the " + FIRMWARE.SAFE_RESET_LEVEL_CM.toFixed(1) + " cm safe reset.");
      }
      this.lastState = reading.state;
    }
    if (this.lastGate !== reading.gate) {
      if (this.lastGate !== null) {
        this.log("info", "Servo gate " + reading.gate +
          (reading.gate === "OPEN" ? " (90 degrees)" : " (0 degrees)"));
      }
      this.lastGate = reading.gate;
    }
  }

  // Colour rule for the level number.
  levelClass(level) {
    if (level >= FIRMWARE.CRITICAL_LEVEL_CM) return "critical";
    if (level >= FIRMWARE.SAFE_RESET_LEVEL_CM) return "warn";
    return "ok";
  }

  // How long until we hit CRITICAL_LEVEL_CM at the current rate of rise?
  // rise is cm over the last WINDOW samples, which is about 5 seconds.
  timeToCritical(reading) {
    const windowSeconds = (FIRMWARE.WINDOW * FIRMWARE.SAMPLE_MS) / 1000;
    const cmPerSecond = reading.rise / windowSeconds;

    if (reading.state === "CRITICAL") return { text: "now", cls: "critical" };
    if (cmPerSecond <= 0.01) return { text: "stable", cls: "ok" };

    const seconds = (FIRMWARE.CRITICAL_LEVEL_CM - reading.level) / cmPerSecond;
    if (seconds <= 0) return { text: "now", cls: "critical" };
    if (seconds > 3600) return { text: "stable", cls: "ok" };

    const cls = seconds < 30 ? "critical" : seconds < 120 ? "warn" : "";
    return { text: formatShort(seconds), cls };
  }

  // ---------- link state ----------
  setConnected(connected) {
    this.el.linkPill.className = "pill pill-link " + (connected ? "online" : "offline");
    this.el.linkText.textContent = connected ? "telemetry live" : "no telemetry";
    this.el.banner.hidden = connected;
    if (!connected) this.el.stateText.textContent = this.lastState || "WAITING";
  }

  // If nothing has arrived for a while, treat the link as down.
  checkStale() {
    if (!this.lastReadingAt) return;
    const stale = Date.now() - this.lastReadingAt > TELEMETRY.OFFLINE_AFTER_MS;
    if (stale && this.el.banner.hidden) this.setConnected(false);
  }

  // ---------- console log ----------
  log(tag, message) {
    const row = document.createElement("div");
    row.className = "log-row";

    const time = document.createElement("span");
    time.className = "log-time";
    time.textContent = new Date().toLocaleTimeString("en-GB", { hour12: false });

    const badge = document.createElement("span");
    badge.className = "log-tag " + tag;
    badge.textContent = tag.toUpperCase();

    const msg = document.createElement("span");
    msg.className = "log-msg";
    msg.textContent = message;

    row.append(time, badge, msg);
    this.el.log.appendChild(row);

    // Keep the log short and always scrolled to the newest line.
    while (this.el.log.childElementCount > 200) this.el.log.firstElementChild.remove();
    this.el.log.scrollTop = this.el.log.scrollHeight;
  }

  clearLog() {
    this.el.log.textContent = "";
  }
}

// 128456 ms becomes "2m 08s"
function formatUptime(ms) {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return m > 0 ? m + "m " + String(s).padStart(2, "0") + "s" : s + "s";
}

// 95 seconds becomes "1m 35s", 12 seconds becomes "12s"
function formatShort(seconds) {
  const s = Math.round(seconds);
  if (s < 60) return s + "s";
  return Math.floor(s / 60) + "m " + String(s % 60).padStart(2, "0") + "s";
}
