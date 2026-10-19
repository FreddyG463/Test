import { createThermalRig } from "./thermal.mjs";
import {
  createSurface,
  stepSurface,
  surfaceHeight,
  poolTargets,
} from "./surface-water.mjs";
import { circleSegment, topEntry, advanceSeed, rampSolids } from "./puzzle.mjs";
import {
  createElectric,
  electricImpact,
  stepElectric,
  contact,
} from "./electric.mjs";
export const STOCK = Object.freeze({ Spark: 2, Drop: 2, Biomass: 1, Metal: 1 });
export const PAIRS = Object.freeze({
  Fire: ["Spark", "Biomass"],
  Water: ["Drop", "Drop"],
  Electric: ["Spark", "Metal"],
  Thunder: ["Spark", "Spark"],
});
export function mix(a, b, recipes = PAIRS) {
  return (
    Object.keys(recipes).find(
      (k) => [...recipes[k]].sort().join("|") === [a, b].sort().join("|"),
    ) ?? null
  );
}
export function costAvailable(stock, species, recipes = PAIRS) {
  const pair = Object.hasOwn(recipes, species) ? recipes[species] : null;
  return (
    !!pair &&
    Object.values(stock).every((n) => Number.isInteger(n) && n >= 0) &&
    pair.every(
      (k) =>
        Number.isInteger(stock[k]) &&
        stock[k] >= pair.filter((x) => x === k).length,
    )
  );
}
export function spend(stock, species, recipes = PAIRS) {
  if (!costAvailable(stock, species, recipes)) return false;
  for (const k of recipes[species]) stock[k]--;
  return true;
}
export const CIRCUIT_LAYOUT = Object.freeze({
  basin: { left: 9, right: 11.25, base: 0.45, crest: 1.6, wallWidth: 0.25 },
  pin: { x: 10, y: 5.5 },
  length: 4.6,
  tip: { x: 10, y: 3, radius: 0.18 },
  port: {
    id: "start-port",
    electricId: "output",
    startPort: true,
    material: "metal",
    x: 8.3,
    y: 5.5,
    w: 0.6,
    h: 1.7,
    heat: 0,
    burned: false,
  },
  output: { id: "output", material: "metal", x: 8.85, y: 5.4, w: 1.3, h: 0.2 },
  rope: {
    id: "cable-rope",
    constraint: "cable-restraint",
    material: "rope",
    x: 6,
    y: 3,
    w: 0.35,
    h: 1.6,
    heat: 0,
    burned: false,
  },
  electrode: {
    id: "receiver",
    material: "metal",
    x: 10.6,
    y: 0.65,
    w: 0.16,
    h: 0.45,
    heat: 0,
    burned: false,
  },
  gate: {
    id: "charge-gate",
    material: "stone",
    x: 13.3,
    y: 4.5,
    w: 0.25,
    h: 2.3,
  },
  ramps: [{ a: { x: 11.5, y: 6 }, b: { x: 16.5, y: 3.2 } }],
  goal: {
    seedId: "plant-seed",
    left: 16.5,
    right: 18.5,
    top: 2.8,
    bottom: 1.2,
  },
  seed: { id: "plant-seed", kind: "plant-seed", x: 12, y: 6.2, radius: 0.22 },
  duration: 4,
});
export function createCircuit(layout = CIRCUIT_LAYOUT) {
  const thermal = createThermalRig(true).state;
  Object.assign(thermal.source, { x: -10, y: -10 });
  const b = layout.basin;
  const walls = [b.left - b.wallWidth, b.right].map((x, i) => ({
    id: `basin-wall-${i}`,
    material: "stone",
    x,
    y: b.base,
    w: b.wallWidth,
    h: b.crest - b.base,
    heat: 0,
    burned: false,
  }));
  const nodes = Array.from({ length: 80 }, (_, i) => {
    const x = i * 0.25,
      wall = walls.some((w) => x >= w.x && x < w.x + w.w);
    return {
      x,
      w: 0.25,
      base: wall ? b.crest : b.base,
      wall,
      water: { volume: 0, energy: 0 },
    };
  });
  const surface = createSurface(nodes);
  const support = { id: "cable-restraint", intact: true };
  return {
    layout,
    thermal,
    surface,
    support,
    stock: { ...STOCK },
    electric: createElectric({ duration: layout.duration }),
    tip: {
      ...layout.tip,
      vx: 0,
      vy: 0,
      age: 0,
      restrained: true,
      attached: true,
    },
    pin: { ...layout.pin },
    length: layout.length,
    seed: { ...layout.seed, vx: 0, vy: 0, age: 0 },
    won: false,
    lost: false,
    maxStep: 0,
    maxTipStep: 0,
    events: [],
    port: { ...layout.port },
    electrode: { ...layout.electrode },
    walls,
    impacts: [],
    lastPower: false,
  };
}
export function circuitTargets(c) {
  const g = c.layout.goal;
  return [
    ...rampSolids(c.layout.ramps),
    ...c.walls,
    c.port,
    c.electrode,
    { ...c.layout.output, heat: 0 },
    {
      id: "cable-tip",
      electricId: "cable-tip",
      material: "metal",
      x: c.tip.x - c.tip.radius,
      y: c.tip.y - c.tip.radius,
      w: c.tip.radius * 2,
      h: c.tip.radius * 2,
    },
    ...(!c.electric.opened ? [c.layout.gate] : []),
    ...poolTargets(c.surface),
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
      id: "mother-floor",
      material: "stone",
      x: g.left,
      y: g.bottom - 0.15,
      w: g.right - g.left,
      h: 0.15,
    },
  ];
}
export function circuitImpact(c, target, p, time) {
  const message =
    p.species === "Water"
      ? "water-release"
      : p.species === "Fire"
        ? "finite-heat"
        : electricImpact(c.electric, target, p.species, time);
  c.impacts.push({ time, species: p.species, target: target.id, message });
  if (c.impacts.length > 24) c.impacts.shift();
}
export function cableStep(c, dt, gravity, integrate) {
  const t = c.tip;
  t.restrained = c.support.intact;
  if (t.restrained) return;
  const before = { x: t.x, y: t.y };
  integrate(t, gravity, dt);
  for (let i = 0; i < 8; i++) {
    const dx = t.x - c.pin.x,
      dy = t.y - c.pin.y,
      d = Math.hypot(dx, dy);
    if (t.attached && d > c.length) {
      t.x = c.pin.x + (dx * c.length) / d;
      t.y = c.pin.y + (dy * c.length) / d;
    }
    circleSegment(t, { x: 0, y: 0.45 }, { x: 20, y: 0.45 });
    for (const wall of c.walls) {
      circleSegment(
        t,
        { x: wall.x, y: wall.y + wall.h },
        { x: wall.x + wall.w, y: wall.y + wall.h },
      );
      circleSegment(
        t,
        { x: wall.x, y: wall.y },
        { x: wall.x, y: wall.y + wall.h },
      );
      circleSegment(
        t,
        { x: wall.x + wall.w, y: wall.y },
        { x: wall.x + wall.w, y: wall.y + wall.h },
      );
    }
  }
  t.vx = ((t.x - before.x) / dt) * Math.exp(-0.6 * dt);
  t.vy = ((t.y - before.y) / dt) * Math.exp(-0.6 * dt);
  c.maxTipStep = Math.max(
    c.maxTipStep,
    Math.hypot(t.x - before.x, t.y - before.y),
  );
}
export function circuitBodies(c) {
  const fluid = c.surface.nodes
    .filter((n) => n.water.volume > 1e-8)
    .map((n) => ({
      id: `open-water-${n.x}`,
      material: "water",
      x: n.x,
      y: n.base,
      w: n.w,
      h: surfaceHeight(n) - n.base,
    }));
  const bodies = [
    c.port,
    { ...c.layout.output },
    c.electrode,
    { id: "cable-tip", material: "metal", ...c.tip },
    ...fluid,
  ];
  const anchored =
    c.tip.attached && contact({ ...c.pin, radius: 0.08 }, c.layout.output);
  return { bodies, links: anchored ? [["output", "cable-tip"]] : [] };
}
export function stepCircuit(world, dt, integrate) {
  const c = world.circuit;
  cableStep(c, dt, world.gravity, integrate);
  stepSurface(c.surface, c.thermal, dt, world.gravity);
  const { bodies, links } = circuitBodies(c),
    wasOpen = c.electric.opened;
  stepElectric(c.electric, bodies, links, world.time, dt);
  if (c.electric.receiverPowered !== c.lastPower) {
    c.events.push({
      time: world.time,
      event: c.electric.receiverPowered
        ? "receiver-powered"
        : "receiver-unpowered",
    });
    c.lastPower = c.electric.receiverPowered;
  }
  if (!wasOpen && c.electric.opened)
    c.events.push({ time: world.time, event: "gate-opened" });
  const g = c.layout.goal,
    segments = [
      ...c.layout.ramps,
      { a: { x: 0, y: 0.45 }, b: { x: 20, y: 0.45 } },
      { a: { x: g.left, y: g.bottom }, b: { x: g.left, y: g.top } },
      { a: { x: g.right, y: g.bottom }, b: { x: g.right, y: g.top } },
      { a: { x: g.left, y: g.bottom }, b: { x: g.right, y: g.bottom } },
    ];
  if (!c.electric.opened) {
    const b = c.layout.gate;
    segments.push(
      { a: { x: b.x, y: b.y }, b: { x: b.x, y: b.y + b.h } },
      { a: { x: b.x + b.w, y: b.y }, b: { x: b.x + b.w, y: b.y + b.h } },
      { a: { x: b.x, y: b.y + b.h }, b: { x: b.x + b.w, y: b.y + b.h } },
      { a: { x: b.x, y: b.y }, b: { x: b.x + b.w, y: b.y } },
    );
  }
  const before = advanceSeed(c.seed, segments, world.gravity, dt, integrate);
  c.maxStep = Math.max(
    c.maxStep,
    Math.hypot(c.seed.x - before.x, c.seed.y - before.y),
  );
  if (!c.won && topEntry(c.seed, before, c.seed, g)) {
    c.won = true;
    c.events.push({
      time: world.time,
      event: "seed-entered-top",
      x: c.seed.x,
      y: c.seed.y,
    });
  }
  if (!c.won && c.seed.y - c.seed.radius <= 0.451) c.lost = true;
  if (c.events.length > 24) c.events.splice(0, c.events.length - 24);
}
