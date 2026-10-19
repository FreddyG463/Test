import { circleSegment } from "./puzzle.mjs";
// The union of actual circle/box cross-sections at a feeder plane.
export function apertureFraction(a, solids) {
  const spans = [];
  for (const b of solids) {
    let left, right;
    if (b.radius != null) {
      const dy = Math.abs(b.y - a.y);
      if (dy >= b.radius) continue;
      const dx = Math.sqrt(b.radius * b.radius - dy * dy);
      left = b.x - dx;
      right = b.x + dx;
    } else {
      if (a.y < b.y || a.y > b.y + b.h) continue;
      left = b.x;
      right = b.x + b.w;
    }
    left = Math.max(a.x, left);
    right = Math.min(a.x + a.w, right);
    if (right > left) spans.push([left, right]);
  }
  spans.sort((a, b) => a[0] - b[0]);
  let covered = 0,
    end = -Infinity;
  for (const [l, r] of spans) {
    covered += Math.max(0, r - Math.max(l, end));
    end = Math.max(end, r);
  }
  return Math.max(0, 1 - covered / a.w);
}
export function stepSolid(b, segments, boxes, dt, gravity, integrate, sweep) {
  const before = { x: b.x, y: b.y };
  integrate(b, gravity, dt);
  let touched = false;
  for (const box of boxes) {
    const u = sweep(before, b, box, b.radius);
    if (u === null || u < 1e-9) continue;
    b.x = before.x + (b.x - before.x) * u;
    b.y = before.y + (b.y - before.y) * u;
    const x = Math.max(box.x, Math.min(box.x + box.w, b.x)),
      y = Math.max(box.y, Math.min(box.y + box.h, b.y));
    const d = Math.hypot(b.x - x, b.y - y);
    if (d > 1e-9) {
      const nx = (b.x - x) / d,
        ny = (b.y - y) / d,
        into = (b.vx - (box.vx ?? 0)) * nx + (b.vy - (box.vy ?? 0)) * ny;
      if (into < 0) {
        b.vx -= into * nx;
        b.vy -= into * ny;
      }
    }
    touched = true;
  }
  for (let i = 0; i < 6; i++) {
    for (const s of segments) touched = circleSegment(b, s.a, s.b) || touched;
    for (const box of boxes) touched = circleBox(b, box) || touched;
  }
  if (touched) {
    b.vx *= Math.exp(-10 * dt);
    b.vy *= Math.exp(-10 * dt);
  }
  b.trail.push(before);
  if (b.trail.length > 100) b.trail.shift();
  return Math.hypot(b.x - before.x, b.y - before.y);
}
export function magneticForce(weight, pole, powered) {
  const gap = pole.y - (weight.y + weight.radius);
  if (
    !powered ||
    weight.material !== "metal" ||
    Math.abs(weight.x - pole.x) > pole.w / 2 ||
    gap < -0.001 ||
    gap > pole.range
  )
    return 0;
  return pole.maxForce / (1 + (Math.max(0, gap) / 0.3) ** 2);
}
export function stepPulley(p, force, dt, g) {
  const total = p.weightMass + p.gateMass,
    net = (p.weightMass - p.gateMass) * g - force;
  const resistance = p.friction * Math.sign(p.velocity || net),
    acceleration = (net - resistance) / total;
  const old = p.q;
  let next = old + p.velocity * dt + 0.5 * acceleration * dt * dt,
    velocity = p.velocity + acceleration * dt;
  next = Math.max(0, Math.min(p.travel, next));
  if (next === 0 || next === p.travel) velocity = 0;
  p.q = next;
  p.velocity = velocity;
  p.force = force;
  p.magnetWork -= force * (next - old);
  p.frictionWork += p.friction * Math.abs(next - old);
  return next - old;
}

// Static box contact also resolves an already touching body (sweep entry=0).
export function circleBox(b, box) {
  const x = Math.max(box.x, Math.min(box.x + box.w, b.x));
  const y = Math.max(box.y, Math.min(box.y + box.h, b.y));
  const dx = b.x - x,
    dy = b.y - y,
    d = Math.hypot(dx, dy);
  if (d >= b.radius) return false;
  let nx, ny, depth;
  if (d > 1e-12) {
    nx = dx / d;
    ny = dy / d;
    depth = b.radius - d;
  } else {
    const face = [
      { gap: b.x - box.x, nx: -1, ny: 0 },
      { gap: box.x + box.w - b.x, nx: 1, ny: 0 },
      { gap: b.y - box.y, nx: 0, ny: -1 },
      { gap: box.y + box.h - b.y, nx: 0, ny: 1 },
    ].sort((a, b) => a.gap - b.gap)[0];
    ({ nx, ny } = face);
    depth = b.radius + face.gap;
  }
  b.x += nx * depth;
  b.y += ny * depth;
  const into = (b.vx - (box.vx ?? 0)) * nx + (b.vy - (box.vy ?? 0)) * ny;
  if (into < 0) {
    b.vx -= into * nx;
    b.vy -= into * ny;
  }
  return true;
}

// Bucket descends while a constant-radius drum lowers a hinged bridge.
// Derived from gravitational potential and both translational/rotational inertia.
export function stepLoadedDrum(p, dt, g) {
  const theta = p.initialAngle - p.q / p.radius;
  const inertia =
    p.bucketMass +
    p.counterMass +
    (p.bridgeMass * p.length ** 2) / (3 * p.radius ** 2);
  const drive =
    (p.bucketMass - p.counterMass) * g +
    ((p.bridgeMass * g * p.length) / (2 * p.radius)) * Math.cos(theta);
  if (Math.abs(p.velocity) < 1e-10 && Math.abs(drive) <= p.friction) {
    p.velocity = 0;
    p.drive = drive;
    return 0;
  }
  const friction = p.friction * Math.sign(p.velocity || drive),
    acceleration = (drive - friction) / inertia;
  const old = p.q;
  p.q = Math.max(
    0,
    Math.min(p.travel, p.q + p.velocity * dt + 0.5 * acceleration * dt * dt),
  );
  p.velocity =
    p.q === 0 || p.q === p.travel ? 0 : p.velocity + acceleration * dt;
  p.drive = drive;
  return p.q - old;
}
