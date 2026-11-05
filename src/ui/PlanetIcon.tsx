import { useEffect, useRef, useState } from 'react';
import { planetById } from '../engine/planets';
import { onTextureLoad, renderGlobe } from '../views/planetTextures';

/** Small textured globe of a Solar System body (falls back to its colour while loading). */
export function PlanetIcon({ id, size = 20 }: { id: string; size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [, setLoaded] = useState(0);
  useEffect(() => onTextureLoad(() => setLoaded((n) => n + 1)), []);
  const p = planetById(id);
  useEffect(() => {
    const cv = ref.current;
    if (!cv || !p) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = cv.height = size * dpr;
    const c = cv.getContext('2d')!;
    c.clearRect(0, 0, cv.width, cv.height);
    const r = cv.width / 2;
    const ringed = !!p.ring;
    const body = ringed ? r * 0.55 : r * 0.92;
    if (ringed) {
      c.strokeStyle = 'rgba(214,196,160,0.75)';
      c.lineWidth = r * 0.12;
      c.beginPath();
      c.ellipse(r, r, r * 0.95, r * 0.32, -0.35, 0, Math.PI * 2);
      c.stroke();
    }
    const globe = renderGlobe(p, body * 2, 0.6);
    if (globe) c.drawImage(globe, r - body, r - body, body * 2, body * 2);
    else {
      c.fillStyle = p.color;
      c.beginPath();
      c.arc(r, r, body, 0, Math.PI * 2);
      c.fill();
    }
    // Gentle terminator for a 3D look.
    const g = c.createLinearGradient(r - body, r - body, r + body, r + body);
    g.addColorStop(0.45, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.65)');
    c.fillStyle = g;
    c.beginPath();
    c.arc(r, r, body, 0, Math.PI * 2);
    c.fill();
  });
  return <canvas ref={ref} style={{ width: size, height: size }} className="shrink-0" />;
}
