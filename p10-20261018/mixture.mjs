// Finite 2D-equivalent water/sediment columns and smooth cohesive material law.
// Masses are kg*, water density1, sediment density2.5. No species/level branches.
export const MIXTURE = Object.freeze({
  waterDensity: 1,
  sedimentDensity: 2.5,
  depthScale: 1 / 4.2,
  yieldScale: 12,
  adhesionScale: 24,
  mixingRate: 10,
  conductance: 0.8,
});
export const volume = (m) =>
  m.water / MIXTURE.waterDensity + m.sediment / MIXTURE.sedimentDensity;
export const mass = (m) => m.water + m.sediment;
export const concentration = (m) => (mass(m) > 0 ? m.sediment / mass(m) : 0);
export const yieldStress = (m) => MIXTURE.yieldScale * concentration(m) ** 2;
export const adhesionLimit = (m, contactLength) =>
  MIXTURE.adhesionScale * concentration(m) ** 2 * Math.max(0, contactLength);
export function take(m, q) {
  const v = volume(m),
    f = v > 0 ? Math.min(1, Math.max(0, q / v)) : 0;
  const out = { water: m.water * f, sediment: m.sediment * f };
  m.water -= out.water;
  m.sediment -= out.sediment;
  return out;
}
export function add(a, b) {
  a.water += b.water;
  a.sediment += b.sediment;
}
function rootPrimitive(x, r) {
  x = Math.max(-r, Math.min(r, x));
  return (
    0.5 * (x * Math.sqrt(Math.max(0, r * r - x * x)) + r * r * Math.asin(x / r))
  );
}
// Exact circle area below h clipped by horizontal x bounds. Handles partial entry.
export function circleBelow(b, h, left = -Infinity, right = Infinity) {
  const r = b.radius,
    L = Math.max(-r, left - b.x),
    R = Math.min(r, right - b.x),
    s = h - b.y;
  if (R <= L || s <= -r) return 0;
  const F = (x) => rootPrimitive(x, r),
    full = 2 * (F(R) - F(L));
  if (s >= r) return full;
  const edge = Math.sqrt(Math.max(0, r * r - s * s)),
    a = Math.max(L, -edge),
    z = Math.min(R, edge);
  if (z <= a) return s < 0 ? 0 : full;
  const cap = F(z) - F(a) + Math.abs(s) * (-z + a);
  return s < 0 ? cap : full - cap;
}
export function occupied(node, h, solids = []) {
  return solids.reduce(
    (v, s) =>
      v +
      Math.max(
        0,
        circleBelow(s, h, node.x, node.x + node.w) -
          circleBelow(s, node.base, node.x, node.x + node.w),
      ) *
        MIXTURE.depthScale,
    0,
  );
}
export function freeCapacity(n, h, solids = []) {
  return Math.max(
    0,
    (h - n.base) * n.w * MIXTURE.depthScale - occupied(n, h, solids),
  );
}
export function height(n, solids = []) {
  const v = volume(n);
  if (v <= 0) return n.base;
  if (!solids.some((s) => s.x + s.radius > n.x && s.x - s.radius < n.x + n.w))
    return n.base + v / (n.w * MIXTURE.depthScale);
  let lo = n.base,
    hi =
      n.base +
      (v +
        solids.reduce(
          (a, s) => a + Math.PI * s.radius * s.radius * MIXTURE.depthScale,
          0,
        )) /
        (n.w * MIXTURE.depthScale) +
      1;
  for (let i = 0; i < 32; i++) {
    const mid = (lo + hi) / 2;
    if (freeCapacity(n, mid, solids) > v) hi = mid;
    else lo = mid;
  }
  return (lo + hi) / 2;
}
export function columns(left, right, base, water = 0, count = 12) {
  return Array.from({ length: count }, (_, i) => ({
    x: left + (i * (right - left)) / count,
    w: (right - left) / count,
    base:
      typeof base === "function"
        ? base(left + (i * (right - left)) / count)
        : base,
    water: water / count,
    sediment: 0,
  }));
}
// Simultaneous conservative face exchange; mixtures only exchange at wet contact.
export function stepChannel(nodes, dt, g, solids = [], options = {}) {
  const levels = nodes.map((n) => height(n, solids)),
    v = nodes.map(volume),
    d = nodes.map(() => ({ water: 0, sediment: 0 }));
  const exchanges = [],
    out = nodes.map(() => 0),
    flows = [];
  for (let i = 0; i < nodes.length - 1; i++) {
    const a = nodes[i],
      b = nodes[i + 1];
    if (Math.abs(a.x + a.w - b.x) > 1e-7) continue;
    const high = levels[i] >= levels[i + 1] ? i : i + 1,
      low = high === i ? i + 1 : i;
    const gap = Math.abs(levels[i] - levels[i + 1]),
      depth = Math.max(0, levels[high] - Math.max(a.base, b.base));
    if (depth <= 0) continue;
    const rho = mass(nodes[high]) / Math.max(1e-12, v[high]),
      stress = (rho * g * depth * gap) / ((a.w + b.w) / 2),
      resistance = yieldStress(nodes[high]);
    const q = Math.min(
      v[high],
      gap * Math.min(a.w, b.w) * MIXTURE.depthScale * 0.2,
      (options.conductance ?? MIXTURE.conductance) *
        Math.max(0, stress - resistance) *
        dt,
    );
    if (q > 0) {
      flows.push({ from: high, to: low, q });
      out[high] += q;
    }
    if (
      v[i] > 0 &&
      v[i + 1] > 0 &&
      Math.min(levels[i], levels[i + 1]) > Math.max(a.base, b.base)
    )
      exchanges.push([
        i,
        i + 1,
        Math.min(v[i], v[i + 1]) *
          0.5 *
          (1 - Math.exp(-(options.mixingRate ?? MIXTURE.mixingRate) * dt)),
      ]);
  }
  for (const { from, to, q } of flows) {
    const f = q / Math.max(v[from], out[from]),
      a = nodes[from];
    const w = a.water * f,
      s = a.sediment * f;
    d[from].water -= w;
    d[from].sediment -= s;
    d[to].water += w;
    d[to].sediment += s;
  }
  // Mixing is symmetric volume exchange from the remaining pre-step composition.
  for (const [i, j, q] of exchanges) {
    const f = (q / Math.max(v[i], 1e-12)) * 0.25,
      h = (q / Math.max(v[j], 1e-12)) * 0.25;
    const w = nodes[i].water * f - nodes[j].water * h,
      s = nodes[i].sediment * f - nodes[j].sediment * h;
    d[i].water -= w;
    d[j].water += w;
    d[i].sediment -= s;
    d[j].sediment += s;
  }
  // Bound advection+diffusion together to avoid overdraw from shared faces.
  let scale = 1;
  for (let i = 0; i < nodes.length; i++)
    for (const key of ["water", "sediment"])
      if (d[i][key] < 0) scale = Math.min(scale, nodes[i][key] / -d[i][key]);
  for (let i = 0; i < nodes.length; i++) {
    nodes[i].water += d[i].water * scale;
    nodes[i].sediment += d[i].sediment * scale;
  }
  return levels;
}
// A contacting cohesive patch carries its own mass and a finite supported load.
// Positive slip is along the contacted wall/down-slope; Coulomb-style yield.
export function stepAdhesion(p, dt, g) {
  const drive = (mass(p) + p.load) * g * Math.sin(p.angle),
    limit = p.contact
      ? adhesionLimit(p, Math.max(0, p.contactLength - p.slip))
      : 0;
  const force = Math.max(0, drive - limit),
    a = force / Math.max(1e-12, mass(p) + p.load);
  p.slip += p.velocity * dt + 0.5 * a * dt * dt;
  p.velocity += a * dt;
  p.force = limit;
  p.drive = drive;
  return force;
}
export function stepSlope(p, dt, g, angle, depth, externalForce = 0) {
  const m = mass(p),
    drive = m * g * Math.sin(angle) + externalForce,
    limit = yieldStress(p) * Math.max(0, volume(p) / Math.max(depth, 1e-9));
  const sign = Math.sign(p.velocity || drive),
    net = drive - sign * limit;
  if (Math.abs(p.velocity) < 1e-10 && Math.abs(drive) <= limit) {
    p.velocity = 0;
    return 0;
  }
  const next = p.velocity + (net / Math.max(m, 1e-12)) * dt;
  p.velocity = p.velocity * next < 0 && Math.abs(drive) <= limit ? 0 : next;
  p.distance += p.velocity * dt;
  return p.velocity;
}

// Independent wall fixture: a real falling circle can rest on the cohesive ledge.
// Its gravitational load enters adhesion only while actual footprint/contact holds.
export function stepWallSupport(rig, dt, g) {
  const p = rig.patch,
    b = rig.body,
    top = p.y - p.slip + p.contactLength / 2;
  const before = b.y - b.radius;
  b.y += b.vy * dt - 0.5 * g * dt * dt;
  b.vy -= g * dt;
  const bounds = wallPatchBounds(p);
  const contact =
    p.contact &&
    b.x - b.radius >= bounds.x &&
    b.x + b.radius <= bounds.x + bounds.w &&
    before >= top - 1e-6 &&
    b.y - b.radius <= top;
  p.load = contact ? b.mass : 0;
  stepAdhesion(p, dt, g);
  if (p.slip >= p.contactLength) p.contact = false;
  if (contact && p.contact) {
    b.y = p.y - p.slip + p.contactLength / 2 + b.radius;
    b.vy = -p.velocity;
  }
  rig.supported = contact && p.contact;
  return rig.supported;
}

export function wallPatchBounds(p) {
  const width = volume(p) / (p.contactLength * MIXTURE.depthScale);
  return {
    x: p.x + ((p.normalX ?? -1) < 0 ? -width : 0),
    y: p.y - p.slip - p.contactLength / 2,
    w: width,
    h: p.contactLength,
  };
}
