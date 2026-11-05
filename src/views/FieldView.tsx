import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { engine } from '../engine/engine';
import { blackbodyRGB } from '../engine/simulation';
import type { Body } from '../engine/types';
import { schwarzschildRadius } from '../physics/blackhole';
import { G } from '../physics/constants';
import { useUI } from '../store';
import { createYUpShip, disposeYUpShip, updateYUpShip, type YUpShip } from './shipModels';
import { createPlanetGroup, createStarGlow, disposePlanetGroup, orientPlanetGroup } from './bodyVisuals';
import { planetById } from '../engine/planets';
import { attachPicking } from './pick3d';
import { useElementSize } from './useCanvasSize';

/** Half-size of the grid in view units; maps to the shared frame half-width. */
const S = 10;
/** Number of decades of field strength that are shown; weaker field is hidden. */
const DECADES = 2;

const vert = /* glsl */ `
attribute float aStrength;
attribute float aFade;
varying float vS;
varying float vFade;
varying vec3 vN;
void main() {
  vS = aStrength;
  vFade = aFade;
  vN = normalize(normalMatrix * (mat3(instanceMatrix) * normal));
  gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
}
`;

const frag = /* glsl */ `
varying float vS;
varying float vFade;
varying vec3 vN;
vec3 ramp(float s) {
  // weak -> teal, medium -> violet, strong -> orange, extreme -> warm white
  vec3 c0 = vec3(0.16, 0.55, 0.85);
  vec3 c1 = vec3(0.55, 0.40, 0.95);
  vec3 c2 = vec3(0.98, 0.55, 0.20);
  vec3 c3 = vec3(1.0, 0.93, 0.80);
  if (s < 0.4) return mix(c0, c1, s / 0.4);
  if (s < 0.8) return mix(c1, c2, (s - 0.4) / 0.4);
  return mix(c2, c3, (s - 0.8) / 0.2);
}
void main() {
  float light = 0.55 + 0.45 * max(dot(vN, normalize(vec3(0.3, 0.8, 0.5))), 0.0);
  vec3 col = ramp(vS) * light;
  float a = pow(vS, 1.3) * 0.95 * vFade;
  gl_FragColor = vec4(col, a);
}
`;

/** Unit arrow along +Y, centred on the origin. */
function arrowGeometry(): THREE.BufferGeometry {
  const shaft = new THREE.CylinderGeometry(0.045, 0.045, 0.62, 6);
  shaft.translate(0, -0.19, 0);
  const head = new THREE.ConeGeometry(0.13, 0.38, 8);
  head.translate(0, 0.31, 0);
  const g = mergeGeometries([shaft, head])!;
  shaft.dispose();
  head.dispose();
  return g;
}

export function FieldView() {
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
    camera.position.set(0, 13, 17);
    let seenReset = engine.viewReset;
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.enablePan = false;
    controls.enableZoom = false;

    // Orientation aids: orbital-plane grid and a faint bounding box.
    const grid = new THREE.GridHelper(2 * S, 20, 0x1e293b, 0x111827);
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.6;
    scene.add(grid);
    const box = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(2 * S, S, 2 * S)),
      new THREE.LineBasicMaterial({ color: 0x334155, transparent: true, opacity: 0.25 }),
    );
    scene.add(box);

    const geo = arrowGeometry();
    const mat = new THREE.ShaderMaterial({ vertexShader: vert, fragmentShader: frag, transparent: true, depthWrite: false });
    let mesh: THREE.InstancedMesh | null = null;
    let strength: THREE.InstancedBufferAttribute | null = null;
    let fade: THREE.InstancedBufferAttribute | null = null;
    let nodes: Float32Array = new Float32Array(0);
    let layoutKey = '';
    let logMaxSmooth = NaN;

    const build = (density: 'normal' | 'fine', volume: boolean) => {
      if (mesh) {
        scene.remove(mesh);
        mesh.dispose();
      }
      const n = density === 'fine' ? 31 : 19;
      const layers = volume ? (density === 'fine' ? 7 : 5) : 1;
      const count = n * n * layers;
      nodes = new Float32Array(count * 3);
      let k = 0;
      for (let l = 0; l < layers; l++) {
        const z = layers === 1 ? 0 : (l / (layers - 1) - 0.5) * S * 0.9;
        for (let i = 0; i < n; i++) {
          for (let j = 0; j < n; j++) {
            nodes[k * 3] = (i / (n - 1) - 0.5) * 2 * S;
            nodes[k * 3 + 1] = (j / (n - 1) - 0.5) * 2 * S;
            nodes[k * 3 + 2] = z;
            k++;
          }
        }
      }
      mesh = new THREE.InstancedMesh(geo, mat, count);
      mesh.frustumCulled = false;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      strength = new THREE.InstancedBufferAttribute(new Float32Array(count), 1).setUsage(THREE.DynamicDrawUsage);
      fade = new THREE.InstancedBufferAttribute(new Float32Array(count), 1).setUsage(THREE.DynamicDrawUsage);
      geo.setAttribute('aStrength', strength);
      geo.setAttribute('aFade', fade);
      scene.add(mesh);
      return 2 * S / (n - 1);
    };
    let cell = 1;

    // Body markers.
    const sphereGeo = new THREE.SphereGeometry(1, 24, 12);
    const ringGeo = new THREE.TorusGeometry(1, 0.06, 6, 48);
    ringGeo.rotateX(Math.PI / 2);
    const markers = new Map<number, { mesh: THREE.Mesh; ring?: THREE.Mesh; ship?: YUpShip; kind: string; model?: string; planet?: THREE.Group; glow?: THREE.Sprite }>();
    scene.add(new THREE.HemisphereLight(0x9fb0d0, 0x101018, 1.1));
    const keyLight = new THREE.DirectionalLight(0xffffff, 2.2);
    keyLight.position.set(4, 10, 6);
    scene.add(keyLight);
    const makeMarker = (b: Body) => {
      let color: THREE.ColorRepresentation;
      if (b.kind === 'blackHole') color = 0x000000;
      else if (b.kind === 'planet' || b.kind === 'ship') color = b.color;
      else color = new THREE.Color(...blackbodyRGB(b.temperature));
      const m = new THREE.Mesh(sphereGeo, new THREE.MeshBasicMaterial({ color }));
      scene.add(m);
      const entry: { mesh: THREE.Mesh; ring?: THREE.Mesh; ship?: YUpShip; kind: string; model?: string; planet?: THREE.Group; glow?: THREE.Sprite } = { mesh: m, kind: b.kind, model: b.model };
      const pm = b.kind === 'planet' ? planetById(b.model) : undefined;
      if (pm) {
        entry.planet = createPlanetGroup(pm);
        scene.add(entry.planet);
      }
      if (b.kind === 'star' || b.kind === 'whiteDwarf' || b.kind === 'neutronStar') {
        entry.glow = createStarGlow();
        scene.add(entry.glow);
      }
      if (b.kind === 'ship') {
        entry.ship = createYUpShip(b.model);
        scene.add(entry.ship.root);
      }
      if (b.kind === 'blackHole') {
        entry.ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xfb923c }));
        scene.add(entry.ring);
      }
      return entry;
    };

    const dummy = new THREE.Object3D();
    const up = new THREE.Vector3(0, 1, 0);
    const dir = new THREE.Vector3();
    const lctx = labels.current!.getContext('2d')!;
    let lastW = 0;
    let lastH = 0;
    let logs = new Float32Array(0);
    let gx = new Float32Array(0);
    let gy = new Float32Array(0);
    let gz = new Float32Array(0);

    const render = () => {
      const { width: W, height: H, dpr } = size.current;
      if (W !== lastW || H !== lastH) {
        renderer.setPixelRatio(dpr);
        renderer.setSize(W, H, false);
        camera.aspect = W / H;
        camera.updateProjectionMatrix();
        // Keep the whole grid in view in narrow panels.
        camera.position.setLength(24 / Math.min(1, camera.aspect * 1.15));
        labels.current!.width = Math.round(W * dpr);
        labels.current!.height = Math.round(H * dpr);
        lastW = W;
        lastH = H;
      }
      const ui = useUI.getState();
      const opts = ui.field;
      const key = `${opts.density}-${opts.volume}`;
      if (key !== layoutKey) {
        cell = build(opts.density, opts.volume);
        layoutKey = key;
      }
      const sim = engine.sim;
      const frame = engine.frame;
      const focus = engine.focus();
      const u = frame.halfWidth / S; // metres per view unit
      const massive = sim.bodies.filter((b) => b.massive);
      const count = nodes.length / 3;
      if (logs.length !== count) {
        logs = new Float32Array(count);
        gx = new Float32Array(count);
        gy = new Float32Array(count);
        gz = new Float32Array(count);
      }

      // Acceleration of a test body held at rest: g = GM / (r^2 sqrt(1 - r_s/r)) per source (superposed).
      const src = massive.map((b) => ({
        x: b.x,
        y: b.y,
        z: b.z,
        gm: G * b.mass,
        rs: b.kind === 'blackHole' ? schwarzschildRadius(b.mass) : 0,
        rIn: b.kind === 'blackHole' ? 1.02 * schwarzschildRadius(b.mass) : b.radius,
      }));
      const valid: number[] = [];
      for (let i = 0; i < count; i++) {
        const px = frame.cx + nodes[i * 3] * u;
        const py = frame.cy + nodes[i * 3 + 1] * u;
        const pz = focus.z + nodes[i * 3 + 2] * u;
        let ax = 0;
        let ay = 0;
        let az = 0;
        let inside = false;
        for (const s of src) {
          const dx = s.x - px;
          const dy = s.y - py;
          const dz = s.z - pz;
          const r2 = dx * dx + dy * dy + dz * dz;
          const r = Math.sqrt(r2);
          if (r < s.rIn) {
            inside = true;
            break;
          }
          const f = s.gm / (r2 * r * (s.rs > 0 ? Math.sqrt(1 - s.rs / r) : 1));
          ax += f * dx;
          ay += f * dy;
          az += f * dz;
        }
        const g = Math.hypot(ax, ay, az);
        gx[i] = ax;
        gy[i] = ay;
        gz[i] = az;
        logs[i] = inside || !(g > 0) ? -Infinity : Math.log10(g);
        if (Number.isFinite(logs[i])) valid.push(logs[i]);
      }
      // Reference level: 99.5th percentile, smoothed so the colour scale does not flicker.
      let logMax = -Infinity;
      if (valid.length) {
        valid.sort((a, b) => a - b);
        logMax = valid[Math.min(valid.length - 1, Math.floor(valid.length * 0.995))];
        logMaxSmooth = Number.isFinite(logMaxSmooth) ? logMaxSmooth + (logMax - logMaxSmooth) * 0.15 : logMax;
      }
      const top = logMaxSmooth;
      engine.fieldRange = Number.isFinite(top) ? [10 ** (top - DECADES), 10 ** top] : [0, 0];

      // A nearly uniform field (e.g. zoomed in on a ship) would otherwise light up every arrow.
      const spread = valid.length ? valid[valid.length - 1] - valid[0] : 0;
      const contrast = Math.min(1, Math.max(0.3, spread / DECADES));
      const sAttr = strength!.array as Float32Array;
      const fAttr = fade!.array as Float32Array;
      for (let i = 0; i < count; i++) {
        const s = Number.isFinite(logs[i]) ? Math.min(1, (logs[i] - (top - DECADES)) / DECADES) : 0;
        if (!(s > 0.02)) {
          dummy.scale.setScalar(0);
          dummy.updateMatrix();
          mesh!.setMatrixAt(i, dummy.matrix);
          sAttr[i] = 0;
          fAttr[i] = 0;
          continue;
        }
        // Sim (x, y, z) -> three (x, z, -y).
        dir.set(gx[i], gz[i], -gy[i]).normalize();
        dummy.position.set(nodes[i * 3], nodes[i * 3 + 2], -nodes[i * 3 + 1]);
        dummy.quaternion.setFromUnitVectors(up, dir);
        const len = cell * (0.25 + 0.5 * s);
        dummy.scale.set(len * (0.7 + 0.5 * s), len, len * (0.7 + 0.5 * s));
        dummy.updateMatrix();
        mesh!.setMatrixAt(i, dummy.matrix);
        sAttr[i] = s;
        const rh = Math.hypot(nodes[i * 3], nodes[i * 3 + 1]);
        fAttr[i] = (1 - THREE.MathUtils.smoothstep(rh, S * 0.85, S * 1.05)) * contrast;
      }
      mesh!.instanceMatrix.needsUpdate = true;
      strength!.needsUpdate = true;
      fade!.needsUpdate = true;

      // Body markers.
      const alive = new Set<number>();
      for (const b of sim.bodies) {
        if (!b.massive && b.kind !== 'ship') continue;
        alive.add(b.id);
        let m = markers.get(b.id);
        if (m && (m.kind !== b.kind || m.model !== b.model)) {
          scene.remove(m.mesh);
          (m.mesh.material as THREE.Material).dispose();
          if (m.ring) scene.remove(m.ring);
          if (m.ship) disposeYUpShip(m.ship);
          if (m.planet) disposePlanetGroup(m.planet);
          if (m.glow) scene.remove(m.glow);
          m = undefined;
        }
        if (!m) {
          m = makeMarker(b);
          markers.set(b.id, m);
        }
        if (b.kind === 'star' || b.kind === 'whiteDwarf' || b.kind === 'neutronStar') (m.mesh.material as THREE.MeshBasicMaterial).color.setRGB(...blackbodyRGB(b.temperature));
        else if (b.kind === 'planet') {
          // Molten remnants glow towards their black-body colour.
          const hot = Math.max(0, Math.min(1, (b.temperature - 700) / 1800));
          (m.mesh.material as THREE.MeshBasicMaterial).color.set(b.color).lerp(new THREE.Color(...blackbodyRGB(b.temperature)), hot);
        }
        const x = (b.x - frame.cx) / u;
        const y = (b.y - frame.cy) / u;
        const z = (b.z - focus.z) / u;
        const vis = Math.abs(x) < S * 1.1 && Math.abs(y) < S * 1.1 && Math.abs(z) < S;
        const r =
          b.kind === 'blackHole'
            ? Math.max(schwarzschildRadius(b.mass) / u, 0.14)
            : Math.max(b.radius / u, b.kind === 'ship' ? 0.07 : b.kind === 'planet' ? 0.08 : 0.13);
        m.mesh.visible = vis;
        m.mesh.position.set(x, z, -y);
        m.mesh.scale.setScalar(r);
        if (m.planet) {
          m.mesh.visible = false;
          m.planet.visible = vis;
          m.planet.position.copy(m.mesh.position);
          m.planet.scale.setScalar(r);
          orientPlanetGroup(m.planet, b.model, sim.time, ui.warp, performance.now() / 1000, b.spin);
        }
        if (m.glow) {
          m.glow.visible = vis;
          m.glow.position.copy(m.mesh.position);
          m.glow.scale.setScalar(r * 7);
          m.glow.material.color.setRGB(...blackbodyRGB(b.temperature));
        }
        if (m.ship) {
          const size = Math.max((b.radius * 2) / u, 0.35);
          const host = sim.dominantAttractor(b.x, b.y, b.z);
          m.ship.root.visible = vis;
          updateYUpShip(m.ship, x, y, z, size, b.vx - (host?.vx ?? 0), b.vy - (host?.vy ?? 0), b.vz - (host?.vz ?? 0), 1 / 60);
          m.mesh.scale.setScalar(1e-6);
        }
        if (m.ring) {
          m.ring.visible = vis;
          m.ring.position.copy(m.mesh.position);
          m.ring.scale.setScalar(r * 1.35);
        }
      }
      for (const [id, m] of markers) {
        if (alive.has(id)) continue;
        scene.remove(m.mesh);
        (m.mesh.material as THREE.Material).dispose();
        if (m.ship) disposeYUpShip(m.ship);
        if (m.ring) {
          scene.remove(m.ring);
          (m.ring.material as THREE.Material).dispose();
        }
        if (m.planet) disposePlanetGroup(m.planet);
        if (m.glow) scene.remove(m.glow);
        markers.delete(id);
      }

      if (engine.viewReset !== seenReset) {
        // "Fit all": back to the default viewpoint that shows the whole plane.
        seenReset = engine.viewReset;
        camera.position.set(0, 13, 17);
        camera.position.setLength(24 / Math.min(1, camera.aspect * 1.15));
        controls.target.set(0, 0, 0);
      }
      controls.update();
      renderer.render(scene, camera);

      lctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      lctx.clearRect(0, 0, W, H);
      if (opts.labels) {
        lctx.font = '500 11px "Inter Variable", sans-serif';
        const p = new THREE.Vector3();
        for (const b of sim.bodies) {
          const m = markers.get(b.id);
          if (!m || !(m.mesh.visible || m.planet?.visible)) continue;
          p.copy(m.mesh.position).project(camera);
          if (p.z > 1) continue;
          lctx.fillStyle = b.id === ui.selectedId ? 'rgba(248,250,252,0.95)' : 'rgba(203,213,225,0.65)';
          lctx.fillText(b.name, (p.x * 0.5 + 0.5) * W + 8, (-p.y * 0.5 + 0.5) * H - 8);
        }
      }
    };

    const unregister = engine.register(render);
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
        [...markers.entries()]
          .filter(([, m]) => m.mesh.visible || m.planet?.visible || m.ship?.root.visible)
          .map(([id, m]) => ({ id, massive: true, pos: (m.planet?.visible ? m.planet.position : m.mesh.position).clone() })),
    );

    return () => {
      unregister();
      detachPick();
      el.removeEventListener('wheel', onWheel);
      for (const m of markers.values()) {
        (m.mesh.material as THREE.Material).dispose();
        if (m.ship) disposeYUpShip(m.ship);
        if (m.ring) (m.ring.material as THREE.Material).dispose();
      }
      mesh?.dispose();
      geo.dispose();
      mat.dispose();
      sphereGeo.dispose();
      ringGeo.dispose();
      grid.geometry.dispose();
      box.geometry.dispose();
      controls.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      el.remove();
    };
  }, [size]);

  return (
    <div ref={wrap} className="absolute inset-0 cursor-grab active:cursor-grabbing" style={{ background: 'radial-gradient(ellipse at 50% 40%, #0a1120 0%, #03050a 75%)' }}>
      <div ref={holder} className="absolute inset-0" />
      <canvas ref={labels} className="pointer-events-none absolute inset-0 h-full w-full" />
    </div>
  );
}
