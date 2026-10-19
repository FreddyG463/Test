import {
  clayGeometry,
  latchPaddle,
  ballStop,
  plateSegment,
  gateSegment,
} from "./clay-bridge.mjs";
import { bearingSegments, bearingThickness } from "./clay-bearing.mjs";
export function drawClay(c, { rect, line, circle, text, scale }) {
  const size = Math.max(7, scale * 0.2),
    draw = (s, color, width) => line([s.a, s.b], color, width);
  for (const box of clayGeometry.shields)
    rect(box, box.rough ? "#9b9677" : "#81907e");
  for (const s of [...clayGeometry.track, ...clayGeometry.seedTrack])
    draw(s, "#6e806e", 5);
  if (c.patch) {
    const fired = c.patch.patch.material === "fired-clay";
    for (const s of bearingSegments(c.patch))
      draw(
        s,
        fired ? "#de8748" : "#927344",
        Math.max(3, bearingThickness(c.patch) * scale),
      );
    for (const a of c.patch.anchors)
      circle(a.x, a.y, 0.045, a.broken ? "#dc6460" : "#71a66b");
    if (c.patch.patch.ledger.vapor > 0 && c.patch.patch.energy > 0.15)
      for (let i = 0; i < 3; i++)
        circle(
          10.8 + i * 0.2,
          5.55 + ((c.time * 0.4 + i * 0.2) % 0.6),
          0.04,
          "#d4ded9",
        );
  }
  draw(latchPaddle(c), "#b49365", 7);
  draw(ballStop(c), "#9b795c", 6);
  line(
    [
      { x: 5.1, y: 4.4 + c.latch.q },
      { x: 5.1, y: 7 },
      { x: 9.4, y: 7 },
      { x: 9.4, y: 6.2 + c.latch.q },
    ],
    "#948566",
    2,
  );
  draw(plateSegment(c), "#b39664", 7);
  draw(gateSegment(c), "#9f845f", 7);
  line(
    [
      { x: 14.5, y: 4.35 - c.plate.q },
      { x: 14.5, y: 7 },
      { x: 16.7, y: 7 },
      { x: 16.7, y: 5.65 + 4 * c.plate.q },
    ],
    "#948566",
    2,
  );
  circle(c.ball.x, c.ball.y, c.ball.radius, "#6d95ac", "#476777");
  line(
    [
      { x: c.ball.x, y: c.ball.y },
      {
        x: c.ball.x + 0.12 * Math.cos(c.ball.angle),
        y: c.ball.y + 0.12 * Math.sin(c.ball.angle),
      },
    ],
    "#dbe6dc",
    1,
  );
  circle(c.seed.x, c.seed.y, c.seed.radius, "#b5a36f", "#777543");
  for (const p of [...c.projectiles, ...c.stones]) {
    line(p.trail ?? [], "#a39470", 1);
    circle(
      p.x,
      p.y,
      p.radius,
      p.species === "Mud"
        ? "#927344"
        : p.species === "Fire"
          ? "#dd713d"
          : "#77816f",
    );
  }
  const g = c.layout.goal;
  rect(
    { x: g.left - 0.15, y: g.bottom, w: 0.15, h: g.top - g.bottom },
    "#688956",
  );
  rect({ x: g.right, y: g.bottom, w: 0.15, h: g.top - g.bottom }, "#688956");
  rect(
    { x: g.left, y: g.bottom - 0.12, w: g.right - g.left, h: 0.12 },
    c.won ? "#92b578" : "#76925e",
  );
  text("MOTHER SPROUT", 18.1, 0.8, "#617e4d", size);
  text("THE CLAY BRIDGE", 10.8, 8.3, "#65795b", size * 1.2);
  text("LIFTING STOP", 5.1, 6.1, "#816b4b", size);
  text("ROUGH GAP", 11, 4, "#816b4b", size);
  text("LOAD PLATE", 14.5, 3.8, "#816b4b", size);
  if (c.won) text("DELIVERED", 18.5, 3.1, "#698e4e", size * 1.2);
}
