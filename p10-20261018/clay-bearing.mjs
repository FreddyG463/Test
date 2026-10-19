// Deformable 2D beam reference: finite nodal mass, axial/bending energy,
// finite original contact springs and dynamic circle impulses. No level rules.
import {
  mass,
  volume,
  MIXTURE,
  concentration,
  adhesionLimit,
} from "./mixture.mjs";
import {
  thickness,
  depositClayHeat,
  wetClay,
  stepClayThermal,
  CLAY,
} from "./clay.mjs";

export const BEARING = Object.freeze({
  nodes: 9,
  substeps: 16,
  wetAxial: 100,
  firedAxial: 4000,
  wetBending: 180,
  firedBending: 12000,
  damping: 0.4,
  anchorStiffness: 4000,
  anchorDamping: 12,
  anchorTravel: 0.035,
  friction: 0.35,
});
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const turn = (a, b, c) =>
  Math.atan2(
    (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x),
    (b.x - a.x) * (c.x - b.x) + (b.y - a.y) * (c.y - b.y),
  );
function projection(point, a, b) {
  const dx = b.x - a.x,
    dy = b.y - a.y,
    t = clamp(
      ((point.x - a.x) * dx + (point.y - a.y) * dy) /
        Math.max(1e-12, dx * dx + dy * dy),
      0,
      1,
    );
  return { t, x: a.x + t * dx, y: a.y + t * dy };
}
export function createBearing(p, { distributedContacts = false } = {}) {
  const nodes = Array.from({ length: BEARING.nodes }, (_, i) => {
    const s = p.length * (i / (BEARING.nodes - 1) - 0.5);
    return {
      x: p.x + s * Math.cos(p.angle),
      y: p.y + s * Math.sin(p.angle),
      vx: 0,
      vy: 0,
    };
  });
  // Only the original overlapping ledges may constrain the material. An
  // interior single contact cannot stand in for two opposing end supports.
  const anchors = [];
  for (const s of p.anchors) {
    if (
      p.material === "fired-clay" &&
      !p.curedAnchors.some((a) => a.id === s.id)
    )
      continue;
    let best = null;
    const along = (v) =>
        (v.x - p.x) * Math.cos(p.angle) + (v.y - p.y) * Math.sin(p.angle),
      left = Math.max(-p.length / 2, Math.min(along(s.a), along(s.b))),
      right = Math.min(p.length / 2, Math.max(along(s.a), along(s.b))),
      contactLength = Math.max(0, right - left);
    for (let i = 0; i < nodes.length; i++) {
      const q = projection(nodes[i], s.a, s.b),
        d = Math.hypot(q.x - nodes[i].x, q.y - nodes[i].y);
      if (
        d <= thickness(p) / 2 &&
        (best === null ||
          Math.abs(i - (nodes.length - 1) / 2) >
            Math.abs(best - (nodes.length - 1) / 2))
      )
        best = i;
    }
    if (distributedContacts) {
      const spacing = p.length / (nodes.length - 1);
      for (let i = 0; i < nodes.length; i++) {
        const t = along(nodes[i]),
          length = Math.max(
            0,
            Math.min(right, t + spacing / 2) - Math.max(left, t - spacing / 2),
          );
        if (length > 1e-9)
          anchors.push({
            id: s.id,
            node: i,
            x: nodes[i].x,
            y: nodes[i].y,
            length,
            broken: false,
            peakForce: 0,
          });
      }
    } else if (best !== null && !anchors.some((a) => a.node === best))
      anchors.push({
        id: s.id,
        node: best,
        x: nodes[best].x,
        y: nodes[best].y,
        length: contactLength,
        broken: false,
        peakForce: 0,
      });
  }
  return {
    patch: p,
    nodes,
    rest: structuredClone(nodes),
    anchors,
    referenceMaterial: p.material,
    restLengths: nodes
      .slice(1)
      .map((v, i) => Math.hypot(v.x - nodes[i].x, v.y - nodes[i].y)),
    curvatures: nodes.slice(1, -1).map((v, i) => ({
      x: nodes[i].x - 2 * v.x + nodes[i + 2].x,
      y: nodes[i].y - 2 * v.y + nodes[i + 2].y,
    })),
    restAngles: nodes
      .slice(1, -1)
      .map((v, i) => turn(nodes[i], v, nodes[i + 2])),
    restLength: p.length / (nodes.length - 1),
    brokenEdges: [],
    time: 0,
    peakSag: 0,
    peakContactForce: 0,
    contactImpulse: 0,
    dampingLoss: 0,
    frictionLoss: 0,
    impactLoss: 0,
    stabilizationWork: 0,
    iterations: 0,
  };
}
function properties(b) {
  const fired = b.patch.material === "fired-clay",
    c = concentration(b.patch);
  return {
    axial: fired ? BEARING.firedAxial : BEARING.wetAxial * c * c,
    bending: fired ? BEARING.firedBending : BEARING.wetBending * c * c,
  };
}
function contacts(b, body, dt) {
  const n = b.nodes,
    invNode = n.length / mass(b.patch),
    invBody = 1 / body.mass,
    radius = body.radius + bearingThickness(b) / 2;
  for (let i = 0; i < n.length - 1; i++) {
    if (b.brokenEdges.includes(i)) continue;
    const a = n[i],
      z = n[i + 1],
      q = projection(body, a, z),
      dx = body.x - q.x,
      dy = body.y - q.y,
      d = Math.hypot(dx, dy);
    if (d >= radius || d < 1e-10) continue;
    const nx = dx / d,
      ny = dy / d,
      wa = 1 - q.t,
      wz = q.t,
      inv = invBody + (wa * wa + wz * wz) * invNode,
      vx = wa * a.vx + wz * z.vx,
      vy = wa * a.vy + wz * z.vy,
      vn = (body.vx - vx) * nx + (body.vy - vy) * ny,
      j = Math.max(0, (-vn + (0.15 * (radius - d)) / dt) / inv);
    const work = j * vn + 0.5 * j * j * inv;
    b.impactLoss += Math.max(0, -work);
    b.stabilizationWork += Math.max(0, work);
    body.vx += j * nx * invBody;
    body.vy += j * ny * invBody;
    a.vx -= j * nx * wa * invNode;
    a.vy -= j * ny * wa * invNode;
    z.vx -= j * nx * wz * invNode;
    z.vy -= j * ny * wz * invNode;
    b.contactImpulse += j;
    b.peakContactForce = Math.max(b.peakContactForce, j / dt);
    // Tangential impulse includes sphere inertia (I=2/5 mr²). Rolling friction
    // therefore exchanges translational and angular momentum, without a drive.
    const tx = -ny,
      ty = nx,
      vt = (body.vx - vx) * tx + (body.vy - vy) * ty - body.omega * body.radius,
      invInertia = 1 / (0.4 * body.mass * body.radius ** 2),
      jt = clamp(
        -vt / (inv + body.radius ** 2 * invInertia),
        -BEARING.friction * j,
        BEARING.friction * j,
      );
    body.vx += jt * tx * invBody;
    body.vy += jt * ty * invBody;
    body.omega -= jt * body.radius * invInertia;
    a.vx -= jt * tx * wa * invNode;
    a.vy -= jt * ty * wa * invNode;
    z.vx -= jt * tx * wz * invNode;
    z.vy -= jt * ty * wz * invNode;
    b.frictionLoss += Math.max(
      0,
      -jt * vt - 0.5 * jt * jt * (inv + body.radius ** 2 * invInertia),
    );
  }
}
function terrainContact(body, s) {
  const q = projection(body, s.a, s.b),
    dx = body.x - q.x,
    dy = body.y - q.y,
    d = Math.hypot(dx, dy);
  if (d >= body.radius || d < 1e-12) return;
  const nx = dx / d,
    ny = dy / d,
    vn = body.vx * nx + body.vy * ny,
    j = Math.max(0, -vn * body.mass);
  body.x += nx * (body.radius - d);
  body.y += ny * (body.radius - d);
  body.vx += (j * nx) / body.mass;
  body.vy += (j * ny) / body.mass;
  const tx = -ny,
    ty = nx,
    vt = body.vx * tx + body.vy * ty - body.omega * body.radius,
    jt = clamp(
      (-vt * body.mass) / 3.5,
      -BEARING.friction * j,
      BEARING.friction * j,
    );
  body.vx += (jt * tx) / body.mass;
  body.vy += (jt * ty) / body.mass;
  body.omega -= jt / (0.4 * body.mass * body.radius);
}
export function stepFreeCircles(bodies, dt, gravity, terrain = []) {
  const h = dt / BEARING.substeps;
  for (let i = 0; i < BEARING.substeps; i++)
    for (const b of bodies) {
      b.omega ??= 0;
      b.angle ??= 0;
      b.vy -= gravity * h;
      b.x += b.vx * h;
      b.y += b.vy * h;
      for (const s of terrain) terrainContact(b, s);
      b.angle += b.omega * h;
    }
}
export function stepBearing(
  b,
  bodies,
  dt = 1 / 120,
  gravity = 9.81,
  terrain = [],
) {
  if (!Number.isFinite(dt) || dt < 0 || dt > 1 / 60)
    throw new RangeError("Bearing dt must be 0..1/60");
  if (!Number.isFinite(gravity) || gravity < 0)
    throw new RangeError("Invalid gravity");
  for (const body of bodies) {
    if (
      !(body.mass > 0) ||
      !(body.radius > 0) ||
      ![body.x, body.y, body.vx, body.vy, body.mass, body.radius].every(
        Number.isFinite,
      )
    )
      throw new RangeError("Invalid dynamic circle");
    body.omega ??= 0;
    body.angle ??= 0;
  }
  if (!dt) return;
  if (b.referenceMaterial !== b.patch.material) {
    // Firing locks the shape actually reached, not an original straight bridge.
    b.restLengths = b.nodes
      .slice(1)
      .map((v, i) => Math.hypot(v.x - b.nodes[i].x, v.y - b.nodes[i].y));
    b.curvatures = b.nodes.slice(1, -1).map((v, i) => ({
      x: b.nodes[i].x - 2 * v.x + b.nodes[i + 2].x,
      y: b.nodes[i].y - 2 * v.y + b.nodes[i + 2].y,
    }));
    b.restAngles = b.nodes
      .slice(1, -1)
      .map((v, i) => turn(b.nodes[i], v, b.nodes[i + 2]));
    b.referenceMaterial = b.patch.material;
  }
  const h = dt / BEARING.substeps,
    n = b.nodes,
    nodeMass = mass(b.patch) / n.length,
    prop = properties(b);
  for (let sub = 0; sub < BEARING.substeps; sub++) {
    const f = n.map((v) => ({
      x: -BEARING.damping * v.vx,
      y: -nodeMass * gravity - BEARING.damping * v.vy,
    }));
    for (let i = 0; i < n.length - 1; i++) {
      if (b.brokenEdges.includes(i)) continue;
      const dx = n[i + 1].x - n[i].x,
        dy = n[i + 1].y - n[i].y,
        L = Math.hypot(dx, dy);
      const force = prop.axial * (L - b.restLengths[i]),
        fx = (force * dx) / Math.max(L, 1e-12),
        fy = (force * dy) / Math.max(L, 1e-12);
      f[i].x += fx;
      f[i].y += fy;
      f[i + 1].x -= fx;
      f[i + 1].y -= fy;
    }
    for (let i = 1; i < n.length - 1; i++) {
      if (b.brokenEdges.includes(i - 1) || b.brokenEdges.includes(i)) continue;
      const a = n[i - 1],
        v = n[i],
        z = n[i + 1],
        dx = v.x - a.x,
        dy = v.y - a.y,
        ex = z.x - v.x,
        ey = z.y - v.y,
        l1 = Math.max(1e-12, dx * dx + dy * dy),
        l2 = Math.max(1e-12, ex * ex + ey * ey),
        ga = { x: -dy / l1, y: dx / l1 },
        gz = { x: -ey / l2, y: ex / l2 },
        delta = turn(a, v, z) - b.restAngles[i - 1],
        moment =
          prop.bending *
          b.restLength ** 2 *
          Math.atan2(Math.sin(delta), Math.cos(delta));
      f[i - 1].x -= moment * ga.x;
      f[i - 1].y -= moment * ga.y;
      f[i].x += moment * (ga.x + gz.x);
      f[i].y += moment * (ga.y + gz.y);
      f[i + 1].x -= moment * gz.x;
      f[i + 1].y -= moment * gz.y;
    }
    for (const a of b.anchors) {
      if (a.broken) continue;
      const v = n[a.node],
        dx = a.x - v.x,
        dy = a.y - v.y,
        extension = Math.hypot(dx, dy);
      if (extension > BEARING.anchorTravel) {
        a.broken = true;
        continue;
      }
      const fx = BEARING.anchorStiffness * dx - BEARING.anchorDamping * v.vx,
        fy = BEARING.anchorStiffness * dy - BEARING.anchorDamping * v.vy,
        requested = Math.hypot(fx, fy),
        limit = adhesionLimit(b.patch, a.length),
        scale = Math.min(1, limit / Math.max(1e-12, requested));
      f[a.node].x += fx * scale;
      f[a.node].y += fy * scale;
      a.peakForce = Math.max(a.peakForce, requested * scale);
    }
    for (let i = 0; i < n.length; i++) {
      const v = n[i];
      b.dampingLoss += BEARING.damping * (v.vx * v.vx + v.vy * v.vy) * h;
      v.vx += (f[i].x / nodeMass) * h;
      v.vy += (f[i].y / nodeMass) * h;
      v.x += v.vx * h;
      v.y += v.vy * h;
      b.peakSag = Math.max(b.peakSag, b.rest[i].y - v.y);
    }
    for (const body of bodies) {
      body.vy -= gravity * h;
      body.x += body.vx * h;
      body.y += body.vy * h;
    }
    for (const body of bodies) {
      contacts(b, body, h);
      for (const s of terrain) terrainContact(body, s);
      body.angle += body.omega * h;
    }
    b.iterations++;
  }
  b.time += dt;
}

export function bearingSegments(b) {
  return b.nodes
    .slice(0, -1)
    .flatMap((a, i) =>
      b.brokenEdges.includes(i) ? [] : [{ a, b: b.nodes[i + 1] }],
    );
}
export function bearingThickness(b) {
  const length = b.nodes
    .slice(1)
    .reduce(
      (sum, v, i) => sum + Math.hypot(v.x - b.nodes[i].x, v.y - b.nodes[i].y),
      0,
    );
  return volume(b.patch) / (Math.max(1e-12, length) * MIXTURE.depthScale);
}

export function bearingContact(b, point, radius = 0) {
  if (
    !Number.isFinite(radius) ||
    radius < 0 ||
    ![point.x, point.y].every(Number.isFinite)
  )
    throw new RangeError("Invalid contact geometry");
  return bearingSegments(b).some((s) => {
    const q = projection(point, s.a, s.b);
    return (
      Math.hypot(point.x - q.x, point.y - q.y) <=
      bearingThickness(b) / 2 + radius
    );
  });
}
export function heatBearing(b, point, energy, radius = 0) {
  if (!Number.isFinite(energy) || energy < 0 || energy > CLAY.standardFire)
    throw new RangeError("Invalid Fire payload");
  if (!bearingContact(b, point, radius)) return 0;
  return depositClayHeat(b.patch, { x: b.patch.x, y: b.patch.y }, energy);
}
export function wetBearing(b, point, water, radius = 0) {
  if (!Number.isFinite(water) || water < 0)
    throw new RangeError("Invalid Water payload");
  if (!bearingContact(b, point, radius)) return 0;
  return wetClay(b.patch, { x: b.patch.x, y: b.patch.y }, water);
}
export function stepBearingThermal(b, dt) {
  // Detachment is permanent: curing cannot recreate a torn original bond.
  b.patch.anchors = b.patch.anchors.filter((s) =>
    b.anchors.some((a) => a.id === s.id && !a.broken),
  );
  stepClayThermal(b.patch, dt);
}
