// Physical constants (SI, CODATA 2018 / IAU 2015 nominal values).
export const G = 6.6743e-11; // m^3 kg^-1 s^-2
export const C = 299_792_458; // m/s
export const HBAR = 1.054571817e-34; // J s
export const KB = 1.380649e-23; // J/K
export const SIGMA_SB = 5.670374419e-8; // W m^-2 K^-4

export const M_SUN = 1.98847e30; // kg
export const R_SUN = 6.957e8; // m
export const L_SUN = 3.828e26; // W
export const M_EARTH = 5.9722e24; // kg
export const R_EARTH = 6.371e6; // m
export const M_JUPITER = 1.89813e27; // kg
export const R_JUPITER = 6.9911e7; // m
export const M_MOON = 7.342e22; // kg

export const AU = 1.495978707e11; // m
export const LY = 9.4607304725808e15; // m
export const PC = 3.0856775814913673e16; // m
export const MPC = PC * 1e6;

export const YEAR = 365.25 * 86400; // Julian year, s
export const DAY = 86400;

/** Planck mass: the smallest mass for which a black hole is meaningful in semiclassical GR. */
export const M_PLANCK = Math.sqrt((HBAR * C) / G); // ~2.176e-8 kg
export const L_PLANCK = Math.sqrt((HBAR * G) / C ** 3); // ~1.616e-35 m
export const T_PLANCK = Math.sqrt((HBAR * G) / C ** 5); // ~5.39e-44 s

/** Present-day CMB temperature (Fixsen 2009). */
export const T_CMB_TODAY = 2.72548; // K

/** Age of the Universe (Planck 2018), s. */
export const AGE_UNIVERSE = 13.787e9 * YEAR;
