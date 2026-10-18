// Reusable deterministic circle/segment seed and top-entry goal capabilities.
// Experimental world units; no canvas, asset sizes, DOM or Unity assumptions.
export const FIRST_LEVEL = Object.freeze({
  id: "warm-crossing",
  shots: 3,
  seed: Object.freeze({
    id: "plant-seed",
    kind: "plant-seed",
    x: 10,
    y: 6.4,
    radius: 0.22,
  }),
  support: Object.freeze({ id: "seed-support", intact: true }),
  heatPad: Object.freeze({ x: 8.3, y: 5.5, w: 0.6, h: 1.7 }),
  boiler: Object.freeze({ x: 8.6, y: 2, w: 2, h: 1.4 }),
  rod: Object.freeze({ x: 8.6, y: 3, w: 0.3, h: 2.5 }),
  exchanger: Object.freeze({ x: 8.6, y: 2, w: 0.15, h: 1.4 }),
  rope: Object.freeze({
    id: "release-rope",
    material: "rope",
    constraint: "seed-support",
    x: 6,
    y: 3,
    w: 0.35,
    h: 1.6,
  }),
  ramps: Object.freeze([
    Object.freeze({
      a: Object.freeze({ x: 9.5, y: 6 }),
      b: Object.freeze({ x: 12.5, y: 4.8 }),
    }),
    Object.freeze({
      a: Object.freeze({ x: 15, y: 4.0 }),
      b: Object.freeze({ x: 16.5, y: 3.2 }),
    }),
  ]),
  bridge: Object.freeze({ left: 12.5, right: 15, base: 3.2 }),
  catch: Object.freeze({ position: 1.2 }),
  goal: Object.freeze({
    seedId: "plant-seed",
    left: 16.5,
    right: 18.5,
    top: 2.8,
    bottom: 1.2,
  }),
});

export function createPuzzle(layout = FIRST_LEVEL) {
  const support = { ...layout.support };
  return {
    layout,
    support,
    ammo: layout.shots,
    seed: { ...layout.seed, vx: 0, vy: 0, age: 0, support },
    won: false,
    lost: false,
    bridgeY: layout.bridge.base,
    events: [],
    maxStep: 0,
  };
}

export function topEntry(entity, before, after, goal) {
  if (
    entity.kind !== "plant-seed" ||
    entity.id !== goal.seedId ||
    after.vy >= 0
  )
    return false;
  const start = before.y - entity.radius,
    end = after.y - entity.radius;
  if (start < goal.top || end >= goal.top || start === end) return false;
  const fraction = (start - goal.top) / (start - end);
  const x = before.x + (after.x - before.x) * fraction;
  return x - entity.radius > goal.left && x + entity.radius < goal.right;
}

// Two-sided capsule segment contact, with relative velocity for moving supports.
export function circleSegment(body, a, b, surfaceVelocity = 0) {
  const dx = b.x - a.x,
    dy = b.y - a.y,
    length2 = dx * dx + dy * dy;
  const u = Math.max(
    0,
    Math.min(1, ((body.x - a.x) * dx + (body.y - a.y) * dy) / length2),
  );
  const x = a.x + dx * u,
    y = a.y + dy * u,
    vx = body.x - x,
    vy = body.y - y,
    d = Math.hypot(vx, vy);
  if (d >= body.radius) return false;
  const nx = d > 1e-12 ? vx / d : -dy / Math.sqrt(length2),
    ny = d > 1e-12 ? vy / d : dx / Math.sqrt(length2);
  body.x += nx * (body.radius - d);
  body.y += ny * (body.radius - d);
  const surface =
    typeof surfaceVelocity === "function" ? surfaceVelocity({ x, y }) : null;
  const into = surface
    ? (body.vx - surface.x) * nx + (body.vy - surface.y) * ny
    : body.vx * nx + (body.vy - surfaceVelocity) * ny;
  if (into < 0) {
    body.vx -= into * nx;
    body.vy -= into * ny;
  }
  return true;
}

export function advanceSeed(s, segments, gravity, dt, integrate) {
  const before = { x: s.x, y: s.y };
  integrate(s, gravity, dt);
  for (let i = 0; i < 4; i++)
    for (const segment of segments)
      circleSegment(s, segment.a, segment.b, segment.velocity ?? 0);
  s.vx *= Math.exp(-0.12 * dt);
  return before;
}

export function stepPuzzle(world, dt, integrate) {
  const p = world.puzzle,
    s = p.seed,
    l = p.layout;
  const bridgeY = l.bridge.base + world.thermal.piston.x;
  const bridgeVelocity = (bridgeY - p.bridgeY) / dt;
  p.bridgeY = bridgeY;
  if (s.support.intact) return;
  const segments = [
    ...l.ramps,
    {
      a: { x: l.bridge.left, y: bridgeY },
      b: { x: l.bridge.right, y: bridgeY },
      velocity: bridgeVelocity,
    },
    { a: { x: 0, y: 0.45 }, b: { x: 20, y: 0.45 } },
    {
      a: { x: l.goal.left, y: l.goal.bottom },
      b: { x: l.goal.left, y: l.goal.top },
    },
    {
      a: { x: l.goal.right, y: l.goal.bottom },
      b: { x: l.goal.right, y: l.goal.top },
    },
    {
      a: { x: l.goal.left, y: l.goal.bottom },
      b: { x: l.goal.right, y: l.goal.bottom },
    },
  ];
  const before = advanceSeed(s, segments, world.gravity, dt, integrate);
  p.maxStep = Math.max(p.maxStep, Math.hypot(s.x - before.x, s.y - before.y));
  if (!p.won && topEntry(s, before, s, l.goal)) {
    p.won = true;
    p.events.push({
      time: world.time,
      event: "seed-entered-top",
      x: s.x,
      y: s.y,
    });
  }
  if (!p.won && !p.lost && s.y - s.radius <= 0.451) {
    p.lost = true;
    p.events.push({
      time: world.time,
      event: "seed-on-pit-floor",
      x: s.x,
      y: s.y,
    });
  }
}

export function railCatch(piston, before, stop) {
  if (before >= stop.position && piston.x < stop.position) {
    piston.x = stop.position;
    piston.velocity = Math.max(0, piston.velocity);
    return true;
  }
  return false;
}

export function rampSolids(ramps) {
  const boxes = [];
  for (const [index, ramp] of ramps.entries()) {
    const steps = Math.ceil((ramp.b.x - ramp.a.x) / 0.25);
    for (let i = 0; i < steps; i++) {
      const x = ramp.a.x + ((ramp.b.x - ramp.a.x) * i) / steps;
      const nextX = ramp.a.x + ((ramp.b.x - ramp.a.x) * (i + 1)) / steps;
      const y = ramp.a.y + ((ramp.b.y - ramp.a.y) * i) / steps;
      const nextY = ramp.a.y + ((ramp.b.y - ramp.a.y) * (i + 1)) / steps;
      boxes.push({
        id: `track-${index}-${i}`,
        material: "stone",
        x,
        y: Math.min(y, nextY) - 0.1,
        w: nextX - x,
        h: Math.abs(y - nextY) + 0.1,
      });
    }
  }
  return boxes;
}
export function puzzleSolids(p) {
  const boxes = rampSolids(p.layout.ramps);
  const g = p.layout.goal;
  boxes.push(
    {
      id: "moving-bridge",
      material: "metal",
      x: p.layout.bridge.left,
      y: p.bridgeY - 0.15,
      w: p.layout.bridge.right - p.layout.bridge.left,
      h: 0.15,
    },
    {
      id: "mother-left",
      material: "stone",
      x: g.left - 0.15,
      y: g.bottom,
      w: 0.15,
      h: g.top - g.bottom,
    },
    {
      id: "mother-right",
      material: "stone",
      x: g.right,
      y: g.bottom,
      w: 0.15,
      h: g.top - g.bottom,
    },
    {
      id: "mother-base",
      material: "stone",
      x: g.left,
      y: g.bottom - 0.15,
      w: g.right - g.left,
      h: 0.15,
    },
  );
  return boxes;
}
