import * as THREE from 'three';
import { engine } from '../engine/engine';
import { wavelengthRGB } from '../physics/spectrum';

const MAX_SEGMENTS = 40000;

/**
 * Photon paths as additive, vertex-coloured line segments. Colour = wavelength measured by a
 * static observer at each point (gravitational blue/redshift). `place` maps sim coordinates to
 * scene coordinates and returns false to skip a point.
 */
export class LightRays {
  readonly object: THREE.LineSegments;
  private pos = new Float32Array(MAX_SEGMENTS * 6);
  private col = new Float32Array(MAX_SEGMENTS * 6);
  private geo = new THREE.BufferGeometry();

  constructor() {
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    const mat = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthTest: false,
      depthWrite: false,
    });
    this.object = new THREE.LineSegments(this.geo, mat);
    this.object.frustumCulled = false;
    this.object.renderOrder = 10;
  }

  update(place: (x: number, y: number, z: number, out: THREE.Vector3) => boolean) {
    const sim = engine.sim;
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    let n = 0;
    for (const p of sim.bodies) {
      if (p.kind !== 'photon') continue;
      const pts: number[] = [];
      const lams: number[] = [];
      p.trail.forEach((x, y, z, _i, _n, v) => {
        pts.push(x, y, z);
        lams.push(v);
      });
      pts.push(p.x, p.y, p.z);
      lams.push(sim.photonWavelength(p));
      const count = pts.length / 3;
      let prevOk = false;
      let prevCol: [number, number, number] = [0, 0, 0];
      for (let i = 0; i < count && n < MAX_SEGMENTS; i++) {
        const x = pts[i * 3];
        const y = pts[i * 3 + 1];
        const z = pts[i * 3 + 2];
        const ok = place(x, y, z, b);
        const fade = Math.min(1, (i / count) * 3 + 0.15);
        const c = wavelengthRGB(lams[i]).map((v) => v * fade) as [number, number, number];
        if (ok && prevOk) {
          this.pos.set([a.x, a.y, a.z, b.x, b.y, b.z], n * 6);
          this.col.set([...prevCol, ...c], n * 6);
          n++;
        }
        a.copy(b);
        prevOk = ok;
        prevCol = c;
      }
    }
    this.geo.setDrawRange(0, n * 2);
    (this.geo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.attributes.color as THREE.BufferAttribute).needsUpdate = true;
  }

  /**
   * Draw the rays as waves lying in a plane (curvature view). `toPlane` maps sim (x, y) to plane
   * coordinates (or null to skip), `lift` gives the surface height there. The local wavelength on
   * screen is λ × unitsPerNm, so stretching and squeezing of the light is visible.
   */
  updateWaves(
    toPlane: (x: number, y: number) => [number, number] | null,
    lift: (px: number, py: number) => number,
    unitsPerNm: number,
    amp: number,
  ) {
    const sim = engine.sim;
    let n = 0;
    const put = (px: number, py: number, c: number[], idx: number) => {
      this.pos[idx] = px;
      this.pos[idx + 1] = lift(px, py) + 0.05;
      this.pos[idx + 2] = -py;
      this.col[idx] = c[0];
      this.col[idx + 1] = c[1];
      this.col[idx + 2] = c[2];
    };
    for (const p of sim.bodies) {
      if (p.kind !== 'photon') continue;
      const pts: [number, number, number][] = [];
      const lams: number[] = [];
      p.trail.forEach((x, y, z, _i, _n, v) => {
        pts.push([x, y, z]);
        lams.push(v);
      });
      pts.push([p.x, p.y, p.z]);
      lams.push(sim.photonWavelength(p));
      const count = pts.length;
      // Walk from the photon backwards so the wave pattern travels with the light.
      let phase = 0;
      let prev: { px: number; py: number; c: number[] } | null = null;
      for (let i = count - 1; i > 0 && n < MAX_SEGMENTS; i--) {
        const a = toPlane(pts[i][0], pts[i][1]);
        const b = toPlane(pts[i - 1][0], pts[i - 1][1]);
        if (!a || !b) {
          prev = null;
          continue;
        }
        const la = lams[i];
        const lb = lams[i - 1];
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (len < 1e-9) continue;
        const nx = -(b[1] - a[1]) / len;
        const ny = (b[0] - a[0]) / len;
        const steps = Math.max(1, Math.ceil(len / (unitsPerNm * Math.min(la, lb) * 0.12)));
        const fade = Math.min(1, (i / count) * 3 + 0.15);
        for (let k = 0; k <= steps && n < MAX_SEGMENTS; k++) {
          const t = k / steps;
          const l = la + (lb - la) * t;
          if (k > 0) phase += len / steps / (Math.max(l, 50) * unitsPerNm);
          const off = amp * Math.sin(2 * Math.PI * phase);
          const px = a[0] + (b[0] - a[0]) * t + nx * off;
          const py = a[1] + (b[1] - a[1]) * t + ny * off;
          const c = wavelengthRGB(l).map((v) => v * fade);
          if (prev) {
            put(prev.px, prev.py, prev.c, n * 6);
            put(px, py, c, n * 6 + 3);
            n++;
          }
          prev = { px, py, c };
        }
      }
    }
    this.geo.setDrawRange(0, n * 2);
    (this.geo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.attributes.color as THREE.BufferAttribute).needsUpdate = true;
  }

  dispose() {
    this.geo.dispose();
    (this.object.material as THREE.Material).dispose();
  }
}

const glowVert = /* glsl */ `
attribute vec3 segEnd;
attribute float atEnd;
attribute float side;
attribute vec3 color;
uniform vec2 uRes;
uniform float uWidth;
varying vec3 vColor;
varying float vSide;
void main() {
  // 'position' is the segment start; the ribbon normal always comes from start -> end so both
  // ends of a segment offset to the same side (no twisted quads).
  vec4 a = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  vec4 b = projectionMatrix * modelViewMatrix * vec4(segEnd, 1.0);
  vec2 dir = normalize(b.xy / b.w * uRes - a.xy / a.w * uRes + vec2(1e-6, 0.0));
  vec2 nrm = vec2(-dir.y, dir.x);
  vec4 p = atEnd > 0.5 ? b : a;
  p.xy += nrm * side * uWidth / uRes * p.w;
  gl_Position = p;
  vColor = color;
  vSide = side;
}
`;

const glowFrag = /* glsl */ `
uniform float uIntensity;
varying vec3 vColor;
varying float vSide;
void main() {
  float d = abs(vSide);
  // Bright, almost white core inside a soft coloured halo.
  float core = exp(-d * d * 60.0);
  float halo = exp(-d * d * 5.0);
  vec3 c = vColor * halo * 0.55 + mix(vColor, vec3(1.0), 0.6) * core * 1.2;
  gl_FragColor = vec4(c * uIntensity, 1.0);
}
`;

const MAX_GLOW_SEGMENTS = 30000;

/**
 * Light rays as glowing ribbons of constant screen width (soft halo + hot core, additive), coloured
 * by the locally measured wavelength. Used by the realistic view.
 */
export class GlowRays {
  readonly object: THREE.Mesh;
  readonly material: THREE.ShaderMaterial;
  private pos = new Float32Array(MAX_GLOW_SEGMENTS * 18);
  private oth = new Float32Array(MAX_GLOW_SEGMENTS * 18);
  private atEnd = new Float32Array(MAX_GLOW_SEGMENTS * 6);
  private side = new Float32Array(MAX_GLOW_SEGMENTS * 6);
  private col = new Float32Array(MAX_GLOW_SEGMENTS * 18);
  private geo = new THREE.BufferGeometry();

  constructor() {
    const dyn = (arr: Float32Array, n: number) => new THREE.BufferAttribute(arr, n).setUsage(THREE.DynamicDrawUsage);
    this.geo.setAttribute('position', dyn(this.pos, 3));
    this.geo.setAttribute('segEnd', dyn(this.oth, 3));
    this.geo.setAttribute('atEnd', dyn(this.atEnd, 1));
    this.geo.setAttribute('side', dyn(this.side, 1));
    this.geo.setAttribute('color', dyn(this.col, 3));
    this.material = new THREE.ShaderMaterial({
      vertexShader: glowVert,
      fragmentShader: glowFrag,
      uniforms: { uRes: { value: new THREE.Vector2(1, 1) }, uWidth: { value: 6 }, uIntensity: { value: 1 } },
      // Ribbon winding depends on the segment direction on screen, so draw both faces.
      side: THREE.DoubleSide,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthTest: false,
      depthWrite: false,
    });
    this.object = new THREE.Mesh(this.geo, this.material);
    this.object.frustumCulled = false;
    this.object.renderOrder = 10;
  }

  update(place: (x: number, y: number, z: number, out: THREE.Vector3) => void) {
    const sim = engine.sim;
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    let n = 0;
    // Every vertex carries the segment start (position) and end; atEnd picks which one it sits on.
    const vert = (k: number, start: THREE.Vector3, end: THREE.Vector3, atEnd: number, s: number, c: number[]) => {
      this.pos.set([start.x, start.y, start.z], k * 3);
      this.oth.set([end.x, end.y, end.z], k * 3);
      this.atEnd[k] = atEnd;
      this.side[k] = s;
      this.col.set(c, k * 3);
    };
    for (const p of sim.bodies) {
      if (p.kind !== 'photon') continue;
      const pts: number[] = [];
      const lams: number[] = [];
      p.trail.forEach((x, y, z, _i, _n, v) => {
        pts.push(x, y, z);
        lams.push(v);
      });
      pts.push(p.x, p.y, p.z);
      lams.push(sim.photonWavelength(p));
      const count = lams.length;
      let prevC: number[] = [];
      for (let i = 0; i < count && n < MAX_GLOW_SEGMENTS; i++) {
        place(pts[i * 3], pts[i * 3 + 1], pts[i * 3 + 2], b);
        const fade = Math.min(1, (i / count) * 3 + 0.15);
        const c = wavelengthRGB(lams[i]).map((v) => v * fade);
        if (i > 0) {
          // Two triangles per segment.
          const k = n * 6;
          vert(k, a, b, 0, -1, prevC);
          vert(k + 1, a, b, 0, 1, prevC);
          vert(k + 2, a, b, 1, 1, c);
          vert(k + 3, a, b, 0, -1, prevC);
          vert(k + 4, a, b, 1, 1, c);
          vert(k + 5, a, b, 1, -1, c);
          n++;
        }
        a.copy(b);
        prevC = c;
      }
    }
    this.geo.setDrawRange(0, n * 6);
    for (const name of ['position', 'segEnd', 'atEnd', 'side', 'color']) (this.geo.attributes[name] as THREE.BufferAttribute).needsUpdate = true;
  }

  dispose() {
    this.geo.dispose();
    this.material.dispose();
  }
}
