import { useEffect, useRef } from 'react';
import { engine } from '../engine/engine';
import { placeFromTool, placementVelocity, predictPath } from '../engine/placement';
import { starHex } from '../engine/simulation';
import { shipById, type ShipShape } from '../engine/ships';
import { drawShipTopView } from './shipSilhouettes';
import { makeDoubleTap, markHandled } from './doubleTap';
import { planetById, planetSpin } from '../engine/planets';
import { renderGlobe, ringStops } from './planetTextures';
import type { Body, Effect } from '../engine/types';
import { ergosphereEquatorial, iscoRadius, photonSphereRadius, schwarzschildRadius, tidalRadius, gravRadius } from '../physics/blackhole';
import { AU, C, LY, PC } from '../physics/constants';
import { fmtLength, fmtNum, fmtSpeed } from '../physics/units';
import { wavelengthCss } from '../physics/spectrum';
import { useUI } from '../store';
import { useElementSize } from './useCanvasSize';

interface Interaction {
  mode: 'pan' | 'move' | 'place' | null;
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
  worldX: number;
  worldY: number;
  bodyId: number | null;
  moved: boolean;
  preview: Float64Array | null;
  previewAt: number;
  hoverX: number;
  hoverY: number;
  inside: boolean;
}

const BG_TOP = '#05070d';
const BG_BOTTOM = '#080b14';

export function MapView() {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const size = useElementSize(wrap);
  const ix = useRef<Interaction>({
    mode: null,
    startX: 0,
    startY: 0,
    lastX: 0,
    lastY: 0,
    worldX: 0,
    worldY: 0,
    bodyId: null,
    moved: false,
    preview: null,
    previewAt: 0,
    hoverX: 0,
    hoverY: 0,
    inside: false,
  });

  useEffect(() => {
    const cv = canvas.current!;
    const ctx = cv.getContext('2d')!;
    const sim = engine.sim;
    const frame = engine.frame;

    const scale = () => Math.min(size.current.width, size.current.height) / (2 * frame.halfWidth);
    const toScreen = (x: number, y: number): [number, number] => {
      const k = scale();
      return [size.current.width / 2 + (x - frame.cx) * k, size.current.height / 2 - (y - frame.cy) * k];
    };
    const toWorld = (sx: number, sy: number): [number, number] => {
      const k = scale();
      return [frame.cx + (sx - size.current.width / 2) / k, frame.cy - (sy - size.current.height / 2) / k];
    };

    const render = () => {
      const { width: W, height: H, dpr } = size.current;
      if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) {
        cv.width = Math.round(W * dpr);
        cv.height = Math.round(H * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const ui = useUI.getState();
      const opts = ui.map;
      const k = scale();
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, BG_TOP);
      g.addColorStop(1, BG_BOTTOM);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);

      if (opts.grid) drawGrid(ctx, W, H, frame.cx, frame.cy, k);

      const bodies = sim.bodies;
      // Accretion disks and characteristic radii.
      if (opts.zones) for (const b of bodies) if (b.kind === 'blackHole') drawZones(ctx, b, toScreen, k);

      const selected = sim.get(ui.selectedId);
      if (selected && (selected.kind === 'star' || selected.kind === 'planet' || selected.kind === 'whiteDwarf')) {
        const host = sim.dominantAttractor(selected.x, selected.y, selected.z, selected.id);
        if (host && host.kind === 'blackHole') {
          const rt = tidalRadius(host.mass, selected.mass, selected.radius);
          const [hx, hy] = toScreen(host.x, host.y);
          if (rt * k > 4) {
            ctx.setLineDash([2, 5]);
            ctx.strokeStyle = 'rgba(248,113,113,0.65)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.arc(hx, hy, rt * k, 0, Math.PI * 2);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.fillStyle = 'rgba(248,113,113,0.8)';
            ctx.font = '10px "JetBrains Mono Variable", monospace';
            ctx.fillText('r_t', hx + rt * k * 0.707 + 4, hy - rt * k * 0.707 - 4);
          }
        }
      }

      // Sight line of the fixed viewing direction (viewpoint -> target).
      if (ui.lookAtId != null && selected) {
        const target = sim.get(ui.lookAtId);
        if (target) {
          const [ax, ay] = toScreen(selected.x, selected.y);
          const [bx, by] = toScreen(target.x, target.y);
          ctx.setLineDash([5, 5]);
          ctx.strokeStyle = 'rgba(125,211,252,0.7)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(ax, ay);
          ctx.lineTo(bx, by);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }
      if (opts.trails) drawTrails(ctx, bodies, toScreen, ui.selectedId);
      drawLightRays(ctx, bodies, toScreen, opts.trails, W);

      // Particles first, then massive bodies.
      for (const b of bodies) if (!b.massive) drawParticle(ctx, b, toScreen, b.id === ui.selectedId, k);
      for (const b of bodies) if (b.massive) drawMassive(ctx, b, toScreen, k, opts.labels, b.id === ui.selectedId);
      if (opts.labels) for (const b of bodies) if (b.kind === 'ship') drawLabel(ctx, b, toScreen, b.id === ui.selectedId, k);

      drawEffects(ctx, sim.effects, toScreen, k, sim.time, W, H);

      if (selected) drawSelection(ctx, selected, toScreen, k);

      // Placement preview.
      const st = ix.current;
      if (ui.tool !== 'select' && st.inside) {
        const placing = st.mode === 'place';
        const [wx, wy] = placing ? [st.worldX, st.worldY] : toWorld(st.hoverX, st.hoverY);
        const [sx, sy] = toScreen(wx, wy);
        const drag: [number, number] | null = placing ? [st.lastX - st.startX, st.lastY - st.startY] : null;
        ctx.strokeStyle = 'rgba(125,211,252,0.9)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(sx, sy, 7, 0, Math.PI * 2);
        ctx.moveTo(sx - 12, sy);
        ctx.lineTo(sx - 4, sy);
        ctx.moveTo(sx + 4, sy);
        ctx.lineTo(sx + 12, sy);
        ctx.moveTo(sx, sy - 12);
        ctx.lineTo(sx, sy - 4);
        ctx.moveTo(sx, sy + 4);
        ctx.lineTo(sx, sy + 12);
        ctx.stroke();
        const now = performance.now();
        if (now - st.previewAt > 60) {
          st.previewAt = now;
          if (ui.tool === 'photons') {
            const d = drag && Math.hypot(drag[0], drag[1]) > 4 ? drag : [1, 0];
            st.preview = predictPath(sim, wx, wy, d[0], -d[1], true);
          } else {
            const [vx, vy] = placementVelocity(sim, ui.params, wx, wy, drag);
            st.preview = predictPath(sim, wx, wy, vx, vy, false);
          }
        }
        if (st.preview && st.preview.length > 2) {
          ctx.setLineDash([4, 4]);
          ctx.strokeStyle = ui.tool === 'photons' ? 'rgba(253,224,71,0.7)' : 'rgba(125,211,252,0.6)';
          ctx.beginPath();
          ctx.moveTo(sx, sy);
          for (let i = 0; i < st.preview.length; i += 2) {
            const [px, py] = toScreen(st.preview[i], st.preview[i + 1]);
            ctx.lineTo(px, py);
          }
          ctx.stroke();
          ctx.setLineDash([]);
        }
        if (drag && Math.hypot(drag[0], drag[1]) > 4) {
          ctx.strokeStyle = '#7dd3fc';
          ctx.lineWidth = 1.5;
          arrow(ctx, sx, sy, sx + drag[0], sy + drag[1]);
          if (ui.tool !== 'photons') {
            const [vx, vy] = placementVelocity(sim, ui.params, wx, wy, drag);
            const host = sim.dominantAttractor(wx, wy, 0);
            const rel = host ? Math.hypot(vx - host.vx, vy - host.vy) : Math.hypot(vx, vy);
            ctx.fillStyle = '#bae6fd';
            ctx.font = '11px "JetBrains Mono Variable", monospace';
            ctx.fillText(fmtSpeed(rel), sx + drag[0] + 8, sy + drag[1] - 8);
          }
        }
      }

      drawScaleBar(ctx, W, H, k);
      drawCursorReadout(ctx, W, H, st, toWorld);
    };

    const unregister = engine.register(render);

    const pick = (sx: number, sy: number): Body | undefined => {
      let best: Body | undefined;
      let bestD = Infinity;
      const k = scale();
      for (const b of sim.bodies) {
        const [bx, by] = toScreen(b.x, b.y);
        const d = Math.hypot(bx - sx, by - sy);
        const rpx = Math.max(b.radius * k, 0);
        const thr = Math.max(10, rpx);
        // Prefer massive bodies over particles at equal distance.
        const score = d - (b.massive ? 4 : 0);
        if (d < thr && score < bestD) {
          bestD = score;
          best = b;
        }
      }
      return best;
    };

    const local = (e: PointerEvent | WheelEvent) => {
      const r = cv.getBoundingClientRect();
      return [e.clientX - r.left, e.clientY - r.top] as [number, number];
    };

    const tap = makeDoubleTap();
    const onDown = (e: PointerEvent) => {
      tap.down(e);
      if (e.button === 2) {
        useUI.setState({ tool: 'select' });
        return;
      }
      const [sx, sy] = local(e);
      cv.setPointerCapture(e.pointerId);
      const st = ix.current;
      st.startX = st.lastX = sx;
      st.startY = st.lastY = sy;
      st.moved = false;
      const ui = useUI.getState();
      if (ui.tool !== 'select') {
        const [wx, wy] = toWorld(sx, sy);
        st.mode = 'place';
        st.worldX = wx;
        st.worldY = wy;
        return;
      }
      const hit = pick(sx, sy);
      if (hit) {
        st.mode = 'move';
        st.bodyId = hit.id;
        useUI.setState({ selectedId: hit.id });
      } else {
        st.mode = 'pan';
      }
    };

    const onMove = (e: PointerEvent) => {
      const [sx, sy] = local(e);
      const st = ix.current;
      st.hoverX = sx;
      st.hoverY = sy;
      st.inside = true;
      if (!st.mode) return;
      const dx = sx - st.lastX;
      const dy = sy - st.lastY;
      if (Math.hypot(sx - st.startX, sy - st.startY) > 3) st.moved = true;
      st.lastX = sx;
      st.lastY = sy;
      const k = scale();
      if (st.mode === 'pan' && st.moved) {
        useUI.setState({ follow: false });
        frame.cx -= dx / k;
        frame.cy += dy / k;
      } else if (st.mode === 'move' && st.moved) {
        const b = sim.get(st.bodyId);
        if (b) {
          b.x += dx / k;
          b.y -= dy / k;
          b.trail.clear();
        }
      }
    };

    const onUp = (e: PointerEvent) => {
      const st = ix.current;
      const ui = useUI.getState();
      if (ui.tool === 'select' && tap.up(e) === 'double') {
        const r = cv.getBoundingClientRect();
        const hit = pick(e.clientX - r.left, e.clientY - r.top);
        if (hit) {
          // A body was hit: zoom to it instead of maximizing the panel.
          markHandled(e);
          engine.zoomTo(hit.id);
        }
      }
      if (st.mode === 'place') {
        const drag: [number, number] = [st.lastX - st.startX, st.lastY - st.startY];
        const id = placeFromTool(sim, ui.tool, ui.params, st.worldX, st.worldY, Math.hypot(...drag) > 4 ? drag : null, frame.halfWidth);
        if (id != null && ui.tool !== 'meteors' && ui.tool !== 'photons') useUI.setState({ selectedId: id, follow: false });
        st.preview = null;
      } else if (st.mode === 'pan' && !st.moved) {
        useUI.setState({ selectedId: null });
      } else if (st.mode === 'move' && st.moved) {
        // Keep the follow target stable while dragging.
      }
      st.mode = null;
      st.bodyId = null;
      try {
        cv.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const [sx, sy] = local(e);
      const before = toWorld(sx, sy);
      const f = Math.exp(Math.sign(e.deltaY) * Math.min(Math.abs(e.deltaY), 100) * 0.0022);
      frame.halfWidth = Math.min(1e24, Math.max(1e-30, frame.halfWidth * f));
      if (!useUI.getState().follow) {
        const after = toWorld(sx, sy);
        frame.cx += before[0] - after[0];
        frame.cy += before[1] - after[1];
      }
    };


    const onLeave = () => {
      ix.current.inside = false;
    };
    const onContext = (e: Event) => e.preventDefault();

    cv.addEventListener('pointerdown', onDown);
    cv.addEventListener('pointermove', onMove);
    cv.addEventListener('pointerup', onUp);
    cv.addEventListener('pointerleave', onLeave);
    cv.addEventListener('wheel', onWheel, { passive: false });
    cv.addEventListener('contextmenu', onContext);
    return () => {
      unregister();
      cv.removeEventListener('pointerdown', onDown);
      cv.removeEventListener('pointermove', onMove);
      cv.removeEventListener('pointerup', onUp);
      cv.removeEventListener('pointerleave', onLeave);
      cv.removeEventListener('wheel', onWheel);
      cv.removeEventListener('contextmenu', onContext);
    };
  }, [size]);

  const tool = useUI((s) => s.tool);
  return (
    <div ref={wrap} className="absolute inset-0">
      <canvas ref={canvas} className="block h-full w-full" style={{ cursor: tool === 'select' ? 'default' : 'crosshair', touchAction: 'none' }} />
    </div>
  );
}

type ToScreen = (x: number, y: number) => [number, number];

function drawGrid(ctx: CanvasRenderingContext2D, W: number, H: number, cx: number, cy: number, k: number) {
  const span = (Math.max(W, H) / k) * 0.5;
  const exp = Math.floor(Math.log10(span / 2));
  const major = 10 ** exp;
  const minor = major / 10;
  const fade = Math.min(1, Math.max(0, (minor * k - 6) / 30));
  const drawLines = (step: number, alpha: number) => {
    if (alpha <= 0.01) return;
    ctx.strokeStyle = `rgba(148,163,184,${alpha})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    const x0 = Math.floor((cx - span) / step) * step;
    for (let x = x0; x <= cx + span; x += step) {
      const sx = Math.round(W / 2 + (x - cx) * k) + 0.5;
      ctx.moveTo(sx, 0);
      ctx.lineTo(sx, H);
    }
    const y0 = Math.floor((cy - span) / step) * step;
    for (let y = y0; y <= cy + span; y += step) {
      const sy = Math.round(H / 2 - (y - cy) * k) + 0.5;
      ctx.moveTo(0, sy);
      ctx.lineTo(W, sy);
    }
    ctx.stroke();
  };
  drawLines(minor, 0.045 * fade);
  drawLines(major, 0.09);
}

function drawZones(ctx: CanvasRenderingContext2D, b: Body, toScreen: ToScreen, k: number) {
  const [sx, sy] = toScreen(b.x, b.y);
  const rg = gravRadius(b.mass);
  const isco = iscoRadius(b.mass, b.spin) * k;
  if (b.disk) {
    const rin = iscoRadius(b.mass, b.spin) * k;
    const rout = b.diskOuter * rg * k;
    if (rout > 2) {
      const g = ctx.createRadialGradient(sx, sy, rin, sx, sy, rout);
      g.addColorStop(0, 'rgba(255,244,214,0.85)');
      g.addColorStop(0.15, 'rgba(255,186,92,0.55)');
      g.addColorStop(0.6, 'rgba(234,88,12,0.18)');
      g.addColorStop(1, 'rgba(234,88,12,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(sx, sy, rout, 0, Math.PI * 2);
      ctx.arc(sx, sy, Math.max(rin, 0.5), 0, Math.PI * 2, true);
      ctx.fill();
    }
  }
  const ring = (r: number, color: string, dash: number[]) => {
    if (r < 3) return;
    ctx.setLineDash(dash);
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(sx, sy, r, 0, Math.PI * 2);
    ctx.stroke();
  };
  if (b.spin > 0.05) ring(ergosphereEquatorial(b.mass) * k, 'rgba(167,139,250,0.45)', [1, 3]);
  ring(photonSphereRadius(b.mass, b.spin) * k, 'rgba(250,204,21,0.6)', [3, 3]);
  ring(isco, 'rgba(56,189,248,0.55)', [6, 4]);
  ctx.setLineDash([]);
}

function drawTrails(ctx: CanvasRenderingContext2D, bodies: Body[], toScreen: ToScreen, selectedId: number | null) {
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const b of bodies) {
    const tr = b.trail;
    if (tr.count < 2 || b.kind === 'photon') continue;
    const massive = b.massive || b.kind === 'ship';
    const color = trailColor(b);
    const segs = massive ? 6 : 2;
    const n = tr.count;
    const per = Math.ceil(n / segs);
    // Swarm particles only show a short tail to keep the map readable.
    const skip = massive ? 0 : Math.max(0, n - 16);
    ctx.lineWidth = b.id === selectedId ? 1.6 : massive ? 1.1 : 0.7;
    let prev: [number, number] | null = null;
    for (let s = 0; s < segs; s++) {
      const a = ((s + 1) / segs) * (massive ? 0.75 : 0.35);
      ctx.strokeStyle = color.replace('ALPHA', a.toFixed(3));
      ctx.beginPath();
      if (prev) ctx.moveTo(prev[0], prev[1]);
      let started = !!prev;
      tr.forEach((x, y, _z, i) => {
        if (i < skip || i < s * per || i > (s + 1) * per) return;
        const p = toScreen(x, y);
        if (!started) {
          ctx.moveTo(p[0], p[1]);
          started = true;
        } else ctx.lineTo(p[0], p[1]);
        prev = p;
      });
      if (s === segs - 1) {
        const p = toScreen(b.x, b.y);
        ctx.lineTo(p[0], p[1]);
      }
      ctx.stroke();
    }
  }
}

/**
 * Light rays as glowing paths. Each segment is coloured by the wavelength a static observer
 * would measure there (gravitational blue/redshift), so both the bending and the shift are visible.
 */
function drawLightRays(ctx: CanvasRenderingContext2D, bodies: Body[], toScreen: ToScreen, trails: boolean, W: number) {
  const sim = engine.sim;
  const photons = bodies.filter((b) => b.kind === 'photon');
  if (!photons.length) return;
  // Waves and labels only while the number of rays keeps the picture readable.
  const waves = photons.length <= 40;
  const labels = photons.length <= 16;
  const many = photons.length > 60;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const p of photons) {
    if (trails && p.trail.count > 1) {
      const scr: [number, number][] = [];
      const lam: number[] = [];
      // Wavelengths were stored with the trail points when they were recorded.
      p.trail.forEach((x, y, _z, _i, _n, v) => {
        scr.push(toScreen(x, y));
        lam.push(v);
      });
      scr.push(toScreen(p.x, p.y));
      lam.push(sim.photonWavelength(p));
      const n = scr.length;
      // Soft straight glow under the ray (skipped for large beams to keep the frame rate).
      if (!many) {
        ctx.lineWidth = 5;
        strokeRuns(ctx, scr, lam, 0.12, n);
      }
      // Bright core drawn as a wave whose on-screen wavelength is proportional to the local λ,
      // so stretching (redshift) and squeezing (blueshift) are visible, not just the colour.
      ctx.lineWidth = 1.4;
      if (waves) {
        const wave = waveRay(scr, lam, n);
        strokeRuns(ctx, wave.pts, wave.lam, 0.95, wave.pts.length);
      } else strokeRuns(ctx, scr, lam, 0.9, n);
    }
    const [x, y] = toScreen(p.x, p.y);
    if (x < -20 || y < -20 || x > W + 20) continue;
    const lamNow = sim.photonWavelength(p);
    if (many) {
      ctx.fillStyle = wavelengthCss(lamNow, 0.95);
      ctx.fillRect(x - 1.5, y - 1.5, 3, 3);
      continue;
    }
    const g = ctx.createRadialGradient(x, y, 0, x, y, 9);
    g.addColorStop(0, 'rgba(255,255,255,0.95)');
    g.addColorStop(0.25, wavelengthCss(lamNow, 0.9));
    g.addColorStop(1, wavelengthCss(lamNow, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, 9, 0, Math.PI * 2);
    ctx.fill();
    if (labels) {
      ctx.save();
      ctx.globalCompositeOperation = 'source-over';
      ctx.font = '600 10px "JetBrains Mono Variable", monospace';
      ctx.fillStyle = wavelengthCss(Math.min(Math.max(lamNow, 400), 720));
      ctx.fillText(`${Math.round(lamNow)} nm${lamNow < 380 ? ' UV' : lamNow > 750 ? ' IR' : ''}`, x + 10, y - 8);
      ctx.restore();
    }
  }
  ctx.restore();
  // Spectrum legend.
  ctx.save();
  const lx = 16;
  const ly = 14;
  const lw = 150;
  const grad = ctx.createLinearGradient(lx, 0, lx + lw, 0);
  for (let k = 0; k <= 10; k++) grad.addColorStop(k / 10, wavelengthCss(380 + k * 37));
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.fillRect(lx - 6, ly - 4, lw + 12, 30);
  ctx.fillStyle = grad;
  ctx.fillRect(lx, ly, lw, 5);
  ctx.fillStyle = 'rgba(203,213,225,0.85)';
  ctx.font = '10px "JetBrains Mono Variable", monospace';
  ctx.fillText('380', lx, ly + 18);
  ctx.fillText('λ nm', lx + lw / 2 - 12, ly + 18);
  ctx.fillText('750', lx + lw - 18, ly + 18);
  ctx.restore();
}

/** Stroke a polyline, grouping consecutive points of similar wavelength into one path. */
function strokeRuns(ctx: CanvasRenderingContext2D, pts: [number, number][], lam: number[], alpha: number, n: number) {
  let i = 0;
  while (i < n - 1) {
    const key = Math.round(lam[i] / 4);
    const fade = Math.min(1, (i / n) * 3 + 0.15);
    ctx.strokeStyle = wavelengthCss(lam[i], alpha * fade);
    ctx.beginPath();
    ctx.moveTo(pts[i][0], pts[i][1]);
    let j = i + 1;
    while (j < n) {
      ctx.lineTo(pts[j][0], pts[j][1]);
      if (Math.round(lam[j] / 4) !== key || j - i > 48) break;
      j++;
    }
    ctx.stroke();
    i = j;
  }
}

/** Screen pixels per nanometre of wavelength for the wave drawing (550 nm -> 16 px). */
const WAVE_PX_PER_NM = 16 / 550;

/**
 * Turn a ray polyline into a sinusoid. Phase is measured from the photon (the last point), so the
 * wave pattern travels with the light; local wavelength on screen = λ × WAVE_PX_PER_NM.
 */
function waveRay(scr: [number, number][], lam: number[], n: number): { pts: [number, number][]; lam: number[] } {
  const pts: [number, number][] = [];
  const lams: number[] = [];
  let phase = 0;
  const amp = 3;
  for (let i = n - 1; i > 0; i--) {
    const [x1, y1] = scr[i];
    const [x0, y0] = scr[i - 1];
    const len = Math.hypot(x1 - x0, y1 - y0);
    if (len < 1e-6) continue;
    const nx = -(y1 - y0) / len;
    const ny = (x1 - x0) / len;
    const steps = Math.max(1, Math.ceil(len / 2));
    for (let k = 0; k < steps; k++) {
      const t = k / steps;
      const l = lam[i] + (lam[i - 1] - lam[i]) * t;
      const off = amp * Math.sin(2 * Math.PI * phase);
      pts.push([x1 + (x0 - x1) * t + nx * off, y1 + (y0 - y1) * t + ny * off]);
      lams.push(l);
      phase += len / steps / (Math.max(l, 50) * WAVE_PX_PER_NM);
    }
  }
  pts.reverse();
  lams.reverse();
  return { pts, lam: lams };
}

function trailColor(b: Body): string {
  switch (b.kind) {
    case 'blackHole':
      return 'rgba(251,146,60,ALPHA)';
    case 'photon':
      return 'rgba(253,224,71,ALPHA)';
    case 'ship':
      return hexToRgba(b.color);
    case 'planet':
      return hexToRgba(b.color);
    case 'meteor':
      return 'rgba(203,213,225,ALPHA)';
    case 'debris':
      return hexToRgba(b.color);
    default:
      return hexToRgba(starHex(b.temperature));
  }
}

function hexToRgba(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},ALPHA)`;
}

function drawParticle(ctx: CanvasRenderingContext2D, b: Body, toScreen: ToScreen, selected: boolean, k: number) {
  const [x, y] = toScreen(b.x, b.y);
  if (x < -20 || y < -20 || x > 1e5 || y > 1e5) return;
  if (b.kind === 'ship') {
    // Heading along the velocity relative to the dominant body (the direction of the orbit).
    const host = engine.sim.dominantAttractor(b.x, b.y, b.z);
    const heading = Math.atan2(b.vy - (host?.vy ?? 0), b.vx - (host?.vx ?? 0));
    const model = shipById(b.model);
    const lengthPx = (model?.length ?? b.radius * 2) * k;
    if (lengthPx >= 14) {
      // True-scale top view.
      drawShipTopView(ctx, b.model, x, y, heading, lengthPx);
    } else {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(-heading);
      ctx.fillStyle = b.color;
      ctx.strokeStyle = b.color;
      ctx.lineWidth = 1.4;
      drawShipGlyph(ctx, model?.shape ?? 'arrow');
      ctx.restore();
    }
    if (selected) {
      ctx.strokeStyle = '#e0f2fe';
      ctx.beginPath();
      ctx.arc(x, y, Math.max(10, lengthPx * 0.6), 0, Math.PI * 2);
      ctx.stroke();
    }
    return;
  }
  if (b.kind === 'photon') return; // drawn by drawLightRays
  ctx.fillStyle = b.color;
  const s = b.kind === 'debris' ? 1.6 : 1.8;
  ctx.fillRect(x - s / 2, y - s / 2, s, s);
}

/** Small top-down silhouettes, pointing along +x (direction of motion). */
function drawShipGlyph(ctx: CanvasRenderingContext2D, shape: ShipShape) {
  ctx.beginPath();
  switch (shape) {
    case 'saucer':
      // Saucer section with two nacelles behind it.
      ctx.ellipse(3, 0, 4.5, 4.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(-7, -4.5, 7, 1.6);
      ctx.fillRect(-7, 2.9, 7, 1.6);
      return;
    case 'disc':
      ctx.arc(-1, 0, 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(2, -3.2, 5, 2);
      ctx.fillRect(2, 1.2, 5, 2);
      return;
    case 'ring':
      ctx.arc(0, 0, 5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 0, 1.6, 0, Math.PI * 2);
      ctx.fill();
      return;
    case 'wedge':
      ctx.moveTo(9, 0);
      ctx.lineTo(-6, 5.5);
      ctx.lineTo(-6, -5.5);
      ctx.closePath();
      ctx.fill();
      return;
    case 'box':
      ctx.fillRect(-4, -4, 8, 8);
      return;
    case 'car':
      ctx.fillRect(-6, -3, 12, 6);
      return;
    case 'ufo':
      ctx.ellipse(0, 0, 6, 6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.fillStyle = '#7cffb2';
      ctx.arc(0, 0, 2, 0, Math.PI * 2);
      ctx.fill();
      return;
    case 'shell':
      ctx.ellipse(0, 0, 2, 6, 0, 0, Math.PI * 2);
      ctx.fill();
      return;
    case 'sphere':
      ctx.arc(0, 0, 5.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.fillStyle = '#2a2e35';
      ctx.arc(2.5, 0, 1.6, 0, Math.PI * 2);
      ctx.fill();
      return;
    case 'tie':
      ctx.fillRect(-5, -6, 10, 1.6);
      ctx.fillRect(-5, 4.4, 10, 1.6);
      ctx.fillRect(-0.6, -5, 1.2, 10);
      ctx.arc(0, 0, 2.4, 0, Math.PI * 2);
      ctx.fill();
      return;
    case 'long':
      ctx.fillRect(-8, -1.2, 14, 2.4);
      ctx.arc(7, 0, 2.6, 0, Math.PI * 2);
      ctx.fill();
      return;
    default:
      ctx.moveTo(7, 0);
      ctx.lineTo(-5, 4);
      ctx.lineTo(-2.5, 0);
      ctx.lineTo(-5, -4);
      ctx.closePath();
      ctx.fill();
  }
}

function drawMassive(ctx: CanvasRenderingContext2D, b: Body, toScreen: ToScreen, k: number, labels: boolean, selected: boolean) {
  const [x, y] = toScreen(b.x, b.y);
  const r = b.radius * k;
  if (b.kind === 'blackHole') {
    const rs = schwarzschildRadius(b.mass) * k;
    const shadow = 2.6 * rs; // apparent shadow radius sqrt(27) GM/c^2
    if (r >= 3) {
      const g = ctx.createRadialGradient(x, y, r, x, y, Math.max(shadow * 1.4, r + 6));
      g.addColorStop(0, 'rgba(251,146,60,0.45)');
      g.addColorStop(1, 'rgba(251,146,60,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, Math.max(shadow * 1.4, r + 6), 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(253,186,116,0.95)';
      ctx.lineWidth = 1.2;
      ctx.stroke();
    } else {
      const glow = b.flare > 0.01 ? Math.min(14, 4 * Math.log10(1 + b.flare)) : 0;
      if (glow > 0) {
        ctx.fillStyle = 'rgba(255,220,160,0.35)';
        ctx.beginPath();
        ctx.arc(x, y, 5 + glow, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = '#000';
      ctx.strokeStyle = 'rgba(253,186,116,0.95)';
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.arc(x, y, 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = 'rgba(253,186,116,0.4)';
      ctx.beginPath();
      ctx.arc(x, y, 8, 0, Math.PI * 2);
      ctx.stroke();
    }
  } else if (b.kind === 'planet') {
    drawPlanet2D(ctx, b, x, y, Math.max(r, 2.2));
  } else {
    drawStar2D(ctx, b, x, y, Math.max(r, b.kind === 'neutronStar' || b.kind === 'whiteDwarf' ? 2 : 3));
  }
  if (labels) {
    ctx.font = `${selected ? 600 : 500} 11px "Inter Variable", sans-serif`;
    ctx.fillStyle = selected ? '#f8fafc' : 'rgba(203,213,225,0.8)';
    const off = Math.max(r, 6) * 0.72 + 6;
    ctx.fillText(b.name, x + off, y - off);
  }
}

/** Glowing star: hot white core with limb darkening, coloured corona and, when point-like, diffraction spikes. */
function drawStar2D(ctx: CanvasRenderingContext2D, b: Body, x: number, y: number, pr: number) {
  const color = starHex(b.temperature);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const haloR = pr * 4 + 16;
  const halo = ctx.createRadialGradient(x, y, pr * 0.6, x, y, haloR);
  halo.addColorStop(0, color + 'cc');
  halo.addColorStop(0.25, color + '44');
  halo.addColorStop(1, color + '00');
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(x, y, haloR, 0, Math.PI * 2);
  ctx.fill();
  if (pr < 30) {
    // Diffraction spikes of a bright point source.
    const len = pr * 5 + 18;
    for (const a of [0, Math.PI / 2]) {
      const g = ctx.createLinearGradient(x - Math.cos(a) * len, y - Math.sin(a) * len, x + Math.cos(a) * len, y + Math.sin(a) * len);
      g.addColorStop(0, color + '00');
      g.addColorStop(0.5, color + '99');
      g.addColorStop(1, color + '00');
      ctx.strokeStyle = g;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x - Math.cos(a) * len, y - Math.sin(a) * len);
      ctx.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
      ctx.stroke();
    }
  }
  ctx.restore();
  // Photosphere with limb darkening.
  const disk = ctx.createRadialGradient(x, y, 0, x, y, pr);
  disk.addColorStop(0, '#fffdf6');
  disk.addColorStop(0.55, mixHex(color, '#ffffff', 0.55));
  disk.addColorStop(0.9, color);
  disk.addColorStop(1, mixHex(color, '#000000', 0.35));
  ctx.fillStyle = disk;
  ctx.beginPath();
  ctx.arc(x, y, pr, 0, Math.PI * 2);
  ctx.fill();
  if (b.kind === 'neutronStar') {
    ctx.strokeStyle = 'rgba(165,243,252,0.8)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(x, y, pr + 3, 0, Math.PI * 2);
    ctx.stroke();
  }
}

function mixHex(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (sh: number) => Math.round(((pa >> sh) & 255) * (1 - t) + ((pb >> sh) & 255) * t);
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
}

/** Planet: textured globe with its night side turned away from the nearest star (Saturn with rings). */
function drawPlanet2D(ctx: CanvasRenderingContext2D, b: Body, x: number, y: number, pr: number) {
  const model = planetById(b.model);
  const sim = engine.sim;
  if (model?.ring && pr >= 3) {
    const stops = ringStops();
    const ri = pr * model.ring[0];
    const ro = pr * model.ring[1];
    if (stops) {
      const g = ctx.createRadialGradient(x, y, ri, x, y, ro);
      for (const st of stops) g.addColorStop(st.t, st.color);
      ctx.fillStyle = g;
    } else ctx.fillStyle = 'rgba(214,196,160,0.45)';
    ctx.beginPath();
    ctx.arc(x, y, ro, 0, Math.PI * 2);
    ctx.arc(x, y, ri, 0, Math.PI * 2, true);
    ctx.fill();
  }
  const globe =
    model && pr >= 5 ? renderGlobe(model, pr * 2 * 1.5, planetSpin(model, sim.time, useUI.getState().warp, performance.now() / 1000, b.spin)) : null;
  if (globe) ctx.drawImage(globe, x - pr, y - pr, pr * 2, pr * 2);
  else {
    ctx.fillStyle = b.color;
    ctx.beginPath();
    ctx.arc(x, y, pr, 0, Math.PI * 2);
    ctx.fill();
  }
  // Molten surface after a giant impact.
  if (b.temperature > 700 && pr >= 2) {
    const a = Math.min(0.9, (b.temperature - 700) / 2000);
    const hot = starHex(b.temperature);
    const g = ctx.createRadialGradient(x, y, 0, x, y, pr * 1.8);
    g.addColorStop(0, hot + Math.round(a * 255).toString(16).padStart(2, '0'));
    g.addColorStop(0.55, hot + Math.round(a * 160).toString(16).padStart(2, '0'));
    g.addColorStop(1, hot + '00');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, pr * 1.8, 0, Math.PI * 2);
    ctx.fill();
  }
  // Day/night terminator towards the nearest star.
  let lx = 0;
  let ly = 0;
  let best = Infinity;
  for (const s of sim.bodies) {
    if (s.kind !== 'star' && s.kind !== 'whiteDwarf' && s.kind !== 'neutronStar') continue;
    const d = Math.hypot(s.x - b.x, s.y - b.y);
    if (d < best && d > 0) {
      best = d;
      lx = (s.x - b.x) / d;
      ly = -(s.y - b.y) / d;
    }
  }
  if (Number.isFinite(best) && pr >= 2.5) {
    const g = ctx.createLinearGradient(x + lx * pr, y + ly * pr, x - lx * pr, y - ly * pr);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(0.45, 'rgba(0,0,0,0.05)');
    g.addColorStop(0.62, 'rgba(0,0,0,0.6)');
    g.addColorStop(1, 'rgba(0,0,0,0.88)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, pr, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawLabel(ctx: CanvasRenderingContext2D, b: Body, toScreen: ToScreen, selected: boolean, k: number) {
  const [x, y] = toScreen(b.x, b.y);
  const off = Math.max(10, b.radius * k * 0.8);
  ctx.font = `${selected ? 600 : 500} 11px "Inter Variable", sans-serif`;
  ctx.fillStyle = selected ? '#f8fafc' : 'rgba(186,230,253,0.75)';
  ctx.fillText(b.name, x + off, y - off * 0.8);
}

function drawSelection(ctx: CanvasRenderingContext2D, b: Body, toScreen: ToScreen, k: number) {
  const [x, y] = toScreen(b.x, b.y);
  const r = Math.max(b.radius * k, 6) + 6;
  ctx.strokeStyle = 'rgba(125,211,252,0.9)';
  ctx.lineWidth = 1;
  const t = performance.now() / 1000;
  ctx.setLineDash([4, 4]);
  ctx.lineDashOffset = -t * 8;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.lineDashOffset = 0;
}

function drawEffects(ctx: CanvasRenderingContext2D, effects: Effect[], toScreen: ToScreen, k: number, simTime: number, W: number, H: number) {
  const now = performance.now();
  for (const e of effects) {
    const age = (now - e.wallTime) / 1000;
    const [x, y] = toScreen(e.x, e.y);
    if (e.kind === 'gwave') {
      // Physical wavefront expanding at c.
      const R = C * (simTime - e.simTime) * k;
      if (R > 2 && R < 4 * Math.max(W, H)) {
        ctx.strokeStyle = 'rgba(147,197,253,0.55)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(x, y, R, 0, Math.PI * 2);
        ctx.stroke();
      }
      // Illustrative ripples on a wall-clock timescale so the burst is visible at any warp.
      if (age < 5) {
        for (let i = 0; i < 5; i++) {
          const rr = (age * 0.6 - i * 0.08) * Math.max(W, H);
          if (rr <= 0) continue;
          const a = Math.max(0, 0.45 * (1 - age / 5) * (1 - i / 5));
          ctx.strokeStyle = `rgba(165,180,252,${a})`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(x, y, rr, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
    } else if (age < 3) {
      const rr = 6 + age * 70;
      const a = Math.max(0, 1 - age / 3);
      const g = ctx.createRadialGradient(x, y, 0, x, y, rr);
      const c = e.kind === 'tde' ? '255,170,90' : '255,250,230';
      g.addColorStop(0, `rgba(${c},${a})`);
      g.addColorStop(1, `rgba(${c},0)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, rr, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function arrow(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number) {
  const a = Math.atan2(y1 - y0, x1 - x0);
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.moveTo(x1, y1);
  ctx.lineTo(x1 - 8 * Math.cos(a - 0.4), y1 - 8 * Math.sin(a - 0.4));
  ctx.moveTo(x1, y1);
  ctx.lineTo(x1 - 8 * Math.cos(a + 0.4), y1 - 8 * Math.sin(a + 0.4));
  ctx.stroke();
}

const SCALE_UNITS: [string, number][] = [
  ['m', 1],
  ['km', 1e3],
  ['AU', AU],
  ['ly', LY],
  ['pc', PC],
  ['kpc', PC * 1e3],
  ['Mpc', PC * 1e6],
];

function drawScaleBar(ctx: CanvasRenderingContext2D, _W: number, H: number, k: number) {
  const target = 120 / k;
  // Pick a unit first, then a round 1-2-5 value in that unit.
  let unit: [string, number] = ['m', 1];
  // Allow fractions (0.2 AU) rather than huge numbers of the smaller unit.
  for (const u of SCALE_UNITS) if (target >= u[1] * (u[1] > 1 ? 0.2 : 1)) unit = u;
  const tv = target / unit[1];
  const e = Math.floor(Math.log10(tv));
  const base = 10 ** e;
  const m = tv / base;
  const nice = (m >= 5 ? 5 : m >= 2 ? 2 : 1) * base;
  const len = nice * unit[1];
  const px = len * k;
  const x = 16;
  const y = H - 18;
  ctx.strokeStyle = 'rgba(226,232,240,0.85)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x, y - 4);
  ctx.lineTo(x, y);
  ctx.lineTo(x + px, y);
  ctx.lineTo(x + px, y - 4);
  ctx.stroke();
  ctx.fillStyle = 'rgba(226,232,240,0.9)';
  ctx.font = '11px "JetBrains Mono Variable", monospace';
  const label = unit[1] === 1 && len < 1 ? fmtLength(len) : `${fmtNum(nice)} ${unit[0]}`;
  ctx.fillText(label, x, y - 8);
}

function drawCursorReadout(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  st: Interaction,
  toWorld: (sx: number, sy: number) => [number, number],
) {
  if (!st.inside) return;
  const [wx, wy] = toWorld(st.hoverX, st.hoverY);
  const host = engine.sim.dominantAttractor(wx, wy, 0);
  if (!host) return;
  const r = Math.hypot(wx - host.x, wy - host.y);
  let txt = `${host.name}: ${fmtLength(r)}`;
  if (host.kind === 'blackHole') txt += `  (${(r / schwarzschildRadius(host.mass)).toPrecision(3)} r_s)`;
  ctx.font = '11px "JetBrains Mono Variable", monospace';
  const w = ctx.measureText(txt).width;
  ctx.fillStyle = 'rgba(148,163,184,0.85)';
  ctx.fillText(txt, W - w - 14, H - 14);
}
