import { useEffect, useRef } from 'react';
import { engine } from '../engine/engine';
import { useT } from '../i18n';
import { C, M_SUN, MPC, PC } from '../physics/constants';
import { fmtEnergy, fmtNum, fmtTime } from '../physics/units';
import { useUI } from '../store';
import { useElementSize } from './useCanvasSize';

const DISTANCES: [string, number][] = [
  ['8 kpc', 8000 * PC],
  ['40 Mpc', 40 * MPC],
  ['410 Mpc', 410 * MPC],
  ['1 Gpc', 1000 * MPC],
];

export function DataView() {
  const t = useT();
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const size = useElementSize(wrap);
  useUI((s) => s.tick);
  const gw = engine.sim.gw;
  const dist = engine.sim.settings.gwDistance;

  useEffect(() => {
    const cv = canvas.current!;
    const ctx = cv.getContext('2d')!;
    const render = () => {
      const { width: W, height: H, dpr } = size.current;
      if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) {
        cv.width = Math.round(W * dpr);
        cv.height = Math.round(H * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      const g = engine.sim.gw;
      const padL = 64;
      const padR = 16;
      const padT = 14;
      const padB = 28;
      const pw = W - padL - padR;
      const ph = H - padT - padB;
      // Axes frame.
      ctx.strokeStyle = 'rgba(148,163,184,0.18)';
      ctx.lineWidth = 1;
      ctx.strokeRect(padL + 0.5, padT + 0.5, pw, ph);
      if (g.count < 2) return;
      let tMin = Infinity;
      let tMax = -Infinity;
      let hMax = 0;
      g.forEach((tt, hp, hx) => {
        tMin = Math.min(tMin, tt);
        tMax = Math.max(tMax, tt);
        hMax = Math.max(hMax, Math.abs(hp), Math.abs(hx));
      });
      if (!(hMax > 0) || !(tMax > tMin)) return;
      const e = Math.floor(Math.log10(hMax));
      const unit = 10 ** e;
      const yMax = Math.ceil((hMax / unit) * 1.1 * 2) / 2 * unit;
      const X = (tt: number) => padL + ((tt - tMin) / (tMax - tMin)) * pw;
      const Y = (h: number) => padT + ph / 2 - (h / yMax) * (ph / 2);
      // Grid and labels.
      ctx.font = '10px "JetBrains Mono Variable", monospace';
      ctx.fillStyle = 'rgba(148,163,184,0.8)';
      for (const f of [-1, -0.5, 0, 0.5, 1]) {
        const y = Y(f * yMax);
        ctx.strokeStyle = f === 0 ? 'rgba(148,163,184,0.3)' : 'rgba(148,163,184,0.08)';
        ctx.beginPath();
        ctx.moveTo(padL, y + 0.5);
        ctx.lineTo(padL + pw, y + 0.5);
        ctx.stroke();
        const label = fmtNum(f * yMax, 2);
        ctx.fillText(label, padL - ctx.measureText(label).width - 6, y + 3);
      }
      const span = tMax - tMin;
      for (let i = 0; i <= 4; i++) {
        const tt = tMin + (span * i) / 4;
        const x = X(tt);
        ctx.strokeStyle = 'rgba(148,163,184,0.08)';
        ctx.beginPath();
        ctx.moveTo(x + 0.5, padT);
        ctx.lineTo(x + 0.5, padT + ph);
        ctx.stroke();
        const label = i === 4 ? 't' : `t-${fmtTime(tMax - tt)}`;
        ctx.fillText(label, Math.min(x - ctx.measureText(label).width / 2, W - padR - ctx.measureText(label).width), H - 10);
      }
      // h× (faint) then h+.
      const plot = (sel: 1 | 2, color: string, width: number) => {
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.beginPath();
        let first = true;
        g.forEach((tt, hp, hx) => {
          const x = X(tt);
          const y = Y(sel === 1 ? hp : hx);
          if (first) {
            ctx.moveTo(x, y);
            first = false;
          } else ctx.lineTo(x, y);
        });
        ctx.stroke();
      };
      plot(2, 'rgba(167,139,250,0.45)', 1);
      plot(1, 'rgba(56,189,248,0.95)', 1.4);
      // Ringdown markers.
      for (const r of g.ringdowns) {
        if (r.t0 < tMin || r.t0 > tMax) continue;
        const x = X(r.t0);
        ctx.setLineDash([3, 3]);
        ctx.strokeStyle = 'rgba(251,146,60,0.7)';
        ctx.beginPath();
        ctx.moveTo(x + 0.5, padT);
        ctx.lineTo(x + 0.5, padT + ph);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = 'rgba(251,146,60,0.9)';
        ctx.fillText('merger', x + 4, padT + 12);
      }
      ctx.fillStyle = 'rgba(56,189,248,0.95)';
      ctx.fillText('h+', padL + 8, padT + 14);
      ctx.fillStyle = 'rgba(167,139,250,0.8)';
      ctx.fillText('h×', padL + 30, padT + 14);
    };
    return engine.register(render);
  }, [size]);

  const stat = (label: string, value: string) => (
    <div className="min-w-0">
      <div className="truncate text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className="font-mono text-[13px] text-slate-100">{value}</div>
    </div>
  );

  return (
    <div className="absolute inset-0 flex flex-col bg-[#060910]">
      <div className="grid grid-cols-2 gap-x-4 gap-y-2 border-b border-white/5 px-4 py-3 sm:grid-cols-4">
        {stat(t('gw.freq'), gw.freq > 0 ? `${fmtNum(gw.freq)} Hz` : '-')}
        {stat(t('gw.lum'), gw.luminosity > 0 ? `${fmtNum(gw.luminosity)} W` : '-')}
        {stat(t('gw.radiated'), gw.radiated > 0 ? `${fmtEnergy(gw.radiated)} (${fmtNum(gw.radiated / (M_SUN * C * C))} M☉c²)` : '-')}
        {stat(t('gw.peak'), gw.peak > 0 ? fmtNum(gw.peak) : '-')}
      </div>
      <div ref={wrap} className="relative min-h-0 flex-1">
        <canvas ref={canvas} className="absolute inset-0 h-full w-full" />
        {gw.count < 2 && (
          <div className="absolute inset-0 flex items-center justify-center px-8 text-center text-sm text-slate-500">{t('gw.noSignal')}</div>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2 border-t border-white/5 px-4 py-2 text-[11px] text-slate-400">
        <span>{t('gw.distance')}:</span>
        {DISTANCES.map(([label, d]) => (
          <button
            key={label}
            onClick={() => {
              // Strain scales as 1/D, so existing samples can be rescaled.
              engine.sim.gw.rescale(engine.sim.settings.gwDistance / d);
              engine.sim.settings.gwDistance = d;
            }}
            className={`rounded px-2 py-0.5 font-mono transition ${Math.abs(dist / d - 1) < 1e-6 ? 'bg-sky-500/20 text-sky-200' : 'hover:bg-white/5'}`}
          >
            {label}
          </button>
        ))}
        <span className="ml-auto hidden text-slate-500 md:inline">{t('gw.faceOn')}</span>
      </div>
    </div>
  );
}
