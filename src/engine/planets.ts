import { M_EARTH, R_EARTH } from '../physics/constants';

/** Texture slots shared by the renderers (order = sampler index in the ray tracer). */
export const PLANET_TEXTURES = [
  'earth_daymap',
  'earth_nightmap',
  'earth_clouds',
  'mercury',
  'venus_atmosphere',
  'moon',
  'mars',
  'jupiter',
  'saturn',
  'uranus',
  'neptune',
  'saturn_ring_alpha',
] as const;
export type PlanetTexture = (typeof PLANET_TEXTURES)[number];

export interface PlanetModel {
  id: string;
  mass: number;
  radius: number;
  color: string;
  /** Sidereal rotation period, hours (negative = retrograde). */
  rotationHours: number;
  /** Obliquity to the ecliptic, degrees; the north pole tilts towards ecliptic longitude 90°. */
  tilt: number;
  texture: PlanetTexture;
  /** Earth: night lights, clouds, oceans and atmosphere. */
  earth?: boolean;
  /** Thick atmosphere haze strength (0..1) at the limb. */
  haze?: number;
  /** Ring extent in planet radii. */
  ring?: [number, number];
}

/** NASA planetary fact sheet values. */
export const PLANETS: PlanetModel[] = [
  { id: 'mercury', mass: 3.3011e23, radius: 2.4397e6, color: '#9e9b96', rotationHours: 1407.6, tilt: 0.03, texture: 'mercury' },
  { id: 'venus', mass: 4.8675e24, radius: 6.0518e6, color: '#e8cda2', rotationHours: -5832.5, tilt: 177.4, texture: 'venus_atmosphere', haze: 0.6 },
  { id: 'earth', mass: M_EARTH, radius: R_EARTH, color: '#4f8fd8', rotationHours: 23.934, tilt: 23.44, texture: 'earth_daymap', earth: true },
  // Moon: obliquity to the ecliptic (the simulation plane), not to its own orbit.
  { id: 'moon', mass: 7.342e22, radius: 1.7374e6, color: '#a7a5a0', rotationHours: 655.72, tilt: 1.54, texture: 'moon' },
  { id: 'mars', mass: 6.4171e23, radius: 3.3895e6, color: '#c1502e', rotationHours: 24.623, tilt: 25.19, texture: 'mars', haze: 0.15 },
  { id: 'jupiter', mass: 1.89813e27, radius: 6.9911e7, color: '#d8b48a', rotationHours: 9.925, tilt: 3.13, texture: 'jupiter', haze: 0.25 },
  { id: 'saturn', mass: 5.6834e26, radius: 5.8232e7, color: '#e3d3a3', rotationHours: 10.656, tilt: 26.73, texture: 'saturn', haze: 0.25, ring: [1.24, 2.27] },
  { id: 'uranus', mass: 8.681e25, radius: 2.5362e7, color: '#9fd9e3', rotationHours: -17.24, tilt: 97.77, texture: 'uranus', haze: 0.45 },
  { id: 'neptune', mass: 1.02413e26, radius: 2.4622e7, color: '#4b70dd', rotationHours: 16.11, tilt: 28.32, texture: 'neptune', haze: 0.45 },
];

export const planetById = (id: string | undefined) => PLANETS.find((p) => p.id === id);

/**
 * Spin angle (rad) of a planet at simulation time t, i.e. the direction (from the equinox, about the
 * pole) of its prime meridian. `phase` is the angle at t = 0 (Earth: Greenwich sidereal time).
 * Falls back to a slow visual spin when the true rotation is too fast to follow.
 */
export function planetSpin(p: PlanetModel, simTime: number, warp: number, wallSeconds: number, phase = 0): number {
  const omega = (2 * Math.PI) / (p.rotationHours * 3600);
  if (Math.abs(omega * warp) > 2) return (phase + Math.sign(omega) * wallSeconds * 0.4) % (2 * Math.PI);
  return (phase + omega * simTime) % (2 * Math.PI);
}
