import {
  createClayBridge,
  launchClay,
  stepClayBridge,
  firstClayHit,
} from "./clay-bridge.mjs";
import {
  createOverflow,
  overflowTargets,
  overflowImpact,
  stepOverflow,
  overflowLaunch,
  overflowMiss,
  overflowAvailable,
  spendOverflow,
} from "./overflow.mjs";
import {
  createLast,
  lastTargets,
  lastImpact,
  stepLast,
  lastAvailable,
  spendLast,
} from "./last-connection.mjs";
import {
  createCircuit,
  circuitTargets,
  circuitImpact,
  stepCircuit,
  costAvailable,
  spend,
} from "./circuit.mjs";
import {
  createThermalRig,
  stepThermal,
  THERMAL_MATERIALS,
  depositWater,
} from "./thermal.mjs";
import {
  createPuzzle,
  stepPuzzle,
  railCatch,
  puzzleSolids,
} from "./puzzle.mjs";
import {
  FLOW,
  createCourse,
  releaseWater,
  stepSurface,
  poolTargets,
  heatPool,
} from "./surface-water.mjs";
// Standalone experiment units (metres, seconds). Not calibrated to Unity.
export const DT = 1 / 120;
export const CONFIG = Object.freeze({
  width: 20,
  height: 10,
  gravity: 9.81,
  floor: 0.45,
  cannon: Object.freeze({ x: 2, y: 1.35 }),
  pin: Object.freeze({ x: 8.5, y: 7.3 }),
  tip: Object.freeze({ x: 13, y: 5 }),
  tipRadius: 0.28,
  projectileRadius: 0.16,
  bay: Object.freeze({ x: 6.8, y: 1.4, w: 3.7, h: 0.8 }),
});
export const MATERIALS = Object.freeze({
  rope: Object.freeze({ burnable: true, threshold: 1, cooling: 0.08 }),
  metal: Object.freeze({
    burnable: false,
    threshold: Infinity,
    cooling: 0.3,
    ...THERMAL_MATERIALS.metal,
  }),
  stone: Object.freeze({
    burnable: false,
    threshold: Infinity,
    cooling: 0.3,
    ...THERMAL_MATERIALS.stone,
  }),
});
const length = Math.hypot(
  CONFIG.tip.x - CONFIG.pin.x,
  CONFIG.tip.y - CONFIG.pin.y,
);

export function createWorld(preset = "rope") {
  if (
    ![
      "rope",
      "trajectory",
      "thermal",
      "water-boiler",
      "first-puzzle",
      "free-water",
      "broken-circuit",
      "last-connection",
      "overflow",
      "clay-bridge",
    ].includes(preset)
  )
    throw new RangeError("Unknown preset");
  if (preset === "clay-bridge")
    return {
      preset,
      time: 0,
      shots: 0,
      nextId: 1,
      gravity: CONFIG.gravity,
      targets: [],
      projectiles: [],
      events: [],
      releaseCount: 0,
      cable: null,
      clay: createClayBridge(),
    };
  if (preset === "overflow")
    return {
      preset,
      time: 0,
      shots: 0,
      nextId: 1,
      gravity: CONFIG.gravity,
      targets: [],
      projectiles: [],
      events: [],
      releaseCount: 0,
      cable: null,
      overflow: createOverflow(),
    };
  if (preset === "last-connection")
    return {
      preset,
      time: 0,
      shots: 0,
      nextId: 1,
      gravity: CONFIG.gravity,
      targets: [],
      projectiles: [],
      events: [],
      releaseCount: 0,
      cable: null,
      last: createLast(),
    };
  const rig = [
    "thermal",
    "water-boiler",
    "first-puzzle",
    "free-water",
  ].includes(preset)
    ? createThermalRig(["water-boiler", "free-water"].includes(preset))
    : null;
  const puzzle = preset === "first-puzzle" ? createPuzzle() : null;
  if (puzzle) {
    // The same thermal plant is prefilled; only its fixture/route changes.
    Object.assign(rig.state.source, puzzle.layout.heatPad);
    Object.assign(rig.state.bridge, puzzle.layout.rod);
    Object.assign(rig.state.water, puzzle.layout.boiler);
    Object.assign(rig.state.exchanger, puzzle.layout.exchanger);
    rig.targets = [
      rig.state.source,
      { ...puzzle.layout.rope, heat: 0, burned: false },
    ];
  }
  const surface = preset === "free-water" ? createCourse(rig.state) : null;
  if (surface) {
    rig.targets = [rig.state.source, ...surface.targets];
    delete rig.state.inlet;
    rig.state.openCatchment = true;
  }
  const circuit = preset === "broken-circuit" ? createCircuit() : null;
  const targets = circuit
    ? [{ ...circuit.layout.rope }, circuit.port, circuit.electrode]
    : rig
      ? rig.targets
      : preset === "rope"
        ? [
            {
              id: "rope",
              material: "rope",
              constraint: "suspension",
              x: 12.85,
              y: 5,
              w: 0.3,
              h: 3,
            },
            { id: "metal", material: "metal", x: 14.4, y: 2.7, w: 0.6, h: 1.8 },
          ]
        : [
            { id: "near", material: "stone", x: 9.8, y: 2, w: 0.45, h: 1.8 },
            { id: "far", material: "metal", x: 14.4, y: 2, w: 0.6, h: 2.4 },
          ];
  return {
    preset,
    time: 0,
    shots: 0,
    nextId: 1,
    gravity: CONFIG.gravity,
    targets:
      rig || circuit
        ? targets
        : targets.map((t) => ({ ...t, heat: 0, burned: false })),
    ...(rig ? { thermal: rig.state } : {}),
    ...(puzzle ? { puzzle, constraints: [puzzle.support] } : {}),
    ...(surface ? { surface } : {}),
    ...(circuit ? { circuit, constraints: [circuit.support] } : {}),
    projectiles: [],
    events: [],
    releaseCount: 0,
    cable:
      preset === "rope"
        ? {
            x: CONFIG.tip.x,
            y: CONFIG.tip.y,
            vx: 0,
            vy: 0,
            length,
            restrained: true,
            landed: false,
          }
        : null,
  };
}

function event(world, text) {
  world.events.push({ time: world.time, text });
  if (world.events.length > 8) world.events.shift();
}

export function projectileAt(angle, speed) {
  if (
    !Number.isFinite(angle) ||
    angle < 5 ||
    angle > 85 ||
    !Number.isFinite(speed) ||
    speed < 6 ||
    speed > 18
  )
    throw new RangeError("Invalid launch");
  const a = (angle * Math.PI) / 180;
  return {
    ...CONFIG.cannon,
    vx: Math.cos(a) * speed,
    vy: Math.sin(a) * speed,
    radius: CONFIG.projectileRadius,
    age: 0,
    heat: 1.2,
    trail: [],
  };
}

export function fire(
  world,
  angle = 50,
  speed = 14,
  heat = 1.2,
  species = "Fire",
) {
  if (world.clay) {
    if (!["Mud", "Fire", "Stone"].includes(species))
      throw new RangeError("Species unavailable in this preset");
    if (!Number.isFinite(heat) || heat < 0 || heat > 1.2)
      throw new RangeError("Invalid heat");
    const p = projectileAt(angle, speed);
    Object.assign(p, {
      species,
      heat,
      launchedAt: world.time,
      id: world.nextId,
    });
    if (!launchClay(world.clay, p)) return false;
    world.nextId++;
    world.shots++;
    return true;
  }
  if (
    !(
      world.overflow
        ? ["Stone", "Water", "Mud"]
        : world.last
          ? ["Fire", "Stone"]
          : world.circuit
            ? ["Fire", "Water", "Electric", "Thunder"]
            : ["Fire", "Water"]
    ).includes(species) ||
    (species === "Water" &&
      !["water-boiler", "free-water", "broken-circuit", "overflow"].includes(
        world.preset,
      ))
  )
    throw new RangeError("Species unavailable in this preset");
  if (!Number.isFinite(heat) || heat < 0 || heat > 1.2)
    throw new RangeError("Invalid heat");
  if (world.projectiles.length >= 12) return false;
  if (world.overflow && !overflowAvailable(world.overflow, species))
    return false;
  if (world.last && !lastAvailable(world.last, species)) return false;
  if (world.circuit && !costAvailable(world.circuit.stock, species))
    return false;
  if (world.puzzle && world.puzzle.ammo <= 0) return false;
  if (
    species === "Water" &&
    world.surface &&
    world.surface.parcels.length +
      world.projectiles.filter((p) => p.species === "Water").length >=
      FLOW.maxParcels
  )
    return false;
  const p = projectileAt(angle, speed);
  p.id = world.nextId++;
  p.heat = heat;
  p.species = species;
  p.launchedAt = world.time;
  p.volume =
    species === "Water"
      ? world.surface || world.circuit || world.overflow
        ? FLOW.dose
        : 1
      : 0;
  if (world.circuit) spend(world.circuit.stock, species);
  if (world.overflow) {
    spendOverflow(world.overflow, species);
    overflowLaunch(world.overflow, p);
  }
  if (world.last) spendLast(world.last, species);
  if ((world.last || world.overflow) && species === "Stone") {
    Object.assign(p, {
      ...(world.overflow
        ? world.overflow.layout.stone
        : { radius: 0.35, mass: 3 }),
      material: "stone",
    });
    (world.last ?? world.overflow).stones.push(p);
  } else world.projectiles.push(p);
  if (world.puzzle) world.puzzle.ammo--;
  world.shots++;
  event(world, `${species} launched · ${angle}° · ${speed} m/s`);
  return true;
}

export function integrate(p, gravity, dt = DT) {
  p.x += p.vx * dt;
  p.y += p.vy * dt - 0.5 * gravity * dt * dt;
  p.vy -= gravity * dt;
  p.age += dt;
}

// Swept circle approximated by a segment against a radius-expanded AABB.
// Conservative square corners are documented; no frame-dependent overlap tests.
export function sweep(a, b, box, radius = 0) {
  let enter = 0,
    exit = 1;
  for (const [key, size] of [
    ["x", "w"],
    ["y", "h"],
  ]) {
    const low = box[key] - radius,
      high = box[key] + box[size] + radius;
    const d = b[key] - a[key];
    if (Math.abs(d) < 1e-12) {
      if (a[key] < low || a[key] > high) return null;
    } else {
      const u = (low - a[key]) / d,
        v = (high - a[key]) / d;
      enter = Math.max(enter, Math.min(u, v));
      exit = Math.min(exit, Math.max(u, v));
      if (enter > exit) return null;
    }
  }
  return enter;
}

export function applyHeat(world, target, amount) {
  if (!Number.isFinite(amount) || amount < 0)
    throw new RangeError("Invalid heat input");
  if (target.burned) return;
  target.heat += amount;
  if (target.thermal) world.thermal.input += amount;
  const material = MATERIALS[target.material];
  if (material.burnable && target.heat >= material.threshold) {
    target.burned = true;
    for (const constraint of world.constraints ?? []) {
      if (constraint.id === target.constraint) constraint.intact = false;
    }
    if (target.constraint === "suspension" && world.cable?.restrained) {
      world.cable.restrained = false;
      world.releaseCount++;
      event(world, "Rope burned · suspension released");
    }
  }
}

function collisionBoxes(world) {
  const boxes = world.targets.filter((t) => !t.burned);
  if (world.puzzle) boxes.push(...puzzleSolids(world.puzzle));
  if (world.surface) boxes.push(...poolTargets(world.surface));
  if (world.circuit) boxes.push(...circuitTargets(world.circuit));
  if (world.last) boxes.push(...lastTargets(world.last));
  if (world.overflow) boxes.push(...overflowTargets(world.overflow));
  boxes.push({
    id: "ground",
    material: "stone",
    x: -100,
    y: -10,
    w: 200,
    h: 10 + CONFIG.floor,
  });
  if (world.cable) boxes.push({ id: "bay", material: "metal", ...CONFIG.bay });
  return boxes;
}
function collision(world, before, p, boxes = collisionBoxes(world)) {
  let hit = null;
  for (const target of boxes) {
    const t = sweep(before, p, target, p.radius);
    if (t !== null && (!hit || t < hit.t)) hit = { target, t };
  }
  return hit;
}

function stepCable(world) {
  const c = world.cable;
  if (!c || c.restrained) return;
  c.vy -= world.gravity * DT;
  c.vx *= Math.exp(-0.16 * DT);
  c.vy *= Math.exp(-0.16 * DT);
  const old = { x: c.x, y: c.y };
  c.x += c.vx * DT;
  c.y += c.vy * DT;
  const r = CONFIG.tipRadius,
    bay = CONFIG.bay;
  let contact = false,
    bayContact = false;
  // Projection solver: tension-only cable and static floor/landing top.
  for (let i = 0; i < 8; i++) {
    const dx = c.x - CONFIG.pin.x,
      dy = c.y - CONFIG.pin.y;
    const d = Math.hypot(dx, dy);
    if (d > c.length) {
      c.x = CONFIG.pin.x + (dx * c.length) / d;
      c.y = CONFIG.pin.y + (dy * c.length) / d;
    }
    const overBay = c.x >= bay.x - r && c.x <= bay.x + bay.w + r;
    const surface = overBay ? bay.y + bay.h : CONFIG.floor;
    if (c.y - r <= surface && old.y - r >= surface - 0.03) {
      c.y = surface + r;
      contact = true;
      bayContact ||= overBay;
    }
  }
  c.vx = (c.x - old.x) / DT;
  c.vy = (c.y - old.y) / DT;
  if (contact) {
    c.vx *= Math.exp(-7 * DT);
    c.vy = Math.max(0, c.vy);
    if (bayContact && !c.landed) {
      c.landed = true;
      event(world, "Cable weight contacted landing bay");
    }
  }
}

export function step(world) {
  if (world.clay) {
    world.time += DT;
    stepClayBridge(world.clay, DT, world.gravity);
    return;
  }
  const previousPiston = world.thermal?.piston.x;
  world.time += DT;
  for (const target of world.targets) {
    if (target.thermal) continue;
    target.heat = Math.max(
      0,
      target.heat - MATERIALS[target.material].cooling * DT,
    );
  }
  world.projectiles = world.projectiles.filter((p) => {
    const before = { x: p.x, y: p.y };
    integrate(p, world.gravity);
    p.trail.push(before);
    if (p.trail.length > 100) p.trail.shift();
    const hit = collision(world, before, p);
    if (hit) {
      if (world.overflow) {
        overflowImpact(
          world.overflow,
          hit.target,
          p,
          world.time,
          world.gravity,
        );
        event(world, `${p.species} released on ${hit.target.id}`);
        return false;
      }
      if (world.last) lastImpact(world.last, hit.target, p, world.time);
      if (world.circuit)
        circuitImpact(world.circuit, hit.target, p, world.time);
      let accepted = 0;
      if (p.species === "Water") {
        if (world.circuit) {
          releaseWater(
            world.circuit.surface,
            before.x + (p.x - before.x) * hit.t,
            before.y + (p.y - before.y) * hit.t,
            p.volume,
          );
          accepted = p.volume;
        } else if (world.surface) {
          const x = before.x + (p.x - before.x) * hit.t;
          const y = before.y + (p.y - before.y) * hit.t;
          releaseWater(world.surface, x, y, p.volume);
          accepted = p.volume;
        } else if (hit.target.reservoir) {
          accepted = depositWater(hit.target.reservoir, p.volume);
          world.thermal.deposited += accepted;
          world.thermal.overflow += p.volume - accepted;
        }
        event(
          world,
          `Water impact · ${hit.target.id} · ${world.surface || world.circuit ? "released" : "deposited"} ${accepted.toFixed(2)} V*`,
        );
      } else if (world.last) {
        /* contact heat accounted above */
      } else if (["Electric", "Thunder"].includes(p.species)) {
        /* resolved above */
      } else if (hit.target.pool)
        heatPool(
          world.surface ?? world.circuit?.surface,
          hit.target.pool,
          p.heat,
        );
      else if ("heat" in hit.target) applyHeat(world, hit.target, p.heat);
      if (world.thermal) {
        world.thermal.impacts.push({
          launchedAt: p.launchedAt,
          flightTime: world.time - p.launchedAt,
          time: world.time,
          species: p.species,
          target: hit.target.id,
          heat: p.species === "Fire" && hit.target.thermal ? p.heat : 0,
          volume: accepted,
        });
        if (world.thermal.impacts.length > 24) world.thermal.impacts.shift();
      }
      if (p.species !== "Water")
        event(
          world,
          `${["Electric", "Thunder"].includes(p.species) ? `${p.species} · ${world.circuit.impacts.at(-1).message}` : world.last && hit.target.heatBody ? "Metal heated" : hit.target.pool ? "Open pool heated" : hit.target.material === "rope" ? "Rope heated" : "Non-burnable impact"} · ${hit.target.id}`,
        );
      return false;
    }
    const alive = p.age < 8 && p.x < CONFIG.width + 1 && p.y > -1;
    if (!alive && world.overflow) overflowMiss(world.overflow, p);
    return alive;
  });
  stepCable(world);
  if (world.surface)
    stepSurface(world.surface, world.thermal, DT, world.gravity);
  if (world.thermal) {
    const reached = world.thermal.piston.reached;
    stepThermal(world.thermal, DT, world.gravity);
    if (world.puzzle)
      railCatch(
        world.thermal.piston,
        previousPiston,
        world.puzzle.layout.catch,
      );
    if (
      !world.thermal.observed.waterWarm &&
      world.thermal.water.energy > 0.05
    ) {
      world.thermal.observed.waterWarm = true;
      event(world, "Thermal contact warmed boiler water");
    }
    if (!world.thermal.observed.steam && world.thermal.steam > 0.02) {
      world.thermal.observed.steam = true;
      event(world, "Finite boiling energy entered steam chamber");
    }
    if (!reached && world.thermal.piston.reached)
      event(world, "Piston contacted target marker");
  }
  if (world.puzzle) stepPuzzle(world, DT, integrate);
  if (world.circuit) stepCircuit(world, DT, integrate);
  if (world.last) stepLast(world, DT, integrate, sweep);
  if (world.overflow) stepOverflow(world, DT, integrate, sweep);
}

export function forecast(world, angle, speed, species) {
  if (world.clay) {
    const p = projectileAt(angle, speed),
      points = [{ x: p.x, y: p.y }];
    if (species === "Stone") p.radius = 0.24;
    for (let i = 0; i < 960; i++) {
      const a = { x: p.x, y: p.y };
      integrate(p, world.gravity);
      const h = firstClayHit(world.clay, a, p, p);
      if (h) {
        points.push({ x: a.x + (p.x - a.x) * h.t, y: a.y + (p.y - a.y) * h.t });
        return { points, hit: h.s.id };
      }
      if (i % 4 === 0) points.push({ x: p.x, y: p.y });
      if (p.y < 0 || p.x > 21) break;
    }
    return { points, hit: null };
  }
  const p = projectileAt(angle, speed),
    points = [{ x: p.x, y: p.y }],
    boxes = collisionBoxes(world);
  if ((world.last || world.overflow) && species === "Stone")
    p.radius = world.overflow ? world.overflow.layout.stone.radius : 0.35;
  for (let i = 0; i < 8 / DT; i++) {
    const before = { x: p.x, y: p.y };
    integrate(p, world.gravity);
    const hit = collision(world, before, p, boxes);
    if (hit) {
      points.push({
        x: before.x + (p.x - before.x) * hit.t,
        y: before.y + (p.y - before.y) * hit.t,
      });
      return { points, hit: hit.target.id };
    }
    if (i % 4 === 0) points.push({ x: p.x, y: p.y });
    if (p.x > CONFIG.width || p.y < 0) break;
  }
  return { points, hit: null };
}
