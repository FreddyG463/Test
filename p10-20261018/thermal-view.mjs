import {
  THERMAL,
  THERMAL_LAYOUT,
  pressure,
  waterTemperature,
  contactActive,
} from "./thermal.mjs";

export function drawThermal(t, time, { rect, line, circle, text, scale }) {
  const label = Math.max(7, scale * 0.19);
  const blue = waterTemperature(t) / THERMAL.boilingTemperature;
  // Cross-section is a schematic of the same water/contact state, not an exterior shell.
  if (t.openCatchment) {
    rect({ x: 14, y: 4, w: 2, h: 0.3 }, "#7d8574");
    rect({ x: 16, y: 4, w: 0.5, h: 2.4 }, "#7d8574");
  } else rect({ x: 13.5, y: 4, w: 3, h: 2.85 }, "#7d8574");
  rect({ ...THERMAL_LAYOUT.water, h: THERMAL_LAYOUT.water.h }, "#e2e4d5");
  rect(
    { ...THERMAL_LAYOUT.water, h: THERMAL_LAYOUT.water.h * t.water.volume },
    blue > 0.95 ? "#d7b878" : "#98b9b0",
  );
  line(
    [
      { x: 14, y: 4.3 + 2.1 * t.water.volume },
      { x: 16, y: 4.3 + 2.1 * t.water.volume },
    ],
    "#6d9890",
    2,
  );
  rect(
    t.bridge,
    t.bridge.material === "stone"
      ? "#929783"
      : t.source.heat > 0.05
        ? "#ce975a"
        : "#879587",
  );
  rect(t.exchanger, t.source.heat > 0.05 ? "#ce975a" : "#879587");
  // The contact gap is geometry: shrinking the bridge really separates it from water.
  if (!contactActive(t)) text("NO TRANSFER", 12.6, 5.5, "#9b7159", label);
  else if (t.transferRate > 0.01) {
    const x = 11.6 + (time % 1) * 2.2;
    circle(x, 6.27, 0.06, "#f8daa0");
  }
  text("HEAT BRIDGE", 12.6, 7.05, "#758068", label);
  text(
    t.openCatchment
      ? "OPEN CATCHMENT"
      : t.inlet
        ? `BOILER · ${(t.water.volume * 100).toFixed(0)}%`
        : "PREFILLED BOILER",
    15,
    3.5,
    "#758068",
    label,
  );
  if (t.inlet) {
    line(
      [
        { x: 13.05, y: 7.9 },
        { x: 13.05, y: 7.1 },
        { x: 14, y: 7.1 },
        { x: 14, y: 6.85 },
      ],
      "#8ea7a0",
      Math.max(2, scale * 0.16),
    );
    rect(t.inlet, "#9dbbb2");
    rect(
      { x: t.inlet.x + 0.1, y: t.inlet.y + 0.2, w: 0.7, h: 0.35 },
      "#e8f0e2",
    );
    text("WATER INLET", 12.9, 8.95, "#698b80", label);
  }
  // Exhausted pressure chamber with a sliding piston and visible rail stops.
  rect({ x: 14.8, y: 6.85, w: 0.4, h: 0.35 }, "#929d89");
  rect(
    { x: 14.5, y: 7.1, w: 1, h: t.piston.x },
    pressure(t) > 0.02 ? "#e0ceb0" : "#e5e8da",
  );
  for (const x of [14.4, 15.6])
    line(
      [
        { x, y: 7.1 },
        { x, y: 9.2 },
      ],
      "#71836b",
      2,
    );
  const y = THERMAL_LAYOUT.piston.y + t.piston.x;
  rect({ x: 14.35, y, w: 1.3, h: 0.18 }, "#4f6d5e");
  line(
    [
      { x: 15, y: y + 0.18 },
      { x: 15, y: y + 0.6 },
    ],
    "#657c6a",
    3,
  );
  const markerY = THERMAL_LAYOUT.piston.y + THERMAL.marker;
  line(
    [
      { x: 15.8, y: markerY },
      { x: 16.5, y: markerY },
    ],
    t.piston.reached ? "#d37a3c" : "#9da88c",
    3,
  );
  circle(16.7, markerY, 0.12, t.piston.reached ? "#d37a3c" : "#b6c0a6");
  text(
    t.piston.reached ? "CONTACT" : "TARGET",
    17,
    markerY + 0.4,
    "#748465",
    label,
  );
  text("PISTON", 15, 9.65, "#748465", label);
  if (t.steam > 0.01) {
    for (let i = 0; i < 3; i++)
      circle(
        14.75 + i * 0.25,
        7.1 + ((time * 0.8 + i * 0.2) % Math.max(0.1, t.piston.x)),
        0.04,
        "#f8f3df",
      );
  }
}
