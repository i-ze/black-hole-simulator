import { describe, expect, it } from 'vitest';
import {
  equilibriumMass,
  evaporationTime,
  gravRadius,
  hawkingTemperature,
  iscoRadius,
  mergeBlackHoles,
  netMassRate,
  petersMergeTime,
  photonSphereRadius,
  quasiNormalMode,
  schwarzschildRadius,
} from './blackhole';
import { C, G, M_SUN, T_CMB_TODAY } from './constants';
import { Simulation } from '../engine/simulation';
import { blackHole, photon, ship } from '../engine/bodies';
import { SCENARIOS } from '../engine/scenarios';

describe('black hole formulas', () => {
  it('ISCO and photon sphere', () => {
    const m = M_SUN;
    expect(iscoRadius(m, 0) / gravRadius(m)).toBeCloseTo(6, 6);
    expect(iscoRadius(m, 0.999999) / gravRadius(m)).toBeLessThan(1.05);
    expect(iscoRadius(m, 0.999999, false) / gravRadius(m)).toBeCloseTo(9, 2);
    expect(photonSphereRadius(m, 0) / gravRadius(m)).toBeCloseTo(3, 6);
  });

  it('Hawking temperature and lifetime', () => {
    expect(hawkingTemperature(M_SUN)).toBeCloseTo(6.17e-8, 9);
    // Textbook: a 1e11 kg black hole evaporates in ~2.7 Gyr (photons only, ~8.4e-17 s/kg^3).
    expect(evaporationTime(1) * 1e17).toBeCloseTo(8.41, 1);
    const meq = equilibriumMass(T_CMB_TODAY);
    expect(meq / 4.5e22).toBeGreaterThan(0.95);
    expect(meq / 4.5e22).toBeLessThan(1.05);
    expect(netMassRate(meq * 0.5, T_CMB_TODAY)).toBeLessThan(0);
    expect(netMassRate(meq * 2, T_CMB_TODAY)).toBeGreaterThan(0);
  });

  it('merger fits match numerical relativity for equal masses', () => {
    const r = mergeBlackHoles(30 * M_SUN, 30 * M_SUN);
    expect(r.radiatedFraction).toBeCloseTo(0.0484, 3);
    expect(r.spin).toBeCloseTo(0.686, 2);
    expect(r.kick).toBeCloseTo(0, 6);
    // GW150914: remnant ~62 Msun, spin ~0.67, ringdown ~250 Hz.
    const g = mergeBlackHoles(36 * M_SUN, 29 * M_SUN);
    expect(g.mass / M_SUN).toBeGreaterThan(61);
    expect(g.mass / M_SUN).toBeLessThan(63);
    const q = quasiNormalMode(g.mass, g.spin);
    expect(q.freq).toBeGreaterThan(240);
    expect(q.freq).toBeLessThan(300);
    // Max kick for non-spinning holes ~175 km/s at q ~ 0.36.
    const k = mergeBlackHoles(1, 0.36);
    expect(k.kick / 1000).toBeGreaterThan(150);
    expect(k.kick / 1000).toBeLessThan(200);
  });
});

function run(sim: Simulation, t: number, chunk: number) {
  let guard = 0;
  while (sim.time < t && guard++ < 1e6) sim.advance(Math.min(chunk, t - sim.time), 1e9);
}

describe('dynamics', () => {
  it('keeps a circular orbit at 10 r_s circular', () => {
    const sim = new Simulation();
    const m = 10 * M_SUN;
    const rs = schwarzschildRadius(m);
    sim.add(blackHole(m));
    const [vx, vy] = sim.circularVelocity(10 * rs, 0, 0);
    const s = sim.add(ship('falcon', { x: 10 * rs, vx, vy }));
    const period = (2 * Math.PI * 10 * rs) / Math.hypot(vx, vy);
    let rMin = Infinity;
    let rMax = 0;
    for (let i = 0; i < 200; i++) {
      run(sim, sim.time + period / 40, period / 40);
      const r = Math.hypot(s.x, s.y);
      rMin = Math.min(rMin, r);
      rMax = Math.max(rMax, r);
    }
    expect(s.alive).toBe(true);
    expect(rMax / rMin).toBeLessThan(1.01);
    // Exact Schwarzschild circular-orbit clock rate sqrt(1 - 3GM/(c^2 r)).
    expect(s.timeRate).toBeCloseTo(Math.sqrt(1 - 1.5 / 10), 3);
  });

  it('reproduces perihelion precession', () => {
    const sim = new Simulation();
    const m = M_SUN;
    const rs = schwarzschildRadius(m);
    sim.add(blackHole(m));
    const a = 2000 * rs;
    const e = 0.5;
    const rp = a * (1 - e);
    const vp = Math.sqrt(((G * m) / a) * ((1 + e) / (1 - e)));
    const s = sim.add(ship('falcon', { x: rp, vy: vp }));
    const period = 2 * Math.PI * Math.sqrt(a ** 3 / (G * m));
    // Track periapsis angle after ~1 orbit.
    run(sim, period * 0.6, period / 400);
    let best = Infinity;
    let angle = 0;
    for (let i = 0; i < 4000; i++) {
      run(sim, sim.time + period / 8000, period / 8000);
      const r = Math.hypot(s.x, s.y);
      if (r < best) {
        best = r;
        angle = Math.atan2(s.y, s.x);
      }
    }
    const expected = (6 * Math.PI * G * m) / (C * C * a * (1 - e * e));
    expect(angle / expected).toBeGreaterThan(0.9);
    expect(angle / expected).toBeLessThan(1.15);
  });

  it('deflects light by 4GM/(c^2 b) in the weak field', () => {
    const sim = new Simulation();
    const m = M_SUN;
    const rs = schwarzschildRadius(m);
    sim.cullRadius = 1e30;
    sim.add(blackHole(m));
    const b = 500 * rs;
    const p = sim.add(photon({ x: -2e5 * rs, y: b, vx: C }));
    run(sim, (4e5 * rs) / C, (1e4 * rs) / C);
    const defl = Math.atan2(-p.vy, p.vx);
    // Finite path length truncates the integral slightly.
    expect(defl / ((2 * rs) / b)).toBeGreaterThan(0.97);
    expect(defl / ((2 * rs) / b)).toBeLessThan(1.02);
  });

  it('captures photons inside the critical impact parameter', () => {
    const sim = new Simulation();
    const m = M_SUN;
    const rs = schwarzschildRadius(m);
    sim.add(blackHole(m));
    const bc = 1.5 * Math.sqrt(3) * rs;
    const inside = sim.add(photon({ x: -50 * rs, y: 0.98 * bc, vx: C }));
    const outside = sim.add(photon({ x: -50 * rs, y: 1.02 * bc, vx: C }));
    run(sim, (200 * rs) / C, (rs * 2) / C);
    expect(inside.alive).toBe(false);
    expect(outside.alive).toBe(true);
  });

  it('redshifts light climbing out of the potential well', () => {
    const sim = new Simulation();
    const m = 10 * M_SUN;
    const rs = schwarzschildRadius(m);
    sim.add(blackHole(m));
    const p = sim.add(photon({ x: 1.5 * rs, vx: C, wavelength: 440 }));
    // Radial light moves at the coordinate speed f c.
    expect(p.vx / C).toBeCloseTo(1 / 3, 6);
    run(sim, (60 * rs) / C, rs / C);
    expect(p.alive).toBe(true);
    const r = Math.hypot(p.x, p.y);
    const expected = 440 * Math.sqrt((1 - rs / r) / (1 / 3));
    expect(sim.photonWavelength(p)).toBeCloseTo(expected, 6);
    expect(sim.photonWavelength(p)).toBeGreaterThan(700);
  });

  it('inspirals and merges a GW150914-like binary close to the Peters time', () => {
    const sim = new Simulation();
    SCENARIOS.find((s) => s.id === 'gw150914')!.build(sim);
    const [a, b] = sim.bodies;
    const sep = Math.hypot(a.x - b.x, a.y - b.y);
    const tp = petersMergeTime(a.mass, b.mass, sep);
    run(sim, tp * 2, tp / 200);
    const merger = sim.events.find((e) => e.kind === 'merger');
    expect(merger).toBeDefined();
    const ratio = merger!.time / tp;
    // Peters assumes Newtonian orbits; PN plunge shortens the inspiral somewhat.
    expect(ratio).toBeGreaterThan(0.6);
    expect(ratio).toBeLessThan(1.15);
    expect(Number(merger!.data.mf) / M_SUN).toBeCloseTo(62.0, 0);
    // Peak strain ~1e-21 at 410 Mpc.
    expect(sim.gw.peak).toBeGreaterThan(3e-22);
    expect(sim.gw.peak).toBeLessThan(5e-21);
  });

  it('evaporates a micro black hole at the predicted time', () => {
    const sim = new Simulation();
    sim.add(blackHole(1e8));
    const t = evaporationTime(1e8);
    run(sim, t * 0.99, t / 100);
    expect(sim.bodies.length).toBe(1);
    run(sim, t * 1.01, t / 100);
    expect(sim.bodies.length).toBe(0);
    expect(sim.events[0].kind).toBe('evaporation');
  });

  it('builds every scenario and steps it', () => {
    for (const sc of SCENARIOS) {
      const sim = new Simulation();
      const r = sc.build(sim);
      sim.advance(r.warp / 60, 50);
      for (const b of sim.bodies) expect(Number.isFinite(b.x)).toBe(true);
    }
  });
});

describe('formatting', () => {
  it('formats numbers compactly', async () => {
    const { fmtNum, fmtMass } = await import('./units');
    expect(fmtNum(1.5)).toBe('1.5');
    expect(fmtNum(10)).toBe('10');
    expect(fmtNum(99999999)).toBe('1.00×10⁸');
    expect(fmtNum(1.23e-7)).toBe('1.23×10⁻⁷');
    expect(fmtMass(2 * M_SUN)).toBe('2 M☉');
  });
});

describe('stellar relations and stability', () => {
  it('main sequence and white dwarf radius', async () => {
    const { mainSequence, whiteDwarfRadius } = await import('./stars');
    const { R_SUN } = await import('./constants');
    const sun = mainSequence(M_SUN);
    expect(sun.radius / R_SUN).toBeCloseTo(1, 6);
    expect(sun.temperature).toBeCloseTo(5772, 0);
    expect(whiteDwarfRadius(0.6 * M_SUN) / 1e3).toBeGreaterThan(8000);
    expect(whiteDwarfRadius(0.6 * M_SUN) / 1e3).toBeLessThan(9500);
    expect(whiteDwarfRadius(1.3 * M_SUN)).toBeLessThan(whiteDwarfRadius(0.6 * M_SUN));
  });

  it('collapses heavy neutron stars and explodes heavy white dwarfs', async () => {
    const { star } = await import('../engine/bodies');
    const sim = new Simulation();
    const ns = sim.add(star('neutronStar'));
    ns.mass = 2.4 * M_SUN;
    sim.checkStability(ns);
    expect(ns.kind).toBe('blackHole');
    const wd = sim.add(star('whiteDwarf', { x: 1e12 }));
    wd.mass = 1.5 * M_SUN;
    sim.checkStability(wd);
    expect(wd.alive).toBe(false);
    expect(sim.events.map((e) => e.kind)).toEqual(['collapse', 'supernova']);
  });
});

describe('ephemeris', () => {
  const elong = async (iso: string) => {
    const { julianDay, moonGeocentric, sunGeocentric } = await import('./ephemeris');
    const jd = julianDay(Date.parse(iso));
    const m = moonGeocentric(jd);
    const s = sunGeocentric(jd);
    const d = ((((m.lon - s.lon) * 180) / Math.PI) % 360 + 360) % 360;
    return { d, m };
  };
  it('reproduces known lunar phases and the 2024 total eclipse', async () => {
    const eclipse = await elong('2024-04-08T18:21:00Z');
    expect(Math.min(eclipse.d, 360 - eclipse.d)).toBeLessThan(1);
    expect(Math.abs((eclipse.m.lat * 180) / Math.PI)).toBeLessThan(0.6);
    expect(eclipse.m.r / 1e3).toBeGreaterThan(355000);
    expect(eclipse.m.r / 1e3).toBeLessThan(363000);
    expect(Math.abs((await elong('2024-01-25T17:54:00Z')).d - 180)).toBeLessThan(1);
    expect(Math.abs((await elong('2025-01-06T23:56:00Z')).d - 90)).toBeLessThan(1);
  });
});

describe('planet collisions', () => {
  it('merges the proto-Earth and Theia with a small debris fraction', () => {
    const sim = new Simulation();
    SCENARIOS.find((s) => s.id === 'giantImpact')!.build(sim);
    while (sim.time < 2e5 && !sim.events.length) sim.advance(100, 1e9);
    const e = sim.events.find((x) => x.kind === 'planetImpact');
    expect(e?.data.outcome).toBe('merge');
    expect(Number(e?.data.frac)).toBeGreaterThan(0.95);
    expect(sim.bodies.filter((b) => b.kind === 'planet').length).toBe(1);
    expect(sim.bodies.some((b) => b.kind === 'debris')).toBe(true);
  });
});
