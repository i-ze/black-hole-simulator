import * as THREE from 'three';
import type { PlanetModel, PlanetTexture } from '../engine/planets';

/**
 * Lazily loaded planet textures (Solar System Scope, CC BY 4.0, based on NASA data).
 * Shared by the ray tracer, the Three.js views and the 2D map.
 */

const url = (key: PlanetTexture) => `${import.meta.env.BASE_URL}textures/planets/${key}.${key === 'saturn_ring_alpha' ? 'png' : 'jpg'}`;

const images = new Map<PlanetTexture, HTMLImageElement>();
const pixels = new Map<PlanetTexture, ImageData>();
const textures = new Map<PlanetTexture, THREE.Texture>();
const listeners = new Set<() => void>();

/** Subscribe to "a texture finished loading" (to redraw icons). */
export function onTextureLoad(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function image(key: PlanetTexture): HTMLImageElement | null {
  let img = images.get(key);
  if (!img) {
    img = new Image();
    img.decoding = 'async';
    img.onload = () => listeners.forEach((l) => l());
    img.src = url(key);
    images.set(key, img);
  }
  return img.complete && img.naturalWidth > 0 ? img : null;
}

/** Pixel data for CPU sampling (2D globes), or null while loading. */
export function texturePixels(key: PlanetTexture): ImageData | null {
  const cached = pixels.get(key);
  if (cached) return cached;
  const img = image(key);
  if (!img) return null;
  const cv = document.createElement('canvas');
  cv.width = img.naturalWidth;
  cv.height = img.naturalHeight;
  const c = cv.getContext('2d', { willReadFrequently: true })!;
  c.drawImage(img, 0, 0);
  const data = c.getImageData(0, 0, cv.width, cv.height);
  pixels.set(key, data);
  return data;
}

/** Three.js texture (starts empty, fills in when loaded). */
export function threeTexture(key: PlanetTexture): THREE.Texture {
  let t = textures.get(key);
  if (!t) {
    t = new THREE.TextureLoader().load(url(key), () => listeners.forEach((l) => l()));
    t.colorSpace = key === 'earth_clouds' || key === 'saturn_ring_alpha' ? THREE.NoColorSpace : THREE.SRGBColorSpace;
    t.wrapS = THREE.RepeatWrapping;
    t.anisotropy = 4;
    textures.set(key, t);
  }
  return t;
}

export function textureReady(key: PlanetTexture): boolean {
  const t = threeTexture(key);
  return !!(t.image && (t.image as HTMLImageElement).width);
}

const globes = new Map<string, HTMLCanvasElement>();

/**
 * Orthographic globe (seen from the equatorial plane, rotated by the axial tilt) as a canvas,
 * or null while the texture loads. Cached per planet, size and spin step.
 */
export function renderGlobe(p: PlanetModel, size: number, spin: number): HTMLCanvasElement | null {
  const px = Math.min(256, Math.max(16, 2 ** Math.ceil(Math.log2(size))));
  const step = Math.round((((spin % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) / (Math.PI / 48)) % 96;
  const key = `${p.id}:${px}:${step}`;
  const hit = globes.get(key);
  if (hit) return hit;
  const tex = texturePixels(p.texture);
  if (!tex) return null;
  const clouds = p.earth ? texturePixels('earth_clouds') : null;
  const cv = document.createElement('canvas');
  cv.width = cv.height = px;
  const c = cv.getContext('2d')!;
  const out = c.createImageData(px, px);
  const tilt = (p.tilt * Math.PI) / 180;
  const ct = Math.cos(tilt);
  const st = Math.sin(tilt);
  const sp = (step * Math.PI) / 48;
  for (let j = 0; j < px; j++) {
    for (let i = 0; i < px; i++) {
      const x = ((i + 0.5) / px) * 2 - 1;
      const y = 1 - ((j + 0.5) / px) * 2;
      const r2 = x * x + y * y;
      if (r2 > 1) continue;
      const z = Math.sqrt(1 - r2);
      // Undo the axial tilt (a roll in the image plane), then read latitude/longitude.
      const X = x * ct + y * st;
      const Y = -x * st + y * ct;
      const lat = Math.asin(Y);
      const lon = Math.atan2(X, z) + sp;
      let u = lon / (2 * Math.PI) + 0.5;
      u -= Math.floor(u);
      const v = 0.5 - lat / Math.PI;
      const tx = Math.min(tex.width - 1, Math.floor(u * tex.width));
      const ty = Math.min(tex.height - 1, Math.floor(v * tex.height));
      const k = (ty * tex.width + tx) * 4;
      let rr = tex.data[k];
      let gg = tex.data[k + 1];
      let bb = tex.data[k + 2];
      if (clouds) {
        const cx = Math.min(clouds.width - 1, Math.floor(u * clouds.width));
        const cy = Math.min(clouds.height - 1, Math.floor(v * clouds.height));
        const a = clouds.data[(cy * clouds.width + cx) * 4] / 255;
        rr += (255 - rr) * a * 0.9;
        gg += (255 - gg) * a * 0.9;
        bb += (255 - bb) * a * 0.9;
      }
      const o = (j * px + i) * 4;
      out.data[o] = rr;
      out.data[o + 1] = gg;
      out.data[o + 2] = bb;
      // Soft anti-aliased edge.
      out.data[o + 3] = Math.min(255, (1 - Math.sqrt(r2)) * px * 255);
    }
  }
  c.putImageData(out, 0, 0);
  if (globes.size > 400) globes.clear();
  globes.set(key, cv);
  return cv;
}

/** Radial colour stops of Saturn's rings sampled from the ring texture (inner -> outer). */
export function ringStops(): { t: number; color: string }[] | null {
  const ring = texturePixels('saturn_ring_alpha');
  if (!ring) return null;
  const stops: { t: number; color: string }[] = [];
  const y = Math.floor(ring.height / 2);
  for (let k = 0; k <= 32; k++) {
    const x = Math.min(ring.width - 1, Math.floor((k / 32) * ring.width));
    const o = (y * ring.width + x) * 4;
    stops.push({ t: k / 32, color: `rgba(${ring.data[o]},${ring.data[o + 1]},${ring.data[o + 2]},${(ring.data[o + 3] / 255).toFixed(3)})` });
  }
  return stops;
}
