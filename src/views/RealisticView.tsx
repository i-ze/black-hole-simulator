import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { engine } from '../engine/engine';
import { blackbodyRGB } from '../engine/simulation';
import type { Body } from '../engine/types';
import {
  accretionRate,
  diskPeakTemperature,
  gravRadius,
  hawkingPower,
  hawkingTemperature,
  iscoRadius,
  schwarzschildRadius,
} from '../physics/blackhole';
import { useUI } from '../store';
import { MAX_BH, MAX_SPH, raytraceFrag, raytraceVert } from './shaders/raytrace';
import { animateShip, createShipModel, orientShip } from './shipModels';
import { GlowRays } from './lightRays';
import { attachPicking } from './pick3d';
import { PLANET_TEXTURES, planetById, planetSpin } from '../engine/planets';
import { threeTexture } from './planetTextures';
import { wavelengthRGB } from '../physics/spectrum';
import { useElementSize } from './useCanvasSize';

const FOV = 50;

const particleVert = /* glsl */ `
attribute vec3 color;
attribute float size;
varying vec3 vColor;
void main() {
  vColor = color;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = size;
}
`;
const particleFrag = /* glsl */ `
varying vec3 vColor;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = dot(c, c);
  if (d > 0.25) discard;
  float a = exp(-d * 14.0);
  gl_FragColor = vec4(vColor * a, a);
}
`;

const MAX_POINTS = 8000;

function linearColor(t: number): THREE.Vector3 {
  const [r, g, b] = blackbodyRGB(t);
  return new THREE.Vector3(r ** 2.2, g ** 2.2, b ** 2.2);
}

export function RealisticView() {
  const wrap = useRef<HTMLDivElement>(null);
  const holder = useRef<HTMLDivElement>(null);
  const labels = useRef<HTMLCanvasElement>(null);
  const size = useElementSize(wrap);

  useEffect(() => {
    const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false, powerPreference: 'high-performance' });
    renderer.setClearColor(0x000000, 1);
    renderer.autoClear = false;
    holder.current!.appendChild(renderer.domElement);
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.touchAction = 'none';

    const uniforms = {
      uRes: { value: new THREE.Vector2(1, 1) },
      uCamPos: { value: new THREE.Vector3() },
      uCamRot: { value: new THREE.Matrix3() },
      uTanHalfFov: { value: Math.tan(((FOV / 2) * Math.PI) / 180) },
      uTime: { value: 0 },
      uExposure: { value: 1 },
      uMode: { value: 0 },
      uMaxSteps: { value: 260 },
      uFar: { value: 10 },
      uPixAngle: { value: 0.001 },
      uBhCount: { value: 0 },
      uBh: { value: Array.from({ length: MAX_BH }, () => new THREE.Vector4()) },
      uBhDisk: { value: Array.from({ length: MAX_BH }, () => new THREE.Vector4()) },
      uBhGlow: { value: Array.from({ length: MAX_BH }, () => new THREE.Vector4()) },
      uBhGlowSize: { value: new Array(MAX_BH).fill(0.01) },
      uSphCount: { value: 0 },
      uSph: { value: Array.from({ length: MAX_SPH }, () => new THREE.Vector4()) },
      uSphCol: { value: Array.from({ length: MAX_SPH }, () => new THREE.Vector4()) },
      uSphLight: { value: Array.from({ length: MAX_SPH }, () => new THREE.Vector4()) },
      uSphInfo: { value: Array.from({ length: MAX_SPH }, () => new THREE.Vector4(-1, 0, 0, 0)) },
      uSphExtra: { value: Array.from({ length: MAX_SPH }, () => new THREE.Vector4()) },
      uSphGlow: { value: Array.from({ length: MAX_SPH }, () => new THREE.Vector3()) },
      ...Object.fromEntries(PLANET_TEXTURES.map((k, i) => [`uTex${i}`, { value: threeTexture(k) }])),
    };
    const quadScene = new THREE.Scene();
    const quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const mat = new THREE.ShaderMaterial({ vertexShader: raytraceVert, fragmentShader: raytraceFrag, uniforms, depthTest: false, depthWrite: false });
    quadScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat));

    // Test particles (unlensed overlay).
    const pScene = new THREE.Scene();
    const pCam = new THREE.PerspectiveCamera(FOV, 1, 1e-5, 1e6);
    pCam.up.set(0, 0, 1);
    const pGeo = new THREE.BufferGeometry();
    const pPos = new Float32Array(MAX_POINTS * 3);
    const pCol = new Float32Array(MAX_POINTS * 3);
    const pSize = new Float32Array(MAX_POINTS);
    pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3).setUsage(THREE.DynamicDrawUsage));
    pGeo.setAttribute('color', new THREE.BufferAttribute(pCol, 3).setUsage(THREE.DynamicDrawUsage));
    pGeo.setAttribute('size', new THREE.BufferAttribute(pSize, 1).setUsage(THREE.DynamicDrawUsage));
    const pMat = new THREE.ShaderMaterial({
      vertexShader: particleVert,
      fragmentShader: particleFrag,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const points = new THREE.Points(pGeo, pMat);
    points.frustumCulled = false;
    pScene.add(points);
    const rays = new GlowRays();
    pScene.add(rays.object);

    // True-scale 3D ship models (drawn unlensed on top of the ray-traced image).
    const shipScene = new THREE.Scene();
    const shipCam = new THREE.PerspectiveCamera(FOV, 1, 0.01, 1e4);
    shipCam.up.set(0, 0, 1);
    const sun = new THREE.DirectionalLight(0xffffff, 3);
    const ambient = new THREE.HemisphereLight(0x8090b0, 0x202028, 0.9);
    // Weak fill from the viewing direction so the night side stays readable.
    const fill = new THREE.PointLight(0xc8d4ff, 0, 0, 0);
    shipScene.add(sun, sun.target, ambient, fill);
    const shipMeshes = new Map<number, THREE.Group>();
    const disposeModel = (g: THREE.Group) => {
      shipScene.remove(g);
      g.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
    };
    let lastShipTime = performance.now();

    // Frame used by the last render (focus point and length unit), for picking.
    const view = { focus: { x: 0, y: 0, z: 0 } as { x: number; y: number; z: number }, U: 1 };
    let resScale = 0.75;
    let lastAdjust = performance.now();
    let lastW = 0;
    let lastH = 0;
    let lastRes = 0;
    const lctx = labels.current!.getContext('2d')!;

    const render = (now: number) => {
      const { width: W, height: H, dpr } = size.current;
      const ui = useUI.getState();
      const opts = ui.realistic;
      // Dynamic resolution keeps the frame rate at 60 fps.
      if (now - lastAdjust > 900) {
        const fps = engine.fps;
        if (opts.quality === 'auto') {
          if (fps < 52 && resScale > 0.35) resScale *= 0.85;
          else if (fps > 58.5 && resScale < 1) resScale = Math.min(1, resScale * 1.08);
        } else resScale = opts.quality === 'low' ? 0.5 : 1;
        lastAdjust = now;
      }
      const pr = dpr * resScale;
      if (W !== lastW || H !== lastH || Math.abs(pr - lastRes) > 0.01) {
        renderer.setPixelRatio(pr);
        renderer.setSize(W, H, false);
        lastW = W;
        lastH = H;
        lastRes = pr;
      }
      if (labels.current!.width !== Math.round(W * dpr)) {
        labels.current!.width = Math.round(W * dpr);
        labels.current!.height = Math.round(H * dpr);
      }
      const rw = Math.round(W * pr);
      const rh = Math.round(H * pr);
      uniforms.uRes.value.set(rw, rh);
      uniforms.uPixAngle.value = (2 * uniforms.uTanHalfFov.value) / rh;
      uniforms.uTime.value = now / 1000;
      uniforms.uExposure.value = opts.exposure;
      uniforms.uMode.value = opts.mode === 'physical' ? 0 : 1;
      uniforms.uMaxSteps.value = opts.quality === 'low' ? 150 : opts.quality === 'high' ? 420 : 280;

      engine.realAspect = W / H;
      // Viewpoint from the orbital host: the camera sits on the line from the selected body to the
      // body it orbits, so you see it as from there (the Moon's phase as seen from the Earth).
      if (opts.fromHost && ui.follow) {
        const sel = engine.sim.get(ui.selectedId);
        const host = sel ? engine.sim.orbitalHost(sel) : undefined;
        if (sel && host) {
          const dx = host.x - sel.x;
          const dy = host.y - sel.y;
          const dz = host.z - sel.z;
          const d = Math.hypot(dx, dy, dz) || 1;
          engine.cam.azimuth = Math.atan2(dy, dx);
          engine.cam.elevation = Math.asin(dz / d);
        }
      }
      const cam = engine.cam;
      let focus: { x: number; y: number; z: number } = engine.focus();
      let U = cam.distance;
      let az = cam.azimuth;
      let el = cam.elevation;
      // Fixed viewing direction: the camera sits above the selected body on the side
      // facing the target and looks at the target (e.g. the Moon seen from the Earth).
      const from = ui.lookAtId != null ? engine.sim.get(ui.selectedId) : undefined;
      const target = ui.lookAtId != null ? engine.sim.get(ui.lookAtId) : undefined;
      if (from && target && from.id !== target.id) {
        const dx = target.x - from.x;
        const dy = target.y - from.y;
        const dz = target.z - from.z;
        const d = Math.hypot(dx, dy, dz) || 1;
        // Just above the atmosphere (its limb glow would otherwise tint the whole sky).
        const lift = from.radius * 1.25;
        const cx = from.x + (dx / d) * lift;
        const cy = from.y + (dy / d) * lift;
        const cz = from.z + (dz / d) * lift;
        focus = target;
        U = Math.hypot(cx - target.x, cy - target.y, cz - target.z) || 1;
        az = Math.atan2(cy - target.y, cx - target.x);
        el = Math.asin((cz - target.z) / U);
      }
      view.focus = focus;
      view.U = U;
      // Field of view (narrow = telescope).
      const tanHalf = Math.tan(((cam.fov / 2) * Math.PI) / 180);
      uniforms.uTanHalfFov.value = tanHalf;
      uniforms.uPixAngle.value = (2 * tanHalf) / rh;
      pCam.fov = cam.fov;
      shipCam.fov = cam.fov;
      const ce = Math.cos(el);
      const camPos = new THREE.Vector3(ce * Math.cos(az), ce * Math.sin(az), Math.sin(el));
      uniforms.uCamPos.value.copy(camPos);
      const fwd = camPos.clone().multiplyScalar(-1).normalize();
      const right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 0, 1)).normalize();
      const up = new THREE.Vector3().crossVectors(right, fwd);
      uniforms.uCamRot.value.set(right.x, up.x, fwd.x, right.y, up.y, fwd.y, right.z, up.z, fwd.z);

      const sim = engine.sim;
      const rel = (b: Body) => new THREE.Vector3((b.x - focus.x) / U, (b.y - focus.y) / U, (b.z - focus.z) / U);
      let far = 3;

      // Black holes ranked by apparent size.
      const bhs = sim.bodies
        .filter((b) => b.kind === 'blackHole')
        .map((b) => {
          const p = rel(b);
          return { b, p, score: schwarzschildRadius(b.mass) / U / Math.max(1e-9, p.distanceTo(camPos)) + (b.disk ? 1 : 0) };
        })
        .sort((a, b) => b.score - a.score)
        .slice(0, MAX_BH);
      uniforms.uBhCount.value = bhs.length;
      bhs.forEach(({ b, p }, i) => {
        const rs = schwarzschildRadius(b.mass);
        uniforms.uBh.value[i].set(p.x, p.y, p.z, rs / U);
        const rg = gravRadius(b.mass);
        const rInM = Math.max(iscoRadius(b.mass, b.spin), 1.6 * rs);
        const peak = b.disk ? diskPeakTemperature(b.mass, accretionRate(b.mass, b.eddington, b.spin), rInM) : 0;
        uniforms.uBhDisk.value[i].set(rInM / U, (b.diskOuter * rg) / U, Math.max(peak, 1000), b.disk ? 1 : 0);
        // Point-like emission: Hawking radiation of hot (micro) holes plus accretion flares.
        let intensity = 0;
        let color = new THREE.Vector3(1, 0.85, 0.7);
        const tH = hawkingTemperature(b.mass);
        if (tH > 1500) {
          intensity += Math.min(4, Math.max(0, (Math.log10(hawkingPower(b.mass)) - 2) / 6));
          color = linearColor(Math.min(tH, 40000));
        }
        // Accretion flare: visible once the released energy is comparable to an Eddington-second.
        if (b.flare > 0.01) intensity += Math.min(2.5, Math.log10(1 + b.flare) / 2.5);
        uniforms.uBhGlow.value[i].set(color.x, color.y, color.z, intensity);
        uniforms.uBhGlowSize.value[i] = Math.max(rs / U, 0.004 + 0.006 * intensity);
        far = Math.max(far, p.length() + (b.disk ? (b.diskOuter * rg) / U : 0) + (rs / U) * 10);
      });

      // Stars and planets ranked by apparent size; small stars stay visible as points.
      const pixAngle = uniforms.uPixAngle.value;
      const emitters = sim.bodies.filter((b) => b.kind === 'star' || b.kind === 'whiteDwarf' || b.kind === 'neutronStar');
      const diskHoles = bhs.filter((h) => h.b.disk);
      const sph = sim.bodies
        .filter((b) => b.massive && b.kind !== 'blackHole')
        .map((b) => {
          const p = rel(b);
          const dist = Math.max(1e-12, p.distanceTo(camPos));
          const emissive = b.kind !== 'planet';
          const rr = emissive ? Math.max(b.radius / U, 1.4 * pixAngle * dist) : Math.max(b.radius / U, 0.8 * pixAngle * dist);
          return { b, p, rr, score: rr / dist + (emissive ? 1 : 0) };
        })
        .sort((a, b) => b.score - a.score)
        .slice(0, MAX_SPH);
      uniforms.uSphCount.value = sph.length;
      sph.forEach(({ b, p, rr }, i) => {
        uniforms.uSph.value[i].set(p.x, p.y, p.z, rr);
        // Solar System bodies: texture slot, spin, tilt, Earth effects, rings, haze.
        const pm = b.kind === 'planet' ? planetById(b.model) : undefined;
        if (pm) {
          uniforms.uSphInfo.value[i].set(
            PLANET_TEXTURES.indexOf(pm.texture),
            planetSpin(pm, sim.time, ui.warp, now / 1000, b.spin),
            (pm.tilt * Math.PI) / 180,
            pm.earth ? 1 : 0,
          );
          uniforms.uSphExtra.value[i].set(pm.ring?.[0] ?? 0, pm.ring?.[1] ?? 0, pm.haze ?? 0, PLANET_TEXTURES.indexOf('saturn_ring_alpha'));
        } else {
          uniforms.uSphInfo.value[i].set(-1, 0, 0, 0);
          uniforms.uSphExtra.value[i].set(0, 0, 0, 0);
        }
        // Molten planets glow like a black body at their surface temperature.
        if (b.kind === 'planet' && b.temperature > 700) {
          const gc = linearColor(b.temperature);
          const k = Math.min(1.6, ((b.temperature - 700) / 1800) ** 2 * 1.6);
          uniforms.uSphGlow.value[i].set(gc.x * k, gc.y * k, gc.z * k);
        } else uniforms.uSphGlow.value[i].set(0, 0, 0);
        if (b.kind === 'planet') {
          const c = new THREE.Color(b.color);
          uniforms.uSphCol.value[i].set(c.r ** 2.2, c.g ** 2.2, c.b ** 2.2, 0);
          // Light from the nearest star, or a nearby accretion disk.
          let best: { pos: THREE.Vector3; d: number; w: number } | null = null;
          for (const s of emitters) {
            const sp = rel(s);
            const d = sp.distanceTo(p);
            if (!best || d < best.d) best = { pos: sp, d, w: 1.3 };
          }
          for (const h of diskHoles) {
            const d = h.p.distanceTo(p);
            if (!best || d < best.d) best = { pos: h.p, d, w: 1.0 };
          }
          if (best) uniforms.uSphLight.value[i].set(best.pos.x, best.pos.y, best.pos.z, best.w);
          else uniforms.uSphLight.value[i].set(p.x + 1, p.y, p.z + 1, 0.1);
        } else {
          const c = linearColor(b.temperature);
          uniforms.uSphCol.value[i].set(c.x, c.y, c.z, 1);
        }
        far = Math.max(far, p.length() + rr);
      });
      uniforms.uFar.value = far * 1.3 + 1;

      renderer.clear();
      renderer.render(quadScene, quadCam);

      // Particles.
      pCam.aspect = W / H;
      pCam.position.copy(camPos);
      pCam.lookAt(0, 0, 0);
      pCam.updateProjectionMatrix();
      // Ships large enough on screen are drawn as 3D models at true scale.
      const focalPx = H / (2 * uniforms.uTanHalfFov.value);
      const modeled = new Set<number>();
      let nearD = Infinity;
      let farD = 0;
      const tNow = performance.now();
      const dtWall = Math.min(0.1, (tNow - lastShipTime) / 1000);
      lastShipTime = tNow;
      for (const b of sim.bodies) {
        if (b.kind !== 'ship') continue;
        const p = rel(b);
        const len = (b.radius * 2) / U;
        const d = p.distanceTo(camPos);
        if ((len / Math.max(d, 1e-12)) * focalPx < 3) continue;
        modeled.add(b.id);
        let g = shipMeshes.get(b.id);
        if (!g) {
          g = createShipModel(b.model);
          shipScene.add(g);
          shipMeshes.set(b.id, g);
        }
        g.position.copy(p);
        g.scale.setScalar(len);
        const host = sim.dominantAttractor(b.x, b.y, b.z);
        orientShip(g, b.vx - (host?.vx ?? 0), b.vy - (host?.vy ?? 0), b.vz - (host?.vz ?? 0));
        animateShip(g, dtWall);
        nearD = Math.min(nearD, d - len);
        farD = Math.max(farD, d + len);
      }
      for (const [id, g] of shipMeshes) {
        if (modeled.has(id)) continue;
        disposeModel(g);
        shipMeshes.delete(id);
      }
      if (modeled.size) {
        // Light from the nearest star, else the nearest accretion disk, else faint starlight.
        let best: { pos: THREE.Vector3; d: number; color: THREE.Color; w: number } | null = null;
        for (const s of emitters) {
          const sp = rel(s);
          const d = sp.length();
          if (!best || d < best.d) {
            const [r, g, bl] = blackbodyRGB(s.temperature);
            best = { pos: sp, d, color: new THREE.Color(r, g, bl), w: 3.2 };
          }
        }
        for (const h of diskHoles) {
          const d = h.p.length();
          if (!best || d < best.d * 0.5) best = { pos: h.p, d, color: new THREE.Color(opts.mode === 'physical' ? '#cfe0ff' : '#ffc890'), w: 2.4 };
        }
        if (best && best.d > 0) {
          sun.position.copy(best.pos).normalize();
          sun.color.copy(best.color);
          sun.intensity = best.w;
        } else {
          sun.position.set(0.4, -0.3, 0.8);
          sun.color.set(0xffffff);
          sun.intensity = 0.5;
        }
        sun.intensity *= opts.exposure;
        shipCam.aspect = W / H;
        shipCam.position.copy(camPos);
        shipCam.lookAt(0, 0, 0);
        shipCam.near = Math.max(1e-7, Math.min(0.5, nearD * 0.5));
        shipCam.far = Math.max(shipCam.near * 10, farD * 2);
        shipCam.updateProjectionMatrix();
        fill.position.copy(camPos);
        fill.intensity = 0.6 * opts.exposure;
        renderer.clearDepth();
        renderer.render(shipScene, shipCam);
      }

      let n = 0;
      if (opts.particles) {
        for (const b of sim.bodies) {
          if (b.massive || n >= MAX_POINTS || modeled.has(b.id)) continue;
          const p = rel(b);
          pPos[n * 3] = p.x;
          pPos[n * 3 + 1] = p.y;
          pPos[n * 3 + 2] = p.z;
          const c = b.kind === 'photon' ? wavelengthRGB(sim.photonWavelength(b)).map((v) => v * 1.4) : particleColor(b);
          pCol[n * 3] = c[0];
          pCol[n * 3 + 1] = c[1];
          pCol[n * 3 + 2] = c[2];
          pSize[n] = (b.kind === 'ship' ? 7 : b.kind === 'photon' ? 9 : b.kind === 'debris' ? 4.5 : 3.2) * Math.max(pr, 1);
          n++;
        }
      }
      if (opts.particles) {
        rays.material.uniforms.uRes.value.set(W / 2, H / 2);
        // Cinematic mode: wider, brighter beams.
        rays.material.uniforms.uWidth.value = opts.mode === 'cinematic' ? 9 : 5;
        rays.material.uniforms.uIntensity.value = (opts.mode === 'cinematic' ? 1.5 : 1) * Math.min(2, opts.exposure);
        rays.update((x, y, z, out) => out.set((x - focus.x) / U, (y - focus.y) / U, (z - focus.z) / U));
      }
      rays.object.visible = opts.particles;
      pGeo.setDrawRange(0, n);
      (pGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
      (pGeo.attributes.color as THREE.BufferAttribute).needsUpdate = true;
      (pGeo.attributes.size as THREE.BufferAttribute).needsUpdate = true;
      if (n || opts.particles) renderer.render(pScene, pCam);

      // Labels.
      lctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      lctx.clearRect(0, 0, W, H);
      if (opts.labels) {
        lctx.font = '500 11px "Inter Variable", sans-serif';
        const v = new THREE.Vector3();
        for (const b of sim.bodies) {
          if (!b.massive && b.kind !== 'ship') continue;
          v.copy(rel(b)).project(pCam);
          if (v.z > 1 || v.z < -1) continue;
          const sx = (v.x * 0.5 + 0.5) * W;
          const sy = (-v.y * 0.5 + 0.5) * H;
          if (sx < 0 || sy < 0 || sx > W || sy > H) continue;
          const sel = b.id === ui.selectedId;
          lctx.fillStyle = sel ? 'rgba(248,250,252,0.95)' : 'rgba(203,213,225,0.6)';
          lctx.fillText(b.name, sx + 8, sy - 8);
          lctx.strokeStyle = sel ? 'rgba(125,211,252,0.8)' : 'rgba(148,163,184,0.35)';
          lctx.beginPath();
          lctx.moveTo(sx + 2, sy - 2);
          lctx.lineTo(sx + 7, sy - 7);
          lctx.stroke();
        }
      }
    };

    const unregister = engine.register(render);

    // Orbit controls.
    const el = renderer.domElement;
    let dragging = false;
    let lx = 0;
    let ly = 0;
    const onDown = (e: PointerEvent) => {
      dragging = true;
      lx = e.clientX;
      ly = e.clientY;
      el.setPointerCapture(e.pointerId);
    };
    const onMove = (e: PointerEvent) => {
      // The direction is fixed while looking at a target.
      if (!dragging || useUI.getState().lookAtId != null) return;
      engine.cam.azimuth -= (e.clientX - lx) * 0.005;
      engine.cam.elevation = Math.max(-1.55, Math.min(1.55, engine.cam.elevation + (e.clientY - ly) * 0.005));
      lx = e.clientX;
      ly = e.clientY;
    };
    const onUp = () => {
      dragging = false;
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const f = Math.exp(Math.sign(e.deltaY) * Math.min(Math.abs(e.deltaY), 100) * 0.002);
      if (useUI.getState().lookAtId != null) {
        // Telescope zoom: change the field of view instead of the distance.
        engine.cam.fov = Math.max(0.02, Math.min(60, engine.cam.fov * f));
        return;
      }
      const sel = engine.sim.get(useUI.getState().selectedId);
      const min = sel ? Math.max(sel.radius * 1.5, 1e-30) : 1e-30;
      engine.cam.distance = Math.max(min, Math.min(1e24, engine.cam.distance * f));
    };
    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('wheel', onWheel, { passive: false });
    const detachPick = attachPicking(
      el,
      () => pCam,
      () => {
        const f = view.focus;
        const U = view.U;
        return engine.sim.bodies.map((b) => ({
          id: b.id,
          massive: b.massive || b.kind === 'ship',
          pos: new THREE.Vector3((b.x - f.x) / U, (b.y - f.y) / U, (b.z - f.z) / U),
        }));
      },
    );

    return () => {
      unregister();
      detachPick();
      for (const g of shipMeshes.values()) disposeModel(g);
      rays.dispose();
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('wheel', onWheel);
      mat.dispose();
      pGeo.dispose();
      pMat.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      el.remove();
    };
  }, [size]);

  return (
    <div ref={wrap} className="absolute inset-0 cursor-grab active:cursor-grabbing">
      <div ref={holder} className="absolute inset-0" />
      <canvas ref={labels} className="pointer-events-none absolute inset-0 h-full w-full" />
    </div>
  );
}

function particleColor(b: Body): [number, number, number] {
  switch (b.kind) {
    case 'photon':
      return [1, 0.9, 0.5];
    case 'ship': {
      const c = new THREE.Color(b.color);
      return [c.r * 1.5, c.g * 1.5, c.b * 1.5];
    }
    case 'debris': {
      const c = new THREE.Color(b.color);
      return [c.r * 1.6, c.g * 1.3, c.b];
    }
    default:
      return [0.55, 0.5, 0.45];
  }
}
