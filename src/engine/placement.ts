import { C, G } from '../physics/constants';
import { schwarzschildRadius } from '../physics/blackhole';
import { useUI, type ToolKind, type ToolParams } from '../store';
import { translate } from '../i18n';
import { blackHole, meteor, photon, planet, ship, star } from './bodies';
import { circularSpeed, schwarzschildCoefficients, type Simulation } from './simulation';

let counter = 1;

/**
 * Velocity for a newly placed body.
 *  - orbit: circular orbit around the dominant attractor (drag is ignored unless long),
 *  - drag:  host velocity + drag vector scaled so that 80 px equals the local circular speed,
 *  - rest:  at rest in the simulation frame.
 */
export function placementVelocity(
  sim: Simulation,
  params: ToolParams,
  x: number,
  y: number,
  dragPx: [number, number] | null,
): [number, number] {
  if (params.velocityMode === 'rest') return [0, 0];
  const host = sim.dominantAttractor(x, y, 0);
  const useDrag = params.velocityMode === 'drag' || (dragPx && Math.hypot(dragPx[0], dragPx[1]) > 12);
  if (!host) {
    if (!useDrag || !dragPx) return [0, 0];
    return [dragPx[0] * 1e3, -dragPx[1] * 1e3];
  }
  if (useDrag && dragPx) {
    const r = Math.hypot(x - host.x, y - host.y) || 1;
    const vc = circularSpeed(host.mass, r);
    const k = vc / 80;
    return [host.vx + dragPx[0] * k, host.vy - dragPx[1] * k];
  }
  const [vx, vy] = sim.circularVelocity(x, y, 0);
  return [vx, vy];
}

/** Integrate a test trajectory with the massive bodies frozen, for the placement preview. */
export function predictPath(sim: Simulation, x: number, y: number, vx: number, vy: number, isPhoton: boolean, maxPoints = 600): Float64Array {
  const massive = sim.bodies.filter((b) => b.massive && b.alive);
  const pts = new Float64Array(maxPoints * 2);
  let n = 0;
  if (isPhoton) {
    const s = Math.hypot(vx, vy) || 1;
    vx = (vx / s) * C;
    vy = (vy / s) * C;
  }
  const accel = (px: number, py: number, pvx: number, pvy: number): [number, number] => {
    let ax = 0;
    let ay = 0;
    for (const b of massive) {
      const dx = px - b.x;
      const dy = py - b.y;
      const r2 = dx * dx + dy * dy;
      const r = Math.sqrt(r2);
      const nx = dx / r;
      const ny = dy / r;
      const rvx = pvx - b.vx;
      const rvy = pvy - b.vy;
      const gm = G * b.mass;
      const [A, B] = sim.settings.gr ? schwarzschildCoefficients(gm, r, nx * rvx + ny * rvy, rvx * rvx + rvy * rvy) : [1, 0];
      const f = -gm / r2;
      ax += f * (A * nx + B * rvx);
      ay += f * (A * ny + B * rvy);
    }
    return [ax, ay];
  };
  let px = x;
  let py = y;
  let total = 0;
  const limit = sim.cullRadius;
  for (let i = 0; i < 20000 && n < maxPoints; i++) {
    let dt = Infinity;
    for (const b of massive) {
      const r = Math.hypot(px - b.x, py - b.y);
      const rs = b.kind === 'blackHole' ? schwarzschildRadius(b.mass) : 0;
      if (r < Math.max(b.radius, 1.02 * rs)) return pts.subarray(0, n * 2);
      const v = Math.hypot(vx - b.vx, vy - b.vy) || 1;
      dt = Math.min(dt, (0.01 * (r - rs)) / v, isPhoton ? Infinity : 0.01 * Math.sqrt((r * r * r) / (G * b.mass)));
    }
    if (!Number.isFinite(dt)) dt = 1;
    // RK2 (midpoint) is sufficient for a preview.
    const [ax, ay] = accel(px, py, vx, vy);
    const mx = px + 0.5 * dt * vx;
    const my = py + 0.5 * dt * vy;
    const mvx = vx + 0.5 * dt * ax;
    const mvy = vy + 0.5 * dt * ay;
    const [bx, by] = accel(mx, my, mvx, mvy);
    px += dt * mvx;
    py += dt * mvy;
    vx += dt * bx;
    vy += dt * by;
    total += Math.hypot(dt * mvx, dt * mvy);
    if (i % 8 === 0) {
      pts[n * 2] = px;
      pts[n * 2 + 1] = py;
      n++;
    }
    if (Math.hypot(px - x, py - y) > limit) break;
    // Stop after roughly one closed loop.
    if (i > 200 && Math.hypot(px - x, py - y) < total * 0.004) break;
  }
  return pts.subarray(0, n * 2);
}

/** Create bodies for the active tool. Returns the id of the (first) new body. */
export function placeFromTool(
  sim: Simulation,
  tool: ToolKind,
  params: ToolParams,
  x: number,
  y: number,
  dragPx: [number, number] | null,
  viewHalfWidth: number,
): number | null {
  // Objects placed far from everything must not be culled as "escaped" right away.
  let rMin = Infinity;
  for (const b of sim.bodies) if (b.massive) rMin = Math.min(rMin, Math.hypot(b.x - x, b.y - y));
  const reach = Math.max(Number.isFinite(rMin) ? rMin : 0, Math.hypot(x, y)) + viewHalfWidth;
  if (reach * 4 > sim.cullRadius) sim.cullRadius = reach * 4;
  return placeBodies(sim, tool, params, x, y, dragPx, viewHalfWidth);
}

function placeBodies(
  sim: Simulation,
  tool: ToolKind,
  params: ToolParams,
  x: number,
  y: number,
  dragPx: [number, number] | null,
  viewHalfWidth: number,
): number | null {
  const id = counter++;
  if (tool === 'photons') {
    let dx = dragPx ? dragPx[0] : 1;
    let dy = dragPx ? -dragPx[1] : 0;
    const len = Math.hypot(dx, dy);
    if (len < 4) {
      dx = 1;
      dy = 0;
    } else {
      dx /= len;
      dy /= len;
    }
    const width = viewHalfWidth * 0.5;
    const group = sim.newGroup();
    let first: number | null = null;
    const n = params.photonCount;
    for (let i = 0; i < n; i++) {
      const o = n === 1 ? 0 : (i / (n - 1) - 0.5) * width;
      const wavelength = params.photonRainbow ? 400 + (n === 1 ? 0.5 : i / (n - 1)) * 300 : params.photonWavelength;
      const b = sim.add(photon({ name: `γ-${id}`, x: x - dy * o, y: y + dx * o, vx: dx * C, vy: dy * C, group, wavelength }));
      first ??= b.id;
    }
    return first;
  }
  if (tool === 'meteors') {
    const [vx, vy] = placementVelocity(sim, params, x, y, dragPx);
    const group = sim.newGroup();
    const spread = viewHalfWidth * 0.04;
    let first: number | null = null;
    for (let i = 0; i < params.meteorCount; i++) {
      const r = spread * Math.sqrt(Math.random());
      const t = Math.random() * Math.PI * 2;
      const px = x + r * Math.cos(t);
      const py = y + r * Math.sin(t);
      const vs = 1 + (Math.random() - 0.5) * 0.04;
      const b = sim.add(meteor({ name: `Meteor ${id}`, x: px, y: py, vx: vx * vs, vy: vy * vs, group }));
      first ??= b.id;
    }
    return first;
  }
  let nb;
  switch (tool) {
    case 'blackHole':
      nb = blackHole(10 ** params.bhMassLog, { name: `BH-${id}`, spin: params.bhSpin, disk: params.bhDisk, eddington: 0.05 });
      break;
    case 'star':
      nb = star(params.starPreset, { name: `${starLabel(params.starPreset)}-${id}` });
      break;
    case 'planet':
      nb = planet(params.planetPreset, { name: translate(useUI.getState().lang, `planetPresets.${params.planetPreset}`) });
      {
        const same = sim.bodies.filter((b) => b.model === params.planetPreset).length;
        if (same > 0) nb.name = `${nb.name} ${same + 1}`;
      }
      break;
    case 'ship': {
      nb = ship(params.shipModel);
      // Number repeated ships: "Endurance", "Endurance 2", ...
      const same = sim.bodies.filter((b) => b.model === params.shipModel).length;
      if (same > 0) nb.name = `${nb.name} ${same + 1}`;
      break;
    }
    default:
      return null;
  }
  const [vx, vy] = placementVelocity(sim, params, x, y, dragPx);
  return sim.add({ ...nb, x, y, vx, vy }).id;
}

function starLabel(p: string): string {
  switch (p) {
    case 'redDwarf':
      return 'RD';
    case 'blueGiant':
      return 'BG';
    case 'redGiant':
      return 'RG';
    case 'whiteDwarf':
      return 'WD';
    case 'neutronStar':
      return 'NS';
    default:
      return 'Star';
  }
}
