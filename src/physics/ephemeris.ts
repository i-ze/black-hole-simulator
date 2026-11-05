import { AU } from './constants';

/**
 * Low-precision ephemerides after J. Meeus, "Astronomical Algorithms" (2nd ed.):
 *  - Sun: ch. 25 (accuracy ~0.01°),
 *  - Moon: ch. 47 with the largest periodic terms (accuracy ~0.1-0.3°, a few hundred km),
 *  - sidereal time: ch. 12.
 * Coordinates are geocentric ecliptic of date; the simulation's xy plane is the ecliptic.
 */

const D2R = Math.PI / 180;

export const julianDay = (unixMs: number) => unixMs / 86400000 + 2440587.5;

const centuries = (jd: number) => (jd - 2451545.0) / 36525;

export interface Spherical {
  /** Ecliptic longitude, rad. */
  lon: number;
  /** Ecliptic latitude, rad. */
  lat: number;
  /** Distance, m. */
  r: number;
}

export function sunGeocentric(jd: number): Spherical {
  const T = centuries(jd);
  const L0 = 280.46646 + 36000.76983 * T + 0.0003032 * T * T;
  const M = (357.52911 + 35999.05029 * T - 0.0001537 * T * T) * D2R;
  const e = 0.016708634 - 0.000042037 * T;
  const C = (1.914602 - 0.004817 * T) * Math.sin(M) + (0.019993 - 0.000101 * T) * Math.sin(2 * M) + 0.000289 * Math.sin(3 * M);
  const lon = (L0 + C) * D2R;
  const nu = M + C * D2R;
  const r = (1.000001018 * (1 - e * e)) / (1 + e * Math.cos(nu));
  return { lon, lat: 0, r: r * AU };
}

// Largest terms of Meeus table 47.A (longitude in 1e-6 deg, distance in m) and 47.B (latitude).
// Columns: D, M, M', F, coefficient(s).
const LR: [number, number, number, number, number, number][] = [
  [0, 0, 1, 0, 6288774, -20905355],
  [2, 0, -1, 0, 1274027, -3699111],
  [2, 0, 0, 0, 658314, -2955968],
  [0, 0, 2, 0, 213618, -569925],
  [0, 1, 0, 0, -185116, 48888],
  [0, 0, 0, 2, -114332, -3149],
  [2, 0, -2, 0, 58793, 246158],
  [2, -1, -1, 0, 57066, -152138],
  [2, 0, 1, 0, 53322, -170733],
  [2, -1, 0, 0, 45758, -204586],
  [0, 1, -1, 0, -40923, -129620],
  [1, 0, 0, 0, -34720, 108743],
  [0, 1, 1, 0, -30383, 104755],
  [2, 0, 0, -2, 15327, 10321],
  [0, 0, 1, 2, -12528, 0],
  [0, 0, 1, -2, 10980, 79661],
  [4, 0, -1, 0, 10675, -34782],
  [0, 0, 3, 0, 10034, -23210],
  [4, 0, -2, 0, 8548, -21636],
  [2, 1, -1, 0, -7888, 24208],
  [2, 1, 0, 0, -6766, 30824],
  [1, 0, -1, 0, -5163, -8379],
  [1, 1, 0, 0, 4987, -16675],
  [2, -1, 1, 0, 4036, -12831],
];
const B: [number, number, number, number, number][] = [
  [0, 0, 0, 1, 5128122],
  [0, 0, 1, 1, 280602],
  [0, 0, 1, -1, 277693],
  [2, 0, 0, -1, 173237],
  [2, 0, -1, 1, 55413],
  [2, 0, -1, -1, 46271],
  [2, 0, 0, 1, 32573],
  [0, 0, 2, 1, 17198],
  [2, 0, 1, -1, 9266],
  [0, 0, 2, -1, 8822],
  [2, -1, 0, -1, 8216],
  [2, 0, -2, -1, 4324],
  [2, 0, 1, 1, 4200],
];

export function moonGeocentric(jd: number): Spherical {
  const T = centuries(jd);
  const Lp = 218.3164477 + 481267.88123421 * T;
  const D = (297.8501921 + 445267.1114034 * T) * D2R;
  const M = (357.5291092 + 35999.0502909 * T) * D2R;
  const Mp = (134.9633964 + 477198.8675055 * T) * D2R;
  const F = (93.272095 + 483202.0175233 * T) * D2R;
  // Terms involving M are scaled by the decreasing eccentricity of the Earth's orbit.
  const E = 1 - 0.002516 * T - 0.0000074 * T * T;
  let sl = 0;
  let sr = 0;
  for (const [d, m, mp, f, l, r] of LR) {
    const arg = d * D + m * M + mp * Mp + f * F;
    const e = Math.abs(m) === 1 ? E : 1;
    sl += l * e * Math.sin(arg);
    sr += r * e * Math.cos(arg);
  }
  let sb = 0;
  for (const [d, m, mp, f, b] of B) {
    const e = Math.abs(m) === 1 ? E : 1;
    sb += b * e * Math.sin(d * D + m * M + mp * Mp + f * F);
  }
  return { lon: (Lp + sl / 1e6) * D2R, lat: (sb / 1e6) * D2R, r: 385000560 + sr };
}

/** Greenwich mean sidereal time, rad. */
export function gmst(jd: number): number {
  const T = centuries(jd);
  const deg = 280.46061837 + 360.98564736629 * (jd - 2451545.0) + 0.000387933 * T * T;
  return ((((deg % 360) + 360) % 360) * D2R);
}

export function toCartesian(s: Spherical): [number, number, number] {
  const c = Math.cos(s.lat);
  return [s.r * c * Math.cos(s.lon), s.r * c * Math.sin(s.lon), s.r * Math.sin(s.lat)];
}
