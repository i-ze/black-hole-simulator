import { shipById } from '../engine/ships';

/**
 * Top-view silhouettes of the catalogue ships for the 2D map and the ship picker.
 * Drawn in normalised units: x forward in [-0.5, 0.5] (1 = ship length), y to the left.
 * Shapes match the 3D models in shipModels.ts.
 */

type Ctx = CanvasRenderingContext2D;

interface Pal {
  hull: string;
  edge: string;
  dark: string;
}

const rect = (c: Ctx, x0: number, y0: number, x1: number, y1: number) => c.rect(x0, y0, x1 - x0, y1 - y0);
const ell = (c: Ctx, x: number, y: number, rx: number, ry: number, rot = 0) => {
  c.moveTo(x + rx * Math.cos(rot), y + rx * Math.sin(rot));
  c.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
};
const polyPath = (c: Ctx, pts: number[][]) => {
  c.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]);
  c.closePath();
};

function fill(c: Ctx, color: string, path: (c: Ctx) => void, edge?: string) {
  c.beginPath();
  path(c);
  c.fillStyle = color;
  c.fill();
  if (edge) {
    c.strokeStyle = edge;
    c.stroke();
  }
}

function glow(c: Ctx, color: string, path: (c: Ctx) => void, blur: number) {
  c.save();
  c.shadowColor = color;
  c.shadowBlur = blur;
  fill(c, color, path);
  c.restore();
}

type Painter = (c: Ctx, p: Pal, blur: number) => void;

const PAINTERS: Record<string, Painter> = {
  enterprise(c, p, b) {
    for (const s of [-1, 1]) {
      fill(c, p.hull, (c) => polyPath(c, [[-0.36, s * 0.05], [-0.3, s * 0.05], [-0.22, s * 0.24], [-0.3, s * 0.24]]), p.edge);
      fill(c, p.hull, (c) => rect(c, -0.53, s * 0.225, -0.01, s * 0.295), p.edge);
      glow(c, '#6fb8ff', (c) => rect(c, -0.49, s * 0.22, -0.06, s * 0.232), b);
      glow(c, '#ff5a4f', (c) => ell(c, -0.01, s * 0.26, 0.03, 0.034), b);
    }
    fill(c, p.hull, (c) => ell(c, -0.2, 0, 0.23, 0.068), p.edge);
    fill(c, p.hull, (c) => ell(c, 0.14, 0, 0.365, 0.365), p.edge);
    fill(c, p.dark, (c) => ell(c, 0.14, 0, 0.3, 0.3));
    fill(c, p.hull, (c) => ell(c, 0.14, 0, 0.285, 0.285));
    fill(c, '#1e293b', (c) => ell(c, 0.14, 0, 0.035, 0.035));
    glow(c, '#ff9a3c', (c) => rect(c, -0.235, -0.06, -0.215, 0.06), b);
  },
  borgcube(c, _p, b) {
    fill(c, '#202426', (c) => rect(c, -0.5, -0.5, 0.5, 0.5), '#0b0d0e');
    c.save();
    c.shadowColor = '#3dff7a';
    c.shadowBlur = b;
    c.strokeStyle = '#3dff7a';
    for (let i = 0; i < 9; i++) {
      const y = -0.42 + i * 0.1;
      c.beginPath();
      c.moveTo(-0.45 + (i % 3) * 0.1, y);
      c.lineTo(0.2 + (i % 4) * 0.08, y);
      c.lineTo(0.2 + (i % 4) * 0.08, y + 0.05);
      c.stroke();
    }
    c.restore();
  },
  falcon(c, p, b) {
    glow(c, '#7cc6ff', (c) => c.arc(-0.08, 0, 0.385, Math.PI - 0.85, Math.PI + 0.85), b);
    fill(c, p.hull, (c) => ell(c, -0.08, 0, 0.375, 0.375), p.edge);
    for (const s of [-1, 1]) fill(c, p.hull, (c) => rect(c, 0.15, s * 0.05, 0.49, s * 0.17), p.edge);
    fill(c, p.hull, (c) => rect(c, 0.0, -0.34, 0.27, -0.28), p.edge);
    fill(c, p.hull, (c) => ell(c, 0.27, -0.37, 0.05, 0.045), p.edge);
    fill(c, '#1e293b', (c) => ell(c, 0.3, -0.37, 0.02, 0.03));
    fill(c, p.dark, (c) => ell(c, -0.08, 0, 0.09, 0.09));
    fill(c, p.hull, (c) => ell(c, -0.02, 0.17, 0.06, 0.06), p.edge);
  },
  stardestroyer(c, p, b) {
    fill(c, p.hull, (c) => polyPath(c, [[0.5, 0], [-0.5, 0.28], [-0.5, -0.28]]), p.edge);
    c.beginPath();
    c.moveTo(0.5, 0);
    c.lineTo(-0.5, 0);
    c.strokeStyle = p.edge;
    c.stroke();
    fill(c, p.hull, (c) => rect(c, -0.48, -0.1, -0.2, 0.1), p.edge);
    fill(c, p.hull, (c) => rect(c, -0.47, -0.06, -0.33, 0.06), p.edge);
    fill(c, p.dark, (c) => rect(c, -0.44, -0.08, -0.4, 0.08));
    for (const y of [-0.08, 0, 0.08]) glow(c, '#8fd0ff', (c) => ell(c, -0.5, y, 0.012, 0.03), b);
  },
  endurance(c, p) {
    c.strokeStyle = p.dark;
    c.lineWidth *= 2;
    c.beginPath();
    c.arc(0, 0, 0.42, 0, Math.PI * 2);
    c.stroke();
    c.lineWidth /= 2;
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 12;
      c.beginPath();
      c.moveTo(0, 0);
      c.lineTo(0.42 * Math.cos(a), 0.42 * Math.sin(a));
      c.stroke();
    }
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      c.save();
      c.translate(0.42 * Math.cos(a), 0.42 * Math.sin(a));
      c.rotate(a);
      fill(c, p.hull, (c) => rect(c, -0.05, -0.085, 0.05, 0.085), p.edge);
      c.restore();
    }
    fill(c, p.hull, (c) => ell(c, 0, 0, 0.07, 0.07), p.edge);
  },
  ranger(c, p, b) {
    for (const s of [-1, 1]) glow(c, '#9fd4ff', (c) => ell(c, -0.5, s * 0.12, 0.015, 0.03), b);
    fill(c, p.hull, (c) => polyPath(c, [[0.5, 0], [0.1, 0.17], [-0.5, 0.27], [-0.5, -0.27], [0.1, -0.17]]), p.edge);
    fill(c, '#1e293b', (c) => rect(c, 0.09, -0.06, 0.21, 0.06));
  },
  sanctuary(c, p, b) {
    for (const s of [-1, 1])
      for (const k of [0.12, 0.3]) {
        const a = s * (k + 0.1);
        fill(c, p.hull, (c) => polyPath(c, [[0.17, s * k - 0.05], [0.17 + 0.42 * Math.cos(a), s * k + 0.42 * Math.sin(a)], [0.17, s * k + 0.05]]), p.edge);
      }
    c.lineWidth *= 6;
    c.strokeStyle = p.hull;
    c.beginPath();
    c.arc(0, 0, 0.4, Math.PI * 0.2, Math.PI * 1.8);
    c.stroke();
    c.lineWidth /= 6;
    fill(c, p.hull, (c) => ell(c, 0, 0, 0.3, 0.3), p.edge);
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      glow(c, '#ff8a3d', (c) => ell(c, 0.25 * Math.cos(a), 0.25 * Math.sin(a), 0.014, 0.014), b);
    }
  },
  darkaster(c, p, b) {
    fill(c, p.hull, (c) => rect(c, -0.47, -0.04, 0.35, 0.04), p.edge);
    fill(c, p.hull, (c) => polyPath(c, [[0.24, 0], [0.3, -0.03], [0.48, -0.025], [0.48, 0.025], [0.3, 0.03]]), p.edge);
    fill(c, p.hull, (c) => rect(c, -0.5, -0.1, -0.34, 0.1), p.edge);
    glow(c, '#ff4040', (c) => rect(c, -0.35, 0.038, 0.25, 0.046), b);
    for (const y of [-0.06, 0.06]) glow(c, '#ff3b3b', (c) => ell(c, -0.5, y, 0.012, 0.025), b);
  },
  discovery(c, p, b) {
    fill(c, p.hull, (c) => rect(c, -0.32, -0.012, 0.38, 0.012), p.edge);
    for (let i = 0; i < 6; i++) fill(c, p.hull, (c) => rect(c, 0.285 - i * 0.1, -0.015, 0.315 - i * 0.1, 0.015), p.edge);
    fill(c, p.hull, (c) => rect(c, -0.46, -0.035, -0.32, 0.035), p.edge);
    fill(c, p.hull, (c) => ell(c, 0.43, 0, 0.06, 0.06), p.edge);
    glow(c, '#ffe7b0', (c) => rect(c, 0.47, -0.02, 0.485, 0.02), b);
    glow(c, '#9ec9ff', (c) => rect(c, -0.47, -0.03, -0.46, 0.03), b);
  },
  nostromo(c, p, b) {
    for (const y of [-0.1, 0, 0.1]) glow(c, '#ffb36b', (c) => ell(c, -0.49, y, 0.015, 0.05), b);
    fill(c, p.hull, (c) => rect(c, -0.48, -0.18, -0.18, 0.18), p.edge);
    fill(c, p.hull, (c) => rect(c, -0.175, -0.14, 0.375, 0.14), p.edge);
    fill(c, p.hull, (c) => rect(c, 0.35, -0.09, 0.51, 0.09), p.edge);
    for (const s of [-1, 1]) fill(c, p.dark, (c) => rect(c, -0.05, s * 0.135, 0.15, s * 0.185));
    fill(c, '#1e293b', (c) => rect(c, 0.49, -0.07, 0.51, 0.07));
  },
  rocinante(c, p, b) {
    glow(c, '#a7d6ff', (c) => ell(c, -0.46, 0, 0.012, 0.05), b);
    fill(c, p.hull, (c) => polyPath(c, [[0.51, 0], [0.31, 0.087], [-0.31, 0.087], [-0.45, 0.052], [-0.45, -0.052], [-0.31, -0.087], [0.31, -0.087]]), p.edge);
    for (const s of [-1, 1]) fill(c, p.hull, (c) => rect(c, -0.24, s * 0.08, -0.06, s * 0.15), p.edge);
    fill(c, p.dark, (c) => rect(c, -0.2, -0.015, 0.3, 0.015));
    glow(c, '#ff4b4b', (c) => rect(c, 0.0, 0.07, 0.2, 0.08), b * 0.5);
  },
  serenity(c, p, b) {
    for (const s of [-1, 1]) {
      fill(c, p.hull, (c) => rect(c, -0.24, s * 0.12, -0.16, s * 0.28), p.edge);
      fill(c, p.hull, (c) => rect(c, -0.3, s * 0.25, -0.14, s * 0.35), p.edge);
      glow(c, '#8fd0ff', (c) => ell(c, -0.3, s * 0.3, 0.012, 0.04), b);
    }
    glow(c, '#ffb36b', (c) => ell(c, -0.34, 0, 0.02, 0.075), b);
    fill(c, p.hull, (c) => ell(c, -0.06, 0, 0.28, 0.17), p.edge);
    fill(c, p.hull, (c) => rect(c, 0.12, -0.035, 0.36, 0.035), p.edge);
    fill(c, p.hull, (c) => ell(c, 0.4, 0, 0.096, 0.08), p.edge);
    fill(c, '#1e293b', (c) => rect(c, 0.46, -0.04, 0.49, 0.04));
  },
  galactica(c, p, b) {
    for (const y of [-0.04, 0, 0.04]) glow(c, '#ffcf8a', (c) => ell(c, -0.485, y, 0.01, 0.018), b);
    for (const s of [-1, 1]) fill(c, p.hull, (c) => rect(c, -0.18, s * 0.09, 0.28, s * 0.16), p.edge);
    fill(c, p.hull, (c) => rect(c, -0.48, -0.06, 0.2, 0.06), p.edge);
    fill(c, p.hull, (c) => polyPath(c, [[0.2, -0.08], [0.46, -0.07], [0.46, 0.07], [0.2, 0.08]]), p.edge);
    fill(c, p.dark, (c) => rect(c, -0.18, -0.03, -0.06, 0.03));
  },
  eventhorizon(c, p, b) {
    fill(c, p.hull, (c) => rect(c, -0.45, -0.03, 0.45, 0.03), p.edge);
    fill(c, p.hull, (c) => rect(c, -0.48, -0.24, -0.28, 0.24), p.edge);
    fill(c, p.hull, (c) => rect(c, -0.195, -0.15, -0.165, 0.15), p.edge);
    fill(c, p.dark, (c) => ell(c, -0.18, 0, 0.08, 0.08), p.edge);
    fill(c, p.hull, (c) => rect(c, 0.32, -0.04, 0.48, 0.04), p.edge);
    for (let i = 0; i < 6; i++) glow(c, '#ff3030', (c) => ell(c, 0.3 - i * 0.12, 0.032, 0.008, 0.008), b * 0.5);
    glow(c, '#9fc8ff', (c) => ell(c, -0.455, 0, 0.01, 0.025), b);
  },
  tesla(c, p, b) {
    fill(c, p.hull, (c) => polyPath(c, [[0.5, 0], [0.45, 0.2], [0.3, 0.23], [-0.42, 0.23], [-0.5, 0.17], [-0.5, -0.17], [-0.42, -0.23], [0.3, -0.23], [0.45, -0.2]]), p.edge);
    fill(c, '#1e293b', (c) => polyPath(c, [[0.16, 0.19], [0.06, 0.18], [0.06, -0.18], [0.16, -0.19]]));
    for (const y of [-0.1, 0.1]) fill(c, p.dark, (c) => rect(c, -0.12, y - 0.055, 0.0, y + 0.055));
    fill(c, '#f2f2f0', (c) => ell(c, -0.06, 0.1, 0.05, 0.05), '#9ca3af');
    fill(c, '#0b1220', (c) => ell(c, -0.035, 0.1, 0.02, 0.03));
    glow(c, '#ff3b3b', (c) => rect(c, -0.505, -0.17, -0.49, -0.1), b * 0.5);
    glow(c, '#ff3b3b', (c) => rect(c, -0.505, 0.1, -0.49, 0.17), b * 0.5);
  },
  hailmary(c, p, b) {
    glow(c, '#7a1c12', (c) => ell(c, -0.4, 0, 0.012, 0.05), b);
    fill(c, p.hull, (c) => rect(c, -0.42, -0.025, 0.4, 0.025), p.edge);
    for (const y of [-0.07, 0.07]) fill(c, p.hull, (c) => rect(c, -0.1, y - 0.055, 0.24, y + 0.055), p.edge);
    fill(c, p.dark, (c) => rect(c, -0.39, -0.06, -0.29, 0.06));
    fill(c, p.hull, (c) => ell(c, 0.42, 0, 0.075, 0.075), p.edge);
  },
  blipa(c, p, b) {
    glow(c, '#6b1a10', (c) => ell(c, -0.13, 0, 0.012, 0.05), b);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      c.save();
      c.rotate(a);
      fill(c, p.hull, (c) => rect(c, 0.07, -0.025, 0.37, 0.025), p.edge);
      fill(c, p.hull, (c) => ell(c, 0.38, 0, 0.07, 0.07), p.edge);
      c.restore();
    }
    fill(c, p.hull, (c) => ell(c, 0, 0, 0.16, 0.16), p.edge);
  },
  marsattacks(c, p, b) {
    fill(c, p.hull, (c) => ell(c, 0, 0, 0.5, 0.5), p.edge);
    fill(c, shadeHex(p.hull, 0.8), (c) => ell(c, 0, 0, 0.3, 0.3));
    fill(c, '#7cffb2', (c) => ell(c, 0, 0, 0.13, 0.13), '#2f9e6a');
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2;
      glow(c, ['#ff4d4d', '#ffd84d', '#4dff88'][i % 3], (c) => ell(c, 0.47 * Math.cos(a), 0.47 * Math.sin(a), 0.014, 0.014), b * 0.6);
    }
  },
  district9(c, p, b) {
    fill(c, p.hull, (c) => ell(c, 0, 0, 0.45, 0.414), p.edge);
    fill(c, shadeHex(p.hull, 0.85), (c) => ell(c, 0, 0, 0.3, 0.276), p.edge);
    fill(c, shadeHex(p.hull, 1.1), (c) => ell(c, 0, 0, 0.18, 0.18), p.edge);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      glow(c, '#ffb36b', (c) => ell(c, 0.4 * Math.cos(a), 0.37 * Math.sin(a), 0.008, 0.008), b * 0.5);
    }
  },
  citydestroyer(c, p, b) {
    fill(c, p.hull, (c) => ell(c, 0, 0, 0.5, 0.5), p.edge);
    c.strokeStyle = p.edge;
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      c.save();
      c.rotate(a);
      fill(c, shadeHex(p.hull, 1.25), (c) => rect(c, 0.09, -0.0125, 0.45, 0.0125));
      c.restore();
    }
    fill(c, p.dark, (c) => ell(c, 0, 0, 0.07, 0.07));
    glow(c, '#bfe4ff', (c) => ell(c, 0, 0, 0.025, 0.025), b);
  },
  arrival(c, p) {
    fill(c, p.hull, (c) => ell(c, 0, 0, 0.09, 0.275), '#1a1c1e');
  },
  stargate(c, p, b) {
    glow(c, '#5aa9ff', (c) => ell(c, 0, 0, 0.38, 0.38), b);
    c.lineWidth *= 9;
    c.strokeStyle = p.hull;
    c.beginPath();
    c.arc(0, 0, 0.44, 0, Math.PI * 2);
    c.stroke();
    c.lineWidth /= 9;
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + Math.PI / 2;
      glow(c, '#ff8a2a', (c) => ell(c, 0.5 * Math.cos(a), 0.5 * Math.sin(a), 0.03, 0.03), b);
    }
  },
  deathstar(c, p) {
    fill(c, p.hull, (c) => ell(c, 0, 0, 0.5, 0.5), p.edge);
    c.strokeStyle = shadeHex(p.hull, 0.7);
    for (const r of [0.15, 0.3, 0.42]) {
      c.beginPath();
      c.arc(0, 0, r, 0, Math.PI * 2);
      c.stroke();
    }
    fill(c, p.dark, (c) => ell(c, 0.25, 0, 0.1, 0.11), p.edge);
    fill(c, shadeHex(p.dark, 1.4), (c) => ell(c, 0.25, 0, 0.03, 0.03));
  },
  tie(c, p) {
    for (const s of [-1, 1]) {
      fill(c, p.hull, (c) => rect(c, -0.04, s * 0.17, 0.04, s * 0.43), p.edge);
      fill(c, '#1b1d21', (c) => rect(c, -0.52, s * 0.43, 0.52, s * 0.45), p.hull);
    }
    fill(c, p.hull, (c) => ell(c, 0, 0, 0.2, 0.2), p.edge);
    fill(c, '#0b1220', (c) => ell(c, 0.13, 0, 0.05, 0.08));
  },
  tardis(c, _p, b) {
    fill(c, '#123a8c', (c) => rect(c, -0.27, -0.27, 0.27, 0.27), '#0a2a6a');
    fill(c, '#0f3380', (c) => rect(c, -0.22, -0.22, 0.22, 0.22), '#0a2a6a');
    glow(c, '#eaf4ff', (c) => ell(c, 0, 0, 0.04, 0.04), b);
  },
};

function shadeHex(color: string, f: number): string {
  return color.startsWith('#') ? shade(color, f) : color;
}

function shade(hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v: number) => Math.max(0, Math.min(255, Math.round(v * f)));
  return `rgb(${ch((n >> 16) & 255)},${ch((n >> 8) & 255)},${ch(n & 255)})`;
}

/**
 * Draw a ship centred at (cx, cy) in canvas pixels, pointing along `heading`
 * (radians, measured counter-clockwise like the simulation), `lengthPx` long.
 */
export function drawShipTopView(c: Ctx, modelId: string | undefined, cx: number, cy: number, heading: number, lengthPx: number) {
  const model = shipById(modelId);
  const painter = PAINTERS[model?.id ?? ''] ?? PAINTERS.rocinante;
  const color = model?.color ?? '#cbd5e1';
  c.save();
  c.translate(cx, cy);
  c.rotate(-heading);
  c.scale(lengthPx, -lengthPx);
  c.lineWidth = 0.8 / lengthPx;
  c.lineJoin = 'round';
  painter(c, { hull: color, edge: shade(color, 0.45), dark: '#2a2e35' }, Math.min(12, lengthPx * 0.08));
  c.restore();
}
