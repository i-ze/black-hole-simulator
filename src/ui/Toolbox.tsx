import { Globe2, MousePointer2, Rocket, Sparkles, Sun, Zap } from 'lucide-react';
import type { ReactNode } from 'react';
import { STAR_PRESETS, type StarPreset } from '../engine/bodies';
import { engine } from '../engine/engine';
import { SHIPS } from '../engine/ships';
import { ShipIcon } from './ShipIcon';
import { PlanetIcon } from './PlanetIcon';
import { PLANETS } from '../engine/planets';
import { starHex } from '../engine/simulation';
import { useT } from '../i18n';
import { wavelengthCss } from '../physics/spectrum';
import { equilibriumMass, evaporationTime, hawkingTemperature, schwarzschildRadius } from '../physics/blackhole';
import { M_PLANCK, M_SUN, T_CMB_TODAY } from '../physics/constants';
import { fmtLength, fmtMass, fmtTemp, fmtTime } from '../physics/units';
import { useUI, type ToolKind } from '../store';
import { Section, Segmented, Slider, Toggle } from './controls';

export function BlackHoleIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <ellipse cx="12" cy="12" rx="10.5" ry="3.6" stroke="currentColor" strokeWidth="1.4" opacity="0.7" />
      <circle cx="12" cy="12" r="5" fill="#000" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

const SPECTRUM_GRADIENT = `linear-gradient(90deg, ${[380, 420, 460, 500, 540, 580, 620, 660, 700, 750].map((w) => wavelengthCss(w)).join(', ')})`;

const MASS_MIN = Math.log10(M_PLANCK);
const MASS_MAX = Math.log10(1e11 * M_SUN);

const BH_PRESETS: [string, number][] = [
  ['planck', M_PLANCK],
  ['micro', 1e12],
  ['moon', equilibriumMass(T_CMB_TODAY)],
  ['stellar', 10 * M_SUN],
  ['imbh', 1e4 * M_SUN],
  ['smbh', 4.3e6 * M_SUN],
  ['ultra', 1e10 * M_SUN],
];

export function Toolbox() {
  const t = useT();
  const tool = useUI((s) => s.tool);
  const params = useUI((s) => s.params);
  const setParams = useUI((s) => s.setParams);
  useUI((s) => s.tick);

  const tools: { id: ToolKind; icon: ReactNode }[] = [
    { id: 'select', icon: <MousePointer2 size={16} /> },
    { id: 'blackHole', icon: <BlackHoleIcon /> },
    { id: 'star', icon: <Sun size={16} /> },
    { id: 'planet', icon: <Globe2 size={16} /> },
    { id: 'ship', icon: <Rocket size={16} /> },
    { id: 'meteors', icon: <Sparkles size={16} /> },
    { id: 'photons', icon: <Zap size={16} /> },
  ];
  const mass = 10 ** params.bhMassLog;
  const settings = engine.sim.settings;
  const setSetting = (p: Partial<typeof settings>) => {
    Object.assign(engine.sim.settings, p);
    useUI.setState((s) => ({ tick: s.tick + 1 }));
  };

  return (
    <aside className="panel-glass flex w-[260px] shrink-0 flex-col overflow-y-auto border-r border-white/5">
      <Section title={t('tools.title')}>
        <div className="grid grid-cols-1 gap-0.5">
          {tools.map((x) => (
            <button
              key={x.id}
              onClick={() => useUI.setState({ tool: x.id })}
              className={`flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-[13px] transition ${
                tool === x.id ? 'bg-orange-400/12 text-orange-100 ring-1 ring-orange-300/25' : 'text-slate-300 hover:bg-white/[0.04]'
              }`}
            >
              <span className={tool === x.id ? 'text-orange-300' : 'text-slate-400'}>{x.icon}</span>
              {t(`tools.${x.id}`)}
            </button>
          ))}
        </div>
        <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
          {tool === 'select' ? t('tools.hintSelect') : tool === 'photons' ? t('tools.hintPhotons') : t('tools.hintPlace')}
        </p>
      </Section>

      {tool === 'blackHole' && (
        <Section title={t('tools.blackHole')}>
          <div className="mb-1 flex items-baseline justify-between">
            <span className="text-[12px] text-slate-400">{t('tools.mass')}</span>
            <span className="font-mono text-[12px] text-orange-100">{fmtMass(mass)}</span>
          </div>
          <Slider value={params.bhMassLog} min={MASS_MIN} max={MASS_MAX} step={0.01} onChange={(v) => setParams({ bhMassLog: v })} />
          <div className="mt-2 grid grid-cols-2 gap-1">
            {BH_PRESETS.map(([key, m]) => (
              <button
                key={key}
                onClick={() => setParams({ bhMassLog: Math.log10(m) })}
                className={`truncate rounded px-1.5 py-1 text-left text-[11px] transition ${
                  Math.abs(params.bhMassLog - Math.log10(m)) < 0.005 ? 'bg-orange-400/15 text-orange-100' : 'bg-white/[0.03] text-slate-400 hover:text-slate-200'
                }`}
                title={fmtMass(m)}
              >
                {t(`bhPresets.${key}`)}
              </button>
            ))}
          </div>
          <div className="mt-3 space-y-0.5 rounded-md bg-black/20 p-2 font-mono text-[11px] text-slate-400">
            <div className="flex justify-between">
              <span>r_s</span>
              <span className="text-slate-200">{fmtLength(schwarzschildRadius(mass))}</span>
            </div>
            <div className="flex justify-between">
              <span>T_H</span>
              <span className="text-slate-200">{fmtTemp(hawkingTemperature(mass))}</span>
            </div>
            <div className="flex justify-between">
              <span>t_evap</span>
              <span className="text-slate-200">{hawkingTemperature(mass) > T_CMB_TODAY ? fmtTime(evaporationTime(mass)) : '∞ (CMB)'}</span>
            </div>
          </div>
          <div className="mt-3 mb-1 flex items-baseline justify-between">
            <span className="text-[12px] text-slate-400">{t('tools.spin')}</span>
            <span className="font-mono text-[12px] text-slate-200">{params.bhSpin.toFixed(2)}</span>
          </div>
          <Slider value={params.bhSpin} min={0} max={0.998} step={0.001} onChange={(v) => setParams({ bhSpin: v })} />
          <Toggle label={t('tools.disk')} checked={params.bhDisk} onChange={(v) => setParams({ bhDisk: v })} />
        </Section>
      )}

      {tool === 'star' && (
        <Section title={t('tools.type')}>
          <div className="grid grid-cols-1 gap-0.5">
            {(Object.keys(STAR_PRESETS) as StarPreset[]).map((p) => (
              <button
                key={p}
                onClick={() => setParams({ starPreset: p })}
                className={`flex items-center gap-2 rounded px-2 py-1 text-left text-[12px] transition ${
                  params.starPreset === p ? 'bg-white/10 text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: starHex(STAR_PRESETS[p].temperature), boxShadow: `0 0 6px ${starHex(STAR_PRESETS[p].temperature)}` }} />
                <span className="flex-1">{t(`starPresets.${p}`)}</span>
                <span className="font-mono text-[10px] text-slate-500">{fmtMass(STAR_PRESETS[p].mass)}</span>
              </button>
            ))}
          </div>
        </Section>
      )}

      {tool === 'planet' && (
        <Section title={t('tools.type')}>
          <div className="grid grid-cols-1 gap-0.5">
            {PLANETS.map((pl) => (
              <button
                key={pl.id}
                onClick={() => setParams({ planetPreset: pl.id })}
                className={`flex items-center gap-2 rounded px-2 py-1 text-left text-[12px] transition ${
                  params.planetPreset === pl.id ? 'bg-white/10 text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <PlanetIcon id={pl.id} />
                <span className="flex-1">{t(`planetPresets.${pl.id}`)}</span>
                <span className="font-mono text-[10px] text-slate-500">{fmtMass(pl.mass)}</span>
              </button>
            ))}
          </div>
        </Section>
      )}

      {tool === 'ship' && (
        <Section title={t('tools.type')}>
          <div className="grid grid-cols-1 gap-0.5">
            {SHIPS.map((m) => (
              <button
                key={m.id}
                onClick={() => setParams({ shipModel: m.id })}
                title={`${m.franchise} · ${fmtLength(m.length)}`}
                className={`flex items-center gap-2 rounded px-2 py-1 text-left text-[12px] transition ${
                  params.shipModel === m.id ? 'bg-white/10 text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <ShipIcon id={m.id} beam={m.beam} />
                <span className="min-w-0 flex-1 truncate">{m.name}</span>
                <span className="max-w-[90px] truncate text-[10px] text-slate-500">{m.franchise}</span>
              </button>
            ))}
          </div>
        </Section>
      )}

      {tool === 'meteors' && (
        <Section title={t('tools.count')}>
          <div className="mb-1 flex justify-between text-[12px]">
            <span className="text-slate-400">{t('tools.count')}</span>
            <span className="font-mono text-slate-200">{params.meteorCount}</span>
          </div>
          <Slider value={params.meteorCount} min={10} max={600} step={10} onChange={(v) => setParams({ meteorCount: v })} />
        </Section>
      )}

      {tool === 'photons' && (
        <Section title={t('tools.count')}>
          <div className="mb-1 flex justify-between text-[12px]">
            <span className="text-slate-400">{t('tools.count')}</span>
            <span className="font-mono text-slate-200">{params.photonCount}</span>
          </div>
          <Slider value={params.photonCount} min={1} max={80} step={1} onChange={(v) => setParams({ photonCount: v })} />
          <div className="mt-3 mb-1 flex items-baseline justify-between text-[12px]">
            <span className="text-slate-400">{t('tools.wavelength')}</span>
            <span className="font-mono" style={{ color: params.photonRainbow ? '#e2e8f0' : wavelengthCss(params.photonWavelength) }}>
              {params.photonRainbow ? '400-700 nm' : `${Math.round(params.photonWavelength)} nm`}
            </span>
          </div>
          <div className="h-1.5 rounded-full" style={{ background: SPECTRUM_GRADIENT, opacity: params.photonRainbow ? 0.4 : 1 }} />
          <Slider value={params.photonWavelength} min={380} max={750} step={1} onChange={(v) => setParams({ photonWavelength: v, photonRainbow: false })} />
          <Toggle label={t('tools.rainbow')} checked={params.photonRainbow} onChange={(v) => setParams({ photonRainbow: v })} />
          <p className="mt-1 text-[11px] leading-relaxed text-slate-500">{t('tools.shiftHint')}</p>
        </Section>
      )}

      {tool !== 'select' && tool !== 'photons' && (
        <Section title={t('tools.velocity')}>
          <Segmented
            size="sm"
            value={params.velocityMode}
            onChange={(v) => setParams({ velocityMode: v })}
            options={[
              { value: 'orbit', label: t('tools.vOrbit') },
              { value: 'drag', label: t('tools.vDrag') },
              { value: 'rest', label: t('tools.vRest') },
            ]}
          />
        </Section>
      )}

      <div className="flex-1" />
      <Section title={t('settings.title')}>
        <Toggle label={t('settings.gr')} checked={settings.gr} onChange={(v) => setSetting({ gr: v })} />
        <Toggle label={t('settings.rr')} checked={settings.radiationReaction} onChange={(v) => setSetting({ radiationReaction: v })} />
        <Toggle label={t('settings.hawking')} checked={settings.hawking} onChange={(v) => setSetting({ hawking: v })} />
        <Toggle label={t('settings.tidal')} checked={settings.tidal} onChange={(v) => setSetting({ tidal: v })} />
        <div className="mt-2 mb-1 flex items-baseline justify-between">
          <span className="text-[12px] text-slate-400">{t('settings.cmb')}</span>
          <span className="font-mono text-[12px] text-slate-200">{settings.cmbTemperature.toFixed(2)} K</span>
        </div>
        <Slider value={settings.cmbTemperature} min={0} max={30} step={0.05} onChange={(v) => setSetting({ cmbTemperature: v })} />
      </Section>
    </aside>
  );
}
