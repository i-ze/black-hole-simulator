import { equilibriumMass, schwarzschildRadius, tidalRadius } from '../physics/blackhole';
import { gmst, julianDay, moonGeocentric, sunGeocentric, toCartesian } from '../physics/ephemeris';
import { AU, C, G, M_EARTH, M_SUN, MPC, PC, T_CMB_TODAY } from '../physics/constants';
import { blackHole, meteor, photon, planet, ship, star, type NewBody } from './bodies';
import { circularSpeed, type Simulation } from './simulation';
import { SHIPS } from './ships';
import type { Body } from './types';

export interface ScenarioResult {
  /** Half-width of the initial 2D view, m. */
  extent: number;
  /** Initial time warp. */
  warp: number;
  /** Body to select / follow initially. */
  select?: number;
  /** Initial realistic-camera distance, m. */
  camDistance?: number;
  /** Initial realistic-camera elevation, rad. */
  camElevation?: number;
  /** Realistic view looks at the selected body from the body it orbits (e.g. Moon phases). */
  viewFromHost?: boolean;
}

export interface Scenario {
  id: string;
  build: (sim: Simulation) => ScenarioResult;
}

/** Place a body on a Keplerian orbit around host, starting at apoapsis (or periapsis). */
function orbit(
  sim: Simulation,
  host: Body,
  nb: NewBody,
  a: number,
  e: number,
  angle: number,
  opts: { atPeri?: boolean; incl?: number; retro?: boolean } = {},
): Body {
  const gm = G * (host.mass + nb.mass);
  const r = opts.atPeri ? a * (1 - e) : a * (1 + e);
  const v = Math.sqrt(gm * (2 / r - 1 / a));
  const incl = opts.incl ?? 0;
  const ca = Math.cos(angle);
  const sa = Math.sin(angle);
  const dir = opts.retro ? -1 : 1;
  const x = r * ca;
  const y = r * sa * Math.cos(incl);
  const z = r * sa * Math.sin(incl);
  const vx = -v * sa * dir;
  const vy = v * ca * Math.cos(incl) * dir;
  const vz = v * ca * Math.sin(incl) * dir;
  return sim.add({ ...nb, x: host.x + x, y: host.y + y, z: host.z + z, vx: host.vx + vx, vy: host.vy + vy, vz: host.vz + vz });
}

/** Circular orbit (Kepler's law is exact in Schwarzschild coordinate time). */
function circular(sim: Simulation, host: Body, nb: NewBody, r: number, angle: number): Body {
  const v = circularSpeed(host.mass + nb.mass, r);
  const ca = Math.cos(angle);
  const sa = Math.sin(angle);
  return sim.add({
    ...nb,
    x: host.x + r * ca,
    y: host.y + r * sa,
    z: host.z,
    vx: host.vx - v * sa,
    vy: host.vy + v * ca,
    vz: host.vz,
  });
}

/**
 * Quasi-circular compact binary: circular relative orbit consistent with the integrator
 * plus the Peters inspiral velocity, which minimises spurious eccentricity.
 */
function compactBinary(sim: Simulation, a: NewBody, b: NewBody, sep: number): [Body, Body] {
  const mt = a.mass + b.mass;
  const vrel = circularSpeed(mt, sep);
  const rdot = (-64 / 5) * ((G ** 3 * a.mass * b.mass * mt) / (C ** 5 * sep ** 3));
  const fa = b.mass / mt;
  const fb = a.mass / mt;
  // Radial (inspiral) components point toward the centre of mass.
  const A = sim.add({ ...a, x: fa * sep, y: 0, vx: fa * rdot, vy: fa * vrel });
  const B = sim.add({ ...b, x: -fb * sep, y: 0, vx: -fb * rdot, vy: -fb * vrel });
  return [A, B];
}

export const SCENARIOS: Scenario[] = [
  {
    id: 'sgrA',
    build(sim) {
      // GRAVITY Collaboration 2022: M = 4.297e6 Msun, R0 = 8.277 kpc. S-star elements from Gillessen et al. 2017.
      const m = 4.297e6 * M_SUN;
      const bh = sim.add(blackHole(m, { name: 'Sgr A*', spin: 0.9, disk: true, eddington: 0.01, diskOuter: 40 }));
      const arcsec = 8277 * AU; // 1" at the Galactic Centre, m
      const stars: [string, number, number, number, number][] = [
        ['S2', 0.1255, 0.8839, 0.3, 0.25],
        ['S38', 0.1416, 0.8201, 2.2, -0.3],
        ['S55', 0.1078, 0.7209, 4.1, 0.15],
        ['S14', 0.2863, 0.9761, 5.2, 0.4],
        ['S4', 0.3570, 0.3905, 1.2, -0.1],
      ];
      for (const [name, aArc, e, ang, inc] of stars) {
        orbit(sim, bh, star(name === 'S2' ? 'blueGiant' : 'sun', { name }), aArc * arcsec, e, ang, { incl: inc });
      }
      sim.cullRadius = 1 * PC;
      return { extent: 2200 * AU, warp: 2e7, select: bh.id, camDistance: 40 * schwarzschildRadius(m), camElevation: 0.12 };
    },
  },
  {
    id: 'gw150914',
    build(sim) {
      // Abbott et al. 2016: 36 + 29 Msun at 410 Mpc.
      sim.settings.gwDistance = 410 * MPC;
      const m1 = 36 * M_SUN;
      const m2 = 29 * M_SUN;
      const gm = (G * (m1 + m2)) / (C * C);
      const [a] = compactBinary(
        sim,
        blackHole(m1, { name: 'BH₁', spin: 0 }),
        blackHole(m2, { name: 'BH₂', spin: 0 }),
        13 * gm,
      );
      sim.cullRadius = 1e9;
      return { extent: 40 * gm, warp: 0.02, select: a.id, camDistance: 70 * gm, camElevation: 0.5 };
    },
  },
  {
    id: 'tde',
    build(sim) {
      const m = 1e6 * M_SUN;
      sim.add(blackHole(m, { name: 'SMBH', spin: 0.5 }));
      const sun = star('sun', { name: 'Star' });
      const rt = tidalRadius(m, sun.mass, sun.radius);
      const rp = 0.6 * rt;
      const r0 = 14 * rt;
      // Parabolic orbit with pericentre rp.
      const v = Math.sqrt((2 * G * (m + sun.mass)) / r0);
      const h = Math.sqrt(2 * G * (m + sun.mass) * rp);
      const vt = h / r0;
      const vr = -Math.sqrt(Math.max(0, v * v - vt * vt));
      const s = sim.add({ ...sun, x: r0, y: 0, vx: vr, vy: vt });
      sim.cullRadius = 2000 * rt;
      return { extent: 16 * rt, warp: 1500, select: s.id, camDistance: 30 * rt, camElevation: 0.6 };
    },
  },
  {
    id: 'microEvap',
    build(sim) {
      // Lifetimes t = 5120 pi G^2 M^3/(hbar c^4): ~84 s, ~11 min, ~1.5 h.
      const a = sim.add(blackHole(1e8, { name: 'PBH-1', x: -800 }));
      sim.add(blackHole(2e8, { name: 'PBH-2', x: 0, y: 500 }));
      sim.add(blackHole(4e8, { name: 'PBH-3', x: 800 }));
      sim.cullRadius = 1e8;
      return { extent: 1500, warp: 1, select: a.id, camDistance: 3000, camElevation: 0.2 };
    },
  },
  {
    id: 'equilibrium',
    build(sim) {
      // A black hole whose Hawking temperature equals the CMB temperature, in place of the Moon.
      const meq = equilibriumMass(T_CMB_TODAY);
      const earth = sim.add(planet('earth', { name: 'Earth' }));
      const bh = circular(sim, earth, blackHole(meq, { name: 'Moon-mass BH' }), 3.844e8, 0);
      sim.cullRadius = 1e11;
      return { extent: 5e8, warp: 4e4, select: bh.id, camDistance: 2e7, camElevation: 0.3 };
    },
  },
  {
    id: 'photonSphere',
    build(sim) {
      const m = 10 * M_SUN;
      const rs = schwarzschildRadius(m);
      const bh = sim.add(blackHole(m, { name: 'BH', spin: 0 }));
      const bc = 1.5 * Math.sqrt(3) * rs; // critical impact parameter 3 sqrt3 GM/c^2
      const group = sim.newGroup();
      const offsets = [-6, -4.5, -3.5, -3, -2.75, -2.6, 2.5, 2.55, 2.58, 2.6, 2.7, 2.85, 3, 3.5, 4.5, 6];
      for (const o of offsets) {
        // Rainbow across the beam makes the blue/red shifts easy to follow.
        sim.add(photon({ x: -14 * rs, y: o * rs, vx: C, vy: 0, group, wavelength: 420 + ((o + 6) / 12) * 260 }));
      }
      // Photons grazing the critical impact parameter wind around the photon sphere.
      for (const eps of [1e-2, 1e-3, 1e-5, -1e-5, -1e-3]) {
        sim.add(photon({ x: -14 * rs, y: -bc * (1 + eps), vx: C, vy: 0, group, wavelength: 600 }));
      }
      sim.cullRadius = 200 * rs;
      return { extent: 16 * rs, warp: 4e-5, select: bh.id, camDistance: 30 * rs, camElevation: 1.2 };
    },
  },
  {
    id: 'gravRedshift',
    build(sim) {
      const m = 10 * M_SUN;
      const rs = schwarzschildRadius(m);
      const bh = sim.add(blackHole(m, { name: 'BH' }));
      const group = sim.newGroup();
      // Blue light (440 nm) emitted radially outward from different depths: the deeper the source,
      // the stronger the redshift at infinity, λ∞ = λ0 / sqrt(1 - r_s/r0).
      const depths = [1.12, 1.3, 1.6, 2.2, 3.5, 7];
      depths.forEach((k, i) => {
        const a = 0.35 + (i / (depths.length - 1)) * (Math.PI - 0.7);
        const ca = Math.cos(a);
        const sa = Math.sin(a);
        sim.add(photon({ name: `γ ${k} r_s`, x: k * rs * ca, y: k * rs * sa, vx: ca * C, vy: sa * C, group, wavelength: 440 }));
      });
      // Red light (700 nm) falling in from far away is blueshifted towards violet and ultraviolet.
      for (let i = 0; i < 4; i++) {
        const a = -0.6 - i * 0.62;
        const ca = Math.cos(a);
        const sa = Math.sin(a);
        sim.add(photon({ name: `γ in ${i + 1}`, x: 20 * rs * ca, y: 20 * rs * sa, vx: -ca * C, vy: -sa * C, group, wavelength: 700 }));
      }
      sim.cullRadius = 400 * rs;
      return { extent: 13 * rs, warp: 8e-5, select: bh.id, camDistance: 40 * rs, camElevation: 1.25 };
    },
  },
  {
    id: 'fleet',
    build(sim) {
      // The whole fleet on circular orbits around the Sun while a stellar black hole flies in.
      const sun = sim.add(star('sun', { name: 'Sun' }));
      circular(sim, sun, planet('earth', { name: 'Earth' }), AU, 1.1);
      SHIPS.forEach((m, i) => {
        const r = (0.4 + i * 0.09) * AU;
        circular(sim, sun, ship(m.id), r, i * 2.4);
      });
      // Hyperbolic approach: v_inf = 40 km/s, aimed for a periapsis of ~0.5 AU from the Sun.
      const mBh = 5 * M_SUN;
      const mu = G * (sun.mass + mBh);
      const vInf = 4e4;
      const rp = 0.5 * AU;
      const b = rp * Math.sqrt(1 + (2 * mu) / (rp * vInf * vInf));
      const x0 = -16 * AU;
      const v0 = Math.sqrt(vInf * vInf + (2 * mu) / Math.hypot(x0, b));
      sim.add(blackHole(mBh, { name: 'Intruder BH', x: x0, y: -b, vx: v0 }));
      sim.cullRadius = 500 * AU;
      return { extent: 4.5 * AU, warp: 2e6, select: sun.id, camDistance: 7 * AU, camElevation: 0.55 };
    },
  },
  {
    id: 'timeDilation',
    build(sim) {
      const m = 4e6 * M_SUN;
      const rs = schwarzschildRadius(m);
      const bh = sim.add(blackHole(m, { name: 'BH', disk: true, eddington: 0.02, diskOuter: 24 }));
      const fleet: [string, number][] = [
        ['enterprise', 3.05],
        ['falcon', 5],
        ['rocinante', 12],
        ['tardis', 60],
      ];
      let first: Body | undefined;
      fleet.forEach(([model, k], i) => {
        const b = circular(sim, bh, ship(model), k * rs, i * 1.7);
        first ??= b;
      });
      sim.cullRadius = 1e4 * rs;
      return { extent: 70 * rs, warp: 30, select: first?.id, camDistance: 30 * rs, camElevation: 0.25 };
    },
  },
  {
    id: 'meteors',
    build(sim) {
      const m = 10 * M_SUN;
      const rs = schwarzschildRadius(m);
      const bh = sim.add(blackHole(m, { name: 'BH', disk: true, eddington: 0.1, diskOuter: 30 }));
      const group = sim.newGroup();
      const cx = -1800 * rs;
      const cy = 260 * rs;
      const v = 0.035 * C;
      for (let i = 0; i < 420; i++) {
        const rr = 160 * rs * Math.sqrt(Math.random());
        const t = Math.random() * 2 * Math.PI;
        sim.add(
          meteor({
            x: cx + rr * Math.cos(t) * 1.6,
            y: cy + rr * Math.sin(t),
            z: (Math.random() - 0.5) * 20 * rs,
            vx: v * (1 + (Math.random() - 0.5) * 0.05),
            vy: v * (Math.random() - 0.5) * 0.05,
            group,
          }),
        );
      }
      sim.cullRadius = 8000 * rs;
      return { extent: 1200 * rs, warp: 0.5, select: bh.id, camDistance: 300 * rs, camElevation: 0.35 };
    },
  },
  {
    id: 'cluster',
    build(sim) {
      const m = 1e4 * M_SUN;
      const bh = sim.add(blackHole(m, { name: 'IMBH', spin: 0.3 }));
      const kinds = ['sun', 'redDwarf', 'redDwarf', 'sun', 'blueGiant', 'redDwarf', 'whiteDwarf', 'neutronStar'] as const;
      for (let i = 0; i < 44; i++) {
        const a = (0.004 + Math.random() * 0.03) * PC;
        const e = Math.random() * 0.7;
        const k = kinds[i % kinds.length];
        orbit(sim, bh, star(k, { name: `★${i + 1}` }), a, e, Math.random() * 2 * Math.PI, {
          incl: (Math.random() - 0.5) * 0.6,
          retro: Math.random() < 0.15,
        });
      }
      sim.cullRadius = 2 * PC;
      return { extent: 0.06 * PC, warp: 3e9, select: bh.id, camDistance: 2e4 * schwarzschildRadius(m) };
    },
  },
  {
    id: 'triple',
    build(sim) {
      const m = 30 * M_SUN;
      const gm = (G * 2 * m) / (C * C);
      const [a] = compactBinary(sim, blackHole(m, { name: 'BH₁' }), blackHole(m, { name: 'BH₂' }), 28 * gm);
      const third = blackHole(m, { name: 'BH₃' });
      const host = { mass: 2 * m, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 } as Body;
      orbit(sim, host, third, 160 * gm, 0.55, 2.4, { incl: 0.25 });
      sim.cullRadius = 1e10;
      return { extent: 260 * gm, warp: 0.05, select: a.id, camDistance: 300 * gm, camElevation: 0.6 };
    },
  },
  {
    id: 'kilonova',
    build(sim) {
      const ns = star('neutronStar');
      const [a] = compactBinary(sim, { ...ns, name: 'NS₁' }, { ...ns, name: 'NS₂', mass: 1.3 * M_SUN }, 9e4);
      sim.settings.gwDistance = 40 * MPC; // GW170817
      sim.cullRadius = 1e10;
      return { extent: 1.6e5, warp: 0.01, select: a.id, camDistance: 4e5, camElevation: 0.5 };
    },
  },
  {
    id: 'gargantua',
    build(sim) {
      const m = 1e8 * M_SUN;
      const rs = schwarzschildRadius(m);
      const bh = sim.add(blackHole(m, { name: 'Gargantua', spin: 0.99, disk: true, eddington: 0.05, diskOuter: 26 }));
      circular(sim, bh, planet('earth', { name: 'Miller', color: '#6fa8c9', model: undefined }), 3.2 * rs, 0.4);
      circular(sim, bh, planet('earth', { name: 'Mann', color: '#d9e4ec', mass: 0.8 * M_EARTH, model: undefined }), 40 * rs, 2.6);
      circular(sim, bh, ship('endurance'), 14 * rs, 4.2);
      circular(sim, bh, ship('ranger'), 9 * rs, 5.4);
      sim.cullRadius = 1e4 * rs;
      return { extent: 50 * rs, warp: 600, select: bh.id, camDistance: 22 * rs, camElevation: 0.09 };
    },
  },
  {
    id: 'earthMoon',
    build(sim) {
      // Sun, Earth and Moon at their true positions for the current date (Meeus ephemerides),
      // then evolved as a three-body system (solar perturbations of the lunar orbit included).
      const now = Date.now();
      const jd = julianDay(now);
      const h = 3600 / 86400;
      const sunAt = (j: number) => toCartesian(sunGeocentric(j));
      const moonAt = (j: number) => toCartesian(moonGeocentric(j));
      const [s0, sp, sm] = [sunAt(jd), sunAt(jd + h), sunAt(jd - h)];
      const [m0, mp, mm] = [moonAt(jd), moonAt(jd + h), moonAt(jd - h)];
      const vel = (p: number[], m: number[]) => p.map((v, i) => (v - m[i]) / 7200);
      const vSun = vel(sp, sm);
      const vMoon = vel(mp, mm);
      sim.epoch = now;
      sim.add(star('sun', { name: 'Sun' }));
      // Heliocentric Earth = minus the geocentric Sun.
      const earth = sim.add(
        planet('earth', { name: 'Earth', x: -s0[0], y: -s0[1], z: -s0[2], vx: -vSun[0], vy: -vSun[1], vz: -vSun[2], spin: gmst(jd) }),
      );
      // Synchronous rotation: the near side (prime meridian) faces the Earth.
      const moon = sim.add(
        planet('moon', {
          name: 'Moon',
          x: earth.x + m0[0],
          y: earth.y + m0[1],
          z: earth.z + m0[2],
          vx: earth.vx + vMoon[0],
          vy: earth.vy + vMoon[1],
          vz: earth.vz + vMoon[2],
          spin: Math.atan2(-m0[1], -m0[0]),
        }),
      );
      sim.cullRadius = 100 * AU;
      return { extent: 5e8, warp: 2e4, select: moon.id, camDistance: 1.2e7, camElevation: 0.1, viewFromHost: true };
    },
  },
  {
    id: 'solarSystem',
    build(sim) {
      // The real Solar System (circular orbits at the mean distances) with the Moon around the Earth.
      const sun = sim.add(star('sun', { name: 'Sun' }));
      const orbits: [string, number][] = [
        ['mercury', 0.387],
        ['venus', 0.723],
        ['earth', 1],
        ['mars', 1.524],
        ['jupiter', 5.203],
        ['saturn', 9.537],
        ['uranus', 19.19],
        ['neptune', 30.07],
      ];
      let earth: Body | undefined;
      orbits.forEach(([id, a], i) => {
        const b = circular(sim, sun, planet(id), a * AU, i * 0.9 + 0.3);
        if (id === 'earth') earth = b;
      });
      if (earth) circular(sim, earth, planet('moon'), 3.844e8, 0);
      sim.cullRadius = 500 * AU;
      return { extent: 2 * AU, warp: 1e6, select: earth?.id, camDistance: 6e7, camElevation: 0.25 };
    },
  },
  {
    id: 'giantImpact',
    build(sim) {
      // Canonical Moon-forming impact: a Mars-sized Theia hits the proto-Earth at ~45° near the
      // mutual escape speed (Canup & Asphaug 2001).
      const mE = 0.9 * M_EARTH;
      const mT = 0.11 * M_EARTH;
      const rE = Math.cbrt((3 * mE) / (4 * Math.PI * 5500));
      const rT = 3.4e6;
      const earth = sim.add(planet('earth', { name: 'Proto-Earth', mass: mE, radius: rE, model: undefined, color: '#7b5d4a', temperature: 900 }));
      const mu = G * (mE + mT);
      const vInf = 2000;
      const rp = 0.7 * (rE + rT);
      // Start at r0 with the energy and angular momentum of a hyperbola whose periapsis is rp.
      const vp = Math.sqrt(vInf * vInf + (2 * mu) / rp);
      const h = rp * vp;
      const r0 = 1.5e8;
      const v0 = Math.sqrt(vInf * vInf + (2 * mu) / r0);
      const vt = h / r0;
      const vr = Math.sqrt(Math.max(0, v0 * v0 - vt * vt));
      sim.add(planet('mars', { name: 'Theia', mass: mT, radius: rT, model: undefined, color: '#a0705c', x: -r0, y: 0, vx: vr, vy: vt }));
      sim.cullRadius = 1e10;
      return { extent: 6e7, warp: 1500, select: earth.id, camDistance: 6e7, camElevation: 0.4 };
    },
  },
  {
    id: 'solar',
    build(sim) {
      // A Sun-mass black hole replacing the Sun: planetary orbits are unchanged.
      const bh = sim.add(blackHole(M_SUN, { name: 'BH☉' }));
      const pl: [string, number][] = [
        ['mercury', 0.387],
        ['venus', 0.723],
        ['earth', 1],
        ['mars', 1.524],
      ];
      for (const [id, a] of pl) circular(sim, bh, planet(id), a * AU, Math.random() * 6.28);
      sim.cullRadius = 100 * AU;
      return { extent: 2 * AU, warp: 1.5e6, select: bh.id, camDistance: 3 * AU, camElevation: 0.5 };
    },
  },
];

export const DEFAULT_SCENARIO = 'sgrA';
