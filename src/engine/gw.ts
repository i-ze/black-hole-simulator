import { C, G } from '../physics/constants';

export interface Ringdown {
  t0: number;
  amp: number;
  phase: number;
  /** +1 or -1: sense of rotation of the polarisation phase. */
  sense: number;
  freq: number;
  tau: number;
}

/**
 * Records the gravitational-wave strain seen by a face-on observer (on the +z axis)
 * at distance D, using the quadrupole formula
 *   h+ = G/(c^4 D) (Ï_xx - Ï_yy),  h× = 2G/(c^4 D) Ï_xy,
 * with Ï_ij = Σ m (a_i x_j + 2 v_i v_j + x_i a_j) in the centre-of-mass frame.
 * After a black hole merger, the l=m=2 quasi-normal-mode ringdown is appended.
 */
export class GWRecorder {
  readonly capacity = 4096;
  readonly t = new Float64Array(this.capacity);
  readonly hp = new Float64Array(this.capacity);
  readonly hx = new Float64Array(this.capacity);
  head = 0;
  count = 0;
  lastT = -Infinity;
  ringdowns: Ringdown[] = [];
  /** Instantaneous GW frequency of the tightest bound pair, Hz. */
  freq = 0;
  /** Peters luminosity of the tightest bound pair, W. */
  luminosity = 0;
  /** Peak |h| seen so far. */
  peak = 0;
  /** Total energy radiated in GWs (integrated luminosity + merger budgets), J. */
  radiated = 0;

  clear() {
    this.head = 0;
    this.count = 0;
    this.lastT = -Infinity;
    this.ringdowns = [];
    this.freq = 0;
    this.luminosity = 0;
    this.peak = 0;
    this.radiated = 0;
  }

  rescale(f: number) {
    for (let i = 0; i < this.capacity; i++) {
      this.hp[i] *= f;
      this.hx[i] *= f;
    }
    for (const r of this.ringdowns) r.amp *= f;
    this.peak *= f;
  }

  push(t: number, hp: number, hx: number) {
    this.t[this.head] = t;
    this.hp[this.head] = hp;
    this.hx[this.head] = hx;
    this.head = (this.head + 1) % this.capacity;
    if (this.count < this.capacity) this.count++;
    this.lastT = t;
    const a = Math.hypot(hp, hx);
    if (a > this.peak) this.peak = a;
  }

  latest(): { t: number; hp: number; hx: number } | null {
    if (!this.count) return null;
    const i = (this.head - 1 + this.capacity) % this.capacity;
    return { t: this.t[i], hp: this.hp[i], hx: this.hx[i] };
  }

  /** Phase rotation sense estimated from the last two samples. */
  phaseSense(): number {
    if (this.count < 2) return 1;
    const i1 = (this.head - 1 + this.capacity) % this.capacity;
    const i0 = (this.head - 2 + this.capacity) % this.capacity;
    const cross = this.hp[i0] * this.hx[i1] - this.hx[i0] * this.hp[i1];
    return cross >= 0 ? 1 : -1;
  }

  ringdownStrain(t: number): [number, number] {
    let hp = 0;
    let hx = 0;
    for (const r of this.ringdowns) {
      const dt = t - r.t0;
      if (dt < 0) continue;
      const env = r.amp * Math.exp(-dt / r.tau);
      const ph = r.phase + r.sense * 2 * Math.PI * r.freq * dt;
      hp += env * Math.cos(ph);
      hx += env * Math.sin(ph);
    }
    return [hp, hx];
  }

  /** True while any ringdown is still ringing (within 12 e-folds). */
  ringing(t: number): Ringdown | null {
    let best: Ringdown | null = null;
    for (const r of this.ringdowns) if (t < r.t0 + 12 * r.tau && (!best || r.tau < best.tau)) best = r;
    return best;
  }

  forEach(fn: (t: number, hp: number, hx: number, i: number, n: number) => void) {
    const n = this.count;
    const start = (this.head - n + this.capacity) % this.capacity;
    for (let k = 0; k < n; k++) {
      const i = (start + k) % this.capacity;
      fn(this.t[i], this.hp[i], this.hx[i], k, n);
    }
  }
}

/** Quadrupole strain for a set of point masses. Arrays are positions/velocities/accelerations, stride 3. */
export function quadrupoleStrain(
  n: number,
  m: Float64Array,
  pos: Float64Array,
  vel: Float64Array,
  acc: Float64Array,
  distance: number,
): [number, number] {
  let mt = 0;
  let cx = 0;
  let cy = 0;
  let cvx = 0;
  let cvy = 0;
  for (let i = 0; i < n; i++) {
    mt += m[i];
    cx += m[i] * pos[3 * i];
    cy += m[i] * pos[3 * i + 1];
    cvx += m[i] * vel[3 * i];
    cvy += m[i] * vel[3 * i + 1];
  }
  if (mt <= 0) return [0, 0];
  cx /= mt;
  cy /= mt;
  cvx /= mt;
  cvy /= mt;
  let ixx = 0;
  let iyy = 0;
  let ixy = 0;
  for (let i = 0; i < n; i++) {
    const x = pos[3 * i] - cx;
    const y = pos[3 * i + 1] - cy;
    const vx = vel[3 * i] - cvx;
    const vy = vel[3 * i + 1] - cvy;
    const ax = acc[3 * i];
    const ay = acc[3 * i + 1];
    ixx += m[i] * (2 * ax * x + 2 * vx * vx);
    iyy += m[i] * (2 * ay * y + 2 * vy * vy);
    ixy += m[i] * (ax * y + 2 * vx * vy + x * ay);
  }
  const k = G / (C ** 4 * distance);
  return [k * (ixx - iyy), 2 * k * ixy];
}
