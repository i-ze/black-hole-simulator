import { Eraser, Pause, Play, RotateCcw, StepForward, Trash2 } from 'lucide-react';
import { engine } from '../engine/engine';
import { useT } from '../i18n';
import { DAY, YEAR } from '../physics/constants';
import { fmtNum, fmtTime } from '../physics/units';
import { useUI, WARP_MAX, WARP_MIN } from '../store';
import { IconButton, Slider } from './controls';

const LMIN = Math.log10(WARP_MIN);
const LMAX = Math.log10(WARP_MAX);

const MARKS: [string, number][] = [
  ['1 µs/s', 1e-6],
  ['1 ms/s', 1e-3],
  ['1×', 1],
  ['1 h/s', 3600],
  ['1 d/s', DAY],
  ['1 yr/s', YEAR],
  ['1 kyr/s', 1e3 * YEAR],
  ['1 Myr/s', 1e6 * YEAR],
];

export function TimeBar() {
  const t = useT();
  const running = useUI((s) => s.running);
  const warp = useUI((s) => s.warp);
  const scenarioId = useUI((s) => s.scenarioId);
  const lang = useUI((s) => s.lang);
  useUI((s) => s.tick);
  const sim = engine.sim;
  const stats = sim.stats;

  return (
    <footer className="panel-glass flex h-[64px] shrink-0 items-center gap-4 border-t border-white/5 px-4">
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => useUI.setState({ running: !running })}
          title={running ? t('time.pause') : t('time.play')}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-orange-400 text-slate-950 shadow-[0_0_20px_rgba(251,146,60,0.35)] transition hover:bg-orange-300"
        >
          {running ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" className="ml-0.5" />}
        </button>
        <IconButton title={t('time.step')} onClick={() => engine.step()}>
          <StepForward size={16} />
        </IconButton>
        <IconButton title={t('time.reset')} onClick={() => engine.loadScenario(scenarioId)}>
          <RotateCcw size={16} />
        </IconButton>
        <IconButton title={t('time.clearTrails')} onClick={() => sim.clearTrails()}>
          <Eraser size={16} />
        </IconButton>
        <IconButton title={t('time.clearAll')} onClick={() => engine.clearAll()}>
          <Trash2 size={16} />
        </IconButton>
      </div>

      <div className="w-[150px] shrink-0">
        <div className="text-[10px] uppercase tracking-wider text-slate-500">{t('time.simTime')}</div>
        <div className="font-mono text-[15px] text-white tabular-nums">{fmtTime(sim.time)}</div>
        {sim.epoch != null && (
          <div className="font-mono text-[10px] text-orange-200/80 tabular-nums" title={t('time.dateHint')}>
            {new Date(sim.epoch + sim.time * 1000).toLocaleString(lang === 'hu' ? 'hu-HU' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' })}
          </div>
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col justify-center">
        <div className="mb-0.5 flex items-baseline justify-between gap-2">
          <span className="text-[10px] uppercase tracking-wider text-slate-500">{t('time.warp')}</span>
          <span className="font-mono text-[12px] text-orange-100">
            {t('time.perSecond')} {fmtTime(warp)}
            <span className="ml-2 text-slate-500">({fmtNum(warp)}×)</span>
          </span>
        </div>
        <Slider value={Math.log10(warp)} min={LMIN} max={LMAX} step={0.01} onChange={(v) => useUI.setState({ warp: 10 ** v })} />
        <div className="relative mt-0.5 h-3 font-mono text-[9px] text-slate-500">
          {MARKS.map(([label, w]) => {
            const x = (Math.log10(w) - LMIN) / (LMAX - LMIN);
            return (
              <button
                key={label}
                className="absolute -translate-x-1/2 whitespace-nowrap hover:text-slate-200"
                style={{ left: `${x * 100}%` }}
                onClick={() => useUI.setState({ warp: w })}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="w-[170px] shrink-0 text-right">
        {stats.limited && running ? (
          <div title={t('time.limitedHint')} className="inline-flex items-center gap-1 rounded bg-amber-400/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-300 ring-1 ring-amber-300/20">
            {t('time.limited')} · {fmtNum(stats.effectiveWarp)}× {t('time.effective')}
          </div>
        ) : (
          <div className="text-[10px] text-slate-600">&nbsp;</div>
        )}
        <div className="mt-1 font-mono text-[10px] text-slate-500">
          {Math.round(engine.fps)} fps · {stats.physicsMs.toFixed(1)} ms · {sim.bodies.length} obj
        </div>
      </div>
    </footer>
  );
}
