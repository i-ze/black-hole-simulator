import { useUI } from '../store';
import { DEFAULT_SCENARIO, SCENARIOS } from './scenarios';
import { Simulation, defaultSettings } from './simulation';
import type { Body } from './types';

/** Shared 2D framing used by the map and the curvature view. */
export interface Frame {
  cx: number;
  cy: number;
  halfWidth: number;
}

/** Orbit camera of the realistic renderer. */
export interface Camera3 {
  distance: number;
  azimuth: number;
  elevation: number;
  /** Vertical field of view, degrees. */
  fov: number;
}

type RenderFn = (now: number, dtReal: number) => void;

class Engine {
  readonly sim = new Simulation();
  readonly frame: Frame = { cx: 0, cy: 0, halfWidth: 1e9 };
  readonly cam: Camera3 = { distance: 1e10, azimuth: -Math.PI / 2, elevation: 0.15, fov: 50 };
  /** Camera settings saved when a look-at target is set, restored when it is cleared. */
  private camBeforeLook: Camera3 | null = null;
  fps = 60;
  /** Camera target set by "fit all" while not following a body. */
  camTarget: { x: number; y: number; z: number } | null = null;
  /** Width/height of the realistic view (for fitting). */
  realAspect = 1.6;
  /** Incremented when the 3D views should return to their default viewpoint. */
  viewReset = 0;
  /** Depth scale currently used by the curvature view (1 = true embedding). */
  curvatureScale = 1;
  /** Field strengths (m/s²) at the bottom and top of the force-field colour scale. */
  fieldRange: [number, number] = [0, 0];
  private renderers = new Set<RenderFn>();
  private last = 0;
  private lastTick = 0;
  private raf = 0;
  /** Requested single step (when paused). */
  private stepOnce = false;

  start() {
    if (this.raf) return;
    this.last = performance.now();
    const loop = (now: number) => {
      this.raf = requestAnimationFrame(loop);
      this.frameStep(now);
    };
    this.raf = requestAnimationFrame(loop);
  }

  register(fn: RenderFn) {
    this.renderers.add(fn);
    return () => {
      this.renderers.delete(fn);
    };
  }

  step() {
    this.stepOnce = true;
  }

  private frameStep(now: number) {
    const dtReal = Math.min(0.1, Math.max(0, (now - this.last) / 1000));
    this.last = now;
    if (dtReal > 0) this.fps = this.fps * 0.95 + (1 / dtReal) * 0.05;
    const ui = useUI.getState();
    if (ui.running || this.stepOnce) {
      const dt = ui.warp * (this.stepOnce && !ui.running ? 1 / 60 : dtReal);
      this.stepOnce = false;
      const advanced = this.sim.advance(dt, 9);
      this.sim.stats.effectiveWarp = dtReal > 0 ? advanced / dtReal : 0;
    } else {
      this.sim.stats.effectiveWarp = 0;
      this.sim.stats.limited = false;
    }
    // A vanished look-at target (or viewpoint) ends the fixed direction.
    if (ui.lookAtId != null && (!this.sim.get(ui.lookAtId) || !this.sim.get(ui.selectedId) || ui.selectedId === ui.lookAtId)) this.clearLookAt();
    // Keep selection valid.
    if (ui.selectedId != null && !this.sim.get(ui.selectedId)) {
      const replacement = this.fallbackSelection();
      useUI.setState({ selectedId: replacement?.id ?? null });
    }
    const followed = ui.follow ? this.sim.get(useUI.getState().selectedId) : undefined;
    if (followed) {
      this.frame.cx = followed.x;
      this.frame.cy = followed.y;
    }
    for (const r of this.renderers) r(now, dtReal);
    if (now - this.lastTick > 125) {
      this.lastTick = now;
      useUI.setState((s) => ({ tick: s.tick + 1 }));
    }
  }

  /** After a merger or evaporation, select the most massive black hole that remains. */
  private fallbackSelection(): Body | undefined {
    let best: Body | undefined;
    for (const b of this.sim.bodies) if (b.massive && (!best || b.mass > best.mass)) best = b;
    return best;
  }

  /** Centre of the scene used by 3D views: followed body or centre of mass. */
  focus(): { x: number; y: number; z: number; vx: number; vy: number; vz: number } {
    const ui = useUI.getState();
    const b = ui.follow ? this.sim.get(ui.selectedId) : undefined;
    if (b) return b;
    if (this.camTarget) return { ...this.camTarget, vx: 0, vy: 0, vz: 0 };
    let m = 0;
    const c = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 };
    for (const o of this.sim.bodies) {
      if (!o.massive) continue;
      m += o.mass;
      c.x += o.x * o.mass;
      c.y += o.y * o.mass;
      c.z += o.z * o.mass;
    }
    if (m > 0) {
      c.x /= m;
      c.y /= m;
      c.z /= m;
    }
    return c;
  }

  /** Select a body, follow it and frame all views tightly around it (ships at true size). */
  zoomTo(id: number) {
    const b = this.sim.get(id);
    if (!b) return;
    const size = b.kind === 'ship' ? b.radius * 2 : b.kind === 'blackHole' ? b.radius * 4 : Math.max(b.radius, 1) * 2;
    this.frame.cx = b.x;
    this.frame.cy = b.y;
    this.frame.halfWidth = Math.max(size * (b.kind === 'ship' ? 1.6 : 1.2), 1e-30);
    this.cam.distance = b.kind === 'ship' ? b.radius * 4.5 : b.kind === 'blackHole' ? b.radius * 12 : b.radius * 4;
    this.cam.elevation = 0.35;
    useUI.setState({ selectedId: id, follow: true, tool: 'select' });
  }

  /**
   * Zoom out so that every body is visible. 'frame' fits the shared 2D frame (map, curvature,
   * field); 'camera' moves the realistic camera back around the centre of mass. Photons are left
   * out (escaping light would push the view out without bound). Following is switched off.
   */
  fitAll(target: 'frame' | 'camera') {
    const bodies = this.sim.bodies.filter((b) => b.kind !== 'photon');
    if (!bodies.length) return;
    useUI.setState({ follow: false });
    if (target === 'frame') {
      let x0 = Infinity;
      let x1 = -Infinity;
      let y0 = Infinity;
      let y1 = -Infinity;
      let rMax = 0;
      for (const b of bodies) {
        x0 = Math.min(x0, b.x - b.radius);
        x1 = Math.max(x1, b.x + b.radius);
        y0 = Math.min(y0, b.y - b.radius);
        y1 = Math.max(y1, b.y + b.radius);
        rMax = Math.max(rMax, b.radius);
      }
      this.frame.cx = (x0 + x1) / 2;
      this.frame.cy = (y0 + y1) / 2;
      this.frame.halfWidth = Math.max((x1 - x0) / 2, (y1 - y0) / 2, rMax * 2, 1e-20) * 1.25;
      // Curvature and field views look at the whole plane from their default viewpoint again.
      this.viewReset++;
      return;
    }
    // Aim at the centre of the bounding box, not the centre of mass.
    let x0 = Infinity;
    let x1 = -Infinity;
    let y0 = Infinity;
    let y1 = -Infinity;
    let z0 = Infinity;
    let z1 = -Infinity;
    for (const b of bodies) {
      x0 = Math.min(x0, b.x);
      x1 = Math.max(x1, b.x);
      y0 = Math.min(y0, b.y);
      y1 = Math.max(y1, b.y);
      z0 = Math.min(z0, b.z);
      z1 = Math.max(z1, b.z);
    }
    const c = { x: (x0 + x1) / 2, y: (y0 + y1) / 2, z: (z0 + z1) / 2 };
    this.camTarget = c;
    let r = 0;
    for (const b of bodies) r = Math.max(r, Math.hypot(b.x - c.x, b.y - c.y, b.z - c.z) + b.radius);
    // A flat system seen edge-on would collapse into a line: look at it obliquely from above.
    const planar = Math.max(x1 - x0, y1 - y0);
    if (z1 - z0 < 0.3 * planar) this.cam.elevation = 0.75;
    // Bounding sphere inside the narrower of the vertical / horizontal field of view.
    const halfV = (25 * Math.PI) / 180;
    const halfH = Math.atan(Math.tan(halfV) * this.realAspect);
    this.cam.distance = (Math.max(r, 1e-20) / Math.sin(Math.min(halfV, halfH))) * 1.15;
  }

  /**
   * Keep the realistic camera at the selected body, always facing `targetId` (e.g. watch the Moon
   * from the Earth). The field of view is set so the target fills a good part of the image.
   */
  setLookAt(targetId: number) {
    const ui = useUI.getState();
    const from = this.sim.get(ui.selectedId);
    const target = this.sim.get(targetId);
    if (!from || !target || from.id === target.id) return;
    this.camBeforeLook ??= { ...this.cam };
    const d = Math.hypot(target.x - from.x, target.y - from.y, target.z - from.z);
    const angular = (2 * Math.atan(target.radius / Math.max(d, 1e-30)) * 180) / Math.PI;
    this.cam.fov = Math.min(50, Math.max(0.05, angular * 2.5));
    useUI.setState({ lookAtId: targetId, follow: true });
  }

  clearLookAt() {
    if (this.camBeforeLook) Object.assign(this.cam, this.camBeforeLook);
    this.camBeforeLook = null;
    this.cam.fov = 50;
    useUI.setState({ lookAtId: null });
  }

  /** Remove every body and start from an empty, paused universe. */
  clearAll() {
    this.sim.reset();
    useUI.setState({ selectedId: null, running: false });
  }

  loadScenario(id: string) {
    const sc = SCENARIOS.find((s) => s.id === id) ?? SCENARIOS.find((s) => s.id === DEFAULT_SCENARIO)!;
    this.sim.reset();
    this.sim.settings = defaultSettings();
    const r = sc.build(this.sim);
    this.frame.halfWidth = r.extent;
    const sel = this.sim.get(r.select);
    this.frame.cx = sel?.x ?? 0;
    this.frame.cy = sel?.y ?? 0;
    this.cam.distance = r.camDistance ?? r.extent;
    this.cam.elevation = r.camElevation ?? 0.2;
    this.cam.azimuth = -Math.PI / 2;
    this.camTarget = null;
    this.camBeforeLook = null;
    this.cam.fov = 50;
    useUI.setState({ lookAtId: null });
    if (r.viewFromHost !== undefined) useUI.getState().setRealistic({ fromHost: r.viewFromHost });
    useUI.setState({ scenarioId: sc.id, warp: r.warp, selectedId: r.select ?? null, follow: true, tool: 'select' });
  }
}

export const engine = new Engine();

// Following a body again discards the "fit all" camera target.
useUI.subscribe((s, prev) => {
  if (s.follow && !prev.follow) engine.camTarget = null;
});

if (import.meta.env.DEV) (window as unknown as { __engine: Engine }).__engine = engine;
