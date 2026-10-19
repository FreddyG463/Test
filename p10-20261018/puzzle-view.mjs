// Rendering only: moving positions come from the deterministic model.
export function drawPuzzle(world, { rect, line, circle, text, scale }) {
  const p = world.puzzle,
    l = p.layout,
    g = l.goal;
  const label = (s, x, y) =>
    text(s, x, y, "#435e50", Math.max(7, scale * 0.19));
  for (const ramp of l.ramps)
    line([ramp.a, ramp.b], "#71857b", Math.max(3, scale * 0.12));
  rect(
    {
      x: l.bridge.left,
      y: p.bridgeY - 0.15,
      w: l.bridge.right - l.bridge.left,
      h: 0.15,
    },
    "#608969",
  );
  line(
    [
      { x: 13.7, y: 1 },
      { x: 13.7, y: p.bridgeY - 0.15 },
    ],
    "#71857b",
    Math.max(3, scale * 0.15),
  );
  for (const x of [12.35, 15])
    rect({ x, y: 4.15, w: 0.15, h: 0.25 }, "#b39057");
  label("RAIL CATCH", 14, 2.1);
  label("CROSSING", 13.6, 5.2);
  rect(l.boiler, "#71857b");
  rect(
    { x: l.boiler.x + 0.15, y: l.boiler.y + 0.15, w: l.boiler.w - 0.3, h: 0.8 },
    "#9bc6c6",
  );
  rect(l.rod, "#b39057");
  line(
    [
      { x: 10.6, y: 2.5 },
      { x: 13.7, y: 2.5 },
    ],
    "#8aab70",
    2,
    [4, 3],
  );
  label("STEAM → PISTON", 11.7, 1.65);
  if (p.support.intact)
    line(
      [
        { x: 6.17, y: 4.6 },
        { x: 6.17, y: 8 },
        { x: 10, y: 8 },
        { x: 10, y: p.seed.y },
      ],
      "#b39057",
      2,
    );
  label("RELEASE CORD", 6.2, 5.1);
  line(
    [
      { x: g.left, y: g.top },
      { x: g.left, y: g.bottom },
      { x: g.right, y: g.bottom },
      { x: g.right, y: g.top },
    ],
    p.won ? "#42783e" : "#71857b",
    Math.max(3, scale * 0.15),
  );
  label("MOTHER SPROUT", 17.5, 0.9);
  label("↓ TOP ENTRY", 17.5, 3.55);
  circle(p.seed.x, p.seed.y, p.seed.radius, "#8eae51", "#435e50");
  label(p.won ? "DELIVERED" : "PLANT SEED", p.seed.x, p.seed.y + 0.6);
}
