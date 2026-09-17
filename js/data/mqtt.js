// ============================================================
// MqttSource - STUB, not active yet.
//
// This is the file you finish when the real ESP32 is ready.
// It has the same interface as SimulatedSource:
//   start(), stop(), onReading(cb), onConnectionChange(cb)
// so nothing else in the dashboard has to change.
//
// TO GO LIVE:
//  1. Add this line to index.html, above the module script:
//     <script src="https://cdn.jsdelivr.net/npm/mqtt@5.3.5/dist/mqtt.min.js"></script>
//  2. Set MQTT_CONFIG.team and MQTT_CONFIG.topic in js/config.js.
//  3. Set DATA_SOURCE to "MQTT" in js/config.js.
//  4. Remove the "not implemented" warning below.
// ============================================================

import { MQTT_CONFIG } from "../config.js";

export class MqttSource {
  constructor() {
    this.readingHandlers = [];
    this.connectionHandlers = [];
    this.client = null;
  }

  onReading(callback) {
    this.readingHandlers.push(callback);
  }

  onConnectionChange(callback) {
    this.connectionHandlers.push(callback);
  }

  start() {
    // The mqtt.js UMD build puts a global "mqtt" on window.
    if (typeof window === "undefined" || typeof window.mqtt === "undefined") {
      console.warn(
        "[AshX] MqttSource: mqtt.js is not loaded. Add the CDN script tag to index.html. " +
        "Staying on the simulator is fine for the demo."
      );
      this.emitConnection(false);
      return;
    }

    // TODO: verify the broker and topic match what the ESP32 publishes to.
    const clientId = MQTT_CONFIG.clientIdPrefix + Math.random().toString(16).slice(2, 8);
    this.client = window.mqtt.connect(MQTT_CONFIG.url, {
      clientId,
      reconnectPeriod: MQTT_CONFIG.reconnectPeriodMs,
      clean: true
    });

    this.client.on("connect", () => {
      this.emitConnection(true);
      this.client.subscribe(MQTT_CONFIG.topic);
    });

    this.client.on("message", (topic, payloadBuffer) => {
      try {
        const reading = JSON.parse(payloadBuffer.toString());
        // TODO: if the firmware ever renames a field, translate it to the
        // data contract HERE so the rest of the dashboard stays untouched.
        this.readingHandlers.forEach((cb) => cb(reading));
      } catch (err) {
        console.warn("[AshX] Bad telemetry payload, ignoring.", err);
      }
    });

    this.client.on("close", () => this.emitConnection(false));
    this.client.on("error", (err) => {
      console.warn("[AshX] MQTT error", err);
      this.emitConnection(false);
    });
  }

  stop() {
    if (this.client) this.client.end(true);
    this.client = null;
    this.emitConnection(false);
  }

  emitConnection(value) {
    this.connectionHandlers.forEach((cb) => cb(value));
  }
}
