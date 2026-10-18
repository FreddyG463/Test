// Generic circle/capsule sweeps and finite-mass one-axis mechanical sliders.
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export function closest(p, s) {
  const dx = s.b.x - s.a.x,
    dy = s.b.y - s.a.y,
    u = clamp(
      ((p.x - s.a.x) * dx + (p.y - s.a.y) * dy) /
        Math.max(1e-12, dx * dx + dy * dy),
      0,
      1,
    );
  return { x: s.a.x + u * dx, y: s.a.y + u * dy };
}
export function sweepSegment(a, b, s, r) {
  const q = closest(a, s);
  if (Math.hypot(a.x - q.x, a.y - q.y) <= r) return 0;
  const vx = b.x - a.x,
    vy = b.y - a.y,
    L = Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y),
    hits = [];
  for (const c of [s.a, s.b]) {
    const x = a.x - c.x,
      y = a.y - c.y,
      A = vx * vx + vy * vy,
      B = 2 * (x * vx + y * vy),
      C = x * x + y * y - r * r,
      D = B * B - 4 * A * C;
    if (A > 0 && D >= 0) {
      const t = (-B - Math.sqrt(D)) / (2 * A);
      if (t >= 0 && t <= 1) hits.push(t);
    }
  }
  if (L > 0) {
    const tx = (s.b.x - s.a.x) / L,
      ty = (s.b.y - s.a.y) / L,
      nx = -ty,
      ny = tx,
      d = (a.x - s.a.x) * nx + (a.y - s.a.y) * ny,
      v = vx * nx + vy * ny;
    if (Math.abs(v) > 1e-12)
      for (const sign of [-1, 1]) {
        const t = (sign * r - d) / v,
          u = (a.x + vx * t - s.a.x) * tx + (a.y + vy * t - s.a.y) * ty;
        if (t >= 0 && t <= 1 && u >= 0 && u <= L) hits.push(t);
      }
  }
  return hits.length ? Math.min(...hits) : null;
}
export function boxSegments(box) {
  const { x, y, w, h } = box,
    a = { x, y },
    b = { x: x + w, y },
    c = { x: x + w, y: y + h },
    d = { x, y: y + h };
  return [
    [a, b],
    [b, c],
    [c, d],
    [d, a],
  ].map(([a, b]) => ({ ...box, a, b }));
}
export function impulseSlider(s, body, n) {
  const dot = n.x * s.axis.x + n.y * s.axis.y,
    relative =
      (body.vx - s.velocity * s.axis.x) * n.x +
      (body.vy - s.velocity * s.axis.y) * n.y,
    j = Math.max(0, -relative / (1 / body.mass + (dot * dot) / s.mass));
  body.vx += (j * n.x) / body.mass;
  body.vy += (j * n.y) / body.mass;
  s.velocity -= (j * dot) / s.mass;
  s.impulse += j;
  s.peakImpulse = Math.max(s.peakImpulse, j);
  return j;
}
export function impulseBodies(a, b, n) {
  const vn = (a.vx - b.vx) * n.x + (a.vy - b.vy) * n.y,
    j = Math.max(0, -vn / (1 / a.mass + 1 / b.mass));
  a.vx += (j * n.x) / a.mass;
  a.vy += (j * n.y) / a.mass;
  b.vx -= (j * n.x) / b.mass;
  b.vy -= (j * n.y) / b.mass;
  return j;
}
export function contactSlider(s, body, segment) {
  const q = closest(body, segment),
    dx = body.x - q.x,
    dy = body.y - q.y,
    d = Math.hypot(dx, dy);
  if (d >= body.radius || d < 1e-12) return 0;
  const n = { x: dx / d, y: dy / d },
    j = impulseSlider(s, body, n);
  body.x += n.x * (body.radius - d);
  body.y += n.y * (body.radius - d);
  return j;
}
export function stepSlider(s, dt, force) {
  s.velocity += ((force - s.damping * s.velocity) / s.mass) * dt;
  s.q += s.velocity * dt;
  if (s.q <= s.floor) {
    s.q = s.floor;
    s.velocity = Math.max(0, s.velocity);
  }
  if (s.q >= s.travel) {
    s.q = s.travel;
    s.velocity = 0;
    if (s.ratchet) s.floor = s.travel;
  }
}
