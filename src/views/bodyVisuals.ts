import * as THREE from 'three';
import { planetById, planetSpin, type PlanetModel } from '../engine/planets';
import { threeTexture } from './planetTextures';

let glowTex: THREE.CanvasTexture | null = null;

/** Soft radial glow used for stellar haloes. */
function glowTexture(): THREE.CanvasTexture {
  if (glowTex) return glowTex;
  const cv = document.createElement('canvas');
  cv.width = cv.height = 128;
  const c = cv.getContext('2d')!;
  const g = c.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.18, 'rgba(255,255,255,0.75)');
  g.addColorStop(0.4, 'rgba(255,255,255,0.22)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = g;
  c.fillRect(0, 0, 128, 128);
  glowTex = new THREE.CanvasTexture(cv);
  return glowTex;
}

/** Additive halo sprite for a star (scale it to a few stellar radii). */
export function createStarGlow(): THREE.Sprite {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  s.renderOrder = 5;
  return s;
}

const SPHERE = new THREE.SphereGeometry(1, 48, 24);

/** Ring geometry whose u coordinate runs from the inner to the outer edge (for the ring texture). */
function ringGeometry(inner: number, outer: number): THREE.BufferGeometry {
  const g = new THREE.RingGeometry(inner, outer, 96, 1);
  const pos = g.attributes.position as THREE.BufferAttribute;
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const r = Math.hypot(pos.getX(i), pos.getY(i));
    uv.setXY(i, (r - inner) / (outer - inner), 0.5);
  }
  g.rotateX(-Math.PI / 2); // into the XZ plane (Y-up scenes)
  return g;
}

/**
 * Textured planet for the Y-up views: unit-radius group (scale it to the planet radius).
 * Earth gets a cloud layer, Saturn its rings.
 */
export function createPlanetGroup(model: PlanetModel): THREE.Group {
  const g = new THREE.Group();
  const surface = new THREE.Mesh(SPHERE, new THREE.MeshStandardMaterial({ map: threeTexture(model.texture), roughness: 0.9, metalness: 0 }));
  surface.name = 'surface';
  g.add(surface);
  if (model.earth) {
    const clouds = new THREE.Mesh(
      SPHERE,
      new THREE.MeshStandardMaterial({ color: 0xffffff, alphaMap: threeTexture('earth_clouds'), transparent: true, depthWrite: false, roughness: 1 }),
    );
    clouds.scale.setScalar(1.012);
    clouds.name = 'clouds';
    g.add(clouds);
  }
  if (model.ring) {
    const tex = threeTexture('saturn_ring_alpha');
    const ring = new THREE.Mesh(
      ringGeometry(model.ring[0], model.ring[1]),
      // The ring PNG carries colour in RGB and opacity in its alpha channel.
      new THREE.MeshStandardMaterial({ map: tex, transparent: true, side: THREE.DoubleSide, depthWrite: false, roughness: 1 }),
    );
    ring.name = 'ring';
    g.add(ring);
  }
  return g;
}

const _qt = new THREE.Quaternion();
const _qs = new THREE.Quaternion();
const X = new THREE.Vector3(1, 0, 0);
const Y = new THREE.Vector3(0, 1, 0);

/** Apply axial tilt and spin (Y-up: the pole is +Y before tilting). */
export function orientPlanetGroup(g: THREE.Group, modelId: string | undefined, simTime: number, warp: number, wall: number, phase = 0) {
  const m = planetById(modelId);
  if (!m) return;
  const spin = planetSpin(m, simTime, warp, wall, phase);
  // Negative angle about X tilts the pole towards ecliptic longitude 90° (sim +y = three -z).
  _qt.setFromAxisAngle(X, (-m.tilt * Math.PI) / 180);
  _qs.setFromAxisAngle(Y, spin);
  g.quaternion.copy(_qt).multiply(_qs);
  const clouds = g.getObjectByName('clouds');
  if (clouds) clouds.rotation.y = wall * 0.01;
}

export function disposePlanetGroup(g: THREE.Group) {
  g.removeFromParent();
  g.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    (mesh.material as THREE.Material).dispose();
    if (mesh.geometry !== SPHERE) mesh.geometry.dispose();
  });
}
