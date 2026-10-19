import { surfaceHeight } from "./surface-water.mjs";
export function drawCircuit(c, { rect, line, circle, text, scale }) {
  const e = c.electric,
    l = c.layout,
    active = (id) => e.energized.includes(id),
    color = (id) => (active(id) ? "#43a9ba" : "#71857b");
  const label = (s, x, y) =>
    text(s, x, y, "#435e50", Math.max(7, scale * 0.19));
  for (const n of c.surface.nodes)
    if (n.water.volume > 1e-6) {
      const id = `open-water-${n.x}`;
      rect(
        { x: n.x, y: n.base, w: n.w, h: surfaceHeight(n) - n.base },
        active(id) ? "#56aebe" : "#99c7ce",
      );
    }
  for (const p of [...c.surface.parcels, ...c.surface.spills])
    circle(p.x, p.y, 0.09, "#56aebe");
  for (const b of c.walls) rect(b, "#89967a");
  rect(c.electrode, color("receiver"));
  rect(c.port, e.generatorOn ? "#68a379" : "#71857b");
  rect(l.output, color("output"));
  for (const pulse of e.pulses)
    if (pulse.point)
      circle(
        pulse.point.x,
        pulse.point.y,
        0.1 * pulse.intensity,
        pulse.intensity > 1 ? "#c7a3df" : "#b5e0e9",
      );
  label(e.generatorOn ? "GENERATOR ON" : "ELECTRIC START", 8.6, 7.65);
  // Two straight slack segments have the configured tether length. Only the tip
  // is simulated (P02-style tension constraint), not an invented animation path.
  const d = Math.hypot(c.tip.x - c.pin.x, c.tip.y - c.pin.y),
    slack = Math.sqrt(Math.max(0, (c.length / 2) ** 2 - (d / 2) ** 2));
  const mid = {
    x: (c.pin.x + c.tip.x) / 2 + slack,
    y: (c.pin.y + c.tip.y) / 2,
  };
  line([c.pin, mid, c.tip], color("cable-tip"), Math.max(2, scale * 0.06));
  circle(c.pin.x, c.pin.y, 0.1, "#71857b");
  circle(c.tip.x, c.tip.y, c.tip.radius, color("cable-tip"), "#435e50");
  if (c.support.intact)
    line(
      [
        { x: 6.17, y: 4.6 },
        { x: 6.17, y: 8.3 },
        { x: 10, y: 8.3 },
        { x: c.tip.x, y: c.tip.y },
      ],
      "#b39057",
      2,
    );
  for (const x of [6.17, 10]) {
    rect({ x: x - 0.3, y: 8.35, w: 0.6, h: 0.15 }, "#89967a");
    circle(x, 8.3, 0.12, "#d6c59c", "#71857b");
  }
  label("RELEASE CORD", 6.1, 2.7);
  label("WATER CONTACTS", 10.1, 2.1);
  line(
    [
      { x: 10.76, y: 1.1 },
      { x: 12.3, y: 1.1 },
      { x: 12.3, y: 4.5 },
      { x: 13.3, y: 4.5 },
    ],
    color("receiver"),
    1,
    [3, 3],
  );
  label(e.pathConnected ? "PATH CONNECTED" : "PATH OPEN", 10.1, 1.6);
  for (const r of l.ramps)
    line([r.a, r.b], "#71857b", Math.max(3, scale * 0.12));
  if (!e.opened) rect(l.gate, "#7f8977");
  else rect({ ...l.gate, y: 7.5, h: 0.25 }, "#68a379");
  label(
    e.opened ? "GATE OPEN" : `${e.charge.toFixed(1)} / ${e.duration} s`,
    13.5,
    7.4,
  );
  const g = l.goal;
  line(
    [
      { x: g.left, y: g.top },
      { x: g.left, y: g.bottom },
      { x: g.right, y: g.bottom },
      { x: g.right, y: g.top },
    ],
    c.won ? "#4b8647" : "#71857b",
    Math.max(3, scale * 0.15),
  );
  label("↓ TOP ENTRY", 17.5, 3.6);
  label("MOTHER SPROUT", 17.5, 0.9);
  circle(c.seed.x, c.seed.y, c.seed.radius, "#8eae51", "#435e50");
  label(c.won ? "DELIVERED" : "PLANT SEED", c.seed.x, c.seed.y + 0.6);
}
