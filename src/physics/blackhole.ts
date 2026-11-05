import { C, G, HBAR, KB, L_SUN, M_SUN, SIGMA_SB } from './constants';

/** Gravitational radius GM/c^2 (half the Schwarzschild radius). */
export const gravRadius = (m: number) => (G * m) / (C * C);

/** Schwarzschild radius r_s = 2GM/c^2. */
export const schwarzschildRadius = (m: number) => (2 * G * m) / (C * C);

/** Outer (event) horizon of a Kerr black hole in Boyer-Lindquist r, spin a* in [0,1). */
export const kerrHorizon = (m: number, a: number) => gravRadius(m) * (1 + Math.sqrt(Math.max(0, 1 - a * a)));

/** Equatorial outer ergosphere radius (static limit) - always 2GM/c^2 in the equatorial plane. */
export const ergosphereEquatorial = (m: number) => 2 * gravRadius(m);

/**
 * Innermost stable circular orbit (Bardeen, Press & Teukolsky 1972).
 * prograde=true for co-rotating orbits. a=0 gives 6GM/c^2.
 */
export function iscoRadius(m: number, a: number, prograde = true): number {
  const z1 = 1 + Math.cbrt(1 - a * a) * (Math.cbrt(1 + a) + Math.cbrt(1 - a));
  const z2 = Math.sqrt(3 * a * a + z1 * z1);
  const s = prograde ? -1 : 1;
  return gravRadius(m) * (3 + z2 + s * Math.sqrt((3 - z1) * (3 + z1 + 2 * z2)));
}

/** Circular photon orbit radius in the equatorial plane (prograde/retrograde). a=0 gives 3GM/c^2. */
export function photonSphereRadius(m: number, a: number, prograde = true): number {
  const s = prograde ? -1 : 1;
  return 2 * gravRadius(m) * (1 + Math.cos((2 / 3) * Math.acos(s * a)));
}

/** Critical impact parameter for photon capture by a Schwarzschild black hole: 3*sqrt(3) GM/c^2. */
export const photonCaptureImpact = (m: number) => 3 * Math.sqrt(3) * gravRadius(m);

/** Radiative efficiency of a thin disk, 1 - E_isco (Novikov-Thorne). */
export function diskEfficiency(a: number): number {
  const r = iscoRadius(1, a) / gravRadius(1); // in units of GM/c^2
  return 1 - Math.sqrt(1 - 2 / (3 * r));
}

/** Eddington luminosity for ionised hydrogen, W. */
export const eddingtonLuminosity = (m: number) => 1.26e31 * (m / M_SUN);

/** Hawking temperature of a Schwarzschild black hole, K. */
export const hawkingTemperature = (m: number) => (HBAR * C ** 3) / (8 * Math.PI * G * m * KB);

/** Hawking power (photons only, black-body at the horizon), W. Page (1976) gives ~2-10x more with all species. */
export const hawkingPower = (m: number) => (HBAR * C ** 6) / (15360 * Math.PI * G * G * m * m);

/** Evaporation constant K in dM/dt = -K/M^2. */
export const HAWKING_K = (HBAR * C ** 4) / (15360 * Math.PI * G * G);

/** Evaporation lifetime ignoring absorption, s: t = 5120 pi G^2 M^3 / (hbar c^4). */
export const evaporationTime = (m: number) => (m * m * m) / (3 * HAWKING_K);

/** Mass at which the Hawking temperature equals the given background temperature (unstable equilibrium). */
export const equilibriumMass = (tBackground: number) => (HBAR * C ** 3) / (8 * Math.PI * G * KB * tBackground);

/**
 * Net mass change rate from Hawking emission and absorption of an isotropic
 * black-body background (e.g. the CMB). Both terms use the horizon area so the
 * equilibrium is exactly at T_H = T_bg.
 */
export function netMassRate(m: number, tBackground: number): number {
  const rs = schwarzschildRadius(m);
  const area = 4 * Math.PI * rs * rs;
  const tH = hawkingTemperature(m);
  return (area * SIGMA_SB * (tBackground ** 4 - tH ** 4)) / (C * C);
}

/** Peak wavelength of black-body emission (Wien), m. */
export const wienPeak = (t: number) => 2.897771955e-3 / t;

/** Tidal disruption radius for a body of mass m and radius r around mass M. */
export const tidalRadius = (bhMass: number, m: number, r: number) => r * Math.cbrt(bhMass / m);

/** Tidal acceleration across a length L at distance r from mass M (radial stretching). */
export const tidalAcceleration = (m: number, r: number, len: number) => (2 * G * m * len) / (r * r * r);

/** Kepler period for a circular orbit of radius r around total mass M. */
export const keplerPeriod = (m: number, r: number) => 2 * Math.PI * Math.sqrt((r * r * r) / (G * m));

/** Peters (1964) gravitational wave luminosity of a circular binary, W. */
export function petersLuminosity(m1: number, m2: number, r: number): number {
  const mt = m1 + m2;
  return ((32 / 5) * G ** 4 * (m1 * m2) ** 2 * mt) / (C ** 5 * r ** 5);
}

/** Peters time to coalescence for a circular binary at separation a, s. */
export function petersMergeTime(m1: number, m2: number, a: number): number {
  return ((5 / 256) * C ** 5 * a ** 4) / (G ** 3 * m1 * m2 * (m1 + m2));
}

/** Chirp mass. */
export const chirpMass = (m1: number, m2: number) => (m1 * m2) ** 0.6 / (m1 + m2) ** 0.2;

export interface MergerResult {
  /** Remnant mass, kg. */
  mass: number;
  /** Dimensionless remnant spin. */
  spin: number;
  /** Energy radiated in gravitational waves, J. */
  energy: number;
  /** Fraction of total mass radiated. */
  radiatedFraction: number;
  /** Recoil kick speed, m/s. */
  kick: number;
  /** Ringdown (l=m=2, n=0) frequency, Hz. */
  ringdownFreq: number;
  /** Ringdown damping time, s. */
  ringdownTau: number;
}

/**
 * Binary black hole merger remnant from numerical-relativity fits for
 * non-spinning progenitors:
 *  - radiated energy: Jimenez-Forteza et al. 2017 (eta polynomial),
 *  - final spin: Rezzolla et al. 2008 (a_f = 2 sqrt3 eta - 3.871 eta^2 + 4.028 eta^3),
 *  - recoil: Gonzalez et al. 2007 (v = A eta^2 sqrt(1-4eta)(1+B eta)),
 *  - QNM: Berti, Cardoso & Will 2006 fits for l=m=2, n=0.
 */
export function mergeBlackHoles(m1: number, m2: number, a1 = 0, a2 = 0): MergerResult {
  const mt = m1 + m2;
  const eta = (m1 * m2) / (mt * mt);
  const eRad = 0.0559745 * eta + 0.580951 * eta ** 2 - 0.960673 * eta ** 3 + 3.35241 * eta ** 4;
  const spin = remnantSpin(m1, m2, a1, a2);
  const kick = 1.2e7 * eta * eta * Math.sqrt(Math.max(0, 1 - 4 * eta)) * (1 - 0.93 * eta);
  const mass = mt * (1 - eRad);
  const qnm = quasiNormalMode(mass, spin);
  return {
    mass,
    spin,
    energy: eRad * mt * C * C,
    radiatedFraction: eRad,
    kick,
    ringdownFreq: qnm.freq,
    ringdownTau: qnm.tau,
  };
}

/**
 * Final spin for spins aligned with the orbital angular momentum (Rezzolla et al. 2008, ApJ 674 L29).
 * Reduces to 2 sqrt3 eta - 3.5171 eta^2 + 2.5763 eta^3 (~0.686 for equal masses) for non-spinning holes,
 * and to the spin of the larger hole in the extreme mass-ratio limit.
 */
export function remnantSpin(m1: number, m2: number, a1: number, a2: number): number {
  if (m2 > m1) [m1, m2, a1, a2] = [m2, m1, a2, a1];
  const q = m2 / m1;
  const eta = q / (1 + q) ** 2;
  const at = (a1 + a2 * q * q) / (1 + q * q);
  const s4 = -0.1229;
  const s5 = 0.4537;
  const t0 = -2.8904;
  const t2 = -3.5171;
  const t3 = 2.5763;
  const af = at + at * eta * (s4 * at + s5 * eta + t0) + eta * (2 * Math.sqrt(3) + t2 * eta + t3 * eta * eta);
  return Math.max(-0.998, Math.min(0.998, af));
}

/** Fundamental l=m=2 quasi-normal mode of a Kerr black hole (Berti et al. 2006). */
export function quasiNormalMode(m: number, a: number): { freq: number; tau: number } {
  const momega = 1.5251 - 1.1568 * (1 - a) ** 0.1292;
  const q = 0.7 + 1.4187 * (1 - a) ** -0.499;
  const freq = (momega * C ** 3) / (2 * Math.PI * G * m);
  return { freq, tau: q / (Math.PI * freq) };
}

/** Luminosity of a main-sequence-like star from radius and effective temperature, W. */
export const stellarLuminosity = (r: number, t: number) => 4 * Math.PI * r * r * SIGMA_SB * t ** 4;

export const solarLuminosities = (l: number) => l / L_SUN;

/**
 * Shakura-Sunyaev / Novikov-Thorne-like effective temperature of a thin disk at radius r
 * (Newtonian profile with zero-torque inner boundary at rIn), K.
 */
export function diskTemperature(m: number, mdot: number, r: number, rIn: number): number {
  if (r <= rIn) return 0;
  const f = 1 - Math.sqrt(rIn / r);
  return Math.pow((3 * G * m * mdot * f) / (8 * Math.PI * SIGMA_SB * r ** 3), 0.25);
}

/** Peak temperature of the thin-disk profile (attained at r = 49/36 rIn). */
export const diskPeakTemperature = (m: number, mdot: number, rIn: number) =>
  diskTemperature(m, mdot, (49 / 36) * rIn, rIn);

/** Accretion rate for a given Eddington ratio, kg/s. */
export function accretionRate(m: number, eddingtonRatio: number, a: number): number {
  return (eddingtonRatio * eddingtonLuminosity(m)) / (diskEfficiency(a) * C * C);
}
