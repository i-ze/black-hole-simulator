import {
  HAWKING_K,
  eddingtonLuminosity,
  hawkingTemperature,
  kerrHorizon,
  mergeBlackHoles,
  netMassRate,
  petersLuminosity,
  schwarzschildRadius,
  tidalRadius,
} from '../physics/blackhole';
import { C, G, MPC, T_CMB_TODAY } from '../physics/constants';
import { materialize, type NewBody } from './bodies';
import { CHANDRASEKHAR_MASS, NS_MAX_MASS, impactOutcome } from '../physics/stars';
import { GWRecorder, quadrupoleStrain } from './gw';
import {
  COMPACT_KINDS,
  type Body,
  type Effect,
  type EffectKind,
  type EventKind,
  type SimEvent,
  type SimSettings,
  type SimStats,
} from './types';

const C2 = C * C;
const YEAR_S = 365.25 * 86400;
const C5 = C ** 5;
const MAX_SNAPSHOTS = 2048;
const MAX_PARTICLE_SUBSTEPS = 20000;
const MAX_PARTICLES = 6000;
/** Neutron stars above this mass collapse to black holes (approximate TOV limit). */

type PendingEvent =
  | { type: 'merge'; a: Body; b: Body }
  | { type: 'tde'; bh: Body; victim: Body }
  | { type: 'swallow'; bh: Body; victim: Body }
  | { type: 'collide'; a: Body; b: Body }
  | { type: 'evaporate'; bh: Body };

export const defaultSettings = (): SimSettings => ({
  gr: true,
  radiationReaction: true,
  hawking: true,
  tidal: true,
  cmbTemperature: T_CMB_TODAY,
  gwDistance: 410 * MPC,
  accuracy: 0.004,
});

export class Simulation {
  bodies: Body[] = [];
  time = 0;
  settings: SimSettings = defaultSettings();
  events: SimEvent[] = [];
  effects: Effect[] = [];
  gw = new GWRecorder();
  /** Particles farther than this from every massive body are removed, m. */
  cullRadius = 1e15;
  /** Calendar date (Unix ms) of simulation time 0, for date-based scenarios. */
  epoch?: number;
  /** Increments whenever bodies are added or removed. */
  version = 0;
  stats: SimStats = { massiveSteps: 0, particleSteps: 0, limited: false, effectiveWarp: 0, physicsMs: 0 };

  private nextId = 1;
  /** Massive bodies, rebuilt whenever bodies are added or removed (used by lapse2). */
  private massiveCache: Body[] = [];
  private massiveCacheVersion = -1;
  private nextGroup = 1;
  private nextEventId = 1;

  // Scratch buffers for the massive N-body integrator.
  private cap = 0;
  private m = new Float64Array(0);
  private pos = new Float64Array(0);
  private vel = new Float64Array(0);
  private acc = new Float64Array(0);
  private kPos = [new Float64Array(0), new Float64Array(0), new Float64Array(0), new Float64Array(0)];
  private kVel = [new Float64Array(0), new Float64Array(0), new Float64Array(0), new Float64Array(0)];
  private tmpPos = new Float64Array(0);
  private tmpVel = new Float64Array(0);
  private compact: boolean[] = [];
  private snapT = new Float64Array(MAX_SNAPSHOTS + 1);
  private snapPos = new Float64Array(0);
  private snapVel = new Float64Array(0);
  // Interpolated massive state for particle integration.
  private ix = new Float64Array(0);
  private iv = new Float64Array(0);
  private minTau = Infinity;
  private tightPair: [number, number] | null = null;
  private spacing = new Float64Array(0);

  reset() {
    this.bodies = [];
    this.time = 0;
    this.epoch = undefined;
    this.events = [];
    this.effects = [];
    this.gw.clear();
    this.version++;
  }

  add(nb: NewBody): Body {
    const b = materialize(this.nextId++, nb, this.time);
    if (b.kind === 'photon') {
      b.wavelength ??= 560;
      b.emitF ??= this.lapse2(b.x, b.y, b.z);
      this.setNullSpeed(b);
    }
    this.bodies.push(b);
    this.version++;
    return b;
  }

  newGroup(): number {
    return this.nextGroup++;
  }

  remove(id: number) {
    const b = this.get(id);
    if (b) b.alive = false;
    this.bodies = this.bodies.filter((x) => x.alive);
    this.version++;
  }

  get(id: number | null | undefined): Body | undefined {
    if (id == null) return undefined;
    return this.bodies.find((b) => b.id === id && b.alive);
  }

  clearTrails() {
    for (const b of this.bodies) b.trail.clear();
  }

  /**
   * Rescale a photon's velocity to the coordinate speed of light in the Schwarzschild field of the
   * dominant mass: v_r^2/f + v_t^2 = f c^2, i.e. f c radially and sqrt(f) c tangentially.
   * Far from any mass this is simply c.
   */
  private setNullSpeed(p: Body) {
    const host = this.dominantAttractor(p.x, p.y, p.z);
    const v = Math.hypot(p.vx, p.vy, p.vz) || 1;
    const dx = p.vx / v;
    const dy = p.vy / v;
    const dz = p.vz / v;
    let speed = C;
    if (host) {
      const rx = p.x - host.x;
      const ry = p.y - host.y;
      const rz = p.z - host.z;
      const r = Math.hypot(rx, ry, rz) || 1;
      const f = Math.max(1 - (2 * G * host.mass) / (C2 * r), 1e-4);
      const dr = (dx * rx + dy * ry + dz * rz) / r;
      speed = (C * f) / Math.sqrt(dr * dr + f * (1 - dr * dr));
      p.vx = host.vx + dx * speed;
      p.vy = host.vy + dy * speed;
      p.vz = host.vz + dz * speed;
      return;
    }
    p.vx = dx * speed;
    p.vy = dy * speed;
    p.vz = dz * speed;
  }

  /** f = 1 - Σ r_s/r (squared lapse of a static observer; superposed for several masses), clamped to > 0. */
  lapse2(x: number, y: number, z: number): number {
    let phi = 0;
    if (this.massiveCacheVersion !== this.version) {
      this.massiveCache = this.bodies.filter((b) => b.massive);
      this.massiveCacheVersion = this.version;
    }
    for (const b of this.massiveCache) {
      if (!b.alive) continue;
      const r = Math.hypot(b.x - x, b.y - y, b.z - z);
      phi += (2 * G * b.mass) / (C2 * Math.max(r, b.radius, 1e-30));
    }
    return Math.max(1 - phi, 1e-6);
  }

  /**
   * Wavelength of a photon as measured by a static observer at (x, y, z):
   * λ = λ_emit sqrt(f(r) / f(r_emit)) (exact gravitational shift for Schwarzschild).
   */
  photonWavelength(p: Body, x = p.x, y = p.y, z = p.z): number {
    return (p.wavelength ?? 560) * Math.sqrt(this.lapse2(x, y, z) / (p.emitF ?? 1));
  }

  /**
   * The body that b orbits: the lightest heavier body inside whose Hill sphere b lies
   * (r_H = d (m / 3M)^(1/3), with d and M taken from that body's own host). The Moon orbits the
   * Earth even though the Sun pulls it harder; the Earth orbits the Sun.
   */
  orbitalHost(b: Body): Body | undefined {
    const heavier = this.bodies.filter((o) => o.alive && o.massive && o.id !== b.id && o.mass > b.mass);
    let best: Body | undefined;
    for (const c of heavier) {
      const parent = this.dominantAttractor(c.x, c.y, c.z, c.id);
      const d = Math.hypot(b.x - c.x, b.y - c.y, b.z - c.z);
      let inside = true;
      if (parent && parent.mass > c.mass) {
        const dp = Math.hypot(c.x - parent.x, c.y - parent.y, c.z - parent.z);
        inside = d < dp * Math.cbrt(c.mass / (3 * parent.mass));
      }
      if (inside && (!best || c.mass < best.mass)) best = c;
    }
    return best ?? this.dominantAttractor(b.x, b.y, b.z, b.id);
  }

  /** Body whose Newtonian pull dominates at a point (optionally excluding one id). */
  dominantAttractor(x: number, y: number, z: number, exclude?: number): Body | undefined {
    let best: Body | undefined;
    let bestA = 0;
    for (const b of this.bodies) {
      if (!b.alive || !b.massive || b.id === exclude) continue;
      const r2 = (b.x - x) ** 2 + (b.y - y) ** 2 + (b.z - z) ** 2;
      const a = b.mass / Math.max(r2, 1e-30);
      if (a > bestA) {
        bestA = a;
        best = b;
      }
    }
    return best;
  }

  /** Velocity for a circular orbit around the dominant attractor, counter-clockwise about +z. */
  circularVelocity(x: number, y: number, z: number, mass = 0, exclude?: number): [number, number, number] {
    const host = this.dominantAttractor(x, y, z, exclude);
    if (!host) return [0, 0, 0];
    const dx = x - host.x;
    const dy = y - host.y;
    const r = Math.hypot(dx, dy) || 1;
    const v = circularSpeed(host.mass + mass, r);
    return [host.vx - (dy / r) * v, host.vy + (dx / r) * v, host.vz];
  }

  private logEvent(kind: EventKind, data: Record<string, number | string>) {
    this.events.push({ id: this.nextEventId++, time: this.time, kind, data });
    if (this.events.length > 200) this.events.shift();
  }

  private addEffect(kind: EffectKind, x: number, y: number, z: number, opts: Partial<Effect> = {}) {
    this.effects.push({
      id: this.nextEventId++,
      kind,
      x,
      y,
      z,
      simTime: this.time,
      wallTime: performance.now(),
      energy: 0,
      freq: 0,
      tau: 0,
      scale: 0,
      ...opts,
    });
    if (this.effects.length > 32) this.effects.shift();
  }

  private ensureCapacity(n: number) {
    if (n <= this.cap) return;
    const cap = Math.max(8, n * 2);
    this.cap = cap;
    this.m = new Float64Array(cap);
    this.pos = new Float64Array(cap * 3);
    this.vel = new Float64Array(cap * 3);
    this.acc = new Float64Array(cap * 3);
    this.kPos = this.kPos.map(() => new Float64Array(cap * 3));
    this.kVel = this.kVel.map(() => new Float64Array(cap * 3));
    this.tmpPos = new Float64Array(cap * 3);
    this.tmpVel = new Float64Array(cap * 3);
    this.snapPos = new Float64Array((MAX_SNAPSHOTS + 1) * cap * 3);
    this.snapVel = new Float64Array((MAX_SNAPSHOTS + 1) * cap * 3);
    this.ix = new Float64Array(cap * 3);
    this.iv = new Float64Array(cap * 3);
    this.spacing = new Float64Array(cap);
  }

  /** Accelerations of the massive bodies: Schwarzschild geodesic form (coordinate time) + 2.5PN radiation reaction. */
  private accelMassive(n: number, pos: Float64Array, vel: Float64Array, acc: Float64Array) {
    const { m, compact } = this;
    const gr = this.settings.gr;
    const rr = this.settings.radiationReaction;
    acc.fill(0, 0, 3 * n);
    for (let i = 0; i < n; i++) {
      const i3 = 3 * i;
      for (let j = i + 1; j < n; j++) {
        const j3 = 3 * j;
        // Relative coordinates x = x_i - x_j, v = v_i - v_j.
        const rx = pos[i3] - pos[j3];
        const ry = pos[i3 + 1] - pos[j3 + 1];
        const rz = pos[i3 + 2] - pos[j3 + 2];
        const r2 = rx * rx + ry * ry + rz * rz;
        const r = Math.sqrt(r2);
        const mt = m[i] + m[j];
        const gm = G * mt;
        const nx = rx / r;
        const ny = ry / r;
        const nz = rz / r;
        const vx = vel[i3] - vel[j3];
        const vy = vel[i3 + 1] - vel[j3 + 1];
        const vz = vel[i3 + 2] - vel[j3 + 2];
        let A = 1;
        let B = 0;
        if (gr) {
          // Relative motion as a test body in the Schwarzschild field of the total mass (the eta->0 limit
          // of the effective-one-body map). Gives the GR periastron advance, an ISCO at 6GM/c^2 and a plunge.
          [A, B] = schwarzschildCoefficients(gm, r, nx * vx + ny * vy + nz * vz, vx * vx + vy * vy + vz * vz);
        }
        if (rr && compact[i] && compact[j]) {
          // 2.5PN radiation reaction (Kidder 1995, eq. 2.2): reproduces the Peters GW luminosity.
          const eta = (m[i] * m[j]) / (mt * mt);
          const v2 = vx * vx + vy * vy + vz * vz;
          const rdot = nx * vx + ny * vy + nz * vz;
          // With GR dynamics, rescale so the Killing energy E = f u^t c^2 (not the Newtonian energy)
          // is lost at the quadrupole rate: dE/dt = f (u^t)^3 v·a for a tangential kick.
          const k = gr ? radiationScale(gm, r, rdot, v2) : 1;
          A += (k * (-(8 / 5) * eta * (gm / r) * rdot * (3 * v2 + (17 / 3) * (gm / r)))) / C5;
          B += (k * ((8 / 5) * eta * (gm / r) * (v2 + 3 * (gm / r)))) / C5;
        }
        const f = -gm / r2;
        const ax = f * (A * nx + B * vx);
        const ay = f * (A * ny + B * vy);
        const az = f * (A * nz + B * vz);
        const wi = m[j] / mt;
        const wj = m[i] / mt;
        acc[i3] += wi * ax;
        acc[i3 + 1] += wi * ay;
        acc[i3 + 2] += wi * az;
        acc[j3] -= wj * ax;
        acc[j3 + 1] -= wj * ay;
        acc[j3 + 2] -= wj * az;
      }
    }
  }

  private rk4(n: number, dt: number) {
    const { pos, vel, kPos, kVel, tmpPos, tmpVel } = this;
    const len = 3 * n;
    // k1
    kPos[0].set(vel.subarray(0, len));
    this.accelMassive(n, pos, vel, kVel[0]);
    // k2
    for (let i = 0; i < len; i++) {
      tmpPos[i] = pos[i] + 0.5 * dt * kPos[0][i];
      tmpVel[i] = vel[i] + 0.5 * dt * kVel[0][i];
    }
    kPos[1].set(tmpVel.subarray(0, len));
    this.accelMassive(n, tmpPos, tmpVel, kVel[1]);
    // k3
    for (let i = 0; i < len; i++) {
      tmpPos[i] = pos[i] + 0.5 * dt * kPos[1][i];
      tmpVel[i] = vel[i] + 0.5 * dt * kVel[1][i];
    }
    kPos[2].set(tmpVel.subarray(0, len));
    this.accelMassive(n, tmpPos, tmpVel, kVel[2]);
    // k4
    for (let i = 0; i < len; i++) {
      tmpPos[i] = pos[i] + dt * kPos[2][i];
      tmpVel[i] = vel[i] + dt * kVel[2][i];
    }
    kPos[3].set(tmpVel.subarray(0, len));
    this.accelMassive(n, tmpPos, tmpVel, kVel[3]);
    const s = dt / 6;
    for (let i = 0; i < len; i++) {
      pos[i] += s * (kPos[0][i] + 2 * kPos[1][i] + 2 * kPos[2][i] + kPos[3][i]);
      vel[i] += s * (kVel[0][i] + 2 * kVel[1][i] + 2 * kVel[2][i] + kVel[3][i]);
    }
  }

  /** Timestep from the shortest pairwise dynamical time; also finds the tightest compact pair. */
  private chooseDt(n: number, massive: Body[]): number {
    const { pos, vel, m, compact } = this;
    let tau = Infinity;
    let tightTau = Infinity;
    this.tightPair = null;
    for (let i = 0; i < n; i++) this.spacing[i] = Math.max(massive[i].radius * 30, 1);
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const dx = pos[3 * i] - pos[3 * j];
        const dy = pos[3 * i + 1] - pos[3 * j + 1];
        const dz = pos[3 * i + 2] - pos[3 * j + 2];
        const r = Math.sqrt(dx * dx + dy * dy + dz * dz);
        const dvx = vel[3 * i] - vel[3 * j];
        const dvy = vel[3 * i + 1] - vel[3 * j + 1];
        const dvz = vel[3 * i + 2] - vel[3 * j + 2];
        const v = Math.sqrt(dvx * dvx + dvy * dvy + dvz * dvz);
        const tDyn = Math.sqrt((r * r * r) / (G * (m[i] + m[j])));
        const t = Math.min(tDyn, v > 0 ? r / v : Infinity);
        if (t < tau) tau = t;
        if (compact[i] && compact[j] && t < tightTau) {
          tightTau = t;
          this.tightPair = [i, j];
        }
        const sp = 0.012 * r;
        if (m[j] > m[i] * 0.05 && sp < this.spacing[i]) this.spacing[i] = sp;
        if (m[i] > m[j] * 0.05 && sp < this.spacing[j]) this.spacing[j] = sp;
      }
    }
    this.minTau = tau;
    let dt = this.settings.accuracy * tau;
    const ring = this.gw.ringing(this.time);
    if (ring) dt = Math.min(dt, Math.min(ring.tau / 6, 1 / (ring.freq * 24)));
    return dt;
  }

  private checkCollisions(n: number, massive: Body[], out: PendingEvent[]) {
    const { pos } = this;
    for (let i = 0; i < n; i++) {
      const a = massive[i];
      for (let j = i + 1; j < n; j++) {
        const b = massive[j];
        const dx = pos[3 * i] - pos[3 * j];
        const dy = pos[3 * i + 1] - pos[3 * j + 1];
        const dz = pos[3 * i + 2] - pos[3 * j + 2];
        const r = Math.sqrt(dx * dx + dy * dy + dz * dz);
        const aBH = a.kind === 'blackHole';
        const bBH = b.kind === 'blackHole';
        if (aBH && bBH) {
          // Common horizon forms roughly when the separation drops to ~1.5 (r_s1 + r_s2) (light-ring scale).
          if (r < 1.5 * (schwarzschildRadius(a.mass) + schwarzschildRadius(b.mass))) {
            out.push({ type: 'merge', a, b });
            return;
          }
          continue;
        }
        if (aBH || bBH) {
          const bh = aBH ? a : b;
          const victim = aBH ? b : a;
          const rh = bh.radius;
          const rt = tidalRadius(bh.mass, victim.mass, victim.radius);
          if (this.settings.tidal && rt > rh * 1.05 && r < rt && victim.kind !== 'neutronStar') {
            out.push({ type: 'tde', bh, victim });
            return;
          }
          if (r < rh + (victim.kind === 'neutronStar' ? victim.radius : 0)) {
            out.push({ type: 'swallow', bh, victim });
            return;
          }
          continue;
        }
        if (r < a.radius + b.radius) {
          out.push({ type: 'collide', a, b });
          return;
        }
      }
    }
  }

  private hawking(n: number, massive: Body[], dt: number, out: PendingEvent[]) {
    if (!this.settings.hawking) return;
    const tBg = this.settings.cmbTemperature;
    for (let i = 0; i < n; i++) {
      const b = massive[i];
      if (b.kind !== 'blackHole') continue;
      const tH = hawkingTemperature(b.mass);
      if (tH > 50 * tBg) {
        // Analytic integration of dM/dt = -K/M^2 (exact over the step).
        const m3 = b.mass * b.mass * b.mass - 3 * HAWKING_K * dt;
        if (m3 <= 0) {
          b.mass = 0;
          out.push({ type: 'evaporate', bh: b });
          continue;
        }
        b.mass = Math.cbrt(m3);
      } else {
        b.mass += netMassRate(b.mass, tBg) * dt;
      }
      this.m[i] = b.mass;
      b.radius = kerrHorizon(b.mass, b.spin);
    }
  }

  /**
   * Advance the simulation by dtReq seconds of simulation time, spending at most budgetMs of wall time.
   * Returns the simulated time actually advanced.
   */
  advance(dtReq: number, budgetMs: number): number {
    const wall0 = performance.now();
    const deadline = wall0 + budgetMs;
    const t0 = this.time;
    const tTarget = this.time + dtReq;
    this.stats.massiveSteps = 0;
    this.stats.particleSteps = 0;
    this.stats.limited = false;
    let guard = 0;
    while (this.time < tTarget && guard++ < 64) {
      if (performance.now() > deadline) {
        this.stats.limited = true;
        break;
      }
      this.runChunk(tTarget, deadline);
    }
    if (this.time < tTarget && !this.stats.limited) this.stats.limited = true;
    const before = this.bodies.length;
    this.bodies = this.bodies.filter((b) => b.alive);
    if (this.bodies.length !== before) this.version++;
    // Decay accretion flares on a wall-clock timescale so they remain visible at any time warp.
    for (const b of this.bodies) if (b.flare > 0) b.flare *= 0.96;
    this.stats.physicsMs = performance.now() - wall0;
    return this.time - t0;
  }

  private runChunk(tTarget: number, deadline: number) {
    const massive = this.bodies.filter((b) => b.alive && b.massive);
    const particles = this.bodies.filter((b) => b.alive && !b.massive);
    const n = massive.length;
    this.ensureCapacity(n);
    const { m, pos, vel } = this;
    this.compact = massive.map((b) => COMPACT_KINDS.has(b.kind));
    for (let i = 0; i < n; i++) {
      const b = massive[i];
      m[i] = b.mass;
      pos[3 * i] = b.x;
      pos[3 * i + 1] = b.y;
      pos[3 * i + 2] = b.z;
      vel[3 * i] = b.vx;
      vel[3 * i + 1] = b.vy;
      vel[3 * i + 2] = b.vz;
    }
    const tStart = this.time;
    this.tightPair = null;
    let snaps = 0;
    const record = () => {
      this.snapT[snaps] = this.time;
      this.snapPos.set(pos.subarray(0, 3 * n), snaps * 3 * n);
      this.snapVel.set(vel.subarray(0, 3 * n), snaps * 3 * n);
      snaps++;
    };
    record();
    const events: PendingEvent[] = [];
    while (this.time < tTarget) {
      let dt = n > 1 ? this.chooseDt(n, massive) : Infinity;
      if (n <= 1) {
        const ring = this.gw.ringing(this.time);
        if (ring) dt = Math.min(ring.tau / 6, 1 / (ring.freq * 24));
        // Keep particle interpolation accurate around a single moving body.
        if (n === 1 && particles.length) {
          const v = Math.hypot(vel[0], vel[1], vel[2]);
          if (v > 0) dt = Math.min(dt, (massive[0].radius * 1e3) / v);
        }
      }
      dt = Math.min(dt, tTarget - this.time);
      if (!(dt > 0)) break;
      if (n > 0) this.rk4(n, dt);
      this.time += dt;
      this.stats.massiveSteps++;
      this.hawking(n, massive, dt, events);
      this.updateMassiveClocks(n, massive, dt);
      record();
      this.sampleGW(n, massive, dt);
      if (n > 1) this.checkCollisions(n, massive, events);
      if (events.length || snaps > MAX_SNAPSHOTS || performance.now() > deadline) break;
    }
    // Write back the massive state.
    for (let i = 0; i < n; i++) {
      const b = massive[i];
      b.x = pos[3 * i];
      b.y = pos[3 * i + 1];
      b.z = pos[3 * i + 2];
      b.vx = vel[3 * i];
      b.vy = vel[3 * i + 1];
      b.vz = vel[3 * i + 2];
      const tr = b.trail;
      const sp = this.spacing[i] || b.radius * 30;
      if (!(tr.count > 0) || (b.x - tr.lastX) ** 2 + (b.y - tr.lastY) ** 2 + (b.z - tr.lastZ) ** 2 > sp * sp) {
        tr.push(b.x, b.y, b.z);
      }
    }
    if (particles.length) this.integrateParticles(particles, massive, snaps, tStart, this.time);
    for (const e of events) this.applyEvent(e);
  }

  private updateMassiveClocks(n: number, massive: Body[], dt: number) {
    const { pos, vel, m } = this;
    for (let i = 0; i < n; i++) {
      let phi = 0;
      let dom = -1;
      let domPhi = 0;
      for (let j = 0; j < n; j++) {
        if (j === i) continue;
        const r = Math.hypot(pos[3 * i] - pos[3 * j], pos[3 * i + 1] - pos[3 * j + 1], pos[3 * i + 2] - pos[3 * j + 2]);
        const p = (2 * G * m[j]) / (C2 * r);
        phi += p;
        if (p > domPhi) {
          domPhi = p;
          dom = j;
        }
      }
      // Velocities are measured relative to a heavier dominant body; otherwise in the simulation frame.
      const rate =
        dom >= 0 && m[dom] > 0.2 * m[i]
          ? clockRate(phi, pos, 3 * i, pos, vel, 3 * dom, vel[3 * i], vel[3 * i + 1], vel[3 * i + 2])
          : Math.sqrt(Math.max(0, 1 - phi - (vel[3 * i] ** 2 + vel[3 * i + 1] ** 2 + vel[3 * i + 2] ** 2) / C2));
      massive[i].timeRate = rate;
      massive[i].properTime += rate * dt;
      // Magma-ocean surfaces of impact remnants cool on a ~1000-year timescale (order of magnitude).
      if (massive[i].kind === 'planet' && massive[i].temperature > 300) {
        massive[i].temperature = 300 + (massive[i].temperature - 300) * Math.exp(-dt / (1000 * YEAR_S));
      }
    }
  }

  private sampleGW(n: number, massive: Body[], dt: number) {
    const gw = this.gw;
    if (this.tightPair) {
      const [i, j] = this.tightPair;
      const { pos, vel } = this;
      const rx = pos[3 * i] - pos[3 * j];
      const ry = pos[3 * i + 1] - pos[3 * j + 1];
      const rz = pos[3 * i + 2] - pos[3 * j + 2];
      const vx = vel[3 * i] - vel[3 * j];
      const vy = vel[3 * i + 1] - vel[3 * j + 1];
      const vz = vel[3 * i + 2] - vel[3 * j + 2];
      const r2 = rx * rx + ry * ry + rz * rz;
      const h = Math.hypot(ry * vz - rz * vy, rz * vx - rx * vz, rx * vy - ry * vx);
      gw.freq = h / r2 / Math.PI;
      gw.luminosity = petersLuminosity(massive[i].mass, massive[j].mass, Math.sqrt(r2));
      gw.radiated += gw.luminosity * dt;
    } else {
      gw.freq = 0;
      gw.luminosity = 0;
    }
    const ring = gw.ringing(this.time);
    let spacing = n > 1 ? this.minTau * 0.04 : Infinity;
    if (ring) spacing = Math.min(spacing, 1 / (ring.freq * 16));
    if (gw.freq > 0) spacing = Math.min(spacing, 1 / (gw.freq * 24));
    if (!Number.isFinite(spacing) || this.time - gw.lastT < spacing) return;
    let hp = 0;
    let hx = 0;
    if (n > 1) {
      this.accelMassive(n, this.pos, this.vel, this.acc);
      [hp, hx] = quadrupoleStrain(n, this.m, this.pos, this.vel, this.acc, this.settings.gwDistance);
    }
    const [rp, rx] = gw.ringdownStrain(this.time);
    gw.push(this.time, hp + rp, hx + rx);
  }

  private interpolate(n: number, snaps: number, t: number, cursor: { k: number }) {
    const { snapT, snapPos, snapVel, ix, iv } = this;
    if (snaps < 2) {
      ix.set(snapPos.subarray(0, 3 * n));
      iv.set(snapVel.subarray(0, 3 * n));
      return;
    }
    let k = cursor.k;
    while (k < snaps - 2 && snapT[k + 1] < t) k++;
    cursor.k = k;
    const h = snapT[k + 1] - snapT[k];
    const s = h > 0 ? Math.min(1, Math.max(0, (t - snapT[k]) / h)) : 0;
    const s2 = s * s;
    const s3 = s2 * s;
    // Cubic Hermite basis using positions and velocities at both ends.
    const h00 = 2 * s3 - 3 * s2 + 1;
    const h10 = s3 - 2 * s2 + s;
    const h01 = -2 * s3 + 3 * s2;
    const h11 = s3 - s2;
    const d00 = 6 * s2 - 6 * s;
    const d10 = 3 * s2 - 4 * s + 1;
    const d01 = -6 * s2 + 6 * s;
    const d11 = 3 * s2 - 2 * s;
    const o0 = k * 3 * n;
    const o1 = (k + 1) * 3 * n;
    for (let i = 0; i < 3 * n; i++) {
      const p0 = snapPos[o0 + i];
      const p1 = snapPos[o1 + i];
      const v0 = snapVel[o0 + i];
      const v1 = snapVel[o1 + i];
      ix[i] = h00 * p0 + h10 * h * v0 + h01 * p1 + h11 * h * v1;
      iv[i] = h > 0 ? (d00 * p0 + d10 * h * v0 + d01 * p1 + d11 * h * v1) / h : v0;
    }
  }

  private integrateParticles(particles: Body[], massive: Body[], snaps: number, t0: number, t1: number) {
    const n = massive.length;
    const { m, ix, iv } = this;
    const gr = this.settings.gr;
    const eta = this.settings.accuracy * 2.5;
    // In coordinate time infalling matter only approaches r_s asymptotically, so capture just outside it.
    const capR = massive.map((b) => (b.kind === 'blackHole' ? Math.max(b.radius, 1.02 * schwarzschildRadius(b.mass)) : b.radius));
    const rsArr = massive.map((b) => (b.kind === 'blackHole' ? schwarzschildRadius(b.mass) : 0));
    const isBH = massive.map((b) => b.kind === 'blackHole');
    const dur = t1 - t0;
    if (!(dur > 0)) return;
    const minDt = dur / MAX_PARTICLE_SUBSTEPS;
    const absorbed: { j: number; p: Body }[] = [];
    let steps = 0;
    const cursor = { k: 0 };
    const out = new Float64Array(3);

    const accel = (x: number, y: number, z: number, vx: number, vy: number, vz: number) => {
      let ax = 0;
      let ay = 0;
      let az = 0;
      for (let j = 0; j < n; j++) {
        const dx = x - ix[3 * j];
        const dy = y - ix[3 * j + 1];
        const dz = z - ix[3 * j + 2];
        const r2 = dx * dx + dy * dy + dz * dz;
        const r = Math.sqrt(r2);
        const gm = G * m[j];
        const nx = dx / r;
        const ny = dy / r;
        const nz = dz / r;
        const rvx = vx - iv[3 * j];
        const rvy = vy - iv[3 * j + 1];
        const rvz = vz - iv[3 * j + 2];
        let A = 1;
        let B = 0;
        // Exact Schwarzschild geodesic in coordinate time; valid for both matter and light.
        if (gr) [A, B] = schwarzschildCoefficients(gm, r, nx * rvx + ny * rvy + nz * rvz, rvx * rvx + rvy * rvy + rvz * rvz);
        const f = -gm / r2;
        ax += f * (A * nx + B * rvx);
        ay += f * (A * ny + B * rvy);
        az += f * (A * nz + B * rvz);
      }
      out[0] = ax;
      out[1] = ay;
      out[2] = az;
    };

    for (const p of particles) {
      if (!p.alive) continue;
      cursor.k = 0;
      let t = t0;
      let { x, y, z, vx, vy, vz } = p;
      const isPhoton = p.kind === 'photon';
      let sub = 0;
      let dead = false;
      while (t < t1 && !dead) {
        this.interpolate(n, snaps, t, cursor);
        // Adaptive step and capture test.
        let dt = t1 - t;
        let rMin = Infinity;
        let phi = 0;
        let dom = -1;
        let domPhi = 0;
        for (let j = 0; j < n; j++) {
          const dx = x - ix[3 * j];
          const dy = y - ix[3 * j + 1];
          const dz = z - ix[3 * j + 2];
          const r = Math.sqrt(dx * dx + dy * dy + dz * dz);
          if (r < capR[j]) {
            absorbed.push({ j, p });
            dead = true;
            break;
          }
          if (r < rMin) rMin = r;
          const pj = (2 * G * m[j]) / (C2 * r);
          phi += pj;
          if (pj > domPhi) {
            domPhi = pj;
            dom = j;
          }
          const rv = Math.hypot(vx - iv[3 * j], vy - iv[3 * j + 1], vz - iv[3 * j + 2]);
          const gap = r - rsArr[j];
          const tj = isPhoton
            ? gap / C
            : Math.min(rv > 0 ? gap / rv : Infinity, Math.sqrt((r * r * r) / (G * m[j])));
          const e = isPhoton ? 0.04 : eta;
          if (e * tj < dt) dt = e * tj;
        }
        if (dead) break;
        // Escaping light and debris are dropped far from everything; spaceships are never removed.
        if (p.kind !== 'ship' && (rMin > this.cullRadius || (n === 0 && Math.hypot(x, y, z) > this.cullRadius))) {
          dead = true;
          p.alive = false;
          break;
        }
        dt = Math.max(dt, minDt);
        dt = Math.min(dt, t1 - t);
        // RK4
        const t2 = t + dt / 2;
        accel(x, y, z, vx, vy, vz);
        const k1x = vx, k1y = vy, k1z = vz;
        const l1x = out[0], l1y = out[1], l1z = out[2];
        this.interpolate(n, snaps, t2, cursor);
        accel(x + (dt / 2) * k1x, y + (dt / 2) * k1y, z + (dt / 2) * k1z, vx + (dt / 2) * l1x, vy + (dt / 2) * l1y, vz + (dt / 2) * l1z);
        const k2x = vx + (dt / 2) * l1x, k2y = vy + (dt / 2) * l1y, k2z = vz + (dt / 2) * l1z;
        const l2x = out[0], l2y = out[1], l2z = out[2];
        accel(x + (dt / 2) * k2x, y + (dt / 2) * k2y, z + (dt / 2) * k2z, vx + (dt / 2) * l2x, vy + (dt / 2) * l2y, vz + (dt / 2) * l2z);
        const k3x = vx + (dt / 2) * l2x, k3y = vy + (dt / 2) * l2y, k3z = vz + (dt / 2) * l2z;
        const l3x = out[0], l3y = out[1], l3z = out[2];
        this.interpolate(n, snaps, t + dt, cursor);
        accel(x + dt * k3x, y + dt * k3y, z + dt * k3z, vx + dt * l3x, vy + dt * l3y, vz + dt * l3z);
        const k4x = vx + dt * l3x, k4y = vy + dt * l3y, k4z = vz + dt * l3z;
        const l4x = out[0], l4y = out[1], l4z = out[2];
        const s = dt / 6;
        x += s * (k1x + 2 * k2x + 2 * k3x + k4x);
        y += s * (k1y + 2 * k2y + 2 * k3y + k4y);
        z += s * (k1z + 2 * k2z + 2 * k3z + k4z);
        vx += s * (l1x + 2 * l2x + 2 * l3x + l4x);
        vy += s * (l1y + 2 * l2y + 2 * l3y + l4y);
        vz += s * (l1z + 2 * l2z + 2 * l3z + l4z);
        t += dt;
        sub++;
        if (!isPhoton) {
          const rate = dom < 0 ? 1 : clockRate(phi, [x, y, z], 0, ix, iv, 3 * dom, vx, vy, vz);
          p.timeRate = rate;
          p.properTime += rate * dt;
        }
        const tr = p.trail;
        const sp = (isPhoton ? 0.01 : 0.02) * (Number.isFinite(rMin) ? rMin : 1e9);
        if (!(tr.count > 0) || (x - tr.lastX) ** 2 + (y - tr.lastY) ** 2 + (z - tr.lastZ) ** 2 > sp * sp) {
          // Photons store the locally measured wavelength with each point, so renderers need not recompute it.
          tr.push(x, y, z, isPhoton ? this.photonWavelength(p, x, y, z) : 0);
        }
      }
      steps += sub;
      p.x = x;
      p.y = y;
      p.z = z;
      p.vx = vx;
      p.vy = vy;
      p.vz = vz;
    }
    this.stats.particleSteps += steps;
    for (const { j, p } of absorbed) {
      const host = massive[j];
      p.alive = false;
      if (!host.alive) continue;
      const mt = host.mass + p.mass;
      if (mt > 0) {
        host.vx = (host.vx * host.mass + p.vx * p.mass) / mt;
        host.vy = (host.vy * host.mass + p.vy * p.mass) / mt;
        host.vz = (host.vz * host.mass + p.vz * p.mass) / mt;
      }
      host.mass = mt;
      if (isBH[j]) {
        host.radius = kerrHorizon(host.mass, host.spin);
        // ~6% (Schwarzschild thin disk) of the rest mass is released on the way in, in Eddington-seconds.
        host.flare += (0.057 * p.mass * C2) / eddingtonLuminosity(host.mass);
      }
    }
  }

  private applyEvent(e: PendingEvent) {
    switch (e.type) {
      case 'merge':
        return this.merge(e.a, e.b);
      case 'tde':
        return this.disrupt(e.bh, e.victim);
      case 'swallow':
        return this.swallow(e.bh, e.victim);
      case 'collide':
        return this.collide(e.a, e.b);
      case 'evaporate':
        return this.evaporate(e.bh);
    }
  }

  private merge(a: Body, b: Body) {
    if (!a.alive || !b.alive) return;
    const [big, small] = a.mass >= b.mass ? [a, b] : [b, a];
    const res = mergeBlackHoles(big.mass, small.mass, big.spin, small.spin);
    const mt = big.mass + small.mass;
    const cx = (big.x * big.mass + small.x * small.mass) / mt;
    const cy = (big.y * big.mass + small.y * small.mass) / mt;
    const cz = (big.z * big.mass + small.z * small.mass) / mt;
    const cvx = (big.vx * big.mass + small.vx * small.mass) / mt;
    const cvy = (big.vy * big.mass + small.vy * small.mass) / mt;
    const cvz = (big.vz * big.mass + small.vz * small.mass) / mt;
    // Kick in the orbital plane along the direction of motion of the lighter hole at merger.
    let kx = small.vx - cvx;
    let ky = small.vy - cvy;
    const kn = Math.hypot(kx, ky) || 1;
    kx /= kn;
    ky /= kn;
    const last = this.gw.latest();
    const amp = last ? Math.hypot(last.hp, last.hx) : 0;
    const phase = last ? Math.atan2(last.hx, last.hp) : 0;
    this.gw.ringdowns.push({
      t0: this.time,
      amp,
      phase,
      sense: this.gw.phaseSense(),
      freq: res.ringdownFreq,
      tau: res.ringdownTau,
    });
    this.gw.radiated += res.energy;
    this.logEvent('merger', {
      a: big.name,
      b: small.name,
      m1: big.mass,
      m2: small.mass,
      mf: res.mass,
      af: res.spin,
      erad: res.energy,
      frac: res.radiatedFraction,
      kick: res.kick,
      f: res.ringdownFreq,
      tau: res.ringdownTau,
    });
    big.mass = res.mass;
    big.spin = Math.abs(res.spin);
    big.radius = kerrHorizon(big.mass, big.spin);
    big.x = cx;
    big.y = cy;
    big.z = cz;
    big.vx = cvx + kx * res.kick;
    big.vy = cvy + ky * res.kick;
    big.vz = cvz;
    big.disk = big.disk || small.disk;
    small.alive = false;
    this.addEffect('gwave', cx, cy, cz, {
      energy: res.energy,
      freq: res.ringdownFreq,
      tau: res.ringdownTau,
      scale: big.radius,
    });
    this.version++;
  }

  private disrupt(bh: Body, victim: Body) {
    if (!bh.alive || !victim.alive) return;
    const rt = tidalRadius(bh.mass, victim.mass, victim.radius);
    const count = victim.kind === 'planet' ? 80 : 220;
    const group = this.newGroup();
    // Frozen-in approximation: each fluid element keeps the star's velocity at disruption.
    // The spread in position across the star gives the debris its spread in orbital energy.
    for (let k = 0; k < count; k++) {
      const u = Math.random() * 2 - 1;
      const phi = Math.random() * 2 * Math.PI;
      const rr = victim.radius * Math.cbrt(Math.random());
      const s = Math.sqrt(1 - u * u);
      this.add({
        kind: 'debris',
        name: `${victim.name} debris`,
        mass: victim.mass / count,
        radius: victim.radius / Math.cbrt(count),
        x: victim.x + rr * s * Math.cos(phi),
        y: victim.y + rr * s * Math.sin(phi),
        z: victim.z + rr * u * 0.3,
        vx: victim.vx,
        vy: victim.vy,
        vz: victim.vz,
        spin: 0,
        temperature: victim.temperature,
        color: victim.kind === 'planet' ? victim.color : starHex(victim.temperature),
        disk: false,
        eddington: 0,
        diskOuter: 0,
        group,
      });
    }
    victim.alive = false;
    this.logEvent('tde', { bh: bh.name, victim: victim.name, rt, mass: victim.mass });
    this.addEffect('tde', victim.x, victim.y, victim.z, { energy: victim.mass * C2 * 1e-3, scale: rt });
    this.trimParticles();
    this.version++;
  }

  private swallow(bh: Body, victim: Body) {
    if (!bh.alive || !victim.alive) return;
    const mt = bh.mass + victim.mass;
    bh.vx = (bh.vx * bh.mass + victim.vx * victim.mass) / mt;
    bh.vy = (bh.vy * bh.mass + victim.vy * victim.mass) / mt;
    bh.vz = (bh.vz * bh.mass + victim.vz * victim.mass) / mt;
    bh.mass = mt;
    bh.radius = kerrHorizon(bh.mass, bh.spin);
    victim.alive = false;
    this.logEvent('swallow', { bh: bh.name, victim: victim.name, mass: victim.mass });
    this.version++;
  }

  /**
   * Neutron stars above the TOV limit collapse to black holes; white dwarfs above the
   * Chandrasekhar limit explode as type Ia supernovae. Called after collisions and edits.
   */
  checkStability(b: Body, spin = 0.1) {
    if (!b.alive) return;
    if (b.kind === 'neutronStar' && b.mass > NS_MAX_MASS) {
      b.kind = 'blackHole';
      b.massive = true;
      b.spin = spin;
      b.radius = kerrHorizon(b.mass, b.spin);
      b.temperature = 0;
      this.logEvent('collapse', { name: b.name, mass: b.mass });
      this.version++;
    } else if (b.kind === 'whiteDwarf' && b.mass > CHANDRASEKHAR_MASS) {
      this.logEvent('supernova', { name: b.name, mass: b.mass });
      this.addEffect('flash', b.x, b.y, b.z, { energy: 1e44, scale: b.radius * 1e4 });
      b.alive = false;
      this.bodies = this.bodies.filter((x) => x.alive);
      this.version++;
    }
  }

  /** Put a body on a circular orbit around the body it orbits (keeping its position). */
  circularize(b: Body) {
    const host = this.orbitalHost(b);
    if (!host) return;
    const dx = b.x - host.x;
    const dy = b.y - host.y;
    const r = Math.hypot(dx, dy) || 1;
    const v = circularSpeed(host.mass + (b.massive ? b.mass : 0), r);
    b.vx = host.vx - (dy / r) * v;
    b.vy = host.vy + (dx / r) * v;
    b.vz = host.vz;
    b.trail.clear();
  }

  /** Bring a body to rest relative to the body it orbits. */
  stopRelative(b: Body) {
    const host = this.orbitalHost(b);
    b.vx = host?.vx ?? 0;
    b.vy = host?.vy ?? 0;
    b.vz = host?.vz ?? 0;
    b.trail.clear();
  }

  /**
   * Planet-planet collision: merger, partial disruption or catastrophic disruption depending on
   * the specific impact energy (Leinhardt & Stewart 2012). Ejecta become debris; the remnant's
   * surface melts (magma ocean) and cools with time.
   */
  private planetImpact(a: Body, b: Body) {
    const [big, small] = a.mass >= b.mass ? [a, b] : [b, a];
    const mt = big.mass + small.mass;
    const v = Math.hypot(a.vx - b.vx, a.vy - b.vy, a.vz - b.vz);
    const vEsc = Math.sqrt((2 * G * mt) / (big.radius + small.radius));
    const { q, qStar, remnantFraction } = impactOutcome(big.mass, small.mass, v);
    const cx = (big.x * big.mass + small.x * small.mass) / mt;
    const cy = (big.y * big.mass + small.y * small.mass) / mt;
    const cz = (big.z * big.mass + small.z * small.mass) / mt;
    const cvx = (big.vx * big.mass + small.vx * small.mass) / mt;
    const cvy = (big.vy * big.mass + small.vy * small.mass) / mt;
    const cvz = (big.vz * big.mass + small.vz * small.mass) / mt;
    // Mean density is kept; the remnant's radius follows from its mass.
    const rho = mt / ((4 / 3) * Math.PI * (big.radius ** 3 + small.radius ** 3));
    const mRem = mt * remnantFraction;
    const outcome = q / qStar < 0.1 ? 'merge' : q / qStar < 1.8 ? 'partial' : 'disruption';
    this.logEvent('planetImpact', {
      a: big.name,
      b: small.name,
      v,
      vesc: vEsc,
      ratio: q / qStar,
      frac: remnantFraction,
      outcome,
    });
    // Ejecta: a spray of debris leaving the impact site.
    const mEj = mt - mRem;
    const count = Math.min(240, Math.max(mEj > 0 ? 24 : 0, Math.round(240 * (mEj / mt) * 3)));
    const rRem = Math.cbrt((3 * mRem) / (4 * Math.PI * rho));
    const vEscRem = Math.sqrt((2 * G * mRem) / rRem);
    const ix = small.x - big.x;
    const iy = small.y - big.y;
    const il = Math.hypot(ix, iy) || 1;
    const group = this.newGroup();
    for (let k = 0; k < count; k++) {
      const spread = outcome === 'disruption' ? Math.PI : 1.1;
      const ang = Math.atan2(iy, ix) + (Math.random() - 0.5) * 2 * spread;
      // Most ejecta of gentle impacts stay bound (debris disk); disruptions fling material away.
      const sp = vEscRem * (outcome === 'disruption' ? 1.0 + Math.random() : 0.72 + Math.random() * 0.4);
      const rr = rRem * (1.05 + Math.random() * 0.3);
      this.add({
        kind: 'debris',
        name: `${small.name} ejecta`,
        mass: mEj / count,
        radius: rRem * 0.02,
        x: cx + Math.cos(ang) * rr,
        y: cy + Math.sin(ang) * rr,
        z: cz + (Math.random() - 0.5) * rRem * 0.4,
        vx: cvx + Math.cos(ang) * sp * 0.6 + (-iy / il) * sp * 0.8,
        vy: cvy + Math.sin(ang) * sp * 0.6 + (ix / il) * sp * 0.8,
        vz: cvz + (Math.random() - 0.5) * sp * 0.2,
        spin: 0,
        temperature: 2500,
        color: Math.random() < 0.5 ? '#ff9a4a' : '#9c8f84',
        disk: false,
        eddington: 0,
        diskOuter: 0,
        group,
      });
    }
    big.mass = mRem;
    big.radius = rRem;
    big.x = cx;
    big.y = cy;
    big.z = cz;
    big.vx = cvx;
    big.vy = cvy;
    big.vz = cvz;
    // The surface melts: no longer the original world, glowing magma that cools over time.
    big.model = undefined;
    big.color = '#5a3a2a';
    big.temperature = 2500;
    big.name = `${big.name}+${small.name}`;
    small.alive = false;
    this.addEffect('flash', cx, cy, cz, { energy: q * mt, scale: rRem * 3 });
    this.version++;
  }

  private collide(a: Body, b: Body) {
    if (!a.alive || !b.alive) return;
    if (a.kind === 'planet' && b.kind === 'planet') return this.planetImpact(a, b);
    const [big, small] = a.mass >= b.mass ? [a, b] : [b, a];
    const mt = big.mass + small.mass;
    big.x = (big.x * big.mass + small.x * small.mass) / mt;
    big.y = (big.y * big.mass + small.y * small.mass) / mt;
    big.z = (big.z * big.mass + small.z * small.mass) / mt;
    big.vx = (big.vx * big.mass + small.vx * small.mass) / mt;
    big.vy = (big.vy * big.mass + small.vy * small.mass) / mt;
    big.vz = (big.vz * big.mass + small.vz * small.mass) / mt;
    small.alive = false;
    const nsMerger = big.kind === 'neutronStar' && small.kind === 'neutronStar';
    if (nsMerger) {
      this.logEvent('kilonova', { a: big.name, b: small.name, mass: mt });
      this.addEffect('flash', big.x, big.y, big.z, { energy: 1e46, scale: big.radius * 1e3 });
    } else {
      this.logEvent('collision', { a: big.name, b: small.name, mass: mt });
    }
    if (big.kind === 'star' && small.kind === 'star') {
      big.radius = Math.cbrt(big.radius ** 3 + small.radius ** 3);
      big.temperature = (big.temperature * big.mass + small.temperature * small.mass) / mt;
    }
    big.mass = mt;
    this.checkStability(big, nsMerger ? 0.7 : 0.1);
    this.version++;
  }

  private evaporate(bh: Body) {
    bh.alive = false;
    // Energy emitted during the final second of evaporation: M(1 s) c^2 with M(1 s) = (3K * 1 s)^(1/3).
    const lastSecond = Math.cbrt(3 * HAWKING_K) * C2;
    this.logEvent('evaporation', { name: bh.name, energy: lastSecond });
    this.addEffect('flash', bh.x, bh.y, bh.z, { energy: lastSecond, scale: 1 });
    this.version++;
  }

  private trimParticles() {
    const parts = this.bodies.filter((b) => b.alive && !b.massive && b.kind !== 'ship');
    const excess = parts.length - MAX_PARTICLES;
    for (let i = 0; i < excess; i++) parts[i].alive = false;
  }
}

/**
 * Coefficients of the exact Schwarzschild geodesic equation in coordinate time,
 *   a = -(GM/r^2) [A n + B v],  A = f + 2(v^2 - r'^2)/c^2 - r'^2/(c^2 f),  B = -2 r'/(c^2 f),
 * with f = 1 - 2GM/(c^2 r), Schwarzschild r and coordinate velocities. Holds for massive and null
 * geodesics alike; circular orbits obey Kepler's law v^2 = GM/r, light orbits at r = 3GM/c^2.
 */
export function schwarzschildCoefficients(gm: number, r: number, rdot: number, v2: number): [number, number] {
  const f = Math.max(1 - (2 * gm) / (C2 * r), 1e-4);
  const rd2 = rdot * rdot;
  return [f + (2 * (v2 - rd2)) / C2 - rd2 / (C2 * f), (-2 * rdot) / (C2 * f)];
}

/** 1 / (f (u^t)^3) for the relative orbit: converts a Newtonian energy-loss rate to Killing energy. */
function radiationScale(gm: number, r: number, rdot: number, v2: number): number {
  const f = Math.max(1 - (2 * gm) / (C2 * r), 1e-4);
  const rd2 = rdot * rdot;
  const norm = Math.max(f - rd2 / (f * C2) - (v2 - rd2) / C2, 1e-6);
  return norm ** 1.5 / f;
}

type Vec = ArrayLike<number>;

/**
 * Clock rate dτ/dt from the Schwarzschild line element with coordinate velocities,
 *   dτ/dt = sqrt(f - u_r^2/(f c^2) - u_t^2/c^2),  f = 1 - Σ r_s/r,
 * with u measured relative to the dominant mass. Exact for a single Schwarzschild hole.
 */
function clockRate(phi: number, p: Vec, o: number, hp: Vec, hv: Vec, ho: number, vx: number, vy: number, vz: number): number {
  const f = 1 - phi;
  if (f <= 0) return 0;
  const dx = p[o] - hp[ho];
  const dy = p[o + 1] - hp[ho + 1];
  const dz = p[o + 2] - hp[ho + 2];
  const r = Math.hypot(dx, dy, dz) || 1;
  const ux = vx - hv[ho];
  const uy = vy - hv[ho + 1];
  const uz = vz - hv[ho + 2];
  const ur = (ux * dx + uy * dy + uz * dz) / r;
  const u2 = ux * ux + uy * uy + uz * uz;
  const ut2 = Math.max(0, u2 - ur * ur);
  return Math.sqrt(Math.max(0, f - (ur * ur) / (f * C2) - ut2 / C2));
}

/** Circular orbital speed at radius r. In Schwarzschild coordinate time Kepler's law v^2 = GM/r is exact. */
export function circularSpeed(mass: number, r: number): number {
  return Math.sqrt((G * mass) / r);
}

/** Approximate sRGB hex colour of a black body (used for debris and UI swatches). */
export function starHex(t: number): string {
  const [r, g, b] = blackbodyRGB(t);
  const h = (v: number) =>
    Math.round(Math.max(0, Math.min(1, v)) * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
}

/** Black-body colour (normalised, sRGB-ish), Tanner Helland fit; valid ~1000 K - 40000 K. */
export function blackbodyRGB(tk: number): [number, number, number] {
  const t = Math.max(1000, Math.min(40000, tk)) / 100;
  let r: number;
  let g: number;
  let b: number;
  if (t <= 66) {
    r = 255;
    g = 99.4708025861 * Math.log(t) - 161.1195681661;
    b = t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307;
  } else {
    r = 329.698727446 * Math.pow(t - 60, -0.1332047592);
    g = 288.1221695283 * Math.pow(t - 60, -0.0755148492);
    b = 255;
  }
  return [r / 255, g / 255, b / 255].map((v) => Math.max(0, Math.min(1, v))) as [number, number, number];
}
