import type { Body } from '../engine/types';
import { G } from './constants';

export interface OrbitInfo {
  host: Body;
  r: number;
  v: number;
  a: number;
  e: number;
  period: number;
  bound: boolean;
  escape: number;
}

/** Osculating Keplerian elements of a body relative to a host. */
export function orbitalElements(b: Body, host: Body): OrbitInfo {
  const rx = b.x - host.x;
  const ry = b.y - host.y;
  const rz = b.z - host.z;
  const vx = b.vx - host.vx;
  const vy = b.vy - host.vy;
  const vz = b.vz - host.vz;
  const r = Math.hypot(rx, ry, rz);
  const v = Math.hypot(vx, vy, vz);
  const mu = G * (host.mass + (b.massive ? b.mass : 0));
  const eps = (v * v) / 2 - mu / r;
  const hx = ry * vz - rz * vy;
  const hy = rz * vx - rx * vz;
  const hz = rx * vy - ry * vx;
  const h2 = hx * hx + hy * hy + hz * hz;
  const e = Math.sqrt(Math.max(0, 1 + (2 * eps * h2) / (mu * mu)));
  const bound = eps < 0;
  const a = bound ? -mu / (2 * eps) : Infinity;
  const period = bound ? 2 * Math.PI * Math.sqrt((a * a * a) / mu) : Infinity;
  return { host, r, v, a, e, period, bound, escape: Math.sqrt((2 * mu) / r) };
}
