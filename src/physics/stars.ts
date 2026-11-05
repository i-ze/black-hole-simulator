import { G, M_SUN, R_SUN } from './constants';

const T_SUN = 5772;

/**
 * Zero-age main-sequence estimate from the mass:
 *  R ∝ M^0.8 (M < 1 M☉), R ∝ M^0.57 (M ≥ 1 M☉);  L ∝ M^4 (M < 2 M☉), L ∝ 1.4 M^3.5 above;
 *  T from L = 4πR²σT⁴. Accurate to tens of percent, which is the scatter of real stars.
 */
export function mainSequence(mass: number): { radius: number; temperature: number } {
  const m = mass / M_SUN;
  const r = m < 1 ? m ** 0.8 : m ** 0.57;
  const l = m < 2 ? m ** 4 : 1.4 * m ** 3.5;
  const t = T_SUN * (l / (r * r)) ** 0.25;
  return { radius: r * R_SUN, temperature: Math.min(50000, Math.max(2300, t)) };
}

/** Chandrasekhar limit for a carbon-oxygen white dwarf. */
export const CHANDRASEKHAR_MASS = 1.44 * M_SUN;

/**
 * White dwarf radius from the Nauenberg (1972) mass-radius relation:
 *  R = 0.0112 R☉ sqrt((M/M_ch)^(-2/3) - (M/M_ch)^(2/3)).
 * Heavier white dwarfs are smaller; the radius goes to zero at the Chandrasekhar limit.
 */
export function whiteDwarfRadius(mass: number): number {
  const x = Math.min(mass / CHANDRASEKHAR_MASS, 0.999);
  return 0.0112 * R_SUN * Math.sqrt(x ** (-2 / 3) - x ** (2 / 3));
}

/** Approximate maximum neutron star mass (TOV limit); above it the star collapses. */
export const NS_MAX_MASS = 2.3 * M_SUN;

/**
 * Outcome of a collision between two gravity-dominated bodies (planets), after Leinhardt & Stewart (2012):
 *  Q = ½ μ v² / M is the specific impact energy, Q*_RD = c* (4/5) π ρ₁ G R_C1² the catastrophic
 *  disruption threshold (c* ≈ 5, ρ₁ = 1000 kg/m³, R_C1 = radius of the combined mass at density ρ₁).
 *  Largest remnant: M_lr/M = 1 - Q/(2Q*) for Q < 1.8 Q*, and 0.1 (Q/1.8Q*)^-1.5 beyond (super-catastrophic).
 */
export function impactOutcome(m1: number, m2: number, v: number): { q: number; qStar: number; remnantFraction: number } {
  const mt = m1 + m2;
  const mu = (m1 * m2) / mt;
  const q = (0.5 * mu * v * v) / mt;
  const rho1 = 1000;
  const rc1 = Math.cbrt((3 * mt) / (4 * Math.PI * rho1));
  const qStar = 5 * (4 / 5) * Math.PI * rho1 * G * rc1 * rc1;
  const x = q / qStar;
  const remnantFraction = x < 1.8 ? 1 - 0.5 * x : 0.1 * (x / 1.8) ** -1.5;
  return { q, qStar, remnantFraction: Math.max(0.01, Math.min(1, remnantFraction)) };
}
