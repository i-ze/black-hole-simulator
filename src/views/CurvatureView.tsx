import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { engine } from '../engine/engine';
import { blackbodyRGB } from '../engine/simulation';
import type { Body } from '../engine/types';
import { photonSphereRadius, schwarzschildRadius } from '../physics/blackhole';
import { C } from '../physics/constants';
import { useUI } from '../store';
import { embeddingDepth, embeddingGLSL } from './embedding';
import { createYUpShip, disposeYUpShip, updateYUpShip, type YUpShip } from './shipModels';
import { createPlanetGroup, createStarGlow, disposePlanetGroup, orientPlanetGroup } from './bodyVisuals';
import { planetById } from '../engine/planets';
import { LightRays } from './lightRays';
import { attachPicking } from './pick3d';
import { wavelengthCss, wavelengthRGB } from '../physics/spectrum';
import { useElementSize } from './useCanvasSize';

/** Half-size of the plane in view units; maps to the shared frame half-width. */
const S = 10;
const MAX_BODIES = 16;
const MAX_WAVES = 4;
const SEG = 360;

const vert = /* glsl */ `
#define MAX_BODIES ${MAX_BODIES}
#define MAX_WAVES ${MAX_WAVES}
uniform int uCount;
uniform vec4 uBody[MAX_BODIES]; // x, y, r_s, R (view units)
uniform float uExag;
uniform float uRef[MAX_BODIES];
uniform vec2 uTilt;      // linearised wells of distant bodies (depth gradient)
uniform float uTiltBase;
uniform float uPhi0;     // sum of r_s/r of distant bodies
uniform vec4 uWaves[MAX_WAVES];  // x, y, front radius, amplitude
varying vec2 vPlane;
varying float vDilation;
varying float vInside;
varying vec3 vPos;
${embeddingGLSL}
void main() {
  vec2 p = position.xy;
  float depth = uTiltBase - dot(uTilt, p);
  float phi = uPhi0;
  float inside = 0.0;
  for (int i = 0; i < MAX_BODIES; i++) {
    if (i >= uCount) break;
    vec4 b = uBody[i];
    float r = max(length(p - b.xy), 1e-6);
    depth += embeddingDepth(r, b.z, b.w, uRef[i]);
    phi += b.z / max(r, b.w);
    if (b.w <= b.z * 1.0001 && r < b.z) inside = 1.0;
  }
  float h = -depth * uExag;
  for (int i = 0; i < MAX_WAVES; i++) {
    vec4 w = uWaves[i];
    if (w.w <= 0.0) continue;
    float r = length(p - w.xy);
    float behind = w.z - r;
    if (behind > 0.0) h += w.w * sin(behind * 5.0) * exp(-behind * 0.35) / (1.0 + r * 0.3);
  }
  vPlane = p;
  vDilation = sqrt(max(0.0, 1.0 - phi));
  vInside = inside;
  vec3 pos = vec3(p.x, h, -p.y);
  vPos = pos;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}
`;

const frag = /* glsl */ `
uniform float uGrid;
uniform vec2 uGridOffset;
varying vec2 vPlane;
varying float vDilation;
varying float vInside;
varying vec3 vPos;

vec3 dilationColor(float a) {
  // 1 -> cool cyan, 0.75 -> violet, 0.5 -> orange, 0 -> deep red.
  vec3 c1 = vec3(0.30, 0.78, 0.98);
  vec3 c2 = vec3(0.56, 0.42, 0.98);
  vec3 c3 = vec3(0.98, 0.58, 0.22);
  vec3 c4 = vec3(0.85, 0.12, 0.10);
  if (a > 0.9) return mix(c2, c1, (a - 0.9) / 0.1);
  if (a > 0.6) return mix(c3, c2, (a - 0.6) / 0.3);
  return mix(c4, c3, a / 0.6);
}

float gridLine(vec2 coord, float width) {
  vec2 g = abs(fract(coord - 0.5) - 0.5) / fwidth(coord);
  return 1.0 - min(min(g.x, g.y) / width, 1.0);
}

void main() {
  vec3 n = normalize(cross(dFdx(vPos), dFdy(vPos)));
  float shade = 0.55 + 0.45 * abs(dot(n, normalize(vec3(0.4, 1.0, 0.3))));
  vec2 wc = (vPlane + uGridOffset) / uGrid;
  float major = gridLine(wc, 1.1);
  float minor = gridLine(wc * 5.0, 0.8) * 0.35;
  vec3 lc = dilationColor(vDilation);
  vec3 base = vec3(0.012, 0.02, 0.04) * shade + lc * 0.05 * (1.0 - vDilation) * 4.0;
  vec3 col = base + lc * (major * 0.85 + minor) * shade;
  // Iso-lines of the clock rate.
  float iso = 0.0;
  for (int i = 1; i < 10; i++) {
    float level = float(i) * 0.1;
    float d = abs(vDilation - level) / max(fwidth(vDilation), 1e-5);
    iso = max(iso, 1.0 - min(d / 1.2, 1.0));
  }
  col += vec3(1.0, 0.85, 0.6) * iso * 0.25 * step(vDilation, 0.95);
  if (vInside > 0.5) col = vec3(0.0);
  float edge = 1.0 - smoothstep(${(S * 0.78).toFixed(2)}, ${(S * 1.0).toFixed(2)}, length(vPlane));
  gl_FragColor = vec4(col, edge);
}
`;

export function CurvatureView() {
  const wrap = useRef<HTMLDivElement>(null);
  const holder = useRef<HTMLDivElement>(null);
  const labels = useRef<HTMLCanvasElement>(null);
  const size = useElementSize(wrap);

  useEffect(() => {
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setClearColor(0x000000, 0);
    holder.current!.appendChild(renderer.domElement);
    Object.assign(renderer.domElement.style, { width: '100%', height: '100%', display: 'block', touchAction: 'none' });

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, 1, 0.01, 500);
    camera.position.set(0, 10.5, 15.5);
    let seenReset = engine.viewReset;
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.enablePan = false;
    controls.enableZoom = false;
    controls.minPolarAngle = 0.05;
    controls.maxPolarAngle = Math.PI * 0.49;
    controls.target.set(0, -1.5, 0);

    const uniforms = {
      uCount: { value: 0 },
      uBody: { value: Array.from({ length: MAX_BODIES }, () => new THREE.Vector4()) },
      uExag: { value: 1 },
      uRef: { value: new Array(MAX_BODIES).fill(S * 1.5) },
      uTilt: { value: new THREE.Vector2() },
      uTiltBase: { value: 0 },
      uPhi0: { value: 0 },
      uWaves: { value: Array.from({ length: MAX_WAVES }, () => new THREE.Vector4()) },
      uGrid: { value: 1 },
      uGridOffset: { value: new THREE.Vector2() },
    };
    const geo = new THREE.PlaneGeometry(2 * S, 2 * S, SEG, SEG);
    const mat = new THREE.ShaderMaterial({ vertexShader: vert, fragmentShader: frag, uniforms, transparent: true, side: THREE.DoubleSide, depthWrite: true });
    const surface = new THREE.Mesh(geo, mat);
    surface.frustumCulled = false;
    scene.add(surface);

    // Background star dust.
    const starGeo = new THREE.BufferGeometry();
    const sp = new Float32Array(1500 * 3);
    for (let i = 0; i < 1500; i++) {
      const u = Math.random() * 2 - 1;
      const t = Math.random() * Math.PI * 2;
      const r = 120;
      const s = Math.sqrt(1 - u * u);
      sp[i * 3] = r * s * Math.cos(t);
      sp[i * 3 + 1] = r * u;
      sp[i * 3 + 2] = r * s * Math.sin(t);
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0x8899bb, size: 0.35, sizeAttenuation: true, transparent: true, opacity: 0.5 })));

    // Body meshes, rings, trails, particles.
    const sphereGeo = new THREE.SphereGeometry(1, 32, 16);
    const ringGeo = (() => {
      const g = new THREE.BufferGeometry();
      const pts = new Float32Array(129 * 3);
      for (let i = 0; i <= 128; i++) {
        const a = (i / 128) * Math.PI * 2;
        pts[i * 3] = Math.cos(a);
        pts[i * 3 + 1] = 0;
        pts[i * 3 + 2] = Math.sin(a);
      }
      g.setAttribute('position', new THREE.BufferAttribute(pts, 3));
      return g;
    })();
    interface Visual {
      mesh: THREE.Mesh;
      horizon?: THREE.Line;
      photon?: THREE.Line;
      trail: THREE.Line;
      trailPos: Float32Array;
      ship?: YUpShip;
      kind: string;
      model?: string;
      planet?: THREE.Group;
      glow?: THREE.Sprite;
    }
    const visuals = new Map<number, Visual>();
    const trailGroup = new THREE.Group();
    scene.add(trailGroup);

    const pGeo = new THREE.BufferGeometry();
    const MAXP = 8000;
    const pPos = new Float32Array(MAXP * 3);
    const pCol = new Float32Array(MAXP * 3);
    pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3).setUsage(THREE.DynamicDrawUsage));
    pGeo.setAttribute('color', new THREE.BufferAttribute(pCol, 3).setUsage(THREE.DynamicDrawUsage));
    const pts = new THREE.Points(pGeo, new THREE.PointsMaterial({ size: 3, sizeAttenuation: false, vertexColors: true, transparent: true, opacity: 0.9, depthWrite: false }));
    pts.frustumCulled = false;
    scene.add(pts);
    const rays = new LightRays();
    scene.add(rays.object);

    const lctx = labels.current!.getContext('2d')!;
    let lastW = 0;
    let lastH = 0;

    const makeVisual = (b: Body): Visual => {
      let material: THREE.Material;
      if (b.kind === 'blackHole') material = new THREE.MeshBasicMaterial({ color: 0x000000 });
      else if (b.kind === 'ship') material = new THREE.MeshBasicMaterial({ color: b.color });
      else if (b.kind === 'planet') material = new THREE.MeshStandardMaterial({ color: b.color, roughness: 0.8, emissive: new THREE.Color(b.color).multiplyScalar(0.25) });
      else {
        const [r, g, bl] = blackbodyRGB(b.temperature);
        material = new THREE.MeshBasicMaterial({ color: new THREE.Color(r, g, bl) });
      }
      const mesh = new THREE.Mesh(sphereGeo, material);
      scene.add(mesh);
      const trailPos = new Float32Array(1500 * 3);
      const tg = new THREE.BufferGeometry();
      tg.setAttribute('position', new THREE.BufferAttribute(trailPos, 3).setUsage(THREE.DynamicDrawUsage));
      const tc = b.kind === 'blackHole' ? 0xfb923c : b.kind === 'planet' || b.kind === 'ship' ? new THREE.Color(b.color).getHex() : new THREE.Color(...blackbodyRGB(b.temperature)).getHex();
      const trail = new THREE.Line(tg, new THREE.LineBasicMaterial({ color: tc, transparent: true, opacity: 0.7 }));
      trail.frustumCulled = false;
      trailGroup.add(trail);
      const v: Visual = { mesh, trail, trailPos, kind: b.kind, model: b.model };
      const pm = b.kind === 'planet' ? planetById(b.model) : undefined;
      if (pm) {
        v.planet = createPlanetGroup(pm);
        scene.add(v.planet);
      }
      if (b.kind === 'star' || b.kind === 'whiteDwarf' || b.kind === 'neutronStar') {
        v.glow = createStarGlow();
        scene.add(v.glow);
      }
      if (b.kind === 'ship') {
        v.ship = createYUpShip(b.model);
        scene.add(v.ship.root);
      }
      if (b.kind === 'blackHole') {
        v.horizon = new THREE.Line(ringGeo, new THREE.LineBasicMaterial({ color: 0xfdba74 }));
        v.photon = new THREE.Line(ringGeo, new THREE.LineBasicMaterial({ color: 0xfacc15, transparent: true, opacity: 0.5 }));
        scene.add(v.horizon, v.photon);
      }
      return v;
    };
    const dropVisual = (v: Visual) => {
      scene.remove(v.mesh);
      (v.mesh.material as THREE.Material).dispose();
      trailGroup.remove(v.trail);
      v.trail.geometry.dispose();
      (v.trail.material as THREE.Material).dispose();
      if (v.ship) disposeYUpShip(v.ship);
      if (v.planet) disposePlanetGroup(v.planet);
      if (v.glow) {
        scene.remove(v.glow);
        v.glow.material.dispose();
      }
      if (v.horizon) scene.remove(v.horizon);
      if (v.photon) scene.remove(v.photon);
    };

    const render = (now: number) => {
      const { width: W, height: H, dpr } = size.current;
      if (W !== lastW || H !== lastH) {
        renderer.setPixelRatio(dpr);
        renderer.setSize(W, H, false);
        camera.aspect = W / H;
        camera.updateProjectionMatrix();
        labels.current!.width = Math.round(W * dpr);
        labels.current!.height = Math.round(H * dpr);
        lastW = W;
        lastH = H;
      }
      const ui = useUI.getState();
      const opts = ui.curvature;
      const sim = engine.sim;
      const frame = engine.frame;
      const u = frame.halfWidth / S; // metres per view unit
      const toView = (x: number, y: number): [number, number] => [(x - frame.cx) / u, (y - frame.cy) / u];

      // Bodies that curve space, largest r_s first.
      const massive = sim.bodies
        .filter((b) => b.massive)
        .sort((a, b) => b.mass - a.mass);
      // Reference circle per body just beyond the far rim of the plane, so a distant body
      // only tilts the (locally almost flat) surface instead of shifting it out of view.
      const bodyData: { x: number; y: number; rs: number; R: number; ref: number }[] = [];
      let maxDepth = 0;
      let tx = 0;
      let ty = 0;
      let phi0 = 0;
      for (const b of massive) {
        const [x, y] = toView(b.x, b.y);
        const rs = schwarzschildRadius(b.mass) / u;
        const R = Math.max(b.radius, schwarzschildRadius(b.mass)) / u;
        const dist = Math.hypot(x, y);
        if (dist > 40 * S && dist > 3 * R) {
          // Far away: the well is a uniform slope across the plane (float32 could not resolve it).
          const slope = Math.sqrt(rs / Math.max(dist - rs, 1e-30));
          tx += (slope * -x) / dist;
          ty += (slope * -y) / dist;
          phi0 += rs / dist;
          continue;
        }
        const i = bodyData.length;
        if (i >= MAX_BODIES) continue;
        const ref = dist + S * 1.5;
        uniforms.uBody.value[i].set(x, y, rs, R);
        uniforms.uRef.value[i] = ref;
        bodyData.push({ x, y, rs, R, ref });
        // Deepest point of this well that lies on the plane.
        const rMin = Math.max(R, rs * 1.05, dist - S * Math.SQRT2);
        maxDepth = Math.max(maxDepth, embeddingDepth(rMin, rs, R, ref) - embeddingDepth(dist + S * Math.SQRT2, rs, R, ref));
      }
      uniforms.uCount.value = bodyData.length;
      const tilt = Math.hypot(tx, ty);
      // (tx, ty) points away from the distant masses, so depth = base - t·p grows towards them.
      uniforms.uTilt.value.set(tx, ty);
      uniforms.uTiltBase.value = tilt * S * 1.5;
      uniforms.uPhi0.value = phi0;
      maxDepth = Math.max(maxDepth, tilt * 2 * S * Math.SQRT2);
      const auto = maxDepth > 0 ? Math.min(1e12, (S * 0.42) / maxDepth) : 1;
      const exag = auto * opts.exaggeration;
      uniforms.uExag.value = exag;
      engine.curvatureScale = exag;
      const heightAt = (x: number, y: number) => {
        let d = uniforms.uTiltBase.value - (uniforms.uTilt.value.x * x + uniforms.uTilt.value.y * y);
        for (const b of bodyData) d += embeddingDepth(Math.max(Math.hypot(x - b.x, y - b.y), 1e-6), b.rs, b.R, b.ref);
        return -d * exag;
      };

      // Grid aligned to world coordinates.
      const gridM = 10 ** Math.floor(Math.log10(frame.halfWidth / 2));
      uniforms.uGrid.value = gridM / u;
      uniforms.uGridOffset.value.set(((frame.cx % gridM) + gridM) % gridM / u, ((frame.cy % gridM) + gridM) % gridM / u);

      // Gravitational wave ripples (illustrative amplitude, wall-clock speed).
      let wi = 0;
      for (const e of sim.effects) {
        if (e.kind !== 'gwave' || wi >= MAX_WAVES) continue;
        const age = (now - e.wallTime) / 1000;
        if (age > 8) continue;
        const [x, y] = toView(e.x, e.y);
        const physical = (C * (sim.time - e.simTime)) / u;
        const front = Math.min(physical, age * S * 0.9);
        uniforms.uWaves.value[wi].set(x, y, front, 0.5 * Math.max(0, 1 - age / 8));
        wi++;
      }
      for (let i = wi; i < MAX_WAVES; i++) uniforms.uWaves.value[i].set(0, 0, 0, 0);

      // Sync body visuals.
      const alive = new Set<number>();
      for (const b of sim.bodies) {
        if (!b.massive && b.kind !== 'ship') continue;
        alive.add(b.id);
        let v = visuals.get(b.id);
        if (v && (v.kind !== b.kind || v.model !== b.model)) {
          // e.g. a neutron star that collapsed into a black hole
          dropVisual(v);
          v = undefined;
        }
        if (!v) {
          v = makeVisual(b);
          visuals.set(b.id, v);
        }
        // Colours follow edits of temperature / colour in the inspector.
        if (b.kind === 'star' || b.kind === 'whiteDwarf' || b.kind === 'neutronStar') {
          const [r, g, bl] = blackbodyRGB(b.temperature);
          (v.mesh.material as THREE.MeshBasicMaterial).color.setRGB(r, g, bl);
          (v.trail.material as THREE.LineBasicMaterial).color.setRGB(r, g, bl);
        } else if (b.kind === 'planet' && !v.planet) {
          const pmat = v.mesh.material as THREE.MeshStandardMaterial;
          pmat.color.set(b.color);
          const hot = Math.max(0, Math.min(1, (b.temperature - 700) / 1800));
          pmat.emissive.setRGB(...blackbodyRGB(b.temperature)).multiplyScalar(hot);
          (v.trail.material as THREE.LineBasicMaterial).color.set(b.color);
        }
        const [x, y] = toView(b.x, b.y);
        const inView = Math.abs(x) < S * 1.2 && Math.abs(y) < S * 1.2;
        const hgt = heightAt(x, y);
        if (b.kind === 'blackHole') {
          const rs = schwarzschildRadius(b.mass) / u;
          const tiny = rs < 0.08;
          v.mesh.visible = inView && tiny;
          v.mesh.scale.setScalar(0.08);
          v.mesh.position.set(x, hgt + 0.08, -y);
          const hr = Math.max(rs, 0.08);
          v.horizon!.visible = inView;
          v.horizon!.scale.setScalar(hr);
          v.horizon!.position.set(x, heightAt(x + hr, y), -y);
          const ps = photonSphereRadius(b.mass, b.spin) / u;
          v.photon!.visible = inView && ps > 0.15;
          v.photon!.scale.setScalar(ps);
          v.photon!.position.set(x, heightAt(x + ps, y), -y);
        } else if (b.kind === 'ship') {
          // True size when large enough, otherwise a symbolic minimum size.
          const size = Math.max((b.radius * 2) / u, 0.35);
          const host = sim.dominantAttractor(b.x, b.y, b.z);
          v.ship!.root.visible = inView;
          updateYUpShip(v.ship!, x, y, hgt + size * 0.15, size, b.vx - (host?.vx ?? 0), b.vy - (host?.vy ?? 0), b.vz - (host?.vz ?? 0), 1 / 60);
          v.mesh.visible = inView;
          v.mesh.scale.setScalar(1e-6);
          v.mesh.position.set(x, hgt + size * 0.3, -y);
        } else {
          const r = Math.max(b.radius / u, b.kind === 'planet' ? 0.06 : 0.1);
          v.mesh.visible = inView && !v.planet;
          v.mesh.scale.setScalar(r);
          v.mesh.position.set(x, hgt + r, -y);
          if (v.planet) {
            v.planet.visible = inView;
            v.planet.position.copy(v.mesh.position);
            // Lift ringed planets so the tilted rings clear the curved surface.
            if (planetById(b.model)?.ring) v.planet.position.y += r * 1.6;
            v.planet.scale.setScalar(r);
            orientPlanetGroup(v.planet, b.model, sim.time, ui.warp, now / 1000, b.spin);
          }
          if (v.glow) {
            v.glow.visible = inView;
            v.glow.position.copy(v.mesh.position);
            v.glow.scale.setScalar(r * 7);
            const [cr, cg, cb] = blackbodyRGB(b.temperature);
            v.glow.material.color.setRGB(cr, cg, cb);
          }
        }
        // Trail on the surface.
        v.trail.visible = opts.trails;
        if (opts.trails) {
          let n = 0;
          const tp = v.trailPos;
          const stride = b.trail.count > 750 ? 2 : 1;
          b.trail.forEach((tx, ty, _z, i) => {
            if (i % stride !== 0 || n >= 1499) return;
            const [vx, vy] = toView(tx, ty);
            tp[n * 3] = vx;
            tp[n * 3 + 1] = heightAt(vx, vy) + 0.02;
            tp[n * 3 + 2] = -vy;
            n++;
          });
          tp[n * 3] = x;
          tp[n * 3 + 1] = hgt + 0.02;
          tp[n * 3 + 2] = -y;
          n++;
          v.trail.geometry.setDrawRange(0, n);
          (v.trail.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
        }
      }
      for (const [id, v] of visuals) {
        if (!alive.has(id)) {
          dropVisual(v);
          visuals.delete(id);
        }
      }

      // Particles on the surface.
      let n = 0;
      for (const b of sim.bodies) {
        if (b.massive || b.kind === 'ship' || n >= MAXP) continue;
        const [x, y] = toView(b.x, b.y);
        if (Math.abs(x) > S || Math.abs(y) > S) continue;
        pPos[n * 3] = x;
        pPos[n * 3 + 1] = heightAt(x, y) + 0.03;
        pPos[n * 3 + 2] = -y;
        const c = b.kind === 'photon' ? wavelengthRGB(sim.photonWavelength(b)) : b.kind === 'debris' ? [1, 0.6, 0.3] : [0.75, 0.72, 0.68];
        pCol[n * 3] = c[0];
        pCol[n * 3 + 1] = c[1];
        pCol[n * 3 + 2] = c[2];
        n++;
      }
      // Light rays as waves on the surface: on-screen wavelength ∝ local λ (550 nm -> 0.6 units).
      const toPlane = (x: number, y: number): [number, number] | null => {
        const [vx, vy] = toView(x, y);
        return Math.abs(vx) > S * 1.05 || Math.abs(vy) > S * 1.05 ? null : [vx, vy];
      };
      const photonCount = sim.bodies.reduce((k, b) => k + (b.kind === 'photon' ? 1 : 0), 0);
      if (photonCount > 40)
        rays.update((x, y, _z, out) => {
          const pp = toPlane(x, y);
          if (!pp) return false;
          out.set(pp[0], heightAt(pp[0], pp[1]) + 0.05, -pp[1]);
          return true;
        });
      else rays.updateWaves(
        (x, y) => {
          const [vx, vy] = toView(x, y);
          return Math.abs(vx) > S * 1.05 || Math.abs(vy) > S * 1.05 ? null : [vx, vy];
        },
        heightAt,
        0.6 / 550,
        0.12,
      );
      pGeo.setDrawRange(0, n);
      (pGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
      (pGeo.attributes.color as THREE.BufferAttribute).needsUpdate = true;

      if (engine.viewReset !== seenReset) {
        // "Fit all": back to the default viewpoint that shows the whole plane.
        seenReset = engine.viewReset;
        camera.position.set(0, 10.5, 15.5);
        controls.target.set(0, -1.5, 0);
      }
      controls.update();
      renderer.render(scene, camera);

      // Labels.
      lctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      lctx.clearRect(0, 0, W, H);
      if (opts.labels) {
        lctx.font = '500 11px "Inter Variable", sans-serif';
        const p = new THREE.Vector3();
        for (const b of sim.bodies) {
          if (!b.massive && b.kind !== 'ship') continue;
          const v = visuals.get(b.id);
          if (!v || !(v.mesh.visible || v.horizon?.visible || v.planet?.visible)) continue;
          p.copy(v.horizon?.visible ? v.horizon.position : v.mesh.position).project(camera);
          if (p.z > 1) continue;
          const sx = (p.x * 0.5 + 0.5) * W;
          const sy = (-p.y * 0.5 + 0.5) * H;
          lctx.fillStyle = b.id === ui.selectedId ? 'rgba(248,250,252,0.95)' : 'rgba(203,213,225,0.65)';
          lctx.fillText(b.name, sx + 8, sy - 10);
        }
        const photons = sim.bodies.filter((b) => b.kind === 'photon');
        if (photons.length <= 16) {
          lctx.font = '600 10px "JetBrains Mono Variable", monospace';
          for (const b of photons) {
            const [vx, vy] = toView(b.x, b.y);
            if (Math.abs(vx) > S || Math.abs(vy) > S) continue;
            p.set(vx, heightAt(vx, vy) + 0.05, -vy).project(camera);
            if (p.z > 1) continue;
            const lam = sim.photonWavelength(b);
            lctx.fillStyle = wavelengthCss(Math.min(Math.max(lam, 400), 720));
            lctx.fillText(`${Math.round(lam)} nm${lam < 380 ? ' UV' : lam > 750 ? ' IR' : ''}`, (p.x * 0.5 + 0.5) * W + 8, (-p.y * 0.5 + 0.5) * H - 6);
          }
        }
      }
    };

    const unregister = engine.register(render);
    const light = new THREE.DirectionalLight(0xffffff, 2);
    light.position.set(5, 10, 4);
    scene.add(light, new THREE.AmbientLight(0x8899aa, 0.6));

    const el = renderer.domElement;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const f = Math.exp(Math.sign(e.deltaY) * Math.min(Math.abs(e.deltaY), 100) * 0.0022);
      engine.frame.halfWidth = Math.min(1e24, Math.max(1e-30, engine.frame.halfWidth * f));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    const detachPick = attachPicking(
      el,
      () => camera,
      () =>
        [...visuals.entries()]
          .filter(([, v]) => v.mesh.visible || v.horizon?.visible || v.planet?.visible)
          .map(([id, v]) => ({ id, massive: true, pos: (v.planet?.visible ? v.planet.position : v.horizon?.visible ? v.horizon.position : v.mesh.position).clone() })),
    );

    return () => {
      unregister();
      detachPick();
      el.removeEventListener('wheel', onWheel);
      for (const v of visuals.values()) dropVisual(v);
      rays.dispose();
      controls.dispose();
      geo.dispose();
      mat.dispose();
      pGeo.dispose();
      starGeo.dispose();
      sphereGeo.dispose();
      ringGeo.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      el.remove();
    };
  }, [size]);

  return (
    <div ref={wrap} className="absolute inset-0 cursor-grab active:cursor-grabbing" style={{ background: 'radial-gradient(ellipse at 50% 35%, #0b1222 0%, #04060b 70%)' }}>
      <div ref={holder} className="absolute inset-0" />
      <canvas ref={labels} className="pointer-events-none absolute inset-0 h-full w-full" />
    </div>
  );
}
