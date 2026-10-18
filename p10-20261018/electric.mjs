// Contact graph and source lifetimes, independent of levels, DOM and graphics.
export const CONDUCTIVITY = Object.freeze({
  metal: 1,
  water: 1,
  stone: 0,
  rope: 0,
});
export function contact(a, b) {
  if (a.radius != null && b.radius != null)
    return Math.hypot(a.x - b.x, a.y - b.y) < a.radius + b.radius - 1e-7;
  if (a.radius != null || b.radius != null) {
    const c = a.radius != null ? a : b,
      r = a.radius != null ? b : a;
    const x = Math.max(r.x, Math.min(r.x + r.w, c.x)),
      y = Math.max(r.y, Math.min(r.y + r.h, c.y));
    return Math.hypot(c.x - x, c.y - y) < c.radius - 1e-7;
  }
  if (a.material === "water" && b.material === "water")
    return (
      Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) >= -1e-9 &&
      Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > 1e-7
    );
  const e = a.material === "water" || b.material === "water" ? 1e-7 : -1e-9;
  return (
    Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > e &&
    Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > e
  );
}
export function graph(bodies, links = []) {
  const nodes = bodies.filter((b) => (CONDUCTIVITY[b.material] ?? 0) > 0),
    edges = [];
  for (let i = 0; i < nodes.length; i++)
    for (let j = i + 1; j < nodes.length; j++)
      if (contact(nodes[i], nodes[j])) edges.push([nodes[i].id, nodes[j].id]);
  for (const [a, b] of links)
    if (nodes.some((n) => n.id === a) && nodes.some((n) => n.id === b))
      edges.push([a, b]);
  return { nodes: nodes.map((n) => n.id), edges };
}
export function reachable(g, start) {
  const seen = new Set(g.nodes.includes(start) ? [start] : []),
    pending = [...seen];
  while (pending.length) {
    const id = pending.pop();
    for (const [a, b] of g.edges) {
      const next = a === id ? b : b === id ? a : null;
      if (next && !seen.has(next)) {
        seen.add(next);
        pending.push(next);
      }
    }
  }
  return [...seen].sort();
}
export function createElectric({
  generator = "output",
  receiver = "receiver",
  duration = 4,
} = {}) {
  return {
    generator,
    receiver,
    duration,
    generatorOn: false,
    pathConnected: false,
    receiverPowered: false,
    sustained: false,
    charge: 0,
    maxCharge: 0,
    opened: false,
    pulses: [],
    graph: { nodes: [], edges: [] },
    energized: [],
    interruptions: 0,
  };
}
export function electricImpact(e, target, species, time) {
  if (species === "Electric" && target.startPort) {
    e.generatorOn = true;
    return "generator-started";
  }
  if (
    ["Electric", "Thunder"].includes(species) &&
    (CONDUCTIVITY[target.material] ?? 0) > 0
  ) {
    e.pulses.push({
      node: target.electricId ?? target.id,
      until: time + 0.25,
      intensity: species === "Thunder" ? 4 : 1,
      ...(Number.isFinite(target.x) && Number.isFinite(target.y)
        ? {
            point: {
              x: target.x + (target.w ?? 0) / 2,
              y: target.y + (target.h ?? 0) / 2,
            },
          }
        : {}),
    });
    if (e.pulses.length > 12) e.pulses.shift();
    return "finite-pulse";
  }
  return "insulated-impact";
}
export function stepElectric(e, bodies, links, time, dt) {
  e.graph = graph(bodies, links);
  e.pulses = e.pulses.filter((p) => p.until > time);
  const path = reachable(e.graph, e.generator);
  e.pathConnected = path.includes(e.receiver);
  e.sustained = e.generatorOn && e.pathConnected;
  const powered = new Set(e.generatorOn ? path : []);
  for (const pulse of e.pulses)
    for (const id of reachable(e.graph, pulse.node)) powered.add(id);
  e.energized = [...powered].sort();
  const before = e.receiverPowered;
  e.receiverPowered = powered.has(e.receiver);
  if (e.receiverPowered)
    e.charge = before ? Math.min(e.duration, e.charge + dt) : 0;
  else {
    if (before && e.charge > 0) e.interruptions++;
    e.charge = 0;
  }
  e.maxCharge = Math.max(e.maxCharge, e.charge);
  if (e.charge >= e.duration - 1e-9) e.opened = true;
}
