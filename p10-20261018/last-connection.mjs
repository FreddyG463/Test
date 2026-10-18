import { PAIRS, mix, costAvailable, spend } from "./circuit.mjs";
import {
  THERMAL,
  THERMAL_MATERIALS,
  transferEnergy,
  touching,
  createThermalRig,
} from "./thermal.mjs";
import { graph, reachable } from "./electric.mjs";
import {
  createSurface,
  releaseWater,
  stepSurface,
  waterBudget,
  surfaceEnergy,
} from "./surface-water.mjs";
import { advanceSeed, topEntry, rampSolids } from "./puzzle.mjs";
import {
  apertureFraction,
  stepSolid,
  magneticForce,
  stepPulley,
} from "./mechanisms.mjs";
export const LAST_PAIRS = Object.freeze({
  ...PAIRS,
  Stone: ["Earth", "Earth"],
});
export const LAST_STOCK = Object.freeze({ Earth: 2, Spark: 1, Biomass: 1 });
export const mixLast = (a, b) => mix(a, b, LAST_PAIRS);
export const lastAvailable = (l, s) => costAvailable(l.stock, s, LAST_PAIRS);
export const spendLast = (l, s) => spend(l.stock, s, LAST_PAIRS);
export const LAST_LAYOUT = Object.freeze({
  aperture: { x: 14.4, y: 6.05, w: 0.4 },
  funnel: [
    { a: { x: 13.4, y: 7 }, b: { x: 14.4, y: 6 } },
    { a: { x: 14.8, y: 6 }, b: { x: 15.8, y: 7 } },
  ],
  pad: {
    id: "heat-input",
    material: "metal",
    x: 6,
    y: 3,
    w: 0.6,
    h: 1.6,
    capacity: 0.25,
  },
  rod: {
    id: "heat-rod",
    material: "metal",
    x: 6.6,
    y: 4.25,
    w: 3.9,
    h: 0.2,
    capacity: 0.08,
  },
  pool: { x: 10.5, y: 4.3, w: 1, area: 0.25, capacity: 0.03 },
  output: { id: "output", material: "metal", x: 10.5, y: 4.35, w: 0.1, h: 0.2 },
  receiver: {
    id: "magnet",
    material: "metal",
    x: 11.35,
    y: 4.35,
    w: 0.1,
    h: 0.2,
  },
  shields: [
    { id: "wet-shield", material: "stone", x: 10, y: 3.7, w: 0.45, h: 1.7 },
    { id: "wet-roof", material: "stone", x: 10, y: 5.4, w: 2, h: 0.3 },
    { id: "wet-floor", material: "stone", x: 10, y: 4.1, w: 2, h: 0.2 },
    { id: "wet-back", material: "stone", x: 11.55, y: 4.3, w: 0.45, h: 1.1 },
  ],
  outlet: { x: 12.1, y: 4.3 },
  waterConductance: 0.08,
  source: 1000,
  feedRate: 0.3,
  pole: { x: 17.6, y: 8.1, w: 1, range: 0.9, maxForce: 18 },
  weight: { x: 17.6, y: 7.8, radius: 0.3, material: "metal" },
  gate: {
    id: "pulley-gate",
    material: "stone",
    x: 13.3,
    y: 4.5,
    w: 0.25,
    h: 2.3,
  },
  ramps: [{ a: { x: 11.5, y: 6 }, b: { x: 16.5, y: 3.2 } }],
  seed: { id: "plant-seed", kind: "plant-seed", x: 12, y: 6.2, radius: 0.22 },
  goal: {
    seedId: "plant-seed",
    left: 16.5,
    right: 18.5,
    top: 2.8,
    bottom: 1.2,
  },
});
export function createLast(layout = LAST_LAYOUT) {
  const adapter = createThermalRig(true).state;
  Object.assign(adapter.source, { x: -20, y: -20 });
  const l = {
    layout,
    stock: { ...LAST_STOCK },
    stones: [],
    pad: { ...layout.pad, energy: 0 },
    rod: { ...layout.rod, energy: 0 },
    pool: { ...layout.pool, volume: layout.pool.capacity, energy: 0 },
    source: layout.source,
    initialMass: layout.source + layout.pool.capacity,
    delivered: 0,
    aperture: 1,
    flow: 0,
    buffer: 0,
    bufferEnergy: 0,
    clock: 0,
    runoff: createSurface(
      Array.from({ length: 80 }, (_, i) => ({
        x: i * 0.25,
        w: 0.25,
        base: 0.45,
        water: { volume: 0, energy: 0 },
      })),
    ),
    adapter,
    input: 0,
    coolingLoss: 0,
    phaseLoss: 0,
    evaporated: 0,
    transferred: 0,
    vapor: [],
    generatorOn: true,
    powered: false,
    network: { nodes: [], edges: [] },
    pulley: {
      q: 0,
      velocity: 0,
      weightMass: 1,
      gateMass: 0.2,
      travel: 2.8,
      friction: 0.02,
      magnetWork: 0,
      frictionWork: 0,
      force: 0,
    },
    weight: { ...layout.weight },
    seed: { ...layout.seed, vx: 0, vy: 0, age: 0 },
    won: false,
    lost: false,
    events: [],
    impacts: [],
    maxStoneStep: 0,
    maxSeedStep: 0,
  };
  l.network = graph(wetBodies(l));
  l.powered =
    l.generatorOn && reachable(l.network, "output").includes("magnet");
  l.pulley.force = magneticForce(l.weight, layout.pole, l.powered);
  return l;
}
export const movingGate = (l) => ({
  ...l.layout.gate,
  y: l.layout.gate.y + l.pulley.q,
});
export function lastTargets(l) {
  const g = l.layout.goal;
  return [
    { ...l.pad, heatBody: l.pad },
    { ...l.rod, heatBody: l.rod },
    ...l.layout.shields,
    ...rampSolids(l.layout.funnel),
    ...rampSolids(l.layout.ramps),
    movingGate(l),
    ...l.stones.map((b) => ({
      id: `stone-${b.id}`,
      material: "stone",
      x: b.x - b.radius,
      y: b.y - b.radius,
      w: b.radius * 2,
      h: b.radius * 2,
    })),
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
export function lastImpact(l, t, p, time) {
  let heat = 0;
  if (p.species === "Fire" && t.heatBody && t.material === "metal") {
    t.heatBody.energy += p.heat;
    l.input += p.heat;
    heat = p.heat;
  }
  l.impacts.push({
    time,
    launchedAt: p.launchedAt,
    flightTime: time - p.launchedAt,
    species: p.species,
    target: t.id,
    heat,
  });
  if (l.impacts.length > 24) l.impacts.shift();
}
export function lastBudget(l) {
  const r = waterBudget(l.runoff, l.adapter),
    e = surfaceEnergy(l.runoff);
  const mass =
    l.source +
    l.pool.volume +
    l.buffer +
    r.airborne +
    r.terrain +
    r.vapor +
    r.outflow +
    l.evaporated;
  const stored =
    l.pad.energy + l.rod.energy + l.pool.energy + l.bufferEnergy + e.stored;
  const spent = l.coolingLoss + l.phaseLoss + e.spent;
  return {
    initial: l.initialMass,
    source: l.source,
    pool: l.pool.volume,
    queued: l.buffer,
    airborne: r.airborne,
    terrain: r.terrain,
    drain: r.outflow,
    vapor: l.evaporated + r.vapor,
    massResidual: l.initialMass - mass,
    input: l.input,
    stored,
    spent,
    energyResidual: l.input - stored - spent,
  };
}
function takePool(l, q) {
  const energy = l.pool.volume > 0 ? (l.pool.energy * q) / l.pool.volume : 0;
  l.pool.volume -= q;
  l.pool.energy -= energy;
  return energy;
}
export function stepLast(world, dt, integrate, sweep) {
  const l = world.last,
    k = l.layout;
  const solidSegments = [
    ...k.funnel,
    ...k.ramps,
    { a: { x: 0, y: 0.45 }, b: { x: 20, y: 0.45 } },
  ];
  for (const s of l.stones)
    l.maxStoneStep = Math.max(
      l.maxStoneStep,
      stepSolid(
        s,
        solidSegments,
        [l.pad, l.rod, ...k.shields, movingGate(l)],
        dt,
        world.gravity,
        integrate,
        sweep,
      ),
    );
  const previousAperture = l.aperture;
  l.aperture = apertureFraction(k.aperture, l.stones);
  if (previousAperture > 1e-9 && l.aperture <= 1e-9)
    l.events.push({
      time: world.time,
      event: "feeder-occluded",
      aperture: l.aperture,
    });
  const amount = Math.min(l.source, k.feedRate * l.aperture * dt);
  l.source -= amount;
  l.delivered += amount;
  l.flow = amount / dt;
  l.pool.volume += amount;
  if (l.pool.volume > k.pool.capacity) {
    const q = l.pool.volume - k.pool.capacity;
    l.bufferEnergy += takePool(l, q);
    l.buffer += q;
  }
  l.clock += dt;
  if (l.buffer > 1e-10 && l.clock >= 0.05 && l.runoff.parcels.length < 24) {
    const q = l.buffer,
      energy = l.bufferEnergy;
    releaseWater(l.runoff, k.outlet.x, k.outlet.y, q, energy);
    l.buffer = 0;
    l.bufferEnergy = 0;
    l.clock = 0;
  }
  for (const m of [l.pad, l.rod]) {
    const old = m.energy;
    m.energy *= Math.exp(-THERMAL.metalCooling * dt);
    l.coolingLoss += old - m.energy;
  }
  const conductive = (a, b) =>
    (THERMAL_MATERIALS[a.material]?.conductivity ?? 0) > 0 &&
    (THERMAL_MATERIALS[b.material]?.conductivity ?? 0) > 0;
  if (conductive(l.pad, l.rod) && touching(l.pad, l.rod)) {
    const q = transferEnergy(
      l.pad.energy,
      l.pad.capacity,
      l.rod.energy,
      l.rod.capacity,
      THERMAL.conductance,
      dt,
    );
    l.pad.energy -= q;
    l.rod.energy += q;
  }
  const wet = { ...l.pool, h: l.pool.volume / l.pool.area };
  if (
    l.pool.volume > 0 &&
    (THERMAL_MATERIALS[l.rod.material]?.conductivity ?? 0) > 0 &&
    touching(l.rod, wet)
  ) {
    const q = transferEnergy(
      l.rod.energy,
      l.rod.capacity,
      l.pool.energy,
      THERMAL.waterCapacity * l.pool.volume,
      k.waterConductance,
      dt,
    );
    l.rod.energy -= q;
    l.pool.energy += q;
    l.transferred += q;
  }
  const old = l.pool.energy;
  l.pool.energy *= Math.exp(-THERMAL.waterCooling * dt);
  l.coolingLoss += old - l.pool.energy;
  const sensible = THERMAL.waterCapacity * THERMAL.boilingTemperature;
  const boiled = Math.min(
    l.pool.volume,
    Math.max(0, l.pool.energy - sensible * l.pool.volume) / THERMAL.latentHeat,
  );
  if (boiled > 0) {
    const energy = boiled * (THERMAL.latentHeat + sensible);
    l.pool.volume -= boiled;
    l.pool.energy = Math.max(0, l.pool.energy - energy);
    l.phaseLoss += energy;
    l.evaporated += boiled;
    l.vapor.push({ x: 11, y: wet.y + wet.h, age: 0, volume: boiled });
  }
  if (l.pool.volume === 0) {
    l.coolingLoss += l.pool.energy;
    l.pool.energy = 0;
  }
  stepSurface(l.runoff, l.adapter, dt, world.gravity);
  l.network = graph(wetBodies(l));
  const powered =
    l.generatorOn && reachable(l.network, "output").includes("magnet");
  if (l.powered !== powered)
    l.events.push({
      time: world.time,
      event: powered ? "magnet-powered" : "wet-contact-broken",
    });
  l.powered = powered;
  Object.assign(l.weight, {
    y: k.weight.y - l.pulley.q,
    vy: -l.pulley.velocity,
  });
  const force = magneticForce(l.weight, k.pole, l.powered);
  stepPulley(l.pulley, force, dt, world.gravity);
  l.weight.y = k.weight.y - l.pulley.q;
  l.weight.vy = -l.pulley.velocity;
  const g = k.goal,
    b = movingGate(l),
    segments = [
      ...k.ramps,
      { a: { x: 0, y: 0.45 }, b: { x: 20, y: 0.45 } },
      { a: { x: g.left, y: g.bottom }, b: { x: g.left, y: g.top } },
      { a: { x: g.right, y: g.bottom }, b: { x: g.right, y: g.top } },
      { a: { x: g.left, y: g.bottom }, b: { x: g.right, y: g.bottom } },
      { a: { x: b.x, y: b.y }, b: { x: b.x, y: b.y + b.h } },
      { a: { x: b.x + b.w, y: b.y }, b: { x: b.x + b.w, y: b.y + b.h } },
      { a: { x: b.x, y: b.y + b.h }, b: { x: b.x + b.w, y: b.y + b.h } },
    ];
  const before = advanceSeed(l.seed, segments, world.gravity, dt, integrate);
  l.maxSeedStep = Math.max(
    l.maxSeedStep,
    Math.hypot(l.seed.x - before.x, l.seed.y - before.y),
  );
  if (!l.won && topEntry(l.seed, before, l.seed, g)) {
    l.won = true;
    l.events.push({
      time: world.time,
      event: "seed-entered-top",
      x: l.seed.x,
      y: l.seed.y,
    });
  }
  if (l.events.length > 24) l.events.shift();
  l.vapor = l.vapor
    .map((v) => ({ ...v, y: v.y + 0.6 * dt, age: v.age + dt }))
    .filter((v) => v.age < 1.2)
    .slice(-80);
}

function wetBodies(l) {
  return [
    l.layout.output,
    l.layout.receiver,
    ...l.stones.map((s) => ({ ...s, id: `stone-${s.id}` })),
    ...(l.pool.volume > 1e-9
      ? [
          {
            id: "wet-link",
            material: "water",
            ...l.pool,
            h: l.pool.volume / l.pool.area,
          },
        ]
      : []),
  ];
}
