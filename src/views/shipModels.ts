import * as THREE from 'three';
import { shipById } from '../engine/ships';

/**
 * Procedural 3D models of the catalogue ships.
 *
 * Local frame: +X forward, +Y left, +Z up; 1 unit = the ship's length (or height for the TARDIS),
 * so a model is scaled by its real length in metres to appear at true size.
 * Proportions follow commonly quoted dimensions; detail is stylised.
 */

// ----------------------------------------------------------------- textures
function canvasTexture(size: number, draw: (c: CanvasRenderingContext2D, s: number) => void): THREE.CanvasTexture {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  draw(cv.getContext('2d')!, size);
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

let rnd = 1;
const rand = () => {
  rnd = (rnd * 16807) % 2147483647;
  return rnd / 2147483647;
};

/** Hull plating: subtle panel variation with seams. */
function panelMap(): THREE.CanvasTexture {
  return canvasTexture(256, (c, s) => {
    c.fillStyle = '#c4c4c4';
    c.fillRect(0, 0, s, s);
    for (let i = 0; i < 140; i++) {
      const w = 8 + rand() * 48;
      const h = 6 + rand() * 30;
      const v = 175 + Math.floor(rand() * 55);
      c.fillStyle = `rgb(${v},${v},${v})`;
      c.fillRect(rand() * s, rand() * s, w, h);
    }
    c.strokeStyle = 'rgba(40,40,40,0.5)';
    c.lineWidth = 1;
    for (let i = 0; i < s; i += 32) {
      c.beginPath();
      c.moveTo(i + 0.5, 0);
      c.lineTo(i + 0.5, s);
      c.moveTo(0, i + 0.5);
      c.lineTo(s, i + 0.5);
      c.stroke();
    }
  });
}

/** Sparse lit windows for the emissive channel. */
function windowMap(): THREE.CanvasTexture {
  return canvasTexture(256, (c, s) => {
    c.fillStyle = '#000';
    c.fillRect(0, 0, s, s);
    for (let row = 0; row < 18; row++) {
      if (rand() < 0.7) continue;
      const y = 6 + row * 14;
      for (let x = 4; x < s; x += 6) if (rand() < 0.35) {
        c.fillStyle = rand() < 0.8 ? '#ffe6b0' : '#bfe3ff';
        c.fillRect(x, y, 2, 2);
      }
    }
  });
}

function borgMaps(): [THREE.CanvasTexture, THREE.CanvasTexture] {
  const base = canvasTexture(512, (c, s) => {
    c.fillStyle = '#1d2022';
    c.fillRect(0, 0, s, s);
    for (let i = 0; i < 900; i++) {
      const v = 25 + Math.floor(rand() * 45);
      c.fillStyle = `rgb(${v},${v + 2},${v})`;
      c.fillRect(rand() * s, rand() * s, 3 + rand() * 40, 3 + rand() * 18);
    }
    c.strokeStyle = 'rgba(0,0,0,0.6)';
    for (let i = 0; i < 300; i++) {
      c.beginPath();
      const x = rand() * s;
      const y = rand() * s;
      c.moveTo(x, y);
      c.lineTo(x + (rand() - 0.5) * 80, y);
      c.lineTo(x + (rand() - 0.5) * 80, y + (rand() - 0.5) * 80);
      c.stroke();
    }
  });
  const glow = canvasTexture(512, (c, s) => {
    c.fillStyle = '#000';
    c.fillRect(0, 0, s, s);
    c.strokeStyle = '#2bff6a';
    c.lineWidth = 1;
    for (let i = 0; i < 120; i++) {
      c.globalAlpha = 0.3 + rand() * 0.7;
      c.beginPath();
      const x = rand() * s;
      const y = rand() * s;
      c.moveTo(x, y);
      if (rand() < 0.5) c.lineTo(x + rand() * 60, y);
      else c.lineTo(x, y + rand() * 60);
      c.stroke();
    }
    for (let i = 0; i < 200; i++) {
      c.fillStyle = '#5dff8f';
      c.globalAlpha = rand();
      c.fillRect(rand() * s, rand() * s, 2, 2);
    }
  });
  return [base, glow];
}

function tardisMap(): THREE.CanvasTexture {
  return canvasTexture(256, (c, s) => {
    c.fillStyle = '#123a8c';
    c.fillRect(0, 0, s, s);
    // Sign band.
    c.fillStyle = '#0b0f1a';
    c.fillRect(8, 6, s - 16, 26);
    c.fillStyle = '#f8fafc';
    c.font = 'bold 15px sans-serif';
    c.textAlign = 'center';
    c.fillText('POLICE   BOX', s / 2, 25);
    // Door panels.
    c.strokeStyle = '#0a2a6a';
    c.lineWidth = 4;
    const top = 44;
    const ph = (s - top - 10) / 4;
    for (let col = 0; col < 2; col++) {
      for (let row = 0; row < 4; row++) {
        const x = 18 + col * ((s - 36) / 2);
        const y = top + row * ph;
        c.strokeRect(x + 4, y + 4, (s - 36) / 2 - 8, ph - 8);
        if (row === 0) {
          c.fillStyle = '#e6f0ff';
          c.fillRect(x + 9, y + 9, (s - 36) / 2 - 18, ph - 18);
          c.strokeStyle = '#123a8c';
          c.lineWidth = 2;
          c.beginPath();
          c.moveTo(x + (s - 36) / 4, y + 9);
          c.lineTo(x + (s - 36) / 4, y + ph - 9);
          c.stroke();
          c.strokeStyle = '#0a2a6a';
          c.lineWidth = 4;
        }
      }
    }
    c.fillStyle = '#0a2a6a';
    c.fillRect(s / 2 - 2, top, 4, s - top - 10);
  });
}

// ----------------------------------------------------------------- materials
interface Mats {
  hull: (color: string) => THREE.MeshStandardMaterial;
  dark: THREE.MeshStandardMaterial;
  glass: THREE.MeshStandardMaterial;
  glow: (color: string) => THREE.MeshBasicMaterial;
}

let shared: { panel: THREE.CanvasTexture; windows: THREE.CanvasTexture; borg: [THREE.CanvasTexture, THREE.CanvasTexture]; tardis: THREE.CanvasTexture } | null = null;
function textures() {
  shared ??= { panel: panelMap(), windows: windowMap(), borg: borgMaps(), tardis: tardisMap() };
  return shared;
}

function mats(length: number): Mats {
  const tx = textures();
  const hullCache = new Map<string, THREE.MeshStandardMaterial>();
  const glowCache = new Map<string, THREE.MeshBasicMaterial>();
  return {
    hull: (color) => {
      let m = hullCache.get(color);
      if (!m) {
        m = new THREE.MeshStandardMaterial({
          color,
          map: tx.panel,
          roughness: 0.55,
          metalness: 0.45,
          emissive: new THREE.Color('#ffffff'),
          emissiveMap: tx.windows,
          // Lit windows only make sense on large ships; small craft show plain hull.
          emissiveIntensity: length >= 150 ? 0.45 : 0,
        });
        hullCache.set(color, m);
      }
      return m;
    },
    dark: new THREE.MeshStandardMaterial({ color: '#2a2e35', roughness: 0.7, metalness: 0.3 }),
    glass: new THREE.MeshStandardMaterial({ color: '#0b1220', roughness: 0.1, metalness: 0.9 }),
    glow: (color) => {
      let m = glowCache.get(color);
      if (!m) {
        m = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(1.6) });
        glowCache.set(color, m);
      }
      return m;
    },
  };
}

// ----------------------------------------------------------------- primitives
type M = THREE.Material;
const add = (g: THREE.Object3D, geo: THREE.BufferGeometry, mat: M, x = 0, y = 0, z = 0) => {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  g.add(m);
  return m;
};
const box = (g: THREE.Object3D, mat: M, l: number, w: number, h: number, x = 0, y = 0, z = 0) => add(g, new THREE.BoxGeometry(l, w, h), mat, x, y, z);
/** Cylinder along X. */
const cylX = (g: THREE.Object3D, mat: M, r: number, l: number, x = 0, y = 0, z = 0, seg = 20, r2 = r) => {
  const geo = new THREE.CylinderGeometry(r2, r, l, seg);
  geo.rotateZ(-Math.PI / 2);
  return add(g, geo, mat, x, y, z);
};
/** Cylinder along Z. */
const cylZ = (g: THREE.Object3D, mat: M, r: number, h: number, x = 0, y = 0, z = 0, seg = 24) => {
  const geo = new THREE.CylinderGeometry(r, r, h, seg);
  geo.rotateX(Math.PI / 2);
  return add(g, geo, mat, x, y, z);
};
const sphere = (g: THREE.Object3D, mat: M, r: number, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1) => {
  const m = add(g, new THREE.SphereGeometry(r, 24, 16), mat, x, y, z);
  m.scale.set(sx, sy, sz);
  return m;
};
/** Body of revolution around Z from (radius, z) profile points. */
const lathe = (g: THREE.Object3D, mat: M, pts: [number, number][], x = 0, y = 0, z = 0) => {
  const geo = new THREE.LatheGeometry(pts.map(([r, h]) => new THREE.Vector2(r, h)), 48);
  geo.rotateX(Math.PI / 2);
  return add(g, geo, mat, x, y, z);
};
/** Prism from a top-view outline (x, y), extruded along Z. */
const slab = (g: THREE.Object3D, mat: M, pts: [number, number][], h: number, z = 0, bevel = 0) => {
  const shape = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
  const geo = new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: bevel > 0, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 2 });
  geo.translate(0, 0, z - h / 2);
  return add(g, geo, mat);
};
/** Closed polyhedron from vertices and triangle indices. */
const poly = (g: THREE.Object3D, mat: M, v: number[][], tri: number[][]) => {
  const pos: number[] = [];
  // Triangles are listed clockwise when seen from outside; emit them counter-clockwise.
  for (const t of tri) for (const i of [t[0], t[2], t[1]]) pos.push(...v[i]);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.computeVertexNormals();
  return add(g, geo, mat);
};
const torusZ = (g: THREE.Object3D, mat: M, R: number, r: number, x = 0, y = 0, z = 0, arc = Math.PI * 2, rot = 0) => {
  const geo = new THREE.TorusGeometry(R, r, 10, 64, arc);
  geo.rotateZ(rot);
  return add(g, geo, mat, x, y, z);
};

// ----------------------------------------------------------------- ships
type Builder = (g: THREE.Group, m: Mats, color: string) => void;

const BUILDERS: Record<string, Builder> = {
  enterprise(g, m, c) {
    const hull = m.hull(c);
    lathe(g, hull, [[0, 0.05], [0.07, 0.052], [0.3, 0.03], [0.365, 0.004], [0.36, -0.01], [0.28, -0.028], [0.06, -0.045], [0, -0.045]], 0.14, 0, 0.07);
    sphere(g, m.glass, 0.035, 0.14, 0, 0.12, 1, 1, 0.5);
    box(g, hull, 0.14, 0.06, 0.09, -0.07, 0, -0.01);
    cylX(g, hull, 0.068, 0.42, -0.2, 0, -0.08);
    sphere(g, hull, 0.068, 0.01, 0, -0.08, 0.4, 1, 1);
    cylX(g, m.glow('#5aa9ff'), 0.04, 0.01, 0.04, 0, -0.08);
    for (const s of [-1, 1]) {
      const pylon = box(g, hull, 0.1, 0.02, 0.16, -0.33, s * 0.15, -0.02);
      pylon.rotation.x = s * 0.95;
      cylX(g, hull, 0.034, 0.52, -0.26, s * 0.26, 0.04);
      sphere(g, m.glow('#ff5a4f'), 0.034, 0.0, s * 0.26, 0.04, 0.6, 1, 1);
      box(g, m.glow('#6fb8ff'), 0.42, 0.006, 0.03, -0.27, s * 0.226, 0.04);
    }
    box(g, m.glow('#ff9a3c'), 0.012, 0.12, 0.012, -0.226, 0, 0.065);
  },
  borgcube(g) {
    const [base, glow] = textures().borg;
    const mat = new THREE.MeshStandardMaterial({ map: base, emissive: new THREE.Color('#ffffff'), emissiveMap: glow, emissiveIntensity: 1.2, roughness: 0.8, metalness: 0.4 });
    base.repeat.set(3, 3);
    glow.repeat.set(3, 3);
    box(g, mat, 1, 1, 1);
  },
  falcon(g, m, c) {
    const hull = m.hull(c);
    lathe(g, hull, [[0, 0.1], [0.24, 0.085], [0.37, 0.025], [0.375, 0], [0.37, -0.025], [0.24, -0.085], [0, -0.1]], -0.08, 0, 0);
    for (const s of [-1, 1]) box(g, hull, 0.34, 0.12, 0.08, 0.32, s * 0.11, 0);
    box(g, hull, 0.18, 0.06, 0.05, 0.08, -0.31, 0);
    cylX(g, hull, 0.045, 0.2, 0.17, -0.37, 0);
    sphere(g, m.glass, 0.045, 0.27, -0.37, 0, 0.7, 1, 1);
    const dish = cylZ(g, hull, 0.07, 0.01, -0.02, 0.17, 0.13);
    dish.rotation.x = 0.4;
    sphere(g, m.dark, 0.05, -0.08, 0, 0.1, 1, 1, 0.4);
    torusZ(g, m.glow('#7cc6ff'), 0.36, 0.014, -0.08, 0, 0, 1.7, Math.PI - 0.85);
  },
  stardestroyer(g, m, c) {
    const hull = m.hull(c);
    poly(
      g,
      hull,
      [
        [0.5, 0, 0],
        [-0.5, 0.28, 0],
        [-0.5, -0.28, 0],
        [-0.5, 0, 0.12],
        [-0.5, 0, -0.07],
      ],
      [
        [0, 3, 1],
        [0, 2, 3],
        [0, 4, 2],
        [0, 1, 4],
        [1, 3, 2],
        [2, 4, 1],
      ],
    );
    box(g, hull, 0.28, 0.2, 0.06, -0.34, 0, 0.13);
    box(g, hull, 0.14, 0.12, 0.06, -0.4, 0, 0.18);
    box(g, hull, 0.04, 0.16, 0.035, -0.42, 0, 0.225);
    for (const s of [-1, 1]) sphere(g, hull, 0.02, -0.42, s * 0.05, 0.26);
    for (const y of [-0.08, 0, 0.08]) cylX(g, m.glow('#8fd0ff'), 0.035, 0.01, -0.505, y, 0.04);
  },
  endurance(g, m, c) {
    const hull = m.hull(c);
    const ring = new THREE.Group();
    ring.userData.spin = 0.55; // rad/s, gives ~1 g at the 32 m ring radius
    g.add(ring);
    torusZ(ring, m.dark, 0.42, 0.012);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const mod = box(ring, hull, 0.1, 0.17, 0.07, 0.42 * Math.cos(a), 0.42 * Math.sin(a), 0);
      mod.rotation.z = a;
    }
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 12;
      const spoke = box(ring, m.dark, 0.34, 0.015, 0.015, 0.21 * Math.cos(a), 0.21 * Math.sin(a), 0);
      spoke.rotation.z = a;
    }
    cylZ(ring, hull, 0.07, 0.14);
    cylZ(ring, m.glow('#a5d8ff'), 0.03, 0.15);
    // Docked Ranger and lander.
    const r1 = box(ring, hull, 0.09, 0.05, 0.03, 0.42, 0, 0.05);
    r1.rotation.z = Math.PI / 2;
  },
  ranger(g, m, c) {
    const hull = m.hull(c);
    slab(g, hull, [[0.5, 0], [0.1, 0.17], [-0.5, 0.27], [-0.5, -0.27], [0.1, -0.17]], 0.1, 0, 0.03);
    box(g, m.glass, 0.12, 0.12, 0.03, 0.15, 0, 0.075);
    box(g, m.dark, 0.6, 0.4, 0.02, -0.15, 0, -0.07);
    for (const s of [-1, 1]) cylX(g, m.glow('#9fd4ff'), 0.03, 0.01, -0.53, s * 0.12, 0);
  },
  sanctuary(g, m, c) {
    const hull = m.hull(c);
    lathe(g, hull, [[0, 0.08], [0.18, 0.07], [0.3, 0.02], [0.3, -0.02], [0.18, -0.07], [0, -0.08]]);
    torusZ(g, hull, 0.4, 0.045, 0, 0, 0, Math.PI * 1.6, Math.PI * 0.2);
    for (const s of [-1, 1]) {
      for (const k of [0.12, 0.3]) {
        const prong = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.42, 6), hull);
        prong.rotation.z = -Math.PI / 2 + s * (k + 0.1);
        prong.position.set(0.38, s * k, 0);
        g.add(prong);
      }
    }
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      sphere(g, m.glow('#ff8a3d'), 0.012, 0.25 * Math.cos(a), 0.25 * Math.sin(a), 0.04);
    }
    cylX(g, m.glow('#ff7a2a'), 0.08, 0.01, -0.42, 0, 0);
  },
  darkaster(g, m, c) {
    const hull = m.hull(c);
    box(g, hull, 0.82, 0.08, 0.1, -0.06, 0, 0);
    const blade = new THREE.Shape([new THREE.Vector2(0, -0.27), new THREE.Vector2(0.18, -0.05), new THREE.Vector2(0.18, 0.05), new THREE.Vector2(0, 0.27), new THREE.Vector2(-0.06, 0)]);
    const geo = new THREE.ExtrudeGeometry(blade, { depth: 0.05, bevelEnabled: false });
    geo.translate(0, 0, -0.025);
    geo.rotateX(Math.PI / 2);
    add(g, geo, hull, 0.3, 0, 0);
    box(g, hull, 0.16, 0.2, 0.15, -0.42, 0, 0);
    for (const y of [-0.06, 0.06]) for (const z of [-0.04, 0.04]) cylX(g, m.glow('#ff3b3b'), 0.025, 0.01, -0.505, y, z);
    box(g, m.glow('#ff4040'), 0.6, 0.004, 0.01, -0.05, 0.042, 0.02);
  },
  discovery(g, m, c) {
    const hull = m.hull(c);
    sphere(g, hull, 0.06, 0.43, 0, 0);
    box(g, m.glow('#ffe7b0'), 0.01, 0.05, 0.012, 0.488, 0, 0.012);
    cylX(g, hull, 0.012, 0.7, 0.03, 0, 0, 8);
    for (let i = 0; i < 6; i++) box(g, hull, 0.03, 0.03, 0.03, 0.3 - i * 0.1, 0, 0);
    box(g, hull, 0.14, 0.07, 0.07, -0.39, 0, 0);
    for (const y of [-0.025, 0, 0.025]) cylX(g, m.glow('#9ec9ff'), 0.012, 0.01, -0.465, y, 0, 10);
  },
  nostromo(g, m, c) {
    const hull = m.hull(c);
    box(g, hull, 0.55, 0.28, 0.16, 0.1, 0, 0);
    box(g, hull, 0.16, 0.18, 0.1, 0.43, 0, -0.02);
    box(g, m.glass, 0.02, 0.14, 0.03, 0.51, 0, 0.0);
    box(g, hull, 0.3, 0.36, 0.22, -0.33, 0, 0);
    for (const s of [-1, 1]) box(g, hull, 0.2, 0.05, 0.08, 0.05, s * 0.16, 0.1);
    for (const y of [-0.1, 0, 0.1]) cylX(g, m.glow('#ffb36b'), 0.055, 0.02, -0.49, y, 0);
    cylZ(g, m.dark, 0.008, 0.12, 0.2, 0.06, 0.14);
  },
  rocinante(g, m, c) {
    const hull = m.hull(c);
    cylX(g, hull, 0.1, 0.62, 0.0, 0, 0, 6);
    cylX(g, hull, 0.0, 0.2, 0.41, 0, 0, 6, 0.1);
    cylX(g, hull, 0.1, 0.14, -0.38, 0, 0, 6, 0.06);
    cylX(g, m.glow('#a7d6ff'), 0.055, 0.01, -0.455, 0, 0);
    for (const s of [-1, 1]) box(g, hull, 0.18, 0.06, 0.05, -0.15, s * 0.12, 0);
    box(g, m.dark, 0.5, 0.03, 0.03, 0.05, 0, 0.1);
    box(g, m.glow('#ff4b4b'), 0.2, 0.004, 0.02, 0.1, 0.087, 0);
  },
  serenity(g, m, c) {
    const hull = m.hull(c);
    sphere(g, hull, 0.08, 0.4, 0, 0.0, 1.2, 1, 0.8);
    box(g, m.glass, 0.03, 0.08, 0.03, 0.49, 0, 0.02);
    box(g, hull, 0.24, 0.07, 0.06, 0.24, 0, -0.01);
    sphere(g, hull, 1, -0.06, 0, 0, 0.28, 0.17, 0.12);
    cylX(g, m.glow('#ffb36b'), 0.075, 0.01, -0.35, 0, 0);
    for (const s of [-1, 1]) {
      box(g, hull, 0.08, 0.16, 0.025, -0.2, s * 0.2, 0);
      cylX(g, hull, 0.05, 0.16, -0.22, s * 0.3, 0);
      cylX(g, m.glow('#8fd0ff'), 0.04, 0.01, -0.305, s * 0.3, 0);
    }
  },
  galactica(g, m, c) {
    const hull = m.hull(c);
    box(g, hull, 0.9, 0.12, 0.1, -0.03, 0, 0);
    box(g, hull, 0.26, 0.16, 0.11, 0.33, 0, 0.005);
    for (const s of [-1, 1]) box(g, hull, 0.46, 0.07, 0.05, 0.05, s * 0.125, -0.005);
    box(g, hull, 0.12, 0.06, 0.06, -0.12, 0, 0.08);
    for (const y of [-0.04, 0, 0.04]) for (const z of [-0.025, 0.025]) cylX(g, m.glow('#ffcf8a'), 0.018, 0.01, -0.485, y, z, 10);
  },
  eventhorizon(g, m, c) {
    const hull = m.hull(c);
    cylX(g, hull, 0.03, 0.9, 0, 0, 0, 12);
    box(g, hull, 0.16, 0.08, 0.08, 0.4, 0, 0);
    sphere(g, m.dark, 0.08, -0.18, 0, 0);
    const ring = torusZ(g, hull, 0.15, 0.014, -0.18, 0, 0);
    ring.rotation.y = Math.PI / 2;
    ring.userData.spin = 0.3;
    for (const [y, z] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) box(g, hull, 0.2, y ? 0.24 : 0.02, z ? 0.24 : 0.02, -0.38, y * 0.12, z * 0.12);
    for (let i = 0; i < 6; i++) sphere(g, m.glow('#ff3030'), 0.006, 0.3 - i * 0.12, 0.032, 0.02);
    cylX(g, m.glow('#9fc8ff'), 0.025, 0.01, -0.455, 0, 0);
  },
  tesla(g, m, c) {
    // Cherry-red Roadster with Starman in the driver's seat (left-hand drive).
    const paint = new THREE.MeshStandardMaterial({ color: c, roughness: 0.25, metalness: 0.6 });
    slab(g, paint, [[0.5, 0], [0.45, 0.2], [0.3, 0.23], [-0.42, 0.23], [-0.5, 0.17], [-0.5, -0.17], [-0.42, -0.23], [0.3, -0.23], [0.45, -0.2]], 0.1, 0.03, 0.03);
    for (const x of [0.3, -0.32]) for (const y of [-0.215, 0.215]) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.05, 20), m.dark);
      wheel.position.set(x, y, -0.03);
      g.add(wheel);
    }
    const shield = box(g, m.glass, 0.02, 0.38, 0.09, 0.12, 0, 0.13);
    shield.rotation.y = -0.6;
    for (const y of [-0.1, 0.1]) box(g, m.dark, 0.12, 0.11, 0.08, -0.06, y, 0.11);
    const suit = new THREE.MeshStandardMaterial({ color: '#f2f2f0', roughness: 0.6 });
    box(g, suit, 0.08, 0.09, 0.15, -0.07, 0.1, 0.2);
    sphere(g, suit, 0.045, -0.06, 0.1, 0.31);
    sphere(g, m.glass, 0.03, -0.035, 0.1, 0.31, 0.7, 1, 0.8);
    const arm = box(g, suit, 0.12, 0.025, 0.025, -0.02, 0.17, 0.2);
    arm.rotation.z = 0.3;
    box(g, m.dark, 0.06, 0.1, 0.02, -0.46, 0, 0.09);
  },
  hailmary(g, m, c) {
    const hull = m.hull(c);
    sphere(g, hull, 0.075, 0.42, 0, 0);
    box(g, m.glass, 0.01, 0.05, 0.02, 0.493, 0, 0.02);
    cylX(g, hull, 0.025, 0.85, 0, 0, 0, 10);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      cylX(g, hull, 0.055, 0.34, 0.07, 0.07 * Math.cos(a), 0.07 * Math.sin(a), 16);
    }
    box(g, m.dark, 0.1, 0.12, 0.12, -0.34, 0, 0);
    // Astrophage spin drive glows in the infrared: only a faint red is visible.
    cylX(g, m.glow('#7a1c12'), 0.05, 0.01, -0.395, 0, 0);
  },
  blipa(g, m, c) {
    // Rocky's xenonite ship: a five-fold symmetric hull, like an Eridian.
    const hull = new THREE.MeshStandardMaterial({ color: c, roughness: 0.85, metalness: 0.1 });
    sphere(g, hull, 0.16, 0, 0, 0, 1, 1, 0.7);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      const arm = box(g, hull, 0.3, 0.05, 0.05, 0.22 * Math.cos(a), 0.22 * Math.sin(a), 0);
      arm.rotation.z = a;
      sphere(g, hull, 0.07, 0.38 * Math.cos(a), 0.38 * Math.sin(a), 0, 1, 1, 0.8);
    }
    cylX(g, m.glow('#6b1a10'), 0.06, 0.01, -0.13, 0, 0);
  },
  marsattacks(g, m, c) {
    const hull = new THREE.MeshStandardMaterial({ color: c, roughness: 0.25, metalness: 0.85 });
    lathe(g, hull, [[0, 0.03], [0.2, 0.035], [0.46, 0.01], [0.5, 0], [0.46, -0.012], [0.15, -0.035], [0, -0.035]]);
    sphere(g, new THREE.MeshStandardMaterial({ color: '#7cffb2', roughness: 0.1, metalness: 0.2, transparent: true, opacity: 0.55 }), 0.13, 0, 0, 0.03, 1, 1, 0.75);
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2;
      sphere(g, m.glow(['#ff4d4d', '#ffd84d', '#4dff88'][i % 3]), 0.014, 0.47 * Math.cos(a), 0.47 * Math.sin(a), 0);
    }
    torusZ(g, m.glow('#9fe8ff'), 0.1, 0.012, 0, 0, -0.036);
  },
  district9(g, m, c) {
    const hull = m.hull(c);
    const disc = lathe(g, hull, [[0, 0.04], [0.3, 0.045], [0.42, 0.03], [0.45, 0], [0.4, -0.04], [0.1, -0.06], [0, -0.06]]);
    disc.scale.set(1, 0.92, 1);
    lathe(g, hull, [[0, 0.08], [0.12, 0.07], [0.18, 0.04], [0, 0.04]]);
    // Debris and service structures hanging from the underside.
    for (let i = 0; i < 26; i++) {
      const a = rand() * Math.PI * 2;
      const r = 0.05 + rand() * 0.35;
      const h = 0.03 + rand() * 0.12;
      box(g, m.dark, 0.02 + rand() * 0.03, 0.02 + rand() * 0.03, h, r * Math.cos(a), r * 0.92 * Math.sin(a), -0.05 - h / 2);
    }
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      sphere(g, m.glow('#ffb36b'), 0.008, 0.4 * Math.cos(a), 0.37 * Math.sin(a), -0.02);
    }
  },
  citydestroyer(g, m, c) {
    const hull = m.hull(c);
    lathe(g, hull, [[0, 0.03], [0.3, 0.028], [0.48, 0.01], [0.5, 0], [0.48, -0.008], [0.1, -0.012], [0, -0.03]]);
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const ridge = box(g, hull, 0.36, 0.025, 0.02, 0.27 * Math.cos(a), 0.27 * Math.sin(a), 0.03);
      ridge.rotation.z = a;
    }
    lathe(g, m.dark, [[0, -0.035], [0.05, -0.03], [0.07, -0.012], [0, -0.012]]);
    torusZ(g, m.glow('#bfe4ff'), 0.06, 0.006, 0, 0, -0.016);
    sphere(g, m.glow('#e6f6ff'), 0.012, 0, 0, -0.035);
  },
  arrival(g) {
    // The "shell": a tall, smooth, dark lens hovering upright (unit = height).
    const stone = new THREE.MeshStandardMaterial({ color: '#34373a', roughness: 0.95, metalness: 0.05 });
    sphere(g, stone, 0.5, 0, 0, 0, 0.18, 0.55, 1);
  },
  stargate(g, m, c) {
    const metal = new THREE.MeshStandardMaterial({ color: c, roughness: 0.5, metalness: 0.7 });
    torusZ(g, metal, 0.44, 0.06);
    torusZ(g, m.dark, 0.38, 0.018);
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + Math.PI / 2;
      const chev = box(g, m.glow('#ff8a2a'), 0.05, 0.08, 0.05, 0.5 * Math.cos(a), 0.5 * Math.sin(a), 0);
      chev.rotation.z = a;
    }
    // The event horizon ("puddle").
    const puddle = new THREE.Mesh(
      new THREE.CircleGeometry(0.38, 48),
      new THREE.MeshBasicMaterial({ color: new THREE.Color('#5aa9ff').multiplyScalar(1.3), transparent: true, opacity: 0.75, side: THREE.DoubleSide }),
    );
    g.add(puddle);
  },
  deathstar(g, m, c) {
    const hull = m.hull(c);
    sphere(g, hull, 0.5);
    torusZ(g, m.dark, 0.5, 0.01);
    // Superlaser dish in the northern hemisphere, facing forward.
    const dir = new THREE.Vector3(Math.cos(0.5), 0, Math.sin(0.5));
    const dish = new THREE.Mesh(new THREE.CircleGeometry(0.11, 40), m.dark);
    dish.position.copy(dir.clone().multiplyScalar(0.492));
    dish.lookAt(dir.clone().multiplyScalar(2));
    g.add(dish);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.008, 8, 40), hull);
    rim.position.copy(dish.position);
    rim.quaternion.copy(dish.quaternion);
    g.add(rim);
    sphere(g, m.glow('#7dff8a'), 0.012, ...dir.clone().multiplyScalar(0.5).toArray());
  },
  tie(g, m, c) {
    const hull = m.hull(c);
    sphere(g, hull, 0.2);
    const win = new THREE.Mesh(new THREE.CircleGeometry(0.1, 8), m.glass);
    win.position.set(0.199, 0, 0);
    win.rotation.y = Math.PI / 2;
    g.add(win);
    for (const s of [-1, 1]) {
      const pylon = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.06, 0.26, 12), hull);
      pylon.position.set(0, s * 0.3, 0);
      g.add(pylon);
      // Hexagonal solar wing in the XZ plane.
      const hex = new THREE.Shape();
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2 + Math.PI / 2;
        const px = 0.52 * Math.cos(a);
        const pz = 0.6 * Math.sin(a);
        if (k === 0) hex.moveTo(px, pz);
        else hex.lineTo(px, pz);
      }
      const wg = new THREE.ExtrudeGeometry(hex, { depth: 0.02, bevelEnabled: false });
      wg.translate(0, 0, -0.01);
      wg.rotateX(Math.PI / 2);
      add(g, wg, new THREE.MeshStandardMaterial({ color: '#1b1d21', roughness: 0.4, metalness: 0.6 }), 0, s * 0.44, 0);
      // Wing hub, axis along Y (default cylinder axis).
      add(g, new THREE.CylinderGeometry(0.08, 0.08, 0.03, 16), hull, 0, s * 0.43, 0);
      // Grey frame: six spokes from the hub and the hexagonal rim, on both faces of the wing.
      for (let k = 0; k < 6; k++) {
        const a0 = (k / 6) * Math.PI * 2 + Math.PI / 2;
        const a1 = ((k + 1) / 6) * Math.PI * 2 + Math.PI / 2;
        const v0 = new THREE.Vector3(0.52 * Math.cos(a0), 0, 0.6 * Math.sin(a0));
        const v1 = new THREE.Vector3(0.52 * Math.cos(a1), 0, 0.6 * Math.sin(a1));
        for (const face of [-1, 1]) {
          const y = s * 0.44 + face * 0.012;
          for (const [from, to] of [
            [new THREE.Vector3(), v0],
            [v0, v1],
          ]) {
            const len = from.distanceTo(to);
            const strut = box(g, hull, len, 0.006, 0.022, (from.x + to.x) / 2, y, (from.z + to.z) / 2);
            strut.rotation.y = -Math.atan2(to.z - from.z, to.x - from.x);
          }
        }
      }
    }
  },
  tardis(g, m) {
    const tex = textures().tardis;
    const side = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6, metalness: 0.05, emissive: new THREE.Color('#203060'), emissiveIntensity: 0.15 });
    const blue = new THREE.MeshStandardMaterial({ color: '#123a8c', roughness: 0.6 });
    // Built with height along Y so every wall maps its texture upright, then rotated to Z-up.
    const bodyGeo = new THREE.BoxGeometry(0.48, 0.82, 0.48);
    bodyGeo.rotateX(Math.PI / 2);
    const body = new THREE.Mesh(bodyGeo, [side, side, blue, blue, side, side]);
    body.position.z = 0.41;
    g.add(body);
    box(g, blue, 0.52, 0.52, 0.04, 0, 0, 0.84);
    box(g, blue, 0.44, 0.44, 0.06, 0, 0, 0.89);
    cylZ(g, m.glow('#eaf4ff'), 0.03, 0.08, 0, 0, 0.96, 12);
    box(g, blue, 0.54, 0.54, 0.03, 0, 0, 0.015);
    // Centre it on its own middle so it orbits around the box's centre.
    g.children.forEach((ch) => (ch.position.z -= 0.5));
  },
};

/** Build a fresh model group for a catalogue ship (unit length). */
export function createShipModel(modelId: string | undefined): THREE.Group {
  const g = new THREE.Group();
  const model = shipById(modelId);
  rnd = 7 + (model?.id.length ?? 0) * 131;
  const builder = BUILDERS[model?.id ?? ''] ?? BUILDERS.rocinante;
  builder(g, mats(model?.length ?? 100), model?.color ?? '#cbd5e1');
  return g;
}

/** Advance spinning parts (Endurance ring, Event Horizon drive). */
export function animateShip(g: THREE.Object3D, dt: number) {
  g.traverse((o) => {
    if (o.userData.spin) {
      if (o.userData.spin && o.type === 'Group') o.rotation.z += o.userData.spin * dt;
      else o.rotation.x += o.userData.spin * dt;
    }
  });
}

const _f = new THREE.Vector3();
const _l = new THREE.Vector3();
const _u = new THREE.Vector3();
const _m = new THREE.Matrix4();

/** Orient a model (local +X forward, +Z up) along a direction in simulation coordinates. */
export function orientShip(g: THREE.Object3D, fx: number, fy: number, fz: number) {
  _f.set(fx, fy, fz);
  if (_f.lengthSq() < 1e-30) _f.set(1, 0, 0);
  _f.normalize();
  _u.set(0, 0, 1);
  if (Math.abs(_f.dot(_u)) > 0.98) _u.set(0, 1, 0);
  _l.crossVectors(_u, _f).normalize();
  _u.crossVectors(_f, _l);
  _m.makeBasis(_f, _l, _u);
  g.quaternion.setFromRotationMatrix(_m);
}

/** A ship model wrapped for Y-up scenes (curvature and field views), where sim (x, y, z) maps to (x, z, -y). */
export interface YUpShip {
  root: THREE.Group;
  model: THREE.Group;
}

export function createYUpShip(modelId: string | undefined): YUpShip {
  const root = new THREE.Group();
  root.rotation.x = -Math.PI / 2;
  const model = createShipModel(modelId);
  root.add(model);
  return { root, model };
}

/** Place a Y-up ship at view position (x, y, z) in sim-axis order, scaled to `size`, facing its velocity. */
export function updateYUpShip(s: YUpShip, x: number, y: number, z: number, size: number, vx: number, vy: number, vz: number, dt: number) {
  s.root.position.set(x, z, -y);
  s.model.scale.setScalar(size);
  orientShip(s.model, vx, vy, vz);
  animateShip(s.model, dt);
}

export function disposeYUpShip(s: YUpShip) {
  s.root.removeFromParent();
  s.root.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
}
