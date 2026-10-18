import { bridgeSegment, overflowBudget } from "./overflow.mjs";
import { height, volume, concentration, wallPatchBounds } from "./mixture.mjs";
const color = (m) => {
  const c = 1 - Math.exp(-6 * concentration(m));
  return `rgb(${Math.round(85 + 51 * c)},${Math.round(162 - 78 * c)},${Math.round(184 - 141 * c)})`;
};
export function drawOverflow(o, { rect, line, circle, text, scale }) {
  const k = o.layout,
    size = Math.max(7, scale * 0.21);
  for (const n of o.basin)
    if (volume(n) > 0)
      rect(
        { x: n.x, y: n.base, w: n.w, h: height(n, o.stones) - n.base },
        color(n),
      );
  rect(
    { x: k.left - 0.2, y: k.base - 0.2, w: 0.2, h: k.rim - k.base + 0.2 },
    "#81907e",
  );
  rect({ x: k.left, y: k.base - 0.2, w: k.right - k.left, h: 0.2 }, "#81907e");
  for (const b of k.shields) rect(b, "#81907e");
  line([k.roof.a, k.roof.b], "#667967", 6);
  for (const n of o.chute) {
    line(
      [
        { x: n.x, y: n.base },
        { x: n.x + n.w, y: n.base },
      ],
      "#7e8d78",
      3,
    );
    if (volume(n) > 1e-7)
      rect({ x: n.x, y: n.base, w: n.w, h: height(n) - n.base }, color(n));
  }
  text("CISTERN", 9.7, 8.35, "#537586", size);
  text(`LIP ${k.rim.toFixed(1)} m`, 10, 7.2, "#537586", size);
  text("GENTLE CHUTE · 5°", 14, 7.45, "#727454", size);
  text("ROOF → DRAIN", 17.5, 8.3, "#62745d", size);
  for (const p of o.parcels)
    circle(
      p.x,
      p.y,
      Math.min(0.12, 0.035 + Math.sqrt(volume(p)) * 0.1),
      color(p),
    );
  for (const p of o.wallPatches) rect(wallPatchBounds(p), color(p));
  for (const s of o.stones) {
    line(s.trail, "#969a8a", 1);
    circle(s.x, s.y, s.radius, "#77816f", "#4e5e4a");
  }
  const top = k.bucket.top - o.drum.q,
    bottom = k.bucket.bottom - o.drum.q;
  rect(
    {
      x: k.bucket.left,
      y: bottom,
      w: k.bucket.right - k.bucket.left,
      h: volume(o.bucket) / ((k.bucket.right - k.bucket.left) / 4.2),
    },
    color(o.bucket),
  );
  line(
    [
      { x: k.bucket.left, y: top },
      { x: k.bucket.left, y: bottom },
      { x: k.bucket.right, y: bottom },
      { x: k.bucket.right, y: top },
    ],
    "#607d72",
    4,
  );
  const b = bridgeSegment(o);
  for (const s of k.ramps) line([s.a, s.b], "#758673", 5);
  line([b.a, b.b], "#8d8965", 6);
  circle(b.a.x, b.a.y, 0.12, "#596e59");
  line(
    [
      { x: 16.75, y: top },
      { x: 16.75, y: 9.2 },
      { x: 18.5, y: 9.2 },
      { x: 18.5, y: 3 + o.drum.q },
    ],
    "#897659",
    2,
  );
  circle(16.75, 9.2, 0.13, "#9b9d82");
  circle(18.5, 9.2, 0.13, "#9b9d82");
  rect({ x: 18.2, y: 2.5 + o.drum.q, w: 0.6, h: 0.5 }, "#929680");
  text(
    `${o.drum.counterMass.toFixed(2)} kg*`,
    18.5,
    2 + o.drum.q,
    "#6e755c",
    size,
  );
  // The ideal drum transmits the same coordinate into the bridge hinge.
  line(
    [
      { x: 16.75, y: 9.2 },
      { x: 9.5, y: 9.2 },
      { x: 9.5, y: 2.9 },
    ],
    "#a39774",
    1,
    [3, 3],
  );
  const goal = k.goal;
  line(
    [
      { x: goal.left, y: goal.top },
      { x: goal.left, y: goal.bottom },
      { x: goal.right, y: goal.bottom },
      { x: goal.right, y: goal.top },
    ],
    "#638a55",
    4,
  );
  circle(o.seed.x, o.seed.y, o.seed.radius, "#8da85a", "#55733e");
  text(o.won ? "DELIVERED!" : "MOTHER SPROUT", 14.5, 0.18, "#527944", size);
  text(
    `${overflowBudget(o).bucketMass.toFixed(3)} kg*`,
    16.75,
    bottom - 0.4,
    "#52746b",
    size,
  );
}
