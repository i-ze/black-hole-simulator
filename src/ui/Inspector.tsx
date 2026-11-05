import { CircleDot, Crosshair, Pause, Pencil, Trash2, ZoomIn } from 'lucide-react';
import { engine } from '../engine/engine';
import { shipById } from '../engine/ships';
import { starHex } from '../engine/simulation';
import type { Body, SimEvent } from '../engine/types';
import { translate, useT, type TFn } from '../i18n';
import { orbitalElements } from '../physics/analysis';
import {
  accretionRate,
  diskEfficiency,
  diskPeakTemperature,
  equilibriumMass,
  evaporationTime,
  hawkingPower,
  hawkingTemperature,
  iscoRadius,
  kerrHorizon,
  netMassRate,
  photonSphereRadius,
  schwarzschildRadius,
  stellarLuminosity,
  tidalAcceleration,
  tidalRadius,
} from '../physics/blackhole';
import { C, G, L_SUN, M_EARTH, M_JUPITER, M_PLANCK, M_SUN, R_EARTH, R_JUPITER, R_SUN } from '../physics/constants';
import { mainSequence, whiteDwarfRadius } from '../physics/stars';
import { fmtEnergy, fmtLength, fmtMass, fmtNum, fmtPower, fmtSpeed, fmtTemp, fmtTime } from '../physics/units';
import { wavelengthCss } from '../physics/spectrum';
import { useUI, type Lang } from '../store';
import { Badge, IconButton, Row, Section, Slider, Toggle } from './controls';

export function Inspector() {
  const t = useT();
  useUI((s) => s.tick);
  const selectedId = useUI((s) => s.selectedId);
  const follow = useUI((s) => s.follow);
  const lang = useUI((s) => s.lang);
  const sim = engine.sim;
  const b = sim.get(selectedId);

  return (
    <aside className="panel-glass flex w-[300px] shrink-0 flex-col overflow-hidden border-l border-white/5">
      <div className="min-h-0 flex-1 overflow-y-auto">
        {b ? <BodyPanel b={b} follow={follow} t={t} /> : <SystemPanel t={t} />}
      </div>
      <EventLog events={sim.events} lang={lang} t={t} />
    </aside>
  );
}

function BodyPanel({ b, follow, t }: { b: Body; follow: boolean; t: TFn }) {
  const sim = engine.sim;
  const attractor = sim.orbitalHost(b);
  // Only show orbital elements around a body that actually dominates this one.
  const host = attractor && (!b.massive || attractor.mass > 0.2 * b.mass) ? attractor : undefined;
  const orbit = host ? orbitalElements(b, host) : null;
  const isBH = b.kind === 'blackHole';
  const tone = isBH ? 'amber' : b.kind === 'ship' ? 'sky' : 'slate';
  const swatch = b.kind === 'blackHole' ? '#000' : b.kind === 'planet' || b.kind === 'ship' || b.kind === 'meteor' ? b.color : starHex(b.temperature);
  const touch = () => useUI.setState((s) => ({ tick: s.tick + 1 }));

  return (
    <>
      <div className="flex items-center gap-3 border-b border-white/5 px-4 py-3">
        <span
          className="h-7 w-7 shrink-0 rounded-full ring-1 ring-white/10"
          style={{ background: swatch, boxShadow: isBH ? '0 0 0 2px rgba(251,146,60,0.7), 0 0 14px rgba(251,146,60,0.45)' : `0 0 12px ${swatch}` }}
        />
        <div className="min-w-0 flex-1">
          <label className="group flex items-center gap-1.5 rounded px-1 -mx-1 ring-1 ring-transparent transition hover:ring-white/10 focus-within:ring-sky-400/40" title={t('inspector.rename')}>
            <input
              className="w-full min-w-0 truncate bg-transparent text-[15px] font-semibold text-white outline-none"
              value={b.name}
              maxLength={40}
              onChange={(e) => {
                b.name = e.target.value;
                touch();
              }}
              onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
            />
            <Pencil size={12} className="shrink-0 text-slate-500 group-hover:text-slate-300" />
          </label>
          <Badge tone={tone}>{t(`kinds.${b.kind}`)}</Badge>
        </div>
        <IconButton title={t('inspector.zoomTo')} onClick={() => engine.zoomTo(b.id)}>
          <ZoomIn size={15} />
        </IconButton>
        <IconButton title={t('inspector.follow')} active={follow} onClick={() => useUI.setState({ follow: !follow })}>
          <Crosshair size={15} />
        </IconButton>
        <IconButton title={t('inspector.delete')} onClick={() => sim.remove(b.id)}>
          <Trash2 size={15} />
        </IconButton>
      </div>

      {b.kind === 'ship' && shipById(b.model) && (
        <Section title={t('inspector.title')}>
          <Row label={t('inspector.franchise')} value={shipById(b.model)!.franchise} />
          <Row label={t('inspector.length')} value={fmtLength(shipById(b.model)!.length)} />
          <Row label={t('inspector.mass')} value={fmtMass(b.mass)} />
        </Section>
      )}
      {b.kind === 'photon' && <PhotonSection b={b} t={t} />}
      {b.kind === 'planet' && <PhaseSection b={b} t={t} />}
      {isBH && <BlackHoleSection b={b} t={t} />}
      {!isBH && b.massive && <StarSection b={b} t={t} host={host} />}

      <Section
        title={t('inspector.dynamics')}
        right={
          b.kind !== 'photon' && host ? (
            <div className="flex gap-1">
              <SmallButton icon={<CircleDot size={11} />} label={t('inspector.circularize')} onClick={() => sim.circularize(b)} />
              <SmallButton icon={<Pause size={11} />} label={t('inspector.stop')} onClick={() => sim.stopRelative(b)} />
            </div>
          ) : undefined
        }
      >
        {orbit ? (
          <>
            <Row label={t('inspector.host')} value={orbit.host.name} />
            <Row
              label={t('inspector.distance')}
              value={
                orbit.host.kind === 'blackHole'
                  ? `${fmtLength(orbit.r)} · ${fmtNum(orbit.r / schwarzschildRadius(orbit.host.mass))} r_s`
                  : fmtLength(orbit.r)
              }
            />
            <Row label={t('inspector.speed')} value={fmtSpeed(orbit.v)} />
            <Row label={t('inspector.escape')} value={fmtSpeed(orbit.escape)} />
            <Row label={t('inspector.semiMajor')} value={orbit.bound ? fmtLength(orbit.a) : t('inspector.unbound')} />
            <Row label={t('inspector.eccentricity')} value={fmtNum(orbit.e)} />
            <Row label={t('inspector.period')} value={orbit.bound ? fmtTime(orbit.period) : '-'} />
          </>
        ) : (
          <Row label={t('inspector.speed')} value={fmtSpeed(Math.hypot(b.vx, b.vy, b.vz))} />
        )}
        {b.kind !== 'photon' && (
          <>
            <div className="my-2 h-px bg-white/5" />
            <Row label={t('inspector.timeRate')} value={b.timeRate.toFixed(6)} hint="dτ/dt" />
            <Row label={t('inspector.properTime')} value={fmtTime(b.properTime)} />
            <Row label={t('inspector.coordTime')} value={fmtTime(sim.time - b.born)} />
            <ClockBar rate={b.timeRate} />
          </>
        )}
      </Section>
    </>
  );
}

/**
 * Phase of a moon as seen from the planet it orbits: elongation from the star (geocentric
 * longitude difference), illuminated fraction k = (1 + cos i)/2 with i the phase angle at the moon,
 * and the time to the next full/new moon from the synodic period.
 */
function PhaseSection({ b, t }: { b: Body; t: TFn }) {
  const sim = engine.sim;
  const host = sim.orbitalHost(b);
  if (!host || host.kind !== 'planet') return null;
  let star: Body | undefined;
  for (const s of sim.bodies) {
    if (s.kind !== 'star') continue;
    if (!star || Math.hypot(s.x - host.x, s.y - host.y) < Math.hypot(star.x - host.x, star.y - host.y)) star = s;
  }
  if (!star) return null;
  const lonM = Math.atan2(b.y - host.y, b.x - host.x);
  const lonS = Math.atan2(star.y - host.y, star.x - host.x);
  const elong = ((((lonM - lonS) * 180) / Math.PI) % 360 + 360) % 360;
  const toStar = [star.x - b.x, star.y - b.y, star.z - b.z];
  const toHost = [host.x - b.x, host.y - b.y, host.z - b.z];
  const cosI =
    (toStar[0] * toHost[0] + toStar[1] * toHost[1] + toStar[2] * toHost[2]) / (Math.hypot(...toStar) * Math.hypot(...toHost));
  const k = (1 + cosI) / 2;
  const names = ['new', 'waxingCrescent', 'firstQuarter', 'waxingGibbous', 'full', 'waningGibbous', 'lastQuarter', 'waningCrescent'];
  const name = names[Math.floor(((elong + 22.5) % 360) / 45)];
  const pMoon = orbitalElements(b, host).period;
  const pHost = orbitalElements(host, star).period;
  const synodic = 1 / Math.abs(1 / pMoon - 1 / pHost);
  const toFull = ((((180 - elong) % 360) + 360) % 360) / 360 * synodic;
  const toNew = ((((360 - elong) % 360) + 360) % 360) / 360 * synodic;
  return (
    <Section title={t('phase.title')}>
      <div className="flex items-center gap-3">
        <PhaseIcon k={k} waxing={elong < 180} />
        <div className="min-w-0 flex-1">
          <div className="text-[14px] font-semibold text-slate-100">{t(`phase.${name}`)}</div>
          <div className="text-[11px] text-slate-400">
            {t('phase.lit')}: {(k * 100).toFixed(0)}% · {t('phase.elongation')}: {elong.toFixed(0)}°
          </div>
        </div>
      </div>
      <div className="mt-2">
        <Row label={t('phase.nextFull')} value={Number.isFinite(toFull) ? fmtTime(toFull) : '-'} />
        <Row label={t('phase.nextNew')} value={Number.isFinite(toNew) ? fmtTime(toNew) : '-'} />
        <Row label={t('phase.synodic')} value={Number.isFinite(synodic) ? fmtTime(synodic) : '-'} />
      </div>
    </Section>
  );
}

/** Moon phase drawing (northern-hemisphere view: waxing lit on the right). */
function PhaseIcon({ k, waxing }: { k: number; waxing: boolean }) {
  const r = 22;
  const rx = r * Math.abs(2 * k - 1);
  // Lit limb (right half), then back along the terminator ellipse: through the dark side for a
  // gibbous moon, through the lit side for a crescent.
  const d = `M 0 ${-r} A ${r} ${r} 0 0 1 0 ${r} A ${rx} ${r} 0 0 ${k > 0.5 ? 1 : 0} 0 ${-r} Z`;
  return (
    <svg width={2 * r + 4} height={2 * r + 4} viewBox={`${-r - 2} ${-r - 2} ${2 * r + 4} ${2 * r + 4}`} className="shrink-0">
      <circle r={r} fill="#1c1f26" stroke="#334155" strokeWidth="1" />
      <path d={d} fill="#e8e4d8" transform={waxing ? undefined : 'scale(-1,1)'} />
    </svg>
  );
}

function PhotonSection({ b, t }: { b: Body; t: TFn }) {
  const sim = engine.sim;
  const lam0 = b.wavelength ?? 560;
  const lam = sim.photonWavelength(b);
  const z = lam / lam0 - 1;
  const lamInf = lam0 / Math.sqrt(b.emitF ?? 1);
  return (
    <Section title={t('inspector.light')}>
      <Row label={t('inspector.lamEmit')} value={<span style={{ color: wavelengthCss(lam0) }}>{lam0.toFixed(0)} nm</span>} />
      <Row label={t('inspector.lamLocal')} value={<span style={{ color: wavelengthCss(lam) }}>{lam.toFixed(1)} nm</span>} />
      <Row label={t('inspector.shift')} value={<span className={z < 0 ? 'text-sky-300' : 'text-rose-300'}>{(z >= 0 ? '+' : '') + fmtNum(z)}</span>} />
      <Row label={t('inspector.lamInf')} value={`${lamInf.toFixed(1)} nm`} />
      <div className="mt-2 h-1.5 rounded-full" style={{ background: `linear-gradient(90deg, ${wavelengthCss(lam0)}, ${wavelengthCss(lam)})` }} />
    </Section>
  );
}

function ClockBar({ rate }: { rate: number }) {
  return (
    <div className="mt-2">
      <div className="h-1.5 overflow-hidden rounded-full bg-white/5">
        <div className="h-full rounded-full bg-gradient-to-r from-rose-500 via-orange-400 to-sky-400" style={{ width: `${Math.max(0, Math.min(1, rate)) * 100}%` }} />
      </div>
    </div>
  );
}

function BlackHoleSection({ b, t }: { b: Body; t: TFn }) {
  const sim = engine.sim;
  const m = b.mass;
  const rs = schwarzschildRadius(m);
  const tH = hawkingTemperature(m);
  const tBg = sim.settings.cmbTemperature;
  const rate = netMassRate(m, tBg);
  const meq = equilibriumMass(Math.max(tBg, 1e-6));
  const touch = () => useUI.setState((s) => ({ tick: s.tick + 1 }));
  const mdot = accretionRate(m, b.eddington, b.spin);
  const rin = iscoRadius(m, b.spin);
  const minLog = Math.log10(M_PLANCK);
  const maxLog = Math.log10(1e11 * M_SUN);

  return (
    <>
      <Section title={t('inspector.title')}>
        <div className="mb-1 flex items-baseline justify-between">
          <span className="text-[12px] text-slate-400">{t('inspector.mass')}</span>
          <span className="font-mono text-[12px] text-orange-100">{fmtMass(m)}</span>
        </div>
        <Slider
          value={Math.log10(m)}
          min={minLog}
          max={maxLog}
          step={0.01}
          onChange={(v) => {
            b.mass = 10 ** v;
            b.radius = kerrHorizon(b.mass, b.spin);
            touch();
          }}
        />
        <div className="mt-2 mb-1 flex items-baseline justify-between">
          <span className="text-[12px] text-slate-400">a*</span>
          <span className="font-mono text-[12px] text-slate-200">{b.spin.toFixed(3)}</span>
        </div>
        <Slider
          value={b.spin}
          min={0}
          max={0.998}
          step={0.001}
          onChange={(v) => {
            b.spin = v;
            b.radius = kerrHorizon(b.mass, b.spin);
            touch();
          }}
        />
        <Toggle
          label={t('tools.disk')}
          checked={b.disk}
          onChange={(v) => {
            b.disk = v;
            touch();
          }}
        />
        {b.disk && (
          <>
            <div className="mb-1 flex items-baseline justify-between">
              <span className="text-[12px] text-slate-400">{t('inspector.eddington')}</span>
              <span className="font-mono text-[12px] text-slate-200">{fmtNum(b.eddington)}</span>
            </div>
            <Slider
              value={Math.log10(b.eddington)}
              min={-6}
              max={0}
              step={0.01}
              onChange={(v) => {
                b.eddington = 10 ** v;
                touch();
              }}
            />
          </>
        )}
      </Section>
      <Section title={t('inspector.deriv')}>
        <Row label={t('inspector.rs')} value={fmtLength(rs)} />
        <Row label={t('inspector.horizon')} value={fmtLength(kerrHorizon(m, b.spin))} />
        <Row label={t('inspector.photonSphere')} value={fmtLength(photonSphereRadius(m, b.spin))} />
        <Row label={t('inspector.isco')} value={fmtLength(rin)} />
        <Row label={t('inspector.spaghetti')} value={`${fmtNum(tidalAcceleration(m, rs, 2))} m/s²`} />
        <Row label={t('inspector.density')} value={`${fmtNum(m / ((4 / 3) * Math.PI * rs ** 3))} kg/m³`} />
        {b.disk && (
          <>
            <Row label={t('inspector.diskT')} value={fmtTemp(diskPeakTemperature(m, mdot, rin))} />
            <Row label={t('inspector.diskL')} value={`${fmtPower(diskEfficiency(b.spin) * mdot * C * C)}`} />
          </>
        )}
        <div className="my-2 h-px bg-white/5" />
        <Row label={t('inspector.hawkingT')} value={fmtTemp(tH)} />
        <Row label={t('inspector.hawkingP')} value={fmtPower(hawkingPower(m))} />
        <Row label={t('inspector.lifetime')} value={tH > tBg ? fmtTime(evaporationTime(m)) : '∞'} />
        <Row
          label={t('inspector.netRate')}
          value={
            <span className={rate < 0 ? 'text-rose-300' : 'text-emerald-300'}>
              {fmtNum(rate)} kg/s
            </span>
          }
        />
        <div className="mt-1 text-right text-[11px] text-slate-500">{rate < 0 ? t('inspector.shrinks') : t('inspector.grows')}</div>
        <Row label={t('inspector.eqMass')} value={fmtMass(meq)} />
        <EquilibriumGauge m={m} meq={meq} />
      </Section>
    </>
  );
}

/** Position of the mass on a log scale around the Hawking-CMB equilibrium mass. */
function EquilibriumGauge({ m, meq }: { m: number; meq: number }) {
  const x = Math.log10(m / meq);
  const pos = Math.max(0, Math.min(1, 0.5 + x / 20));
  return (
    <div className="mt-2">
      <div className="relative h-1.5 rounded-full bg-gradient-to-r from-rose-500/70 via-slate-500/40 to-emerald-500/70">
        <div className="absolute top-1/2 left-1/2 h-3 w-px -translate-y-1/2 bg-white/60" />
        <div className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-orange-400" style={{ left: `${pos * 100}%` }} />
      </div>
      <div className="mt-1 flex justify-between font-mono text-[9px] text-slate-500">
        <span>10⁻¹⁰ M_eq</span>
        <span>M_eq</span>
        <span>10¹⁰ M_eq</span>
      </div>
    </div>
  );
}

function StarSection({ b, t, host }: { b: Body; t: TFn; host?: Body }) {
  const sim = engine.sim;
  const touch = () => useUI.setState((s) => ({ tick: s.tick + 1 }));
  const isStar = b.kind === 'star';
  const lum = b.kind === 'planet' ? 0 : stellarLuminosity(b.radius, b.temperature);
  const setMass = (m: number) => {
    b.mass = m;
    // Compact stars follow their mass-radius relation; collapse/supernova beyond the limits.
    if (b.kind === 'whiteDwarf') b.radius = whiteDwarfRadius(m);
    sim.checkStability(b);
    touch();
  };
  const massRange: [number, number] =
    b.kind === 'planet'
      ? [0.001 * M_EARTH, 13 * M_JUPITER]
      : b.kind === 'whiteDwarf'
        ? [0.17 * M_SUN, 1.5 * M_SUN]
        : b.kind === 'neutronStar'
          ? [1.1 * M_SUN, 2.5 * M_SUN]
          : [0.08 * M_SUN, 150 * M_SUN];
  const radiusRange: [number, number] | null =
    b.kind === 'planet' ? [0.1 * R_EARTH, 2 * R_JUPITER] : b.kind === 'neutronStar' ? [9e3, 15e3] : isStar ? [0.08 * R_SUN, 1500 * R_SUN] : null;
  return (
    <>
      <Section title={t('inspector.title')}>
        <LogSlider label={t('inspector.mass')} value={b.mass} range={massRange} format={fmtMass} onChange={setMass} />
        {b.kind === 'whiteDwarf' && <div className="-mt-1 mb-2 text-[10px] text-slate-500">{t('inspector.wdHint')}</div>}
        {b.kind === 'neutronStar' && <div className="-mt-1 mb-2 text-[10px] text-slate-500">{t('inspector.nsHint')}</div>}
        {radiusRange && (
          <LogSlider
            label={t('inspector.radius')}
            value={b.radius}
            range={radiusRange}
            format={fmtLength}
            onChange={(r) => {
              b.radius = r;
              touch();
            }}
          />
        )}
        {isStar && (
          <>
            <LogSlider
              label={t('inspector.temperature')}
              value={b.temperature}
              range={[2300, 50000]}
              format={(v) => fmtTemp(Math.round(v))}
              swatch={starHex(b.temperature)}
              onChange={(v) => {
                b.temperature = v;
                touch();
              }}
            />
            <button
              className="mt-1 w-full rounded-md bg-white/[0.04] px-2 py-1 text-[11px] text-slate-300 ring-1 ring-white/10 transition hover:bg-white/[0.08]"
              onClick={() => {
                const ms = mainSequence(b.mass);
                b.radius = ms.radius;
                b.temperature = ms.temperature;
                touch();
              }}
            >
              {t('inspector.mainSequence')}
            </button>
          </>
        )}
        {b.kind === 'planet' && (
          <label className="mt-1 flex items-center justify-between text-[12px] text-slate-400">
            {t('inspector.color')}
            <input
              type="color"
              value={b.color}
              onChange={(e) => {
                b.color = e.target.value;
                touch();
              }}
              className="h-6 w-10 cursor-pointer rounded border border-white/10 bg-transparent"
            />
          </label>
        )}
      </Section>
      <Section title={t('inspector.deriv')}>
        {b.kind !== 'planet' && <Row label={t('inspector.luminosity')} value={`${fmtNum(lum / L_SUN)} L☉`} />}
        <Row label={t('inspector.meanDensity')} value={`${fmtNum(b.mass / ((4 / 3) * Math.PI * b.radius ** 3))} kg/m³`} />
        <Row label={t('inspector.surfaceGravity')} value={`${fmtNum((G * b.mass) / (b.radius * b.radius))} m/s²`} />
        <Row label={t('inspector.escapeSurface')} value={fmtSpeed(Math.sqrt((2 * G * b.mass) / b.radius))} />
        <Row label={t('inspector.compactness')} value={fmtNum(schwarzschildRadius(b.mass) / b.radius)} hint="r_s / R" />
        {host && host.kind === 'blackHole' && (
          <>
            <Row label={t('inspector.tidalRadius')} value={fmtLength(tidalRadius(host.mass, b.mass, b.radius))} />
            <Row
              label={t('inspector.tidalAccel')}
              value={`${fmtNum(tidalAcceleration(host.mass, Math.hypot(b.x - host.x, b.y - host.y, b.z - host.z), 2 * b.radius))} m/s²`}
            />
          </>
        )}
      </Section>
    </>
  );
}

/** Logarithmic slider row with a formatted value. */
function LogSlider({
  label,
  value,
  range,
  format,
  onChange,
  swatch,
}: {
  label: string;
  value: number;
  range: [number, number];
  format: (v: number) => string;
  onChange: (v: number) => void;
  swatch?: string;
}) {
  const [lo, hi] = [Math.log10(range[0]), Math.log10(range[1])];
  return (
    <div className="mb-2">
      <div className="mb-0.5 flex items-baseline justify-between">
        <span className="text-[12px] text-slate-400">{label}</span>
        <span className="flex items-center gap-1.5 font-mono text-[12px] text-slate-100">
          {swatch && <span className="h-2.5 w-2.5 rounded-full" style={{ background: swatch, boxShadow: `0 0 6px ${swatch}` }} />}
          {format(value)}
        </span>
      </div>
      <Slider value={Math.min(hi, Math.max(lo, Math.log10(value)))} min={lo} max={hi} step={(hi - lo) / 500} onChange={(v) => onChange(10 ** v)} />
    </div>
  );
}

function SmallButton({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      title={label}
      className="flex items-center gap-1 rounded bg-white/[0.04] px-1.5 py-0.5 text-[10px] text-slate-300 ring-1 ring-white/10 transition hover:bg-white/[0.09] hover:text-white"
    >
      {icon}
      {label}
    </button>
  );
}

function SystemPanel({ t }: { t: TFn }) {
  const sim = engine.sim;
  const counts = new Map<string, number>();
  let mass = 0;
  for (const b of sim.bodies) {
    counts.set(b.kind, (counts.get(b.kind) ?? 0) + 1);
    mass += b.mass;
  }
  return (
    <>
      <div className="border-b border-white/5 px-4 py-3 text-[12px] text-slate-500">{t('inspector.none')}</div>
      <Section title={t('inspector.system')}>
        <Row label={t('inspector.bodies')} value={sim.bodies.length} />
        <Row label={t('inspector.totalMass')} value={fmtMass(mass)} />
        {[...counts.entries()].map(([k, n]) => (
          <Row key={k} label={t(`kinds.${k}`)} value={n} />
        ))}
        <Row label={t('gw.radiated')} value={sim.gw.radiated > 0 ? fmtEnergy(sim.gw.radiated) : '-'} />
      </Section>
    </>
  );
}

function formatEvent(e: SimEvent, lang: Lang): string {
  const d = e.data;
  const p: Record<string, string> = {};
  for (const [k, v] of Object.entries(d)) p[k] = String(v);
  const num = (k: string) => Number(d[k]);
  switch (e.kind) {
    case 'merger':
      p.mf = fmtMass(num('mf'));
      p.af = num('af').toFixed(2);
      p.erad = `${fmtNum(num('erad') / (M_SUN * C * C))} M☉c²`;
      p.frac = `${(num('frac') * 100).toFixed(1)}%`;
      p.kick = fmtSpeed(num('kick'));
      p.f = `${fmtNum(num('f'))} Hz`;
      break;
    case 'tde':
      p.rt = fmtLength(num('rt'));
      break;
    case 'planetImpact':
      p.v = fmtSpeed(num('v'));
      p.vesc = fmtSpeed(num('vesc'));
      p.frac = `${(num('frac') * 100).toFixed(0)}%`;
      p.outcome = translate(lang, `events.outcomes.${d.outcome}`);
      break;
    case 'evaporation':
      p.energy = fmtEnergy(num('energy'));
      break;
    case 'collision':
    case 'kilonova':
    case 'collapse':
    case 'supernova':
      p.mass = fmtMass(num('mass'));
      break;
  }
  return translate(lang, `events.${e.kind}`, p);
}

function EventLog({ events, lang, t }: { events: SimEvent[]; lang: Lang; t: TFn }) {
  const list = events.slice(-30).reverse();
  return (
    <div className="max-h-[38%] shrink-0 overflow-y-auto border-t border-white/5">
      <div className="sticky top-0 bg-[#0b0f1a]/95 px-4 pt-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500 backdrop-blur">
        {t('inspector.events')}
      </div>
      <div className="space-y-2 px-4 pb-3">
        {list.length === 0 && <div className="text-[12px] text-slate-600">{t('inspector.noEvents')}</div>}
        {list.map((e) => (
          <div key={e.id} className="rounded-md border border-white/5 bg-white/[0.02] p-2">
            <div className="mb-0.5 font-mono text-[10px] text-orange-300/80">t = {fmtTime(e.time)}</div>
            <div className="text-[12px] leading-snug text-slate-300">{formatEvent(e, lang)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
