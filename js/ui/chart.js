// ============================================================
// Live level chart, drawn with Chart.js 4 (loaded as a global
// from the UMD script tag in index.html).
//
// Three lines:
//   water level      - the measured level from the device
//   critical 10 cm   - where the alert latches on
//   safe reset 7 cm  - where it is allowed to clear
// The threshold lines are plain datasets, so we do not need the
// annotation plugin and there is one less thing to break.
// ============================================================

import { FIRMWARE, COLORS } from "../config.js";

const MAX_POINTS = 120; // about two minutes of history at 1 Hz

export class LevelChart {
  constructor(canvasId) {
    const canvas = document.getElementById(canvasId);

    // If the CDN did not load, fail loudly but do not break the app.
    if (typeof window.Chart === "undefined") {
      console.warn("[AshX] Chart.js did not load, the chart is disabled.");
      this.chart = null;
      return;
    }

    const grid = { color: "rgba(29, 39, 50, 0.9)", drawTicks: false };
    const ticks = { color: COLORS.muted, font: { size: 10, family: "monospace" } };

    this.chart = new window.Chart(canvas.getContext("2d"), {
      type: "line",
      data: {
        labels: [],
        datasets: [
          {
            label: "level",
            data: [],
            borderColor: COLORS.accent,
            backgroundColor: "rgba(78, 201, 217, 0.12)",
            borderWidth: 2,
            fill: true,
            tension: 0.3,
            pointRadius: 0,
            // Colour the line red while the device is in CRITICAL.
            segment: {
              borderColor: (ctx) =>
                ctx.p1.parsed.y >= FIRMWARE.CRITICAL_LEVEL_CM ? COLORS.critical : COLORS.accent
            }
          },
          {
            label: "critical " + FIRMWARE.CRITICAL_LEVEL_CM.toFixed(1) + " cm",
            data: [],
            borderColor: "rgba(244, 82, 92, 0.65)",
            borderWidth: 1,
            borderDash: [5, 4],
            pointRadius: 0,
            fill: false
          },
          {
            label: "safe reset " + FIRMWARE.SAFE_RESET_LEVEL_CM.toFixed(1) + " cm",
            data: [],
            borderColor: "rgba(52, 211, 153, 0.55)",
            borderWidth: 1,
            borderDash: [3, 4],
            pointRadius: 0,
            fill: false
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        interaction: { intersect: false, mode: "index" },
        scales: {
          x: { grid, ticks: { ...ticks, maxTicksLimit: 8 } },
          y: {
            min: 0,
            max: FIRMWARE.TANK_HEIGHT_CM,
            grid,
            ticks: { ...ticks, stepSize: 5, callback: (v) => v + " cm" }
          }
        },
        plugins: {
          legend: {
            labels: {
              color: COLORS.muted,
              boxWidth: 10,
              boxHeight: 2,
              font: { size: 10, family: "monospace" }
            }
          },
          tooltip: {
            backgroundColor: "#0f151c",
            borderColor: "#1d2732",
            borderWidth: 1,
            titleColor: COLORS.text,
            bodyColor: COLORS.text,
            bodyFont: { family: "monospace", size: 11 }
          }
        }
      }
    });
  }

  // Add one telemetry reading to the right hand edge.
  push(reading) {
    if (!this.chart) return;
    const d = this.chart.data;

    d.labels.push(new Date().toLocaleTimeString("en-GB", { hour12: false }));
    d.datasets[0].data.push(reading.level);
    d.datasets[1].data.push(FIRMWARE.CRITICAL_LEVEL_CM);
    d.datasets[2].data.push(FIRMWARE.SAFE_RESET_LEVEL_CM);

    // Drop the oldest point once the window is full.
    if (d.labels.length > MAX_POINTS) {
      d.labels.shift();
      d.datasets.forEach((set) => set.data.shift());
    }
    this.chart.update();
  }

  // Draw a visible break in the line while telemetry is missing.
  pushGap() {
    if (!this.chart) return;
    const d = this.chart.data;
    if (d.datasets[0].data.at(-1) === null) return; // one gap marker is enough

    d.labels.push("");
    d.datasets[0].data.push(null);
    d.datasets[1].data.push(FIRMWARE.CRITICAL_LEVEL_CM);
    d.datasets[2].data.push(FIRMWARE.SAFE_RESET_LEVEL_CM);
    if (d.labels.length > MAX_POINTS) {
      d.labels.shift();
      d.datasets.forEach((set) => set.data.shift());
    }
    this.chart.update();
  }
}
