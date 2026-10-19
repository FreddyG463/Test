import { mix, costAvailable, spend } from "./circuit.mjs";
import {
  volume,
  mass,
  concentration,
  columns,
  height,
  freeCapacity,
  occupied,
  take,
  add,
  stepChannel,
  MIXTURE,
  yieldStress,
  stepAdhesion,
  adhesionLimit,
  wallPatchBounds,
} from "./mixture.mjs";
import { stepSolid, stepLoadedDrum } from "./mechanisms.mjs";
import { advanceSeed, topEntry, rampSolids } from "./puzzle.mjs";
export const OVERFLOW_PAIRS = Object.freeze({
  Stone: ["Earth", "Earth"],
  Water: ["Drop", "Drop"],
  Mud: ["Earth", "Drop"],
});
export const OVERFLOW_STOCK = Object.freeze({ Earth: 2, Drop: 2 });
export const mixOverflow = (a, b) => mix(a, b, OVERFLOW_PAIRS);
export const overflowAvailable = (o, s) =>
  costAvailable(o.stock, s, OVERFLOW_PAIRS);
export const spendOverflow = (o, s) => spend(o.stock, s, OVERFLOW_PAIRS);
export const MUD_PAYLOAD = Object.freeze({ water: 0.14, sediment: 0.325 });
export const OVERFLOW_LAYOUT = Object.freeze({
  left: 8.5,
  right: 11.5,
  base: 5,
  rim: 6.7,
  freeboard: 0.3,
  stone: { radius: 0.5, mass: 6 },
  chuteRight: 16.25,
  chuteSlope: (5 * Math.PI) / 180,
  roof: { a: { x: 11.5, y: 8.1 }, b: { x: 19.6, y: 7.2 } },
  shields: [
    { id: "intake-lower", material: "stone", x: 11.5, y: 5, w: 0.2, h: 1.7 },
    {
      id: "intake-upper",
      material: "stone",
      x: 11.5,
      y: 6.88,
      w: 0.2,
      h: 1.22,
    },
  ],
  bucket: { left: 16, right: 17.5, top: 5.8, bottom: 5.1, mass: 0.05 },
  bridge: {
    pivot: { x: 9.5, y: 2.9 },
    length: 4,
    initialAngle: Math.PI / 2,
    finalAngle: -0.12,
    mass: 0.01,
    drumRadius: 1.5 / (Math.PI / 2 + 0.12),
  },
  counterMass: 0.13,
  travel: 1.5,
  ramps: [{ a: { x: 5.5, y: 3.8 }, b: { x: 9.5, y: 2.9 } }],
  seed: { id: "plant-seed", kind: "plant-seed", x: 7, y: 3.7, radius: 0.22 },
  goal: { seedId: "plant-seed", left: 13.5, right: 15.5, top: 2, bottom: 0.65 },
});
export function createOverflow(layout = OVERFLOW_LAYOUT) {
  const water =
    (layout.right - layout.left) *
      (layout.rim - layout.base) *
      MIXTURE.depthScale -
    layout.freeboard;
  return {
    layout,
    stock: { ...OVERFLOW_STOCK },
    basin: columns(layout.left, layout.right, layout.base, water),
    chute: columns(
      layout.right,
      layout.chuteRight,
      (x) => layout.rim - (x - layout.right) * Math.tan(layout.chuteSlope),
      0,
      19,
    ),
    stones: [],
    parcels: [],
    wallPatches: [],
    bucket: { water: 0, sediment: 0 },
    drain: { water: 0, sediment: 0 },
    initial: { water, sediment: 0 },
    injected: { water: 0, sediment: 0 },
    inFlight: { water: 0, sediment: 0 },
    clearOverflow: 0,
    weakOverflow: 0,
    minSpillC: 1,
    drum: {
      q: 0,
      velocity: 0,
      travel: layout.travel,
      counterMass: layout.counterMass,
      bucketMass: layout.bucket.mass,
      bridgeMass: layout.bridge.mass,
      length: layout.bridge.length,
      radius: layout.bridge.drumRadius,
      initialAngle: layout.bridge.initialAngle,
      friction: 0.001,
      drive: 0,
    },
    seed: { ...layout.seed, vx: 0, vy: 0, age: 0 },
    won: false,
    events: [],
    impacts: [],
    overflow: { water: 0, sediment: 0 },
    maxPackets: 0,
    maxSeedStep: 0,
    maxStoneStep: 0,
  };
}
export const bridgeSegment = (o) => {
  const k = o.layout.bridge,
    a = k.initialAngle - o.drum.q / k.drumRadius;
  return {
    a: k.pivot,
    b: {
      x: k.pivot.x + k.length * Math.cos(a),
      y: k.pivot.y + k.length * Math.sin(a),
    },
  };
};
export const bucketSolids = (o) => {
  const b = o.layout.bucket,
    y = b.bottom - o.drum.q;
  return [
    {
      vy: -o.drum.velocity,
      id: "bucket-floor",
      material: "metal",
      x: b.left,
      y: y - 0.12,
      w: b.right - b.left,
      h: 0.12,
    },
    {
      vy: -o.drum.velocity,
      id: "bucket-left",
      material: "metal",
      x: b.left - 0.12,
      y,
      w: 0.12,
      h: b.top - b.bottom,
    },
    {
      vy: -o.drum.velocity,
      id: "bucket-right",
      material: "metal",
      x: b.right,
      y,
      w: 0.12,
      h: b.top - b.bottom,
    },
  ];
};
const basinBoxes = (k) => [
  {
    id: "cistern-left",
    material: "stone",
    x: k.left - 0.2,
    y: k.base - 0.2,
    w: 0.2,
    h: k.rim - k.base + 0.2,
  },
  {
    id: "cistern-floor",
    material: "stone",
    x: k.left,
    y: k.base - 0.2,
    w: k.right - k.left,
    h: 0.2,
  },
];
export function overflowTargets(o) {
  const k = o.layout;
  return [
    ...bucketSolids(o),
    ...basinBoxes(k),
    ...k.shields,
    ...rampSolids([k.roof]).map((b) => ({ ...b, id: `roof-${b.id}` })),
    ...rampSolids(k.ramps),
    ...rampSolids([bridgeSegment(o)]),
    ...o.stones.map((s) => ({
      id: `stone-${s.id}`,
      material: "stone",
      x: s.x - s.radius,
      y: s.y - s.radius,
      w: s.radius * 2,
      h: s.radius * 2,
    })),
    ...o.basin
      .filter((n) => volume(n) > 0)
      .map((n, i) => ({
        id: `fluid-${i}`,
        material: "water",
        x: n.x,
        y: n.base,
        w: n.w,
        h: height(n, o.stones) - n.base,
      })),
  ];
}
const payloadFor = (p) =>
  p.species === "Mud" ? { ...MUD_PAYLOAD } : { water: 0.25, sediment: 0 };
export function overflowLaunch(o, p) {
  if (p.species === "Stone") return;
  const payload = payloadFor(p);
  add(o.injected, payload);
  add(o.inFlight, payload);
}
function finishFlight(o, p) {
  const payload = payloadFor(p);
  o.inFlight.water -= payload.water;
  o.inFlight.sediment -= payload.sediment;
  return payload;
}
export function overflowMiss(o, p) {
  add(o.drain, finishFlight(o, p));
}
export function overflowImpact(o, t, p, time, gravity = 9.81) {
  const payload = finishFlight(o, p);
  if (o.parcels.length >= 96)
    throw Error("Payload capacity exhausted after accepted launch");
  const side = t.material !== "water" && (p.x < t.x || p.x > t.x + t.w),
    length = 0.6;
  if (side && adhesionLimit(payload, length) > mass(payload) * gravity) {
    o.wallPatches.push({
      x: p.x < t.x ? t.x : t.x + t.w,
      normalX: p.x < t.x ? -1 : 1,
      y: p.y,
      ...payload,
      angle: Math.PI / 2,
      contact: true,
      contactLength: length,
      slip: 0,
      velocity: 0,
      load: 0,
    });
  } else o.parcels.push({ x: p.x, y: p.y, vx: 0, vy: 0, ...payload });
  o.impacts.push({
    time,
    launchedAt: p.launchedAt,
    species: p.species,
    target: t.id,
    ...payload,
  });
}
function release(o, x, y, payload, vx = 0) {
  if (o.parcels.length >= 96) return false;
  o.parcels.push({ x, y, vx, vy: 0, ...payload });
  return true;
}
function surfaceContact(p, before, n, solids) {
  if (p.x < n.x || p.x >= n.x + n.w || before.y < n.base - 0.001) return false;
  return p.y <= height(n, solids);
}
export function bucketCapacity(o) {
  const b = o.layout.bucket,
    n = { x: b.left, w: b.right - b.left, base: b.bottom - o.drum.q };
  return Math.max(
    0,
    n.w * (b.top - b.bottom) * MIXTURE.depthScale -
      occupied(n, b.top - o.drum.q, o.stones),
  );
}
function stepParcels(o, dt, g) {
  const k = o.layout,
    kept = [];
  for (const p of o.parcels) {
    if (p.roof) {
      const a = k.roof.a,
        b = k.roof.b,
        angle = Math.atan2(a.y - b.y, b.x - a.x),
        rho = mass(p) / Math.max(volume(p), 1e-12),
        drive = rho * g * 0.1 * Math.sin(angle),
        resistance = yieldStress(p);
      p.vx +=
        (Math.max(0, drive - resistance) / Math.max(rho * 0.1, 1e-12)) * dt;
      p.x += p.vx * dt;
      p.y = a.y + ((p.x - a.x) * (b.y - a.y)) / (b.x - a.x);
      if (p.x > b.x) {
        p.roof = false;
        p.y = b.y + 0.001;
      }
      kept.push(p);
      continue;
    }
    const before = { x: p.x, y: p.y };
    p.x += p.vx * dt;
    p.y += p.vy * dt - 0.5 * g * dt * dt;
    p.vy -= g * dt;
    const roofY = (x) =>
      k.roof.a.y +
      ((x - k.roof.a.x) * (k.roof.b.y - k.roof.a.y)) /
        (k.roof.b.x - k.roof.a.x);
    if (
      p.x >= k.roof.a.x &&
      p.x <= k.roof.b.x &&
      before.y >= roofY(before.x) &&
      p.y <= roofY(p.x)
    ) {
      p.roof = true;
      p.y = roofY(p.x);
      p.vx = Math.max(0, p.vx);
      kept.push(p);
      continue;
    }
    const top = k.bucket.top - o.drum.q;
    if (
      p.x >= k.bucket.left &&
      p.x <= k.bucket.right &&
      before.y >= top &&
      p.y <= top
    ) {
      add(o.bucket, take(p, Math.max(0, bucketCapacity(o) - volume(o.bucket))));
      if (volume(p) > 0) {
        p.x = k.bucket.right + 0.01;
        p.y = top;
        p.vx = 0.5;
        p.vy = 0;
        kept.push(p);
      }
      continue;
    }
    const patch = o.wallPatches.find((s) => {
      const box = wallPatchBounds(s);
      return (
        p.x >= box.x &&
        p.x <= box.x + box.w &&
        before.y >= box.y &&
        p.y <= box.y + box.h
      );
    });
    if (patch) {
      add(patch, p);
      continue;
    }
    const basin = o.basin.find((n) => surfaceContact(p, before, n, o.stones));
    if (basin) {
      add(basin, p);
      continue;
    }
    const chute = o.chute.find((n) => surfaceContact(p, before, n, []));
    if (chute) {
      add(chute, p);
      continue;
    }
    if (p.y <= 0.45 || p.x < 0 || p.x > 20) {
      add(o.drain, p);
      continue;
    }
    kept.push(p);
  }
  o.parcels = kept;
}
export function overflowBudget(o) {
  const stored = [
    ...o.basin,
    ...o.chute,
    ...o.parcels,
    ...o.wallPatches,
    o.bucket,
    o.drain,
    o.inFlight,
  ].reduce(
    (a, n) => {
      add(a, n);
      return a;
    },
    { water: 0, sediment: 0 },
  );
  return {
    initial: o.initial.water,
    inputWater: o.injected.water,
    inputSediment: o.injected.sediment,
    water: stored.water,
    sediment: stored.sediment,
    waterResidual: o.initial.water + o.injected.water - stored.water,
    sedimentResidual:
      o.initial.sediment + o.injected.sediment - stored.sediment,
    bucketMass: mass(o.bucket),
    bucketWater: o.bucket.water,
    bucketSediment: o.bucket.sediment,
    overflowWater: o.overflow.water,
    overflowSediment: o.overflow.sediment,
    chuteVolume: o.chute.reduce((a, n) => a + volume(n), 0),
    drainWater: o.drain.water,
    drainSediment: o.drain.sediment,
    inFlightWater: o.inFlight.water,
    inFlightSediment: o.inFlight.sediment,
    clearOverflow: o.clearOverflow,
    weakOverflow: o.weakOverflow,
    minSpillC: o.minSpillC,
  };
}
export function stepOverflow(w, dt, integrate, sweep) {
  const o = w.overflow,
    k = o.layout,
    oldOverflow = mass(o.overflow),
    oldBucket = mass(o.bucket);
  const segments = [
    ...k.ramps,
    k.roof,
    { a: { x: 0, y: 0.45 }, b: { x: 20, y: 0.45 } },
  ];
  for (const s of o.stones) {
    const submerged = o.basin.reduce(
      (v, n) =>
        s.x + s.radius > n.x && s.x - s.radius < n.x + n.w
          ? v +
            (occupied(n, height(n, o.stones), [s]) * mass(n)) /
              Math.max(volume(n), 1e-12)
          : v,
      0,
    );
    o.maxStoneStep = Math.max(
      o.maxStoneStep,
      stepSolid(
        s,
        segments,
        [...basinBoxes(k), ...k.shields, ...bucketSolids(o)],
        dt,
        w.gravity * (1 - submerged / s.mass),
        integrate,
        sweep,
      ),
    );
  }
  const patches = [];
  for (const p of o.wallPatches) {
    stepAdhesion(p, dt, w.gravity);
    if (p.slip >= p.contactLength) {
      p.contact = false;
      if (
        !release(o, p.x, p.y - p.slip, { water: p.water, sediment: p.sediment })
      )
        patches.push(p);
    } else patches.push(p);
  }
  o.wallPatches = patches;
  const excess = volume(o.bucket) - bucketCapacity(o);
  if (excess > 0 && o.parcels.length < 94)
    release(
      o,
      k.bucket.right + 0.01,
      k.bucket.top - o.drum.q,
      take(o.bucket, excess),
      0.5,
    );
  stepParcels(o, dt, w.gravity);
  stepChannel(o.basin, dt, w.gravity, o.stones);
  const end = o.basin.at(-1),
    head = height(end, o.stones) - k.rim;
  if (head > 1e-8 && o.parcels.length < 94) {
    const q = Math.min(volume(end), 1.5 * Math.min(0.18, head) ** 1.5 * dt),
      payload = take(end, q);
    add(o.overflow, payload);
    const c = concentration(payload);
    o.minSpillC = Math.min(o.minSpillC, c);
    if (c === 0) o.clearOverflow += payload.water;
    if (c < 0.01) o.weakOverflow += payload.water;
    release(o, k.right + 0.005, k.rim + Math.min(head, 0.18), payload, 0.35);
  }
  stepChannel(o.chute, dt, w.gravity, [], { mixingRate: 4 });
  const tail = o.chute.at(-1),
    depth = height(tail) - tail.base,
    rho = mass(tail) / Math.max(volume(tail), 1e-12),
    stress = rho * w.gravity * depth * Math.sin(k.chuteSlope),
    rate = 0.8 * Math.max(0, stress - yieldStress(tail));
  if (rate > 0 && o.parcels.length < 94) {
    const payload = take(tail, Math.min(volume(tail), rate * dt));
    release(o, k.chuteRight + 0.005, tail.base + depth, payload, 0.6);
  }
  const oldq = o.drum.q;
  const supported = o.stones
    .filter(
      (s) =>
        s.x - s.radius >= k.bucket.left &&
        s.x + s.radius <= k.bucket.right &&
        Math.abs(s.y - s.radius - (k.bucket.bottom - o.drum.q)) < 0.002,
    )
    .reduce((a, s) => a + s.mass, 0);
  o.drum.bucketMass = k.bucket.mass + mass(o.bucket) + supported;
  stepLoadedDrum(o.drum, dt, w.gravity);
  const b = bridgeSegment(o),
    g = k.goal,
    omega = -(o.drum.q - oldq) / (dt * k.bridge.drumRadius),
    seedSegments = [
      ...k.ramps,
      k.roof,
      ...[...basinBoxes(k), ...k.shields].flatMap((box) => [
        { a: { x: box.x, y: box.y }, b: { x: box.x + box.w, y: box.y } },
        {
          a: { x: box.x, y: box.y + box.h },
          b: { x: box.x + box.w, y: box.y + box.h },
        },
        { a: { x: box.x, y: box.y }, b: { x: box.x, y: box.y + box.h } },
        {
          a: { x: box.x + box.w, y: box.y },
          b: { x: box.x + box.w, y: box.y + box.h },
        },
      ]),
      {
        ...b,
        velocity: (point) => ({
          x: -omega * (point.y - b.a.y),
          y: omega * (point.x - b.a.x),
        }),
      },
      { a: { x: 0, y: 0.45 }, b: { x: 20, y: 0.45 } },
      { a: { x: g.left, y: g.bottom }, b: { x: g.left, y: g.top } },
      { a: { x: g.right, y: g.bottom }, b: { x: g.right, y: g.top } },
      { a: { x: g.left, y: g.bottom }, b: { x: g.right, y: g.bottom } },
    ];
  const before = advanceSeed(o.seed, seedSegments, w.gravity, dt, integrate);
  o.maxSeedStep = Math.max(
    o.maxSeedStep,
    Math.hypot(o.seed.x - before.x, o.seed.y - before.y),
  );
  if (!o.won && topEntry(o.seed, before, o.seed, g)) {
    o.won = true;
    o.events.push({
      time: w.time,
      event: "seed-entered-top",
      x: o.seed.x,
      y: o.seed.y,
    });
  }
  if (oldOverflow === 0 && mass(o.overflow) > 0)
    o.events.push({ time: w.time, event: "cistern-overflow" });
  if (oldBucket < 1e-6 && mass(o.bucket) >= 1e-6)
    o.events.push({
      time: w.time,
      event: "bucket-captured",
      mass: mass(o.bucket),
    });
  if (oldq === 0 && o.drum.q > 0)
    o.events.push({
      time: w.time,
      event: "bucket-descending",
      load: mass(o.bucket),
    });
  if (o.events.length > 24) o.events.splice(0, o.events.length - 24);
  o.maxPackets = Math.max(o.maxPackets, o.parcels.length);
}
