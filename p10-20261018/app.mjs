import { drawClay } from "./clay-bridge-view.mjs";
import { mixClay, clayAvailable, clayBudget } from "./clay-bridge.mjs";
import { drawOverflow } from "./overflow-view.mjs";
import { mixOverflow, overflowAvailable, overflowBudget } from "./overflow.mjs";
import { height, concentration, volume } from "./mixture.mjs";
import { drawLast } from "./last-view.mjs";
import { mixLast, lastAvailable, lastBudget } from "./last-connection.mjs";
import { drawCircuit } from "./circuit-view.mjs";
import { mix, costAvailable, PAIRS } from "./circuit.mjs";
import { CONFIG, DT, createWorld, fire, step, forecast } from "./physics.mjs";
import {
  THERMAL,
  waterTemperature,
  pressure,
  energyBalance,
  contactActive,
  setBridge,
} from "./thermal.mjs";
import { drawThermal } from "./thermal-view.mjs";
import { drawPuzzle } from "./puzzle-view.mjs";
import { drawSurface } from "./surface-view.mjs";
import { waterBudget, surfaceEnergy, surfaceHeight } from "./surface-water.mjs";
const $ = (id) => document.getElementById(id);
// Deep-link directly to a preset, while preserving P02 as the ordinary default.
const requestedPreset = new URLSearchParams(window.location.search).get(
  "preset",
);
if (
  [
    "rope",
    "trajectory",
    "thermal",
    "water-boiler",
    "first-puzzle",
    "free-water",
    "broken-circuit",
    "last-connection",
    "overflow",
    "clay-bridge",
  ].includes(requestedPreset)
)
  $("preset").value = requestedPreset;
const canvas = $("scene"),
  ctx = canvas.getContext("2d");
let world = createWorld($("preset").value),
  paused = false,
  accumulator = 0,
  previous = 0;
let scale = 1,
  ox = 0,
  oy = 0;
let viewHeight = CONFIG.height;
const point = (x, y) => [ox + x * scale, oy + (viewHeight - y) * scale];
const colors = { rope: "#b39057", metal: "#71857b", stone: "#929783" };
const waterMode = () => ["water-boiler", "free-water"].includes(world.preset);

function text(value, x, y, color = "#61735a", size = 11, align = "center") {
  ctx.fillStyle = color;
  ctx.font = `600 ${size}px system-ui`;
  ctx.textAlign = align;
  ctx.fillText(value, ...point(x, y));
}
function line(points, color, width = 1, dash = []) {
  ctx.beginPath();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.setLineDash(dash);
  points.forEach((p, i) => {
    const q = point(p.x, p.y);
    i ? ctx.lineTo(...q) : ctx.moveTo(...q);
  });
  ctx.stroke();
  ctx.setLineDash([]);
}
function circle(x, y, r, color, stroke) {
  ctx.beginPath();
  ctx.arc(...point(x, y), r * scale, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 2;
    ctx.stroke();
  }
}
function rect(box, color) {
  ctx.fillStyle = color;
  const [x, y] = point(box.x, box.y + box.h);
  ctx.fillRect(x, y, box.w * scale, box.h * scale);
}
function draw() {
  const dpr = window.devicePixelRatio || 1;
  const width = canvas.clientWidth,
    height = canvas.clientHeight;
  if (
    canvas.width !== Math.round(width * dpr) ||
    canvas.height !== Math.round(height * dpr)
  ) {
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  viewHeight = world.surface ? 11 : CONFIG.height;
  scale = Math.min(width / CONFIG.width, height / viewHeight);
  ox = (width - CONFIG.width * scale) / 2;
  oy = (height - viewHeight * scale) / 2;
  // Quiet graph-paper world; all drawing uses simulation coordinates.
  for (let x = 0; x <= 20; x++)
    line(
      [
        { x, y: 0 },
        { x, y: 10 },
      ],
      "#e0e7d2",
    );
  for (let y = 0; y <= 10; y++)
    line(
      [
        { x: 0, y },
        { x: 20, y },
      ],
      "#e0e7d2",
    );
  rect({ x: 0, y: 0, w: 20, h: CONFIG.floor }, "#d2dcc0");
  line(
    [
      { x: 0, y: CONFIG.floor },
      { x: 20, y: CONFIG.floor },
    ],
    "#91a77b",
    2,
  );
  // Small grounded plants are decorative; no hidden target logic.
  for (const x of [0.7, 4.5, 5.1, 16.9, 18.8]) {
    line(
      [
        { x, y: 0.45 },
        { x: x - 0.12, y: 0.78 },
        { x: x + 0.03, y: 0.6 },
        { x: x + 0.23, y: 0.88 },
      ],
      "#91a77b",
      2,
    );
  }
  if (world.cable) {
    const c = world.cable,
      pin = CONFIG.pin,
      bay = CONFIG.bay;
    rect({ x: pin.x - 0.55, y: pin.y + 0.15, w: 1.1, h: 0.15 }, "#8d9a80");
    // One straight tension-only cable, not a simulated multi-segment chain.
    line([pin, c], "#586b5e", 3);
    circle(pin.x, pin.y, 0.12, "#edf0df", "#586b5e");
    rect(bay, c.landed ? "#8aab70" : "#a4b790");
    line(
      [
        { x: bay.x, y: bay.y + bay.h },
        { x: bay.x + bay.w, y: bay.y + bay.h },
      ],
      "#5f8050",
      3,
    );
    text(
      "LANDING BAY",
      bay.x + bay.w / 2,
      bay.y - 0.4,
      "#728465",
      Math.max(7, scale * 0.2),
    );
    circle(c.x, c.y, CONFIG.tipRadius, "#6b7e73", "#435e50");
    circle(c.x, c.y, 0.09, "#afbaa5");
    text("CABLE", 9.4, 7.95, "#71826a", Math.max(7, scale * 0.2));
  }
  if (world.clay) drawClay(world.clay, { rect, line, circle, text, scale });
  if (world.overflow)
    drawOverflow(world.overflow, { rect, line, circle, text, scale });
  if (world.last) drawLast(world.last, { rect, line, circle, text, scale });
  if (world.circuit)
    drawCircuit(world.circuit, { rect, line, circle, text, scale });
  if (world.puzzle) drawPuzzle(world, { rect, line, circle, text, scale });
  if (world.surface)
    drawSurface(world.surface, world.time, { rect, line, circle, text, scale });
  if (world.thermal && !world.puzzle)
    drawThermal(world.thermal, world.time, { rect, line, circle, text, scale });
  for (const t of world.targets) {
    if (world.circuit && t.material !== "rope") continue;
    if (world.surface && !t.thermal) continue;
    if (t.reservoir) continue;
    if (world.thermal && t.id.startsWith("boiler-")) continue;
    if (t.burned) {
      // Burnt remnants communicate release without needing the overlay.
      rect({ ...t, y: t.y + t.h - 0.22, h: 0.22 }, "#5b4a35");
      text(
        "BURNED",
        t.x + t.w / 2,
        t.y + t.h + 0.45,
        "#bb7047",
        Math.max(7, scale * 0.2),
      );
      continue;
    }
    rect(
      t,
      t.heat > 0.1 && (t.material === "rope" || t.thermal)
        ? "#db7a3c"
        : colors[t.material],
    );
    if (t.material === "rope") {
      for (let y = t.y; y < t.y + t.h; y += 0.22)
        line(
          [
            { x: t.x, y },
            { x: t.x + t.w, y: y + 0.16 },
          ],
          "#e6cb92",
          1,
        );
    } else {
      for (const y of [t.y + 0.22, t.y + t.h - 0.22])
        circle(t.x + t.w / 2, y, 0.045, "#bdc9b7");
    }
    text(
      t.thermal ? "HEAT PAD" : t.material.toUpperCase(),
      t.x + t.w / 2,
      t.y + t.h + 0.45,
      "#738267",
      Math.max(7, scale * 0.2),
    );
    if (t.heat > 0.05) {
      rect({ x: t.x - 0.25, y: t.y + t.h + 0.12, w: 0.8, h: 0.08 }, "#d7cbb0");
      rect(
        {
          x: t.x - 0.25,
          y: t.y + t.h + 0.12,
          w: 0.8 * Math.min(1, t.heat),
          h: 0.08,
        },
        "#df693b",
      );
    }
  }
  if ($("arc").checked) {
    const { points } = forecast(
      world,
      +$("angle").value,
      +$("speed").value,
      world.clay
        ? mixClay($("clay-a").value, $("clay-b").value)
        : world.overflow
          ? mixOverflow($("overflow-a").value, $("overflow-b").value)
          : world.last
            ? mixLast($("last-a").value, $("last-b").value)
            : "Fire",
    );
    line(points, "#bd9a5d", 1.5, [3, 6]);
    const end = points.at(-1);
    circle(end.x, end.y, 0.07, "#bf9d64");
  }
  // Fixed cannon with a rotating barrel.
  const a = (+$("angle").value * Math.PI) / 180,
    base = CONFIG.cannon;
  rect({ x: base.x - 0.5, y: 0.55, w: 1.1, h: 0.45 }, "#76895b");
  line(
    [base, { x: base.x + Math.cos(a) * 0.85, y: base.y + Math.sin(a) * 0.85 }],
    "#3e5e43",
    Math.max(8, scale * 0.35),
  );
  circle(base.x, base.y, 0.32, "#60794d", "#3f5d42");
  circle(base.x, base.y, 0.11, "#bfce95");
  text("YOU ARE HERE", 2, 0.13, "#6f805f", Math.max(6, scale * 0.17));
  for (const p of world.projectiles) {
    if (p.species === "Mud") {
      line(p.trail, "#a7855a", 2);
      circle(p.x, p.y, p.radius, "#8b623c", "#634a32");
      continue;
    }
    line(
      p.trail,
      p.species === "Electric"
        ? "#6fbbd0"
        : p.species === "Thunder"
          ? "#b29ad2"
          : p.species === "Water"
            ? "#8fb6bd"
            : "#e0b67c",
      2,
    );
    circle(
      p.x,
      p.y,
      p.radius * 1.8,
      p.species === "Electric"
        ? "#b3e4ed"
        : p.species === "Thunder"
          ? "#d7c6ec"
          : p.species === "Water"
            ? "#b9d9d9"
            : "#f2ca7c",
    );
    circle(
      p.x,
      p.y,
      p.radius,
      p.species === "Electric"
        ? "#3b98b3"
        : p.species === "Thunder"
          ? "#9164b8"
          : p.species === "Water"
            ? "#4b8f9e"
            : "#df693b",
    );
    circle(p.x + 0.04, p.y + 0.04, p.radius * 0.4, "#fff5c6");
  }
  if ($("debug").checked) {
    ctx.strokeStyle = "#ac666c";
    ctx.lineWidth = 1;
    for (const t of world.targets) {
      const [x, y] = point(t.x, t.y + t.h);
      ctx.strokeRect(x, y, t.w * scale, t.h * scale);
      text(
        `${t.id} · H ${t.heat.toFixed(2)}`,
        t.x,
        t.y - 0.4,
        "#97626a",
        9,
        "left",
      );
    }
    if (world.cable)
      text(`max L ${world.cable.length.toFixed(2)} m`, 8.5, 8.6, "#97626a", 9);
    text(`g ${world.gravity} · dt 1/120 s`, 0.5, 9.4, "#97626a", 9, "left");
  }
}

let lastUI = "";
function updateUI() {
  $("angle-value").textContent = `${$("angle").value}°`;
  $("speed-value").textContent = `${$("speed").value} m/s`;
  $("heat-value").textContent = (+$("heat").value).toFixed(1);
  $("pause").textContent = paused ? "Resume" : "Pause";
  $("pause").setAttribute("aria-pressed", String(paused));
  $("run-state").textContent = paused ? "PAUSED" : "● RUNNING";
  $("clock").textContent = `${world.time.toFixed(2)} s · ${world.shots} shots`;
  $("clock").dataset.simTime = String(world.time);
  const rope = world.targets.find((t) => t.id === "rope"),
    c = world.cable;
  $("rope-state").textContent = rope
    ? rope.burned
      ? "Rope burned"
      : `Rope intact · heat ${rope.heat.toFixed(2)}`
    : "Trajectory rig active";
  $("cable-state").textContent = c
    ? c.restrained
      ? "Cable restrained"
      : "Cable free · gravity in motion"
    : "Non-burnable targets";
  $("landing-state").textContent = c?.landed
    ? "Landing contact observed"
    : c
      ? "Landing bay waiting"
      : "Compare low and high arcs";
  $("rope-state").classList.toggle("done", !!rope?.burned);
  $("cable-state").classList.toggle("done", !!c && !c.restrained);
  $("landing-state").classList.toggle("done", !!c?.landed);
  $("thermal-readout").hidden = !world.thermal;
  if (world.thermal) {
    const t = world.thermal,
      temp = t.source.heat / THERMAL.metalCapacity,
      wt = waterTemperature(t),
      p = pressure(t);
    const budget = energyBalance(t);
    $("metal-temp").textContent = `${temp.toFixed(2)} T*`;
    $("water-temp").textContent = `${wt.toFixed(2)} / 0.80 T*`;
    $("steam-pressure").textContent = `${p.toFixed(3)} P*`;
    $("piston-distance").textContent =
      `${t.piston.x.toFixed(2)} / ${world.puzzle ? "1.20 catch" : "1.00"} m`;
    $("metal-meter").value = temp;
    $("water-meter").value = wt;
    $("pressure-meter").value = p;
    $("piston-meter").value = t.piston.x;
    Object.assign($("thermal-readout").dataset, {
      input: String(t.input),
      transferred: String(t.transferred),
      waterEnergy: String(t.water.energy),
      pressure: String(p),
      piston: String(t.piston.x),
      max: String(t.piston.max),
      reached: String(t.piston.reached),
      residual: String(budget.residual),
      volume: String(t.water.volume),
      deposited: String(t.deposited),
      overflow: String(t.overflow),
      profile: t.timingProfile,
    });
    $("energy-budget").textContent =
      `Input ${budget.input.toFixed(3)} = stored ${budget.stored.toFixed(3)} + losses/work ${budget.spent.toFixed(3)} E*. Water ${(t.water.volume * 100).toFixed(0)}%.`;
    let summary =
      t.water.volume <= 0
        ? "Boiler empty: land a Water Beetle in the inlet. Hot metal alone cannot make steam."
        : !contactActive(t)
          ? "Contact broken: heat cannot cross the gap or stone."
          : t.piston.reached
            ? "Target touched. Stored energy is finite; the piston returns as pressure fades."
            : p > 0.02
              ? "Steam pressure is doing work against the piston’s weight."
              : t.source.heat > 0.05
                ? "Metal retains heat. Add another pulse before it cools."
                : "Warm metal. Transfer heat. Let pressure do the work.";
    if (world.surface && t.water.volume <= 0)
      summary =
        "Catchment dry. Release Water onto the slope or basin; hot metal alone cannot make steam.";
    if ($("thermal-summary").textContent !== summary)
      $("thermal-summary").textContent = summary;
    $("rope-state").textContent =
      `Metal heat stored · ${t.source.heat.toFixed(2)} E*`;
    $("cable-state").textContent = !contactActive(t)
      ? "Heat transfer blocked"
      : t.water.energy > 0.05
        ? "Water warming through physical contact"
        : "Water waiting for transferred heat";
    $("landing-state").textContent = t.piston.reached
      ? "Piston target contact observed"
      : "Piston target waiting";
    $("rope-state").classList.toggle("done", t.source.heat > 0.05);
    $("cable-state").classList.toggle("done", t.water.energy > 0.05);
    $("landing-state").classList.toggle("done", t.piston.reached);
    if (waterMode()) {
      $("water-volume").textContent =
        `Boiler ${t.water.volume <= 0 ? "empty" : "filled"} · ${t.water.volume.toFixed(2)} / 1.00 V* · total deposited ${t.deposited.toFixed(2)} V*`;
      const hits = t.impacts.filter((i) => i.heat > 0);
      const last = hits.at(-1),
        before = hits.at(-2);
      $("impact-timing").textContent = hits.length
        ? `Metal impact ${last.time.toFixed(3)} s${before ? ` · impact interval ${(last.time - before.time).toFixed(3)} s · launch interval ${(last.launchedAt - before.launchedAt).toFixed(3)} s` : ""} · ${t.timingProfile === "comparison" ? "candidate (not approved balance)" : "current profile"}`
        : "No metal impacts yet.";
    }
    if (world.surface) {
      const mass = waterBudget(world.surface, t);
      const heat = surfaceEnergy(world.surface);
      $("water-volume").textContent =
        `Released ${mass.input.toFixed(2)} V* · catchment ${mass.basin.toFixed(2)} / 1.00 V*`;
      $("surface-stats").textContent =
        `Terrain ${mass.terrain.toFixed(3)} · falling ${mass.airborne.toFixed(3)} · evaporated/vented ${mass.vapor.toFixed(3)} · boundary drain ${mass.outflow.toFixed(3)} V*. ${mass.cells} cells + ${mass.parcels} source / ${mass.spills} spill packets + ${world.projectiles.length} Beetles. Mass error ${mass.residual.toExponential(1)}. Open-pool heat ${heat.stored.toFixed(3)} E*, input ${heat.input.toFixed(3)}, error ${heat.residual.toExponential(1)}.`;
      Object.assign($("thermal-readout").dataset, {
        surfaceInput: String(mass.input),
        terrainWater: String(mass.terrain),
        outflow: String(mass.outflow),
        waterResidual: String(mass.residual),
        cells: String(mass.cells),
        parcels: String(mass.parcels),
        runoff: String(world.surface.crossedOpening),
        directPoolHeat: String(world.surface.directHeat),
        poolHeat: String(heat.stored),
        heatResidual: String(heat.residual),
        spilled: String(world.surface.spilled),
        landed: String(world.surface.landed),
        airborne: String(mass.airborne),
        vapor: String(mass.vapor),
        spillPackets: String(mass.spills),
        openVapor: String(world.surface.evaporated),
        wallUpstream: String(
          surfaceHeight(world.surface.nodes.find((n) => n.x === 5.25)),
        ),
        wallDownstream: String(
          world.surface.nodes
            .filter((n) => n.x >= 5.75 && n.x < 8)
            .reduce((v, n) => v + n.water.volume, 0),
        ),
      });
    }
  }
  const puzzle = world.puzzle;
  $("puzzle-controls").hidden = !puzzle;
  for (const id of ["fire", "thermal-fire", "puzzle-fire"])
    $(id).disabled = !!puzzle && puzzle.ammo === 0;
  if (puzzle) {
    const held = puzzle.support.intact;
    const caught = world.thermal.piston.x >= puzzle.layout.catch.position;
    $("puzzle-ammo").textContent =
      `Spark ${puzzle.ammo} · Biomass ${puzzle.ammo} → ${puzzle.ammo} Fire charges left`;
    $("puzzle-status").textContent = puzzle.won
      ? "Delivered! Plant seed entered Mother Sprout from above."
      : puzzle.lost
        ? "Seed lost on the pit floor. Reset to try again."
        : held
          ? puzzle.ammo === 0
            ? "No charges left; seed still held. Reset to try again."
            : "Seed held. Lift the crossing before releasing it."
          : "Seed travelling under gravity…";
    Object.assign($("puzzle-controls").dataset, {
      won: String(puzzle.won),
      lost: String(puzzle.lost),
      ammo: String(puzzle.ammo),
      held: String(held),
      seedX: String(puzzle.seed.x),
      seedY: String(puzzle.seed.y),
      bridgeY: String(puzzle.bridgeY),
    });
    $("rope-state").textContent = held
      ? "Seed held by release cord"
      : "Cord burned · seed released";
    $("cable-state").textContent = caught
      ? "Bridge lifted · resting on rail catch"
      : "Bridge needs lifting";
    $("landing-state").textContent = puzzle.won
      ? "Mother Sprout received the plant seed"
      : "Mother Sprout waits for top entry";
    $("thermal-summary").textContent = caught
      ? "Rail catch supports the lifted bridge as pressure fades."
      : "Two nearby heat impacts can lift the bridge. One is insufficient.";
    document.querySelector(".recipe-note").textContent =
      `Finite puzzle ingredients · ${puzzle.ammo} of each remaining`;
  }
  $("clay-controls").hidden = !world.clay;
  if (world.clay) {
    const c = world.clay,
      s = mixClay($("clay-a").value, $("clay-b").value),
      b = clayBudget(c);
    for (const id of ["fire", "clay-fire"])
      $(id).disabled = !clayAvailable(c, s);
    $("clay-fire").textContent = `Launch ${s ?? "unavailable"}`;
    $("clay-stock").textContent = Object.entries(c.stock)
      .map(([k, v]) => `${k} ×${v}`)
      .join(" · ");
    $("clay-recipe").textContent =
      `${$("clay-a").value} + ${$("clay-b").value} → ${s ?? "unavailable"}`;
    $("clay-angle").value = $("angle").value;
    $("clay-angle-value").textContent = `${$("angle").value}°`;
    $("clay-state").textContent =
      `${c.patch?.patch.material ?? "No Mud placed"} · Stop ${c.latch.q.toFixed(2)} m · Plate ${c.plate.q.toFixed(2)} m`;
    $("clay-status").textContent = c.won
      ? "Delivered! The plant seed entered Mother Sprout from above."
      : c.lost
        ? "The ball fell into the pit. Reset to try another physical route."
        : c.plate.q > 0
          ? "The load moves the plate and linked seed gate."
          : c.patch?.patch.material === "fired-clay"
            ? "The shaped material is now ceramic."
            : "The seed waits behind a mechanical gate.";
    $("rope-state").textContent =
      c.patch?.patch.material ?? "A rough opening interrupts the track";
    $("cable-state").textContent =
      `Stop ${c.latch.q.toFixed(2)} m · Plate impulse ${c.plate.impulse.toFixed(2)} N*s*`;
    $("landing-state").textContent = c.won
      ? "Mother Sprout received the plant seed"
      : "Only actual seed top entry wins";
    Object.assign($("clay-controls").dataset, {
      won: String(c.won),
      lost: String(c.lost),
      stock: JSON.stringify(c.stock),
      material: c.patch?.patch.material ?? "none",
      latch: String(c.latch.q),
      plate: String(c.plate.q),
      ballX: String(c.ball.x),
      ballY: String(c.ball.y),
      seedX: String(c.seed.x),
      seedY: String(c.seed.y),
      waterError: String(b.waterError),
      solidError: String(b.solidError),
      fireError: String(b.fireError),
      thermalError: String(b.thermalError),
      events: JSON.stringify(c.events.map((e) => e.type)),
      impacts: JSON.stringify(c.impacts),
    });
  }
  $("overflow-controls").hidden = !world.overflow;
  if (world.overflow) {
    const o = world.overflow,
      b = overflowBudget(o),
      species = mixOverflow($("overflow-a").value, $("overflow-b").value);
    for (const id of ["fire", "overflow-fire"])
      $(id).disabled = !overflowAvailable(o, species);
    $("overflow-fire").textContent = `Launch ${species}`;
    $("overflow-recipe").textContent =
      `${$("overflow-a").value} + ${$("overflow-b").value} → ${species}`;
    $("overflow-stock").textContent = Object.entries(o.stock)
      .map(([k, v]) => `${k} ×${v}`)
      .join(" · ");
    $("overflow-angle").value = $("angle").value;
    $("overflow-angle-value").textContent = `${$("angle").value}°`;
    $("overflow-state").textContent =
      `Cistern ${height(o.basin.at(-1), o.stones).toFixed(2)} / ${o.layout.rim.toFixed(2)} m lip · Bucket ${b.bucketMass.toFixed(4)} kg* · Travel ${o.drum.q.toFixed(2)} m`;
    $("overflow-status").textContent = o.won
      ? "Delivered! Plant seed entered Mother Sprout from above."
      : b.chuteVolume > 0.01 && b.overflowSediment > 0
        ? "Muddy overflow is accumulating on the gentle slope. The bucket still needs actual load."
        : o.drum.q > 0
          ? "The loaded bucket lowers the bridge; follow the real seed."
          : "The seed waits. Can displaced water reach the protected bucket?";
    $("rope-state").textContent =
      `Overflow ${b.overflowWater.toFixed(4)} water + ${b.overflowSediment.toFixed(4)} sediment kg*`;
    $("cable-state").textContent =
      `Chute ${b.chuteVolume.toFixed(4)} V* · bucket drive ${o.drum.drive.toFixed(3)} N*`;
    $("landing-state").textContent = o.won
      ? "Mother Sprout received the plant seed"
      : "Mother Sprout waits for top entry";
    Object.assign($("overflow-controls").dataset, {
      won: String(o.won),
      stock: JSON.stringify(o.stock),
      bucketMass: String(b.bucketMass),
      bucketWater: String(b.bucketWater),
      bucketSediment: String(b.bucketSediment),
      q: String(o.drum.q),
      waterResidual: String(b.waterResidual),
      sedimentResidual: String(b.sedimentResidual),
      inputWater: String(b.inputWater),
      inputSediment: String(b.inputSediment),
      overflowWater: String(b.overflowWater),
      overflowSediment: String(b.overflowSediment),
      chuteVolume: String(b.chuteVolume),
      stones: String(o.stones.length),
      packets: String(o.parcels.length),
      patches: String(o.wallPatches.length),
      seedX: String(o.seed.x),
      seedY: String(o.seed.y),
    });
  }
  $("last-controls").hidden = !world.last;
  if (world.last) {
    const l = world.last,
      b = lastBudget(l),
      species = mixLast($("last-a").value, $("last-b").value);
    for (const id of ["fire", "last-fire"])
      $(id).disabled = !lastAvailable(l, species);
    $("last-fire").textContent = species
      ? `Launch ${species}`
      : "Unavailable mix";
    $("last-recipe").textContent =
      `${$("last-a").value} + ${$("last-b").value} → ${species ?? "unavailable"}`;
    $("last-stock").textContent = Object.entries(l.stock)
      .map(([k, v]) => `${k} ×${v}`)
      .join(" · ");
    $("last-angle").value = $("angle").value;
    $("last-angle-value").textContent = `${$("angle").value}°`;
    $("last-state").textContent =
      `Generator ON · Magnet ${l.powered ? "POWERED" : "OFF"} · Force ${l.pulley.force.toFixed(2)} N · Feeder ${(100 * l.aperture).toFixed(0)}% open · Wet bridge ${l.pool.volume.toFixed(4)} V*`;
    $("last-status").textContent = l.won
      ? "Delivered! Plant seed entered Mother Sprout from above."
      : l.powered
        ? "The wet circuit holds the weight. Find how to interrupt it."
        : "Weight falling; the pulley lifts the gate. Follow the real seed.";
    $("rope-state").textContent =
      `Source ${l.source.toFixed(2)} / ${l.layout.source} V* · flow ${l.flow.toFixed(3)} V*/s`;
    $("cable-state").textContent =
      `Weight dropped ${l.pulley.q.toFixed(2)} m · heat stored ${b.stored.toFixed(3)} E*`;
    $("landing-state").textContent = l.won
      ? "Mother Sprout received the plant seed"
      : "Mother Sprout waits for top entry";
    Object.assign($("last-controls").dataset, {
      won: String(l.won),
      powered: String(l.powered),
      generator: String(l.generatorOn),
      aperture: String(l.aperture),
      water: String(l.pool.volume),
      force: String(l.pulley.force),
      q: String(l.pulley.q),
      source: String(l.source),
      stock: JSON.stringify(l.stock),
      stones: String(l.stones.length),
      massResidual: String(b.massResidual),
      energyResidual: String(b.energyResidual),
      input: String(b.input),
      seedX: String(l.seed.x),
      seedY: String(l.seed.y),
    });
  }
  $("circuit-controls").hidden = !world.circuit;
  if (world.circuit) {
    const c = world.circuit,
      e = c.electric,
      species = mix($("mix-a").value, $("mix-b").value);
    const allowed = costAvailable(c.stock, species),
      mass = waterBudget(c.surface, c.thermal);
    for (const id of ["fire", "circuit-fire"]) $(id).disabled = !allowed;
    $("circuit-fire").textContent = species
      ? `Launch ${species}`
      : "Unavailable mix";
    $("circuit-recipe").textContent = species
      ? `${$("mix-a").value} + ${$("mix-b").value} → ${species}`
      : "This pair has no available recipe.";
    $("circuit-stock").textContent = Object.entries(c.stock)
      .map(([k, v]) => `${k} ×${v}`)
      .join(" · ");
    $("circuit-state").textContent =
      `Generator ${e.generatorOn ? "ON" : "OFF"} · Path ${e.pathConnected ? "CONNECTED" : "OPEN"} · Receiver ${e.receiverPowered ? "POWERED" : "OFF"} · ${e.charge.toFixed(2)} / ${e.duration} s${e.pulses.length ? " · SHORT PULSE" : ""}`;
    $("circuit-charge").value = e.charge;
    const missingEffect =
      c.stock.Spark === 0 &&
      (!(
        e.generatorOn || world.projectiles.some((p) => p.species === "Electric")
      ) ||
        !(
          !c.support.intact ||
          world.projectiles.some((p) => p.species === "Fire")
        ));
    $("circuit-status").textContent = c.won
      ? "Delivered! The real plant seed entered Mother Sprout from above."
      : e.opened
        ? "Gate open. Watch the seed under gravity."
        : e.receiverPowered
          ? "Receiver charging while the contact path stays complete."
          : Object.keys(PAIRS).some((s) => costAvailable(c.stock, s))
            ? "Restore a physical circuit. Generator ON and receiver POWERED are separate states."
            : "No mixtures left. Circuit incomplete; reset to retry.";
    $("circuit-angle").value = $("angle").value;
    $("circuit-angle-value").textContent = `${$("angle").value}°`;
    Object.assign($("circuit-controls").dataset, {
      won: String(c.won),
      generator: String(e.generatorOn),
      connected: String(e.pathConnected),
      powered: String(e.receiverPowered),
      charge: String(e.charge),
      maxCharge: String(e.maxCharge),
      gate: String(e.opened),
      tipX: String(c.tip.x),
      tipY: String(c.tip.y),
      seedX: String(c.seed.x),
      seedY: String(c.seed.y),
      rope: String(c.support.intact),
      water: String(mass.terrain),
      released: String(mass.input),
      waterResidual: String(mass.residual),
      pulses: String(e.pulses.length),
      stock: JSON.stringify(c.stock),
    });
    $("rope-state").textContent = c.support.intact
      ? "Cord intact · cable held"
      : "Cord burned · tether released";
    $("cable-state").textContent = e.pathConnected
      ? "Actual cable/water/electrode path connected"
      : "Find the open cable/water/electrode contact";
    $("landing-state").textContent = c.won
      ? "Seed delivered through top opening"
      : e.opened
        ? "Gate open; delivery still required"
        : "Charge gate closed";
    document.querySelector(".recipe-note").textContent =
      "Finite ingredients · spend on accepted launch only";
  }
  const visibleEvents = [
    ...world.events,
    ...(world.clay?.events ?? []).map((e) => ({ time: e.time, text: e.type })),
    ...(world.overflow?.events ?? []).map((e) => ({
      time: e.time,
      text: e.event,
    })),
    ...(world.last?.events ?? []).map((e) => ({ time: e.time, text: e.event })),
    ...(world.circuit?.events ?? []).map((e) => ({
      time: e.time,
      text: e.event,
    })),
    ...(puzzle?.events ?? []).map((e) => ({ time: e.time, text: e.event })),
  ]
    .sort((a, b) => a.time - b.time)
    .slice(-8);
  const signature = JSON.stringify(visibleEvents);
  if (signature !== lastUI) {
    lastUI = signature;
    $("events").replaceChildren(
      ...(visibleEvents.length
        ? [...visibleEvents].reverse().map((e) => {
            const li = document.createElement("li");
            li.textContent = `${e.time.toFixed(2).padStart(5)}s  ${e.text}`;
            return li;
          })
        : [
            Object.assign(document.createElement("li"), {
              textContent: "No events yet. Launch your first Beetle.",
            }),
          ]),
    );
  }
}
function syncSpecies() {
  if (world.clay) {
    const species = mixClay($("clay-a").value, $("clay-b").value);
    $("recipe").textContent =
      `${$("clay-a").value} + ${$("clay-b").value} → ${species ?? "unavailable"}`;
    $("launch-label").textContent =
      `Launch ${species ?? "unavailable mixture"}`;
    $("cannon-heading").textContent = "Mix two ingredients.";
    document.body.dataset.species = species ?? "Mud";
    return;
  }

  if (world.overflow) {
    const species = mixOverflow($("overflow-a").value, $("overflow-b").value);
    $("recipe").textContent =
      `${$("overflow-a").value} + ${$("overflow-b").value} → ${species}`;
    $("launch-label").textContent = `Launch ${species}`;
    $("cannon-heading").textContent = "Mix two ingredients.";
    document.body.dataset.species = species;
    return;
  }
  if (world.last) {
    const species = mixLast($("last-a").value, $("last-b").value);
    $("recipe").textContent =
      `${$("last-a").value} + ${$("last-b").value} → ${species ?? "unavailable"}`;
    $("launch-label").textContent =
      `Launch ${species ?? "unavailable mixture"}`;
    $("cannon-heading").textContent = "Mix two ingredients.";
    document.body.dataset.species = species ?? "Fire";
    return;
  }
  if (world.circuit) {
    const a = $("mix-a").value,
      b = $("mix-b").value,
      s = mix(a, b);
    $("recipe").textContent = `${a} + ${b} → ${s ?? "unavailable"}`;
    $("launch-label").textContent = s
      ? `Launch ${s} Beetle`
      : "Unavailable mixture";
    $("cannon-heading").textContent = "Mix two ingredients.";
    document.body.dataset.species = s ?? "Fire";
    return;
  }
  const species = waterMode() ? $("species").value : "Fire";
  $("recipe").innerHTML =
    species === "Water"
      ? '<span><i class="water-icon">●</i>Drop</span><b>+</b><span><i class="water-icon">●</i>Drop</span><b>→</b><span><i class="water-icon">●</i>Water</span>'
      : '<span><i class="spark">✦</i>Spark</span><b>+</b><span><i class="biomass">❧</i>Biomass</span><b>→</b><span><i class="fire-icon">♨</i>Fire</span>';
  $("launch-label").textContent = `Launch ${species} Beetle`;
  $("cannon-heading").textContent = `Make a little ${species}.`;
  document.body.dataset.species = species;
  $("thermal-fire").textContent =
    species === "Water" ? "Launch Water" : "Add Fire";
}
function reset() {
  world = createWorld($("preset").value);
  paused = false;
  accumulator = 0;
  $("bridge-gap").checked = false;
  $("bridge-insulator").checked = false;
  $("water-controls").hidden = !waterMode();
  $("surface-stats").hidden = !world.surface;
  $("timing-label").hidden = !!world.surface;
  $("aim-inlet").textContent = world.surface
    ? "Aim slope · 70°"
    : "Aim inlet · 60°";
  $("aim-pad").textContent = world.surface
    ? "Aim metal · 72°"
    : "Aim metal · 50°";
  $("species").value = "Water";
  $("timing-profile").value = "current";
  if (waterMode()) {
    $("angle").value = world.surface ? 70 : 60;
    $("speed").value = 14;
    $("heat").value = 1.2;
    $("arc").checked = true;
    $("debug").checked = false;
    $("timescale").value = "1";
  }
  const isPuzzle = !!world.puzzle;
  $("speed").disabled = isPuzzle;
  $("heat").disabled = isPuzzle;
  document.querySelector("#thermal-readout > details").hidden = isPuzzle;
  if (isPuzzle) {
    $("angle").value = 50;
    $("speed").value = 14;
    $("heat").value = 1.2;
    $("timescale").value = "1";
    $("arc").checked = true;
    $("debug").checked = false;
  }
  document.querySelector(".recipe-note").textContent =
    "Candidate recipe · unlimited lab ingredients";
  if (world.circuit) {
    $("angle").value = 30;
    $("speed").value = 14;
    $("heat").value = 1.2;
    $("heat").disabled = true;
    $("mix-a").value = "Spark";
    $("mix-b").value = "Biomass";
    $("timescale").value = "1";
    $("arc").checked = true;
    $("debug").checked = false;
  }
  if (world.last) {
    $("angle").value = 65;
    $("speed").value = 14;
    $("heat").value = 1.2;
    $("speed").disabled = true;
    $("heat").disabled = true;
    $("last-a").value = "Earth";
    $("last-b").value = "Earth";
    $("timescale").value = "1";
    $("arc").checked = true;
    $("debug").checked = false;
    document.querySelector(".recipe-note").textContent =
      "Finite ingredients · spend on accepted launch only";
  }
  if (world.overflow) {
    $("angle").value = 75;
    $("speed").value = 14;
    $("heat").value = 1.2;
    $("speed").disabled = true;
    $("heat").disabled = true;
    $("overflow-a").value = "Earth";
    $("overflow-b").value = "Earth";
    $("timescale").value = "1";
    $("arc").checked = true;
    $("debug").checked = false;
    document.querySelector(".recipe-note").textContent =
      "Earth ×2 + Drop ×2 · finite stock";
  }
  if (world.clay) {
    $("angle").value = 38;
    $("speed").value = 14;
    $("heat").value = 1.2;
    $("speed").disabled = true;
    $("heat").disabled = true;
    $("clay-a").value = "Earth";
    $("clay-b").value = "Drop";
    $("timescale").value = "1";
    $("arc").checked = true;
    $("debug").checked = false;
    document.querySelector(".recipe-note").textContent =
      "Earth ×3 · Drop ×1 · Spark ×1 · Biomass ×1";
  }
  syncSpecies();
  $("launch-status").textContent = "Reset complete. Ready when you are.";
  $("hint").textContent = world.surface
    ? "Water releases 0.25 V* on any solid. Try slope 70°, a low off-target shot, and repeat to pool. Fire at metal 72° heats collected water. Fire can also heat a standing open puddle: try Water then Fire at 5° / 6 m/s. Water above a crest can overtop; spilled water lands on the lower floor before reaching a boundary drain."
    : world.preset === "water-boiler"
      ? "Water: aim 60° at 14 m/s into the inlet. Fire: aim 50° at metal. Compare water-first with heat-first while metal is still warm; no hidden shot order. Candidate timing is a sandbox experiment."
      : world.preset === "thermal"
        ? "One standard heat pulse is not enough. Try another within 1–2 seconds, then compare with a long wait or the insulating stone. The boiler starts filled; this is not a seed-delivery goal."
        : world.preset === "rope"
          ? "A rope can burn. The metal beside it cannot. Try nearby angles and compare what happens."
          : "Compare low and high arcs. The aim guide uses the same gravity and collision model as your Beetle.";
  document.querySelector(".lede").textContent = world.thermal
    ? "Store a little heat. Let a small steam engine show what remains."
    : "Aim a Fire Beetle at the rope. Watch the world do the rest.";
  if (world.preset === "water-boiler")
    document.querySelector(".lede").textContent =
      "Fill the boiler. Store a little heat. Let pressure do the work.";
  if (world.surface)
    document.querySelector(".lede").textContent =
      "A splash, a slope, a little gravity. Follow where the water goes.";
  $("parameter-note").textContent = world.thermal
    ? "Standard Fire carries 1.2 E*. Water boils at 0.80 T*. All thermal units are experimental; no Kelvin or Pascal calibration."
    : "Rope burns at 1.0 heat. Heat cools over time. Gravity: 9.81 m/s². Infinite lab ammo.";
  if (world.puzzle) {
    document.querySelector(".lede").textContent =
      "Three Fire charges. Deliver the plant seed to Mother Sprout.";
    $("hint").textContent =
      "Heat can lift the crossing; a rail catch holds it up. Fire can also burn the release cord. Think before spending your three charges. Tap the scene or adjust the angle; aim buttons only select an angle.";
  }
  if (world.surface)
    $("parameter-note").textContent =
      "Water releases 0.25 V* per physical impact. At most 24 falling volume packets; 73 fixed flow cells. P03/P04 thermal constants are unchanged.";
  if (world.circuit) {
    document.querySelector(".lede").textContent =
      "Six ingredients. One broken connection. Help the plant seed home.";
    $("hint").textContent =
      "The free cable end must physically contact the same water as the receiver. Short power and sustained power are different. You can rebuild the contacts in any order. Reset restores every ingredient.";
  }
  if (world.last) {
    document.querySelector(".lede").textContent =
      "Two mixtures. An unwanted current. Help the seed home.";
    $("hint").textContent =
      "The feeder keeps the shielded bridge wet. Stone can physically lodge in its opening; Fire warms the reachable metal pad. The magnet holds a weight that closes the seed route. Tap to aim or use the nearby angle slider.";
    $("parameter-note").textContent =
      "Finite source: 1000 V*. Fire: 1.2 E*. Stone: 3 kg. The pulley couples a 1 kg weight to a 0.2 kg gate; powered attraction is bounded at 18 N. Experimental units.";
  }
  if (world.overflow) {
    document.querySelector(".lede").textContent =
      "A little space. A little water. Let the overflow carry the weight.";
    $("hint").textContent =
      "Stone displaces water; Water adds0.25V*. Either order works. Mud is a finite wet sediment mixture; watch what actually passes the lip and where it stops. The roof and narrow side inlet protect the hanging bucket. Tap to aim, or use the nearby slider.";
    $("parameter-note").textContent =
      "Experimental 2D-equivalent water/sediment mass and geometry. No Fire in P09. Reset restores all stocks, mixtures, packets and mechanical state.";
  }
  if (world.clay) {
    document.querySelector(".lede").textContent =
      "Shape a path. Let heat change what it can carry.";
    $("hint").textContent =
      "Fresh Mud sticks but yields under heavy load. Fire treats the material it actually hits. A heavy impact can lift the retaining stop. Watch the ball, plate and seed; reset restores all ingredients.";
    $("parameter-note").textContent =
      "Experimental finite-energy and deformable-material reference. This is a browser greybox; physical phone approval pending.";
  }
  updateUI();
  draw();
}
function launch() {
  const selected = world.clay
    ? mixClay($("clay-a").value, $("clay-b").value)
    : world.overflow
      ? mixOverflow($("overflow-a").value, $("overflow-b").value)
      : world.last
        ? mixLast($("last-a").value, $("last-b").value)
        : world.circuit
          ? mix($("mix-a").value, $("mix-b").value)
          : null;
  if (
    (world.circuit || world.last || world.overflow || world.clay) &&
    !selected
  )
    return;
  const ok = fire(
    world,
    +$("angle").value,
    +$("speed").value,
    +$("heat").value,
    world.circuit || world.last || world.overflow || world.clay
      ? selected
      : waterMode()
        ? $("species").value
        : "Fire",
  );
  $("launch-status").textContent = ok
    ? paused
      ? "Queued. Resume or step to move."
      : `${world.circuit || world.last || world.overflow || world.clay ? selected : waterMode() ? $("species").value : "Fire"} Beetle away!`
    : world.circuit || world.last || world.overflow || world.clay
      ? "No ingredients for this mixture. Choose another pair or reset."
      : "Active Beetle/water limit reached. Wait for motion or reset.";
  updateUI();
}
$("clay-fire").addEventListener("click", launch);
for (const id of ["clay-a", "clay-b"])
  $(id).addEventListener("change", () => {
    syncSpecies();
    updateUI();
    draw();
  });
$("clay-angle").addEventListener("input", () => {
  $("angle").value = $("clay-angle").value;
  updateUI();
  draw();
});
$("overflow-fire").addEventListener("click", launch);
for (const id of ["overflow-a", "overflow-b"])
  $(id).addEventListener("change", () => {
    syncSpecies();
    updateUI();
    draw();
  });
$("overflow-angle").addEventListener("input", () => {
  $("angle").value = $("overflow-angle").value;
  updateUI();
  draw();
});
$("last-fire").addEventListener("click", launch);
for (const id of ["last-a", "last-b"])
  $(id).addEventListener("change", () => {
    syncSpecies();
    updateUI();
    draw();
  });
$("last-angle").addEventListener("input", () => {
  $("angle").value = $("last-angle").value;
  updateUI();
  draw();
});
$("circuit-fire").addEventListener("click", launch);
for (const id of ["mix-a", "mix-b"])
  $(id).addEventListener("change", () => {
    syncSpecies();
    updateUI();
    draw();
  });
$("circuit-angle").addEventListener("input", () => {
  $("angle").value = $("circuit-angle").value;
  updateUI();
  draw();
});
$("puzzle-fire").addEventListener("click", launch);
$("fire").addEventListener("click", launch);
$("thermal-fire").addEventListener("click", launch);
$("species").addEventListener("change", () => {
  syncSpecies();
  updateUI();
  draw();
});
for (const [id, angle] of [
  ["aim-inlet", 60],
  ["aim-pad", 50],
  ["aim-heat", 50],
  ["aim-rope", 30],
])
  $(id).addEventListener("click", () => {
    $("angle").value = world.surface ? (id === "aim-inlet" ? 70 : 72) : angle;
    updateUI();
    draw();
  });
$("timing-profile").addEventListener("change", () => {
  if (world.preset === "water-boiler")
    world.thermal.timingProfile = $("timing-profile").value;
  updateUI();
});
for (const id of ["bridge-gap", "bridge-insulator"])
  $(id).addEventListener("change", () => {
    if (world.thermal)
      setBridge(world.thermal, {
        gap: $("bridge-gap").checked,
        insulating: $("bridge-insulator").checked,
      });
    updateUI();
    draw();
  });
$("pause").addEventListener("click", () => {
  paused = !paused;
  accumulator = 0;
  updateUI();
});
$("step").addEventListener("click", () => {
  paused = true;
  accumulator = 0;
  step(world);
  updateUI();
  draw();
});
$("reset").addEventListener("click", reset);
$("preset").addEventListener("change", reset);
for (const id of ["angle", "speed", "heat", "arc", "debug"])
  $(id).addEventListener("input", () => {
    updateUI();
    draw();
  });
$("timescale").addEventListener("change", () => {
  accumulator = 0;
});
canvas.addEventListener("pointerdown", (e) => {
  const bounds = canvas.getBoundingClientRect();
  const x = (e.clientX - bounds.left - ox) / scale;
  const y = viewHeight - (e.clientY - bounds.top - oy) / scale;
  const angle =
    (Math.atan2(y - CONFIG.cannon.y, x - CONFIG.cannon.x) * 180) / Math.PI;
  $("angle").value = Math.round(Math.max(5, Math.min(85, angle)));
  updateUI();
  draw();
});
document.addEventListener("keydown", (e) => {
  if (
    e.repeat ||
    e.ctrlKey ||
    e.metaKey ||
    e.altKey ||
    /INPUT|SELECT|BUTTON|SUMMARY|TEXTAREA/.test(e.target.tagName)
  )
    return;
  if (e.code === "Space") {
    e.preventDefault();
    launch();
  }
  if (e.key.toLowerCase() === "r") reset();
});
document.addEventListener("visibilitychange", () => {
  previous = 0;
  accumulator = 0;
});
function frame(now) {
  const elapsed = previous ? Math.min(0.1, (now - previous) / 1000) : 0;
  previous = now;
  if (!paused && !document.hidden) {
    accumulator += elapsed * +$("timescale").value;
    while (accumulator >= DT) {
      step(world);
      accumulator -= DT;
    }
  }
  updateUI();
  draw();
  requestAnimationFrame(frame);
}
reset();
requestAnimationFrame(frame);
