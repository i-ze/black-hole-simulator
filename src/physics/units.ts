import { AU, C, DAY, LY, M_EARTH, M_JUPITER, M_SUN, PC, R_SUN, YEAR } from './constants';

const SUPERSCRIPT: Record<string, string> = {
  '-': '⁻',
  '0': '⁰',
  '1': '¹',
  '2': '²',
  '3': '³',
  '4': '⁴',
  '5': '⁵',
  '6': '⁶',
  '7': '⁷',
  '8': '⁸',
  '9': '⁹',
};

/** Format a number with 3 significant digits, using ×10ⁿ notation outside [1e-3, 1e5). */
export function fmtNum(v: number, digits = 3): string {
  if (!Number.isFinite(v)) return v > 0 ? '∞' : v < 0 ? '-∞' : '-';
  if (v === 0) return '0';
  const a = Math.abs(v);
  if (a >= 1e-3 && a < 1e5) {
    const p = Math.max(0, digits - 1 - Math.floor(Math.log10(a)));
    const str = v.toFixed(Math.min(p, 6));
    return str.includes('.') ? str.replace(/0+$/, '').replace(/\.$/, '') : str;
  }
  let e = Math.floor(Math.log10(a));
  let m = v / 10 ** e;
  // Rounding can push the mantissa to 10.0 (e.g. 9.9999e7).
  if (Math.abs(Number(m.toFixed(digits - 1))) >= 10) {
    e += 1;
    m = v / 10 ** e;
  }
  const exp = String(e)
    .split('')
    .map((c) => SUPERSCRIPT[c] ?? c)
    .join('');
  return `${m.toFixed(digits - 1)}×10${exp}`;
}

interface Unit {
  name: string;
  value: number;
}

function pick(v: number, units: Unit[]): string {
  const a = Math.abs(v);
  let best = units[0];
  for (const u of units) if (a >= u.value * 0.999) best = u;
  return `${fmtNum(v / best.value)} ${best.name}`;
}

const LENGTH: Unit[] = [
  { name: 'm', value: 1 },
  { name: 'km', value: 1e3 },
  { name: 'R☉', value: R_SUN },
  { name: 'AU', value: AU },
  { name: 'ly', value: LY },
  { name: 'pc', value: PC },
  { name: 'kpc', value: PC * 1e3 },
  { name: 'Mpc', value: PC * 1e6 },
];

const SMALL_LENGTH: Unit[] = [
  { name: 'fm', value: 1e-15 },
  { name: 'pm', value: 1e-12 },
  { name: 'nm', value: 1e-9 },
  { name: 'µm', value: 1e-6 },
  { name: 'mm', value: 1e-3 },
];

export function fmtLength(m: number): string {
  if (Math.abs(m) < 1 && m !== 0) {
    if (Math.abs(m) < 1e-15) return `${fmtNum(m)} m`;
    return pick(m, SMALL_LENGTH);
  }
  return pick(m, LENGTH);
}


export function fmtMass(kg: number): string {
  const a = Math.abs(kg);
  // Below ~ a hundredth of an Earth plain kilograms read best; above, use the astronomical unit
  // that gives a mantissa of order 0.01-1000 (Earth, Jupiter or Solar masses).
  if (a < M_EARTH * 0.01) return `${fmtNum(kg)} kg`;
  if (a < M_JUPITER * 0.1) return `${fmtNum(kg / M_EARTH)} M⊕`;
  if (a < M_SUN * 0.08) return `${fmtNum(kg / M_JUPITER)} M♃`;
  return `${fmtNum(kg / M_SUN)} M☉`;
}

const TIME: Unit[] = [
  { name: 'ps', value: 1e-12 },
  { name: 'ns', value: 1e-9 },
  { name: 'µs', value: 1e-6 },
  { name: 'ms', value: 1e-3 },
  { name: 's', value: 1 },
  { name: 'min', value: 60 },
  { name: 'h', value: 3600 },
  { name: 'd', value: DAY },
  { name: 'yr', value: YEAR },
  { name: 'kyr', value: YEAR * 1e3 },
  { name: 'Myr', value: YEAR * 1e6 },
  { name: 'Gyr', value: YEAR * 1e9 },
];

export function fmtTime(s: number): string {
  if (Math.abs(s) < 1e-12 && s !== 0) return `${fmtNum(s)} s`;
  if (Math.abs(s) >= YEAR * 1e12) return `${fmtNum(s / YEAR)} yr`;
  return pick(s, TIME);
}

export function fmtSpeed(ms: number): string {
  const f = Math.abs(ms) / C;
  if (f > 0.01) return `${fmtNum(f)} c`;
  if (Math.abs(ms) >= 1000) return `${fmtNum(ms / 1000)} km/s`;
  return `${fmtNum(ms)} m/s`;
}

export function fmtPower(w: number): string {
  return `${fmtNum(w)} W`;
}

export function fmtEnergy(j: number): string {
  return `${fmtNum(j)} J`;
}

export function fmtTemp(k: number): string {
  return `${fmtNum(k)} K`;
}

export function fmtWarp(w: number): string {
  if (w >= 1) return `${fmtNum(w)}×`;
  return `${fmtNum(w)}×`;
}

/** Human readable "x per second" for a time warp factor. */
export function fmtWarpRate(w: number): string {
  return `${fmtTime(w)}/s`;
}
