// Finite-energy game model. All thermal/pressure units are dimensionless.
export const THERMAL = Object.freeze({
  metalCapacity: 1,
  metalCooling: 0.12,
  waterCapacity: 0.5,
  waterCooling: 0.12,
  boilingTemperature: 0.8,
  conductance: 1.8,
  latentHeat: 4,
  steamLeak: 0.45,
  chamberVolume: 1,
  pistonArea: 1,
  pistonMass: 0.015,
  friction: 0.02,
  pistonTravel: 1.6,
  marker: 1,
});
export const THERMAL_LAYOUT = Object.freeze({
  pad: Object.freeze({ x: 10.8, y: 5.8, w: 0.6, h: 1.8 }),
  bridge: Object.freeze({ x: 11.4, y: 6.1, w: 2.6, h: 0.35 }),
  exchanger: Object.freeze({ x: 14, y: 4.3, w: 0.15, h: 2.15 }),
  water: Object.freeze({ x: 14, y: 4.3, w: 2, h: 2.1 }),
  piston: Object.freeze({ x: 15, y: 7.1 }),
});
export const THERMAL_MATERIALS = Object.freeze({
  metal: Object.freeze({ conductivity: 1 }),
  stone: Object.freeze({ conductivity: 0 }),
});
export const TIMING_PROFILES = Object.freeze({
  current: Object.freeze({ cooling: 0.12, leak: 0.45 }),
  comparison: Object.freeze({ cooling: 0.085, leak: 0.45 }),
});

export function depositWater(reservoir, amount) {
  if (!Number.isFinite(amount) || amount < 0)
    throw new RangeError("Invalid water volume");
  const accepted = Math.min(
    amount,
    Math.max(0, (reservoir.capacity ?? 1) - reservoir.volume),
  );
  // Incoming water is at ambient: mixing adds capacity/volume but no heat energy.
  reservoir.volume += accepted;
  return accepted;
}

export function createThermalRig(empty = false) {
  const source = {
    id: "heat-pad",
    material: "metal",
    ...THERMAL_LAYOUT.pad,
    heat: 0,
    burned: false,
    thermal: { capacity: THERMAL.metalCapacity },
  };
  const water = {
    ...THERMAL_LAYOUT.water,
    volume: empty ? 0 : 1,
    capacity: 1,
    energy: 0,
  };
  const inlet = {
    id: "water-inlet",
    material: "stone",
    x: 12.6,
    y: 7.9,
    w: 0.9,
    h: 0.65,
    heat: 0,
    burned: false,
    reservoir: water,
  };
  return {
    targets: [
      source,
      ...(empty ? [inlet] : []),
      {
        id: "stone-shield",
        material: "stone",
        x: 9.1,
        y: 2.5,
        w: 0.65,
        h: 1.8,
        heat: 0,
        burned: false,
      },
      {
        id: "boiler-wall",
        material: "stone",
        x: 13.5,
        y: 4,
        w: 0.5,
        h: 2.4,
        heat: 0,
        burned: false,
      },
      {
        id: "boiler-cap",
        material: "stone",
        x: 13.5,
        y: 6.4,
        w: 3,
        h: 0.45,
        heat: 0,
        burned: false,
      },
      {
        id: "boiler-base",
        material: "stone",
        x: 13.5,
        y: 4,
        w: 3,
        h: 0.3,
        heat: 0,
        burned: false,
      },
      {
        id: "boiler-back",
        material: "stone",
        x: 16,
        y: 4,
        w: 0.5,
        h: 2.4,
        heat: 0,
        burned: false,
      },
    ],
    state: {
      source,
      bridge: { ...THERMAL_LAYOUT.bridge, material: "metal" },
      exchanger: { ...THERMAL_LAYOUT.exchanger },
      water,
      ...(empty ? { inlet } : {}),
      timingProfile: "current",
      impacts: [],
      deposited: 0,
      overflow: 0,
      steam: 0,
      piston: { x: 0, velocity: 0, reached: false, max: 0 },
      input: 0,
      coolingLoss: 0,
      phaseLoss: 0,
      ventLoss: 0,
      work: 0,
      transferred: 0,
      evaporated: 0,
      transferRate: 0,
      observed: { waterWarm: false, steam: false },
    },
  };
}

export function touching(a, b) {
  const e = 1e-9;
  return (
    a.x + a.w >= b.x - e &&
    b.x + b.w >= a.x - e &&
    a.y + a.h >= b.y - e &&
    b.y + b.h >= a.y - e
  );
}

export function contactActive(t) {
  return (
    (THERMAL_MATERIALS[t.bridge.material]?.conductivity ?? 0) > 0 &&
    touching(t.source, t.bridge) &&
    touching(t.bridge, t.exchanger) &&
    t.water.volume > 0 &&
    touching(t.exchanger, { ...t.water, h: t.water.h * t.water.volume })
  );
}

export function setBridge(t, { gap = false, insulating = false } = {}) {
  t.bridge.w = THERMAL_LAYOUT.bridge.w - (gap ? 0.3 : 0);
  t.bridge.material = insulating ? "stone" : "metal";
}

export const waterTemperature = (t) =>
  t.water.volume > 0
    ? t.water.energy / (THERMAL.waterCapacity * t.water.volume)
    : 0;
export const pressure = (t) =>
  t.steam / (THERMAL.chamberVolume + THERMAL.pistonArea * t.piston.x);
export function energyBalance(t) {
  const stored = t.source.heat + t.water.energy + t.steam;
  const spent =
    t.coolingLoss + t.phaseLoss + t.ventLoss + t.work + (t.poolTransfer ?? 0);
  return { input: t.input, stored, spent, residual: t.input - stored - spent };
}

// Reusable two-reservoir contact: capped by donor energy and equalization energy.
export function transferEnergy(
  energyA,
  capacityA,
  energyB,
  capacityB,
  conductance,
  dt,
) {
  if (capacityA <= 0 || capacityB <= 0) return 0;
  const difference = Math.max(0, energyA / capacityA - energyB / capacityB);
  return Math.min(
    energyA,
    conductance * difference * dt,
    difference / (1 / capacityA + 1 / capacityB),
  );
}

export function stepThermal(t, dt, gravity) {
  const tuning = TIMING_PROFILES[t.timingProfile ?? "current"];
  const oldHeat = t.source.heat + t.water.energy;
  t.source.heat *= Math.exp(-tuning.cooling * dt);
  t.water.energy *= Math.exp(-tuning.cooling * dt);
  t.coolingLoss += oldHeat - t.source.heat - t.water.energy;
  const q =
    contactActive(t) && t.water.volume > 0
      ? transferEnergy(
          t.source.heat,
          THERMAL.metalCapacity,
          t.water.energy,
          THERMAL.waterCapacity * t.water.volume,
          THERMAL.conductance *
            THERMAL_MATERIALS[t.bridge.material].conductivity,
          dt,
        )
      : 0;
  t.source.heat -= q;
  t.water.energy += q;
  t.transferred += q;
  t.transferRate = q / dt;

  // Evaporation consumes both latent energy and the evaporated water's sensible heat.
  const sensiblePerVolume = THERMAL.waterCapacity * THERMAL.boilingTemperature;
  const excess = Math.max(
    0,
    t.water.energy - sensiblePerVolume * t.water.volume,
  );
  const evaporated = Math.min(t.water.volume, excess / THERMAL.latentHeat);
  const latent = evaporated * THERMAL.latentHeat;
  t.water.energy -= latent + evaporated * sensiblePerVolume;
  t.water.volume -= evaporated;
  t.phaseLoss += evaporated * sensiblePerVolume;
  t.evaporated += evaporated;
  t.steam += latent;
  const leak = t.steam * (1 - Math.exp(-tuning.leak * dt));
  t.steam -= leak;
  t.ventLoss += leak;

  // Slider/rail constraint; pressure applies force against weight and dry friction.
  const p = t.piston,
    force = pressure(t) * THERMAL.pistonArea;
  const load = THERMAL.pistonMass * gravity;
  if (p.x === 0 && p.velocity <= 0 && force <= load + THERMAL.friction) return;
  const direction = Math.sign(p.velocity || force - load);
  const acceleration =
    (force - load - THERMAL.friction * direction) / THERMAL.pistonMass;
  let velocity = p.velocity + acceleration * dt;
  // Static friction may stop motion, but may not reverse it by itself.
  if (
    Math.sign(velocity) !== Math.sign(p.velocity) &&
    Math.abs(force - load) <= THERMAL.friction
  )
    velocity = 0;
  const x = Math.max(0, Math.min(THERMAL.pistonTravel, p.x + velocity * dt));
  if (x === 0 || x === THERMAL.pistonTravel) velocity = 0;
  const mechanicalGain =
    0.5 * THERMAL.pistonMass * (velocity ** 2 - p.velocity ** 2) +
    load * (x - p.x);
  // Debit any discretization gain too: the mechanical output cannot exceed gas energy.
  const cost = Math.max(0, force * Math.max(0, x - p.x), mechanicalGain);
  if (cost > t.steam) {
    p.velocity = 0;
    return;
  }
  t.steam -= cost;
  t.work += cost;
  p.x = x;
  p.velocity = velocity;
  p.max = Math.max(p.max, x);
  p.reached ||= x >= THERMAL.marker;
}
