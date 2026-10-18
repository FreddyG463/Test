import { surfaceHeight } from "./surface-water.mjs";
import { movingGate } from "./last-connection.mjs";
export function drawLast(l, { rect, line, circle, text, scale }) {
  const k = l.layout,
    size = Math.max(7, scale * 0.22);
  for (const s of [...k.funnel, ...k.ramps]) line([s.a, s.b], "#788779", 5);
  // Declared constant-head boundary reservoir; the counter is the actual remaining mass.
  rect({ x: 13.6, y: 8.5, w: 2, h: 0.65 }, "#a5cbd0");
  text(`SOURCE ${l.source.toFixed(1)} V*`, 14.6, 9.45, "#3a707b", size);
  line(
    [
      { x: 14.6, y: 8.5 },
      { x: 14.6, y: 6.05 },
      { x: 12.7, y: 5 },
      { x: 11, y: 5 },
    ],
    l.flow > 0 ? "#5099b1" : "#8f9b98",
    3,
    [4, 4],
  );
  text(`FEED ${(l.aperture * 100).toFixed(0)}%`, 14.6, 7.5, "#426c73", size);
  for (const m of [l.pad, l.rod])
    rect(m, m.energy > 0.025 ? "#cf864f" : "#798e8b");
  text("HEAT INPUT", 6.3, 5.05, "#866445", size);
  rect({ ...l.pool, h: l.pool.volume / l.pool.area }, "#5da6bd");
  for (const e of [k.output, k.receiver]) rect(e, "#bda05d");
  for (const b of k.shields) rect(b, "rgba(113,126,112,0.45)");
  text(
    l.powered ? "WET LINK · ON" : "CONTACT OPEN",
    10.9,
    3.4,
    l.powered ? "#42798a" : "#9b633f",
    size,
  );
  line(
    [
      { x: 10.55, y: 4.6 },
      { x: 10.55, y: 5.9 },
      { x: 8.5, y: 5.9 },
    ],
    "#bb9c53",
    2,
  );
  circle(8.5, 5.9, 0.24, "#d2bc79");
  text("GEN ON", 8.5, 6.45, "#7c6c40", size);
  line(
    [
      { x: 11.4, y: 4.6 },
      { x: 12.3, y: 4.6 },
      { x: 12.3, y: 8.1 },
      { x: 17.6, y: 8.1 },
    ],
    l.powered ? "#c3a75c" : "#939d8c",
    2,
  );
  rect(
    { x: k.pole.x - k.pole.w / 2, y: k.pole.y, w: k.pole.w, h: 0.25 },
    l.powered ? "#ccad69" : "#78897e",
  );
  text(`MAGNET ${l.pulley.force.toFixed(1)} N`, 17.6, 8.9, "#6e714d", size);
  const gate = movingGate(l);
  line(
    [
      { x: gate.x + gate.w / 2, y: gate.y + gate.h },
      { x: gate.x + gate.w / 2, y: 9.9 },
      { x: l.weight.x, y: 9.9 },
      { x: l.weight.x, y: l.weight.y + l.weight.radius },
    ],
    "#7d6954",
    2,
  );
  circle(gate.x + gate.w / 2, 9.75, 0.12, "#a1a895");
  circle(l.weight.x, 9.75, 0.12, "#a1a895");
  rect(gate, "#7c8b79");
  circle(l.weight.x, l.weight.y, l.weight.radius, "#5c7376", "#354e50");
  text("METAL WEIGHT", 17.6, l.weight.y - 0.65, "#5c7070", size);
  const g = k.goal;
  rect(
    { x: g.left - 0.15, y: g.bottom, w: 0.15, h: g.top - g.bottom },
    "#6d915f",
  );
  rect({ x: g.right, y: g.bottom, w: 0.15, h: g.top - g.bottom }, "#6d915f");
  rect(
    { x: g.left, y: g.bottom - 0.15, w: g.right - g.left, h: 0.15 },
    "#6d915f",
  );
  text(l.won ? "DELIVERED!" : "MOTHER SPROUT", 17.5, 0.75, "#527947", size);
  circle(l.seed.x, l.seed.y, l.seed.radius, "#85a755", "#4b723c");
  for (const s of l.stones) {
    line(s.trail, "#9a9c90", 1);
    circle(s.x, s.y, s.radius, "#777e72", "#4c584b");
  }
  for (const p of [...l.runoff.parcels, ...l.runoff.spills])
    circle(p.x, p.y, 0.055, "#5d9fb3");
  for (const n of l.runoff.nodes)
    if (n.water.volume > 1e-6)
      rect({ x: n.x, y: n.base, w: n.w, h: n.water.volume / n.w }, "#8bbccc");
  for (const v of l.vapor) circle(v.x, v.y, 0.07, "rgba(149,172,171,0.4)");
}
