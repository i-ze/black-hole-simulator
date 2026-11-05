import { kerrHorizon } from '../physics/blackhole';
import { M_SUN, R_SUN } from '../physics/constants';
import { planetById } from './planets';
import { SHIPS, shipById } from './ships';
import { MASSIVE_KINDS, Trail, type Body, type BodyKind } from './types';

export type NewBody = Omit<Body, 'id' | 'trail' | 'alive' | 'massive' | 'properTime' | 'timeRate' | 'flare' | 'born'> &
  Partial<Pick<Body, 'properTime'>>;

export function trailCapacity(kind: BodyKind): number {
  if (kind === 'photon') return 400;
  if (MASSIVE_KINDS.has(kind)) return 1500;
  if (kind === 'ship') return 1200;
  return 90;
}

export function materialize(id: number, b: NewBody, time: number): Body {
  const massive = MASSIVE_KINDS.has(b.kind);
  const body: Body = {
    ...b,
    id,
    massive,
    alive: true,
    trail: new Trail(trailCapacity(b.kind)),
    properTime: b.properTime ?? 0,
    timeRate: 1,
    flare: 0,
    born: time,
  };
  if (body.kind === 'blackHole') body.radius = kerrHorizon(body.mass, body.spin);
  return body;
}

const base = {
  x: 0,
  y: 0,
  z: 0,
  vx: 0,
  vy: 0,
  vz: 0,
  spin: 0,
  temperature: 0,
  color: '#ffffff',
  disk: false,
  eddington: 0.1,
  diskOuter: 30,
};

export function blackHole(mass: number, opts: Partial<NewBody> = {}): NewBody {
  return { ...base, kind: 'blackHole', name: 'BH', mass, radius: 0, ...opts };
}

export type StarPreset = 'redDwarf' | 'sun' | 'blueGiant' | 'redGiant' | 'whiteDwarf' | 'neutronStar';

export const STAR_PRESETS: Record<StarPreset, { kind: BodyKind; mass: number; radius: number; temperature: number }> = {
  redDwarf: { kind: 'star', mass: 0.3 * M_SUN, radius: 0.32 * R_SUN, temperature: 3300 },
  sun: { kind: 'star', mass: M_SUN, radius: R_SUN, temperature: 5772 },
  blueGiant: { kind: 'star', mass: 15 * M_SUN, radius: 7 * R_SUN, temperature: 30000 },
  redGiant: { kind: 'star', mass: 1.2 * M_SUN, radius: 50 * R_SUN, temperature: 4000 },
  whiteDwarf: { kind: 'whiteDwarf', mass: 0.6 * M_SUN, radius: 8.8e6, temperature: 20000 },
  neutronStar: { kind: 'neutronStar', mass: 1.4 * M_SUN, radius: 1.2e4, temperature: 1e6 },
};

export function star(preset: StarPreset, opts: Partial<NewBody> = {}): NewBody {
  const p = STAR_PRESETS[preset];
  return { ...base, name: 'Star', ...p, ...opts };
}

export type PlanetPreset = string;

/** Solar System planets (and the Moon) with real masses and radii; `model` selects the texture. */
export function planet(preset: PlanetPreset, opts: Partial<NewBody> = {}): NewBody {
  const p = planetById(preset) ?? planetById('earth')!;
  const name = p.id.charAt(0).toUpperCase() + p.id.slice(1);
  return { ...base, kind: 'planet', name, mass: p.mass, radius: p.radius, color: p.color, model: p.id, ...opts };
}

export function ship(model: string, opts: Partial<NewBody> = {}): NewBody {
  const m = shipById(model) ?? SHIPS[0];
  return { ...base, kind: 'ship', name: m.name, mass: m.mass, radius: m.length / 2, color: m.color, model: m.id, ...opts };
}

export function meteor(opts: Partial<NewBody> = {}): NewBody {
  return { ...base, kind: 'meteor', name: 'Meteor', mass: 1e10, radius: 150, color: '#c9b8a6', ...opts };
}

export function photon(opts: Partial<NewBody> = {}): NewBody {
  return { ...base, kind: 'photon', name: 'γ', mass: 0, radius: 0, color: '#fff3b0', ...opts };
}
