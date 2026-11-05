import { useEffect, useRef } from 'react';
import { drawShipTopView } from '../views/shipSilhouettes';

/** Small top-view drawing of a catalogue ship, pointing right. */
export function ShipIcon({ id, beam }: { id: string; beam: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current!;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = 40;
    const h = 22;
    cv.width = w * dpr;
    cv.height = h * dpr;
    const c = cv.getContext('2d')!;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, w, h);
    drawShipTopView(c, id, w / 2, h / 2, 0, Math.min(w * 0.9, (h * 0.9) / Math.max(beam, 0.3)));
  }, [id, beam]);
  return <canvas ref={ref} className="h-[22px] w-[40px] shrink-0" />;
}
