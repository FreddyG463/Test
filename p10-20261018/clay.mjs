// P10 Stage-A material/contact rig, NOT a bridge/rolling-body solver.
import { THERMAL } from "./thermal.mjs";
import {
  volume,
  mass,
  adhesionLimit,
  stepAdhesion,
  MIXTURE,
} from "./mixture.mjs";

export const CLAY = Object.freeze({
  solidCapacity: 0.5,
  firingTemperature: 1.1,
  conversionPerMass: 0.8,
  evaporationRate: 0.12,
  cooling: 0.12,
  standardFire: 1.2,
});

const finite = (v, name) => {
  if (!Number.isFinite(v) || v < 0) throw new RangeError(`Invalid ${name}`);
  return v;
};
const capacity = (p) =>
  p.sediment * CLAY.solidCapacity + p.water * THERMAL.waterCapacity;
export const thickness = (p) => volume(p) / (p.length * MIXTURE.depthScale);
export const temperature = (p) =>
  Math.min(
    p.water > 0 ? THERMAL.boilingTemperature : Infinity,
    p.energy / Math.max(1e-12, capacity(p)),
  );

function local(p, point) {
  const dx = point.x - p.x,
    dy = point.y - p.y;
  return {
    x: dx * Math.cos(p.angle) + dy * Math.sin(p.angle),
    y: -dx * Math.sin(p.angle) + dy * Math.cos(p.angle),
  };
}
export function contact(p, point, radius = 0) {
  finite(radius, "radius");
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y))
    throw new RangeError("Invalid point");
  const q = local(p, point),
    dx = Math.max(0, Math.abs(q.x) - p.length / 2),
    dy = Math.max(0, Math.abs(q.y) - thickness(p) / 2);
  return dx * dx + dy * dy <= radius * radius;
}

// Parallel rough ledge segments only. This fixture deliberately makes no claim
// to general polygon adhesion or to a load-bearing collider across the gap.
function overlap(p, s) {
  const a = local(p, s.a),
    b = local(p, s.b);
  if (Math.abs(a.y) > thickness(p) / 2 || Math.abs(b.y) > thickness(p) / 2)
    return 0;
  return Math.max(
    0,
    Math.min(p.length / 2, Math.max(a.x, b.x)) -
      Math.max(-p.length / 2, Math.min(a.x, b.x)),
  );
}

export function createClayPatch({
  x = 0,
  y = 0,
  angle = -0.25,
  length = 1.6,
  water = 0.14,
  sediment = 0.325,
  surfaces = [],
} = {}) {
  finite(water, "water");
  finite(sediment, "sediment");
  finite(length, "length");
  if (length === 0 || sediment === 0 || ![x, y, angle].every(Number.isFinite))
    throw new RangeError("Invalid patch geometry or solid mass");
  const p = {
    x,
    y,
    angle,
    length,
    water,
    sediment,
    material: "mud",
    energy: 0,
    time: 0,
    curedAt: null,
    slip: 0,
    velocity: 0,
    fallVx: 0,
    fallVelocity: 0,
    load: 0,
    anchors: [],
    curedAnchors: [],
    ledger: {
      initialWater: water,
      initialSediment: sediment,
      addedWater: 0,
      vapor: 0,
      runoff: 0,
      input: 0,
      latent: 0,
      vaporSensible: 0,
      conversion: 0,
      loss: 0,
    },
  };
  p.anchors = surfaces
    .filter((s) => overlap(p, s) > 0)
    .map((s) => structuredClone(s));
  return p;
}

// Caller supplies an actual contact point (or projectile center + radius), not
// a target id. No-contact input is returned to caller as unspent external heat.
export function depositClayHeat(p, point, energy, radius = 0) {
  finite(energy, "heat");
  if (energy > CLAY.standardFire)
    throw new RangeError("Heat exceeds standard Fire payload");
  if (!contact(p, point, radius)) return 0;
  p.energy += energy;
  p.ledger.input += energy;
  return energy;
}

export function wetClay(p, point, water, radius = 0) {
  finite(water, "water");
  if (!contact(p, point, radius)) return 0;
  p.ledger.addedWater += water;
  if (p.material === "fired-clay") p.ledger.runoff += water;
  else p.water += water;
  return water;
}

export function stepClayThermal(p, dt) {
  finite(dt, "dt");
  if (dt === 0) return;
  const boiling = THERMAL.boilingTemperature,
    excess = Math.max(0, p.energy - capacity(p) * boiling),
    vapor = Math.min(
      p.water,
      CLAY.evaporationRate * dt,
      excess / THERMAL.latentHeat,
    );
  p.water -= vapor;
  const latent = vapor * THERMAL.latentHeat,
    sensible = vapor * THERMAL.waterCapacity * boiling;
  p.energy -= latent + sensible;
  p.ledger.vapor += vapor;
  p.ledger.latent += latent;
  p.ledger.vaporSensible += sensible;
  const cost = p.sediment * CLAY.conversionPerMass;
  if (
    p.material === "mud" &&
    p.water === 0 &&
    p.energy >= capacity(p) * CLAY.firingTemperature + cost
  ) {
    p.energy -= cost;
    p.ledger.conversion += cost;
    p.material = "fired-clay";
    p.curedAt = p.time + dt;
    // Freeze only contacts which survived up to actual conversion.
    p.curedAnchors = p.anchors
      .map((s) => ({
        id: s.id,
        length: overlap(p, s),
        force: adhesionLimit(p, overlap(p, s)),
      }))
      .filter((s) => s.length > 0);
  }
  const loss = p.energy * (1 - Math.exp(-CLAY.cooling * dt));
  p.energy -= loss;
  p.ledger.loss += loss;
  p.time += dt;
}

// Separate tangential gravity/load rig reuses P09's unchanged continuous law.
// There is NO normal support force, rolling ball, beam stiffness or gate here.
export function stepClaySlope(p, dt, gravity = 9.81) {
  finite(dt, "dt");
  finite(gravity, "gravity");
  if (p.material === "fired-clay" && p.curedAnchors.length > 0)
    throw new Error(
      "Anchored ceramic dynamics require the unfinished bearing solver",
    );
  if (p.material === "mud" && p.anchors.length > 0) {
    const len = p.anchors.reduce((n, s) => n + overlap(p, s), 0),
      previous = p.slip,
      rig = {
        ...p,
        angle: Math.abs(p.angle),
        contact: len > 0,
        contactLength: len,
        slip: 0,
      };
    stepAdhesion(rig, dt, gravity);
    const displacement = rig.slip;
    p.slip = previous + displacement;
    p.velocity = rig.velocity;
    const direction = p.angle > 0 ? -1 : 1;
    p.x += direction * displacement * Math.cos(p.angle);
    p.y += direction * displacement * Math.sin(p.angle);
    p.anchors = p.anchors.filter((s) => overlap(p, s) > 0);
    if (p.anchors.length === 0) {
      p.fallVx = direction * p.velocity * Math.cos(p.angle);
      p.fallVelocity = direction * p.velocity * Math.sin(p.angle);
    }
    return;
  }
  const attached =
    p.material === "mud" ? p.anchors.length > 0 : p.curedAnchors.length > 0;
  if (!attached) {
    p.x += p.fallVx * dt;
    p.y += p.fallVelocity * dt - 0.5 * gravity * dt * dt;
    p.fallVelocity -= gravity * dt;
  }
}

export function clayLedger(p) {
  const l = p.ledger;
  return {
    waterError: l.initialWater + l.addedWater - p.water - l.vapor - l.runoff,
    solidError: l.initialSediment - p.sediment,
    energyError:
      l.input - p.energy - l.latent - l.vaporSensible - l.conversion - l.loss,
    mass: mass(p),
    volume: volume(p),
    thickness: thickness(p),
  };
}
