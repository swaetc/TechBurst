// ============================================================
// Data source picker.
// main.js asks for a source and does not care which one it gets.
// Change DATA_SOURCE in js/config.js to swap the simulator for
// the real device. This is the only switch in the whole project.
// ============================================================

import { DATA_SOURCE } from "../config.js";
import { SimulatedSource } from "./simulator.js";
import { MqttSource } from "./mqtt.js";

export function createSource() {
  if (DATA_SOURCE === "MQTT") return new MqttSource();
  return new SimulatedSource();
}
