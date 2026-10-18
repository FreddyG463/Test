import {
  createClayPatch,
  clayLedger,
  contact as patchContact,
} from "./clay.mjs";
import {
  createBearing,
  stepBearing,
  stepFreeCircles,
  heatBearing,
  stepBearingThermal,
  bearingSegments,
  bearingThickness,
} from "./clay-bearing.mjs";
import {
  closest,
  sweepSegment,
  boxSegments,
  impulseSlider,
  impulseBodies,
  contactSlider,
  stepSlider,
} from "./contact-mechanics.mjs";
import { topEntry } from "./puzzle.mjs";
import { mix, costAvailable, spend } from "./circuit.mjs";

export const CLAY_PAIRS = Object.freeze({
  Mud: ["Earth", "Drop"],
  Fire: ["Spark", "Biomass"],
  Stone: ["Earth", "Earth"],
});
export const mixClay = (a, b) => mix(a, b, CLAY_PAIRS);
export const clayAvailable = (c, s) => costAvailable(c.stock, s, CLAY_PAIRS);
export const CLAY_LEVEL = Object.freeze({
  center: { x: 11, y: 5 },
  angle: -0.25,
  length: 1.6,
  gap: 0.8,
  stone: { radius: 0.24, mass: 3 },
  ball: { radius: 0.12, mass: 0.75 },
  goal: {
    seedId: "plant-seed",
    left: 17.9,
    right: 19.3,
    top: 2.8,
    bottom: 1.1,
  },
});
const k = CLAY_LEVEL,
  n = { x: -Math.sin(k.angle), y: Math.cos(k.angle) },
  at = (s) => ({
    x: k.center.x + s * Math.cos(k.angle),
    y: k.center.y + s * Math.sin(k.angle),
  }),
  offset = 0.13 / (k.length / 4.2) / 2,
  raised = (s) => ({ x: at(s).x + n.x * offset, y: at(s).y + n.y * offset });
const segment = (id, a, b, extra = {}) => ({ id, a, b, ...extra });
const TRACK = [
  segment("high-track", raised(-3), raised(-0.4), { rough: true }),
  segment("low-track", raised(0.4), raised(3), { rough: true }),
];
const LEDGES = [
  segment("left", at(-1.1), at(-0.4)),
  segment("right", at(0.4), at(1.1)),
];
const SHIELDS = [
  { id: "rough-abutment", x: 10.15, y: 4.75, w: 0.18, h: 0.55, rough: true },
  { id: "stone-catch", x: 10, y: 0.45, w: 0.25, h: 4.1 },
  { id: "ball-canopy-left", x: 8.1, y: 6.3, w: 1.24, h: 0.2 },
  { id: "ball-canopy-right", x: 9.46, y: 6.3, w: 0.64, h: 0.2 },
  { id: "plate-left-shield", x: 13.7, y: 0.45, w: 0.2, h: 3.7 },
  { id: "plate-tunnel-roof", x: 13.1, y: 5.05, w: 2.3, h: 0.25 },
  { id: "seed-roof-left", x: 15.4, y: 6.05, w: 1.24, h: 0.3 },
  { id: "seed-roof-right", x: 16.76, y: 6.05, w: 2.84, h: 0.3 },
  { id: "seed-left-shield", x: 15.5, y: 0.45, w: 0.2, h: 4 },
];
const FLOOR = segment("floor", { x: -2, y: 0.45 }, { x: 22, y: 0.45 });
const SEED_TRACK = [
  segment("seed-ramp", { x: 15.9, y: 5 }, { x: 18.25, y: 3.45 }),
];
function slider(axis, mass, travel) {
  return {
    axis,
    mass,
    travel,
    q: 0,
    velocity: 0,
    floor: 0,
    ratchet: true,
    damping: 0.15,
    impulse: 0,
    peakImpulse: 0,
  };
}
export function latchPaddle(c) {
  return segment(
    "latch-paddle",
    { x: 4.6, y: 4.4 + c.latch.q },
    { x: 5.6, y: 4.4 + c.latch.q },
    { slider: c.latch },
  );
}
export function ballStop(c) {
  return segment(
    "ball-stop",
    { x: 9.4, y: 5.2 + c.latch.q },
    { x: 9.4, y: 6.25 + c.latch.q },
  );
}
export function plateSegment(c) {
  return segment(
    "load-plate",
    { x: 14, y: 4.35 - c.plate.q },
    { x: 15.1, y: 4.35 - c.plate.q },
    { slider: c.plate },
  );
}
export function gateSegment(c) {
  return segment(
    "seed-gate",
    { x: 16.7, y: 4.2 + 4 * c.plate.q },
    { x: 16.7, y: 5.65 + 4 * c.plate.q },
  );
}
export function createClayBridge() {
  const p = raised(-2.2);
  return {
    layout: k,
    stock: { Earth: 3, Drop: 1, Spark: 1, Biomass: 1 },
    time: 0,
    patch: null,
    ball: {
      ...p,
      x: p.x + n.x * k.ball.radius,
      y: p.y + n.y * k.ball.radius,
      ...k.ball,
      vx: 0,
      vy: 0,
      omega: 0,
      angle: 0,
    },
    latch: slider({ x: 0, y: 1 }, 0.25, 1.25),
    plate: slider({ x: 0, y: -1 }, 0.35, 0.22),
    seed: {
      id: "plant-seed",
      kind: "plant-seed",
      x: 16.1,
      y: 5.15,
      radius: 0.18,
      mass: 0.03,
      vx: 0,
      vy: 0,
    },
    projectiles: [],
    stones: [],
    impacts: [],
    events: [],
    won: false,
    lost: false,
    mudInput: { water: 0, sediment: 0 },
    mudDrain: { water: 0, sediment: 0 },
    fireInput: 0,
    fireMiss: 0,
    maxBallStep: 0,
    ballCrossed: false,
  };
}
function note(c, type, data = {}) {
  c.events.push({ time: c.time, type, ...data });
  if (c.events.length > 30) c.events.shift();
}
export function clayTerrain(c) {
  return [
    ...TRACK,
    FLOOR,
    ...SHIELDS.flatMap(boxSegments),
    segment("ball-tray-wall", { x: 15.05, y: 4 }, { x: 15.05, y: 4.9 }),
    ballStop(c),
  ];
}
export function clayProjectileTargets(c) {
  return [
    ...TRACK,
    ...SHIELDS.flatMap(boxSegments),
    FLOOR,
    latchPaddle(c),
    plateSegment(c),
    gateSegment(c),
    ...SEED_TRACK,
    {
      id: "rolling-body",
      a: c.ball,
      b: c.ball,
      body: c.ball,
      extraRadius: c.ball.radius,
    },
    {
      id: "plant-seed",
      a: c.seed,
      b: c.seed,
      body: c.seed,
      extraRadius: c.seed.radius,
    },
    ...(c.patch
      ? bearingSegments(c.patch).map((s) => ({
          ...s,
          id: "mud-patch",
          patch: true,
          extraRadius: bearingThickness(c.patch) / 2,
        }))
      : []),
  ];
}
export function firstClayHit(c, a, b, p) {
  let hit = null;
  for (const s of clayProjectileTargets(c)) {
    const t = sweepSegment(a, b, s, p.radius + (s.extraRadius ?? 0));
    if (t !== null && (!hit || t < hit.t)) hit = { t, s };
  }
  return hit;
}
export function launchClay(c, p) {
  if (!clayAvailable(c, p.species) || c.projectiles.length >= 12) return false;
  spend(c.stock, p.species, CLAY_PAIRS);
  Object.assign(
    p,
    p.species === "Stone"
      ? k.stone
      : { mass: p.species === "Mud" ? 0.465 : 0.01 },
  );
  c.projectiles.push(p);
  if (p.species === "Mud") {
    c.mudInput.water += 0.14;
    c.mudInput.sediment += 0.325;
  }
  if (p.species === "Fire") c.fireInput += p.heat;
  return true;
}
function impact(c, p, hit, point) {
  const s = hit.s,
    q = closest(point, s),
    d = Math.hypot(point.x - q.x, point.y - q.y),
    normal =
      d > 1e-9
        ? { x: (point.x - q.x) / d, y: (point.y - q.y) / d }
        : { x: 0, y: -1 };
  let accepted = 0;
  // Generic finite impulse: no Stone-id/species test on the mechanical slider.
  if (s.slider) impulseSlider(s.slider, p, normal);
  if (s.body) impulseBodies(p, s.body, normal);
  if (p.species === "Mud") {
    if (s.rough && !c.patch) {
      // Finite paste spreading along the actual contacted incline. The footprint
      // is translated by bounded incoming tangential momentum, not a gap id.
      const tangent = p.vx * Math.cos(k.angle) + p.vy * Math.sin(k.angle),
        spread = Math.max(-0.8, Math.min(0.8, tangent * 0.09)),
        along =
          (q.x - k.center.x) * Math.cos(k.angle) +
          (q.y - k.center.y) * Math.sin(k.angle) +
          spread,
        center = at(along);
      const deposit = createClayPatch({
        ...center,
        angle: k.angle,
        length: k.length,
        surfaces: LEDGES,
      });
      if (patchContact(deposit, q, 1e-7)) {
        c.patch = createBearing(deposit, { distributedContacts: true });
        note(c, "mud-contact", {
          x: point.x,
          y: point.y,
          center,
          anchors: c.patch.anchors.map((a) => ({ id: a.id, length: a.length })),
        });
      } else {
        c.mudDrain.water += 0.14;
        c.mudDrain.sediment += 0.325;
      }
    } else {
      c.mudDrain.water += 0.14;
      c.mudDrain.sediment += 0.325;
    }
  } else if (p.species === "Fire") {
    if (s.patch)
      accepted = heatBearing(c.patch, point, p.heat, p.radius + 1e-7);
    c.fireMiss += p.heat - accepted;
    if (accepted) note(c, "finite-heat", { energy: accepted });
  } else if (p.species === "Stone") {
    c.stones.push({
      ...p,
      x: point.x + normal.x * 0.005,
      y: point.y + normal.y * 0.005,
      omega: 0,
    });
  }
  c.impacts.push({
    time: c.time,
    launchedAt: p.launchedAt,
    flightTime: c.time - p.launchedAt,
    species: p.species,
    target: s.id,
    x: point.x,
    y: point.y,
    heat: accepted,
  });
  if (c.impacts.length > 24) c.impacts.shift();
}
export function stepClayBridge(c, dt, gravity) {
  c.time += dt;
  c.projectiles = c.projectiles.filter((p) => {
    const a = { x: p.x, y: p.y };
    p.x += p.vx * dt;
    p.y += p.vy * dt - 0.5 * gravity * dt * dt;
    p.vy -= gravity * dt;
    p.age += dt;
    p.trail.push(a);
    if (p.trail.length > 100) p.trail.shift();
    const hit = firstClayHit(c, a, p, p);
    if (hit) {
      const point = {
        x: a.x + (p.x - a.x) * hit.t,
        y: a.y + (p.y - a.y) * hit.t,
      };
      impact(c, p, hit, point);
      return false;
    }
    if (p.age > 8 || p.x > 21 || p.y < 0) {
      if (p.species === "Mud") {
        c.mudDrain.water += 0.14;
        c.mudDrain.sediment += 0.325;
      }
      if (p.species === "Fire") c.fireMiss += p.heat;
      return false;
    }
    return true;
  });
  stepSlider(c.latch, dt, -c.latch.mass * gravity);
  stepSlider(c.plate, dt, (0.03 - 4 * 0.02) * gravity);
  const beforeBall = { x: c.ball.x, y: c.ball.y },
    bodies = [c.ball, ...c.stones],
    terrain = clayTerrain(c);
  if (c.patch) {
    const old = c.patch.patch.material;
    stepBearingThermal(c.patch, dt);
    stepBearing(c.patch, bodies, dt, gravity, terrain);
    if (old !== c.patch.patch.material) note(c, "ceramic-conversion");
  } else stepFreeCircles(bodies, dt, gravity, terrain);
  // The plate is an actual finite-mass moving segment, coupled by a4:1 lever
  // to the seed gate. A physical end-stop ratchet holds the opened mechanism.
  for (const b of bodies) {
    contactSlider(c.latch, b, latchPaddle(c));
    contactSlider(c.plate, b, plateSegment(c));
  }
  c.maxBallStep = Math.max(
    c.maxBallStep,
    Math.hypot(c.ball.x - beforeBall.x, c.ball.y - beforeBall.y),
  );
  if (!c.ballCrossed && c.ball.x > 12.1 && c.ball.y > 4) {
    c.ballCrossed = true;
    note(c, "ball-downstream");
  }
  if (c.latch.floor > 0 && !c.events.some((e) => e.type === "latch-raised"))
    note(c, "latch-raised");
  if (c.plate.floor > 0 && !c.events.some((e) => e.type === "plate-latched"))
    note(c, "plate-latched");
  const before = { x: c.seed.x, y: c.seed.y };
  stepFreeCircles([c.seed], dt, gravity, [
    ...SEED_TRACK,
    ...SHIELDS.flatMap(boxSegments),
    FLOOR,
    gateSegment(c),
    segment(
      "goal-left",
      { x: k.goal.left, y: 0.7 },
      { x: k.goal.left, y: k.goal.top },
    ),
    segment(
      "goal-right",
      { x: k.goal.right, y: 0.7 },
      { x: k.goal.right, y: k.goal.top },
    ),
    segment(
      "goal-bottom",
      { x: k.goal.left, y: k.goal.bottom },
      { x: k.goal.right, y: k.goal.bottom },
    ),
  ]);
  if (!c.won && topEntry(c.seed, before, c.seed, k.goal)) {
    c.won = true;
    note(c, "seed-top-entry", {
      id: c.seed.id,
      kind: c.seed.kind,
      x: c.seed.x,
      y: c.seed.y,
      vy: c.seed.vy,
    });
  }
  c.lost ||=
    (c.ball.x > 10.25 && c.ball.x < 13.7 && c.ball.y < 3.5) || c.seed.y < 0;
  c.stones = c.stones.filter((p) => p.x > -2 && p.x < 22 && p.y > 0);
}
export function clayBudget(c) {
  const m = c.patch?.patch,
    l = m ? clayLedger(m) : { waterError: 0, solidError: 0, energyError: 0 },
    inFlight = c.projectiles.filter((p) => p.species === "Mud").length;
  return {
    waterError:
      c.mudInput.water +
      (m?.ledger.addedWater ?? 0) -
      c.mudDrain.water -
      inFlight * 0.14 -
      (m ? m.water + m.ledger.vapor + m.ledger.runoff : 0),
    solidError:
      c.mudInput.sediment -
      c.mudDrain.sediment -
      inFlight * 0.325 -
      (m?.sediment ?? 0),
    fireError:
      c.fireInput -
      c.fireMiss -
      c.projectiles
        .filter((p) => p.species === "Fire")
        .reduce((a, p) => a + p.heat, 0) -
      (m?.ledger.input ?? 0),
    thermalError: l.energyError,
  };
}
export const clayGeometry = {
  track: TRACK,
  ledges: LEDGES,
  shields: SHIELDS,
  seedTrack: SEED_TRACK,
};
