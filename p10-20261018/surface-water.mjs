import {
  THERMAL,
  transferEnergy,
  energyBalance,
  touching,
} from "./thermal.mjs";
// Bounded adjacent surface channels and ballistic spill packets. No DOM.
export const FLOW = Object.freeze({
  dose: 0.25,
  cellWidth: 0.25,
  areaScale: 1 / 4.2,
  conductance: 0.3,
  evaporation: 0.006,
  maxParcels: 24,
  ceiling: 10,
  maxSpills: 80,
});

export function createCourse(thermal) {
  const nodes = [],
    targets = [];
  for (let i = 0; i < 80; ) {
    const x = i * FLOW.cellWidth;
    if (x === 14) {
      nodes.push({
        x,
        w: 2,
        base: 4.3,
        water: thermal.water,
        basin: true,
        outlet: { x: 16.51, y: 6.4, vx: 1.5 },
      });
      targets.push({
        id: "catchment-floor",
        material: "stone",
        x,
        y: 4,
        w: 2,
        h: 0.3,
        heat: 0,
        burned: false,
      });
      i += 8;
      continue;
    }
    const ramp = x >= 8 && x < 14;
    const wall = (x >= 5.5 && x < 5.75) || (x >= 16 && x < 16.5);
    const base = ramp
      ? 7.2 - (x + 0.25 - 8) * (2.9 / 6)
      : wall
        ? x < 8
          ? 3.25
          : 6.4
        : 0.45;
    nodes.push({ x, w: 0.25, base, water: { volume: 0, energy: 0 }, wall });
    if (ramp || wall)
      targets.push({
        id: `${wall ? "blocking-wall" : "ramp"}-${i}`,
        material: "stone",
        x,
        y: 0.45,
        w: 0.25,
        h: base - 0.45,
        heat: 0,
        burned: false,
      });
    i++;
  }
  // The liquid heightfield includes elevated ordinary solids as well as terrain.
  // A packet striking the pad top must rest there, not fall through the pad.
  for (const n of nodes) {
    const centre = n.x + n.w / 2;
    for (const solid of [thermal.source]) {
      if (
        centre >= solid.x &&
        centre <= solid.x + solid.w &&
        solid.y + solid.h > n.base
      ) {
        n.terrainBase = n.base;
        n.base = solid.y + solid.h;
      }
    }
  }
  return createSurface(nodes, targets);
}

// Shared bounded fluid state; course geometry is supplied by the caller.
export function createSurface(nodes, targets = []) {
  return {
    nodes,
    targets,
    parcels: [],
    released: 0,
    evaporated: 0,
    outflow: 0,
    crossedOpening: 0,
    releases: [],
    peakParcels: 0,
    spills: [],
    spillClock: 0,
    spilled: 0,
    landed: 0,
    toBoilerHeat: 0,
    heatInput: 0,
    directHeat: 0,
    metalHeat: 0,
    coolingLoss: 0,
    phaseLoss: 0,
    exportedHeat: 0,
    vapor: [],
    heatHits: [],
  };
}

export const nodeAt = (s, x) => s.nodes.find((n) => x >= n.x && x < n.x + n.w);
const area = (n) => n.w * FLOW.areaScale;
export const surfaceHeight = (n) => n.base + n.water.volume / area(n);

export function releaseWater(s, x, y, volume = FLOW.dose, energy = 0) {
  if (!Number.isFinite(energy) || energy < 0)
    throw new RangeError("Invalid water energy");
  if (!Number.isFinite(volume) || volume < 0)
    throw new RangeError("Invalid volume");
  if (s.parcels.length >= FLOW.maxParcels)
    throw new Error("Water reservation invariant violated");
  s.released += volume;
  s.releases.push({ x, y, volume });
  if (s.releases.length > 24) s.releases.shift();
  s.parcels.push({ x, y, vy: 0, volume, ...(energy > 0 ? { energy } : {}) });
  s.heatInput += energy;
  s.peakParcels = Math.max(s.peakParcels, s.parcels.length);
}

function addVolume(s, node, volume, energy = 0) {
  node.water.volume += volume;
  node.water.energy = (node.water.energy ?? 0) + energy;
  if (node.basin) s.crossedOpening += volume;
}

// Open water alone never enters the contained steam/pressure model.
export function poolTargets(s) {
  return s.nodes
    .filter((n) => !n.basin && n.water.volume > 1e-5)
    .map((n) => ({
      id: `open-water-${n.x}`,
      material: "water",
      pool: n,
      x: n.x,
      y: n.base,
      w: n.w,
      h: surfaceHeight(n) - n.base,
    }));
}
export function heatPool(s, node, energy) {
  if (!Number.isFinite(energy) || energy < 0)
    throw new RangeError("Invalid pool heat");
  if (node.basin || node.water.volume <= 0) return 0;
  node.water.energy = (node.water.energy ?? 0) + energy;
  s.heatInput += energy;
  s.directHeat += energy;
  s.heatHits.push({ x: node.x, energy });
  if (s.heatHits.length > 24) s.heatHits.shift();
  return energy;
}
function take(node, volume) {
  if (volume <= 0 || node.water.volume <= 0) return 0;
  const energy = ((node.water.energy ?? 0) * volume) / node.water.volume;
  node.water.energy = (node.water.energy ?? 0) - energy;
  node.water.volume -= volume;
  return energy;
}
function move(s, thermal, from, to, q) {
  if (q <= 0) return;
  const energy = take(from, q);
  if (from.basin && !to.basin) {
    thermal.poolTransfer = (thermal.poolTransfer ?? 0) + energy;
    s.heatInput += energy;
  }
  if (!from.basin && to.basin) {
    s.exportedHeat += energy;
    s.toBoilerHeat += energy;
    thermal.input += energy;
  }
  addVolume(s, to, q, energy);
}
function drain(s, n, dt, rate) {
  const q = Math.min(n.water.volume, rate * dt);
  if (q > 0) {
    s.exportedHeat += take(n, q);
    s.outflow += q;
  }
}
export function stepSurface(s, thermal, dt, gravity) {
  // Distinct fixed budgets: accepted Water releases reserve 24 source packets;
  // internal spill packets use 80 slots. Full slots retain liquid upstream.
  const settle = (p, spill = false) => {
    p.before = { x: p.x, y: p.y };
    p.x += (p.vx ?? 0) * dt;
    p.y += p.vy * dt - 0.5 * gravity * dt * dt;
    p.vy -= gravity * dt;
    const n = nodeAt(s, p.x);
    if (!n) {
      s.outflow += p.volume;
      s.exportedHeat += p.energy ?? 0;
      return false;
    }
    if (p.y <= surfaceHeight(n)) {
      if (n.basin && (p.energy ?? 0) > 0) {
        s.exportedHeat += p.energy;
        s.toBoilerHeat += p.energy;
        thermal.input += p.energy;
      }
      addVolume(s, n, p.volume, p.energy ?? 0);
      if (spill) s.landed += p.volume;
      return false;
    }
    return true;
  };
  s.parcels = s.parcels.filter((p) => settle(p));
  s.spills = s.spills.filter((p) => settle(p, true));

  // Snapshot fluxes. The bed/crest must be submerged; only water ABOVE that
  // crest is eligible, so an isolated high bed cannot pull water through a wall.
  const transfers = [],
    outgoing = s.nodes.map(() => 0);
  for (let i = 0; i < s.nodes.length - 1; i++) {
    const a = s.nodes[i],
      b = s.nodes[i + 1];
    if (Math.abs(a.x + a.w - b.x) > 1e-9) continue;
    const ha = surfaceHeight(a),
      hb = surfaceHeight(b);
    const from = ha >= hb ? a : b,
      to = ha >= hb ? b : a,
      source = ha >= hb ? i : i + 1;
    const head = Math.max(
      0,
      surfaceHeight(from) - Math.max(from.base, to.base, surfaceHeight(to)),
    );
    if (head <= 1e-12 || from.water.volume <= 0) continue;
    const above = Math.min(from.water.volume, head * area(from));
    const q = Math.min(
      above,
      FLOW.conductance * head * dt,
      head / (1 / area(from) + 1 / area(to)),
    );
    transfers.push({ from, to, q, source });
    outgoing[source] += q;
  }
  for (const e of transfers) {
    const q = Math.min(
      e.q * Math.min(1, e.from.water.volume / (outgoing[e.source] || 1)),
      Math.max(0, (surfaceHeight(e.from) - e.to.base) * area(e.from)),
    );
    if (q <= 0) continue;
    if (e.from.base - e.to.base > 0.5 && !e.to.basin) {
      if (s.spills.length >= FLOW.maxSpills) continue;
      const energy = take(e.from, q),
        right = e.to.x > e.from.x;
      if (e.from.basin) {
        thermal.poolTransfer = (thermal.poolTransfer ?? 0) + energy;
        s.heatInput += energy;
      }
      s.spills.push({
        x: right ? e.to.x + 0.001 : e.to.x + e.to.w - 0.001,
        y: surfaceHeight(e.from),
        vx: right ? 0.3 : -0.3,
        vy: 0,
        volume: q,
        energy,
      });
      s.spilled += q;
    } else move(s, thermal, e.from, e.to, q);
  }

  // Actual rim -> falling packet -> lower world cells. Never count overflow
  // as outflow merely for leaving the vessel. The right wall crest is y6.4.
  s.spillClock += dt;
  const basin = s.nodes.find((n) => n.basin);
  if (
    basin &&
    basin.water.volume > 1 &&
    s.spillClock >= 0.05 &&
    s.spills.length < FLOW.maxSpills
  ) {
    const q = basin.water.volume - 1,
      energy = take(basin, q);
    thermal.poolTransfer = (thermal.poolTransfer ?? 0) + energy;
    s.heatInput += energy;
    s.spills.push({ ...basin.outlet, vy: 0, volume: q, energy });
    s.spilled += q;
    s.spillClock = 0;
  }

  // Local contact transfer from actual hot metal, never from nearby geometry.
  const metal = thermal.source;
  for (const n of s.nodes) {
    if (n.basin || n.water.volume <= 0) continue;
    if (
      touching(metal, {
        x: n.x,
        y: n.base,
        w: n.w,
        h: surfaceHeight(n) - n.base,
      })
    ) {
      const q = transferEnergy(
        metal.heat,
        THERMAL.metalCapacity,
        n.water.energy ?? 0,
        THERMAL.waterCapacity * n.water.volume,
        THERMAL.conductance,
        dt,
      );
      metal.heat -= q;
      n.water.energy = (n.water.energy ?? 0) + q;
      thermal.poolTransfer = (thermal.poolTransfer ?? 0) + q;
      s.heatInput += q;
      s.metalHeat += q;
    }
    const old = n.water.energy ?? 0;
    n.water.energy = old * Math.exp(-THERMAL.waterCooling * dt);
    s.coolingLoss += old - n.water.energy;
    const sensible = THERMAL.waterCapacity * THERMAL.boilingTemperature;
    const boiling = Math.min(
      n.water.volume,
      Math.max(0, n.water.energy - sensible * n.water.volume) /
        THERMAL.latentHeat,
    );
    if (boiling > 0) {
      const cost = boiling * (THERMAL.latentHeat + sensible);
      n.water.energy = Math.max(0, n.water.energy - cost);
      n.water.volume -= boiling;
      s.phaseLoss += cost;
      s.evaporated += boiling;
      s.vapor.push({
        x: n.x + n.w / 2,
        y: surfaceHeight(n),
        age: 0,
        volume: boiling,
      });
    }
    if (n.water.volume === 0) {
      s.coolingLoss += n.water.energy;
      n.water.energy = 0;
    }
    const ambient = n.water.volume * (1 - Math.exp(-FLOW.evaporation * dt));
    if (ambient > 0) {
      s.phaseLoss += take(n, ambient);
      s.evaporated += ambient;
    }
  }
  s.vapor = s.vapor
    .map((v) => ({ ...v, y: v.y + dt * 0.6, age: v.age + dt }))
    .filter((v) => v.age < 1.2)
    .slice(-80);
  // Only the two named horizontal world boundaries remove liquid.
  if (s.nodes[0].x === 0) drain(s, s.nodes[0], dt, 0.12);
  if (s.nodes.at(-1).x + s.nodes.at(-1).w === 20)
    drain(s, s.nodes.at(-1), dt, 0.45);
}

export function surfaceEnergy(s) {
  const stored =
    s.parcels.reduce((v, p) => v + (p.energy ?? 0), 0) +
    s.nodes
      .filter((n) => !n.basin)
      .reduce((v, n) => v + (n.water.energy ?? 0), 0) +
    s.spills.reduce((v, p) => v + (p.energy ?? 0), 0);
  const spent = s.coolingLoss + s.phaseLoss + s.exportedHeat;
  return {
    input: s.heatInput,
    stored,
    spent,
    residual: s.heatInput - stored - spent,
  };
}
export function waterBudget(s, thermal) {
  const airborne = [...s.parcels, ...s.spills].reduce(
    (sum, p) => sum + p.volume,
    0,
  );
  const terrain = s.nodes
    .filter((n) => !n.basin)
    .reduce((sum, n) => sum + n.water.volume, 0);
  const basin = thermal.water.volume,
    vapor = s.evaporated + thermal.evaporated;
  return {
    input: s.released,
    airborne,
    terrain,
    basin,
    vapor,
    outflow: s.outflow,
    residual: s.released - airborne - terrain - basin - vapor - s.outflow,
    cells: s.nodes.length,
    parcels: s.parcels.length,
    spills: s.spills.length,
  };
}

export function coupledEnergy(s, t) {
  const a = surfaceEnergy(s),
    b = energyBalance(t);
  const input = t.input - s.toBoilerHeat + s.directHeat;
  const stored = a.stored + b.stored;
  const spent = a.spent + b.spent - (t.poolTransfer ?? 0) - s.toBoilerHeat;
  return { input, stored, spent, residual: input - stored - spent };
}
