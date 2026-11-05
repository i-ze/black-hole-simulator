export type BodyKind =
  | 'blackHole'
  | 'star'
  | 'neutronStar'
  | 'whiteDwarf'
  | 'planet'
  | 'ship'
  | 'meteor'
  | 'photon'
  | 'debris';

/** Kinds that source gravity and are integrated as a full N-body system. */
export const MASSIVE_KINDS: ReadonlySet<BodyKind> = new Set(['blackHole', 'star', 'neutronStar', 'whiteDwarf', 'planet']);

/** Compact objects: post-Newtonian radiation reaction is applied between pairs of these. */
export const COMPACT_KINDS: ReadonlySet<BodyKind> = new Set(['blackHole', 'neutronStar']);

export class Trail {
  readonly data: Float64Array;
  /** One extra value per point (photons: wavelength in nm at that point, computed once). */
  readonly values: Float32Array;
  head = 0;
  count = 0;
  lastX = NaN;
  lastY = NaN;
  lastZ = NaN;

  constructor(readonly capacity: number) {
    this.data = new Float64Array(capacity * 3);
    this.values = new Float32Array(capacity);
  }

  push(x: number, y: number, z: number, value = 0) {
    const i = this.head * 3;
    this.data[i] = x;
    this.data[i + 1] = y;
    this.data[i + 2] = z;
    this.values[this.head] = value;
    this.head = (this.head + 1) % this.capacity;
    if (this.count < this.capacity) this.count++;
    this.lastX = x;
    this.lastY = y;
    this.lastZ = z;
  }

  /** Iterate points from oldest to newest. */
  forEach(fn: (x: number, y: number, z: number, i: number, n: number, value: number) => void) {
    const n = this.count;
    const start = (this.head - n + this.capacity) % this.capacity;
    for (let k = 0; k < n; k++) {
      const j = (start + k) % this.capacity;
      const i = j * 3;
      fn(this.data[i], this.data[i + 1], this.data[i + 2], k, n, this.values[j]);
    }
  }

  clear() {
    this.head = 0;
    this.count = 0;
    this.lastX = NaN;
  }
}

export interface Body {
  id: number;
  kind: BodyKind;
  name: string;
  /** kg */
  mass: number;
  /** Physical radius, m. For black holes this is kept equal to the outer horizon. */
  radius: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  /** Black holes: dimensionless Kerr spin a*. Planets: rotation phase at t = 0, rad. */
  spin: number;
  /** Effective surface temperature, K (stars). */
  temperature: number;
  /** Display colour (planets, ships, meteors). */
  color: string;
  massive: boolean;
  alive: boolean;
  trail: Trail;
  /** Accumulated proper time of the body's own clock, s. */
  properTime: number;
  /** Last proper-time rate dτ/dt (weak-field estimate). */
  timeRate: number;
  /** Black holes: render an accretion disk. */
  disk: boolean;
  /** Black holes: disk accretion rate in Eddington units. */
  eddington: number;
  /** Black holes: outer disk radius in units of GM/c^2. */
  diskOuter: number;
  /** Energy released recently by accreted matter, in units of L_Edd × 1 s (decays). */
  flare: number;
  /** Simulation time when the body was created. */
  born: number;
  /** Optional group (meteor swarm, debris stream, photon beam). */
  group?: number;
  /** Ship catalogue id (see ships.ts). */
  model?: string;
  /** Photons: wavelength measured by a static observer at the emission point, nm. */
  wavelength?: number;
  /** Photons: f = 1 - Σ r_s/r at the emission point (for the gravitational frequency shift). */
  emitF?: number;
}

export type EventKind =
  | 'merger'
  | 'tde'
  | 'swallow'
  | 'evaporation'
  | 'collision'
  | 'kilonova'
  | 'supernova'
  | 'collapse'
  | 'planetImpact';

export interface SimEvent {
  id: number;
  time: number;
  kind: EventKind;
  data: Record<string, number | string>;
}

export type EffectKind = 'flash' | 'gwave' | 'tde';

export interface Effect {
  id: number;
  kind: EffectKind;
  x: number;
  y: number;
  z: number;
  simTime: number;
  wallTime: number;
  /** Energy scale, J. */
  energy: number;
  /** Characteristic frequency, Hz (gravitational wave rings). */
  freq: number;
  /** Damping time, s. */
  tau: number;
  /** Characteristic length (e.g. horizon of the remnant). */
  scale: number;
}

export interface SimSettings {
  /** Apply general-relativistic corrections (Schwarzschild orbit shapes, 1PN). */
  gr: boolean;
  /** 2.5PN gravitational-wave radiation reaction between compact objects. */
  radiationReaction: boolean;
  /** Hawking evaporation and CMB absorption. */
  hawking: boolean;
  /** Tidal disruption of stars and planets. */
  tidal: boolean;
  /** Background radiation temperature, K. */
  cmbTemperature: number;
  /** Distance of the observer for GW strain, m. */
  gwDistance: number;
  /** Integrator accuracy parameter (fraction of the shortest dynamical time per step). */
  accuracy: number;
}

export interface SimStats {
  massiveSteps: number;
  particleSteps: number;
  /** True when the CPU budget prevented reaching the requested time warp. */
  limited: boolean;
  /** Effective time warp achieved over the last frame. */
  effectiveWarp: number;
  /** Physics wall time of the last frame, ms. */
  physicsMs: number;
}
