import { surfaceHeight } from "./surface-water.mjs";
export function drawSurface(s, time, { rect, line, circle, text, scale }) {
  for (const n of s.nodes) {
    if (n.basin) continue;
    const terrain = n.terrainBase ?? n.base;
    if (terrain > 0.45)
      rect(
        { x: n.x, y: 0.45, w: n.w, h: terrain - 0.45 },
        n.wall ? "#8c9681" : "#a9b78b",
      );
    line(
      [
        { x: n.x, y: terrain },
        { x: n.x + n.w, y: terrain },
      ],
      "#7e9566",
      1.5,
    );
    if (n.water.volume > 1e-6) {
      const height = surfaceHeight(n);
      rect(
        { x: n.x, y: n.base, w: n.w, h: height - n.base },
        (n.water.energy ?? 0) / Math.max(1e-12, n.water.volume) > 0.3
          ? "#d7b878"
          : "#93c3cb",
      );
      line(
        [
          { x: n.x, y: height },
          { x: n.x + n.w, y: height },
        ],
        "#4e929d",
        2,
      );
    }
  }
  for (const p of [...s.parcels, ...s.spills]) {
    line(
      [p.before ?? { x: p.x, y: p.y + 0.1 }, { x: p.x, y: p.y }],
      "#6ba9b7",
      2,
    );
    circle(
      p.x,
      p.y,
      Math.max(0.055, Math.min(0.12, Math.cbrt(p.volume) * 0.5)),
      "#65a8b5",
    );
  }
  const size = Math.max(7, scale * 0.18);
  text("DOWNHILL RUNOFF", 11.4, 4.5, "#698865", size);
  text("BLOCKING WALL", 5.6, 3.7, "#748465", size);
  // Explicit physical outlets: left world boundary and catchment overflow lip.
  line(
    [
      { x: 0.05, y: 0.65 },
      { x: 0.5, y: 0.65 },
    ],
    "#4d8e98",
    3,
  );
  text("DRAIN", 0.65, 1.1, "#588893", size);
  text("SPILL → LOWER POOL", 17.9, 3.3, "#588893", size);
  text("RIGHT DRAIN", 19, 1.1, "#588893", size);
  for (const v of s.vapor) circle(v.x, v.y, 0.06, "#e3d9bf");
}
