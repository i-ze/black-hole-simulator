import { Activity, Box, Compass, Eye, Map as MapIcon, Scan, X } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { isHandled, makeDoubleTap } from '../views/doubleTap';
import { engine } from '../engine/engine';
import { useT } from '../i18n';
import { fmtNum } from '../physics/units';
import { useUI, type ViewKind } from '../store';
import { CurvatureView } from '../views/CurvatureView';
import { DataView } from '../views/DataView';
import { FieldView } from '../views/FieldView';
import { MapView } from '../views/MapView';
import { RealisticView } from '../views/RealisticView';
import { Segmented, Slider } from './controls';

const ICONS: Record<ViewKind, ReactNode> = {
  map: <MapIcon size={13} />,
  curvature: <Box size={13} />,
  field: <Compass size={13} />,
  realistic: <Eye size={13} />,
  data: <Activity size={13} />,
};

export function PanelGrid() {
  const layout = useUI((s) => s.layout);
  const panels = useUI((s) => s.panels);
  const maximized = useUI((s) => s.maximized);
  const cell = (i: number) => <Panel key={`${i}-${panels[i]}`} index={i} kind={panels[i]} />;
  if (maximized != null) return <div className="grid min-h-0 flex-1 p-1.5">{cell(maximized)}</div>;
  if (layout === 'single') return <div className="grid min-h-0 flex-1 p-1.5">{cell(0)}</div>;
  if (layout === 'split2') return <div className="grid min-h-0 flex-1 grid-cols-2 gap-1.5 p-1.5">{[cell(0), cell(1)]}</div>;
  if (layout === 'split3')
    return (
      <div className="grid min-h-0 flex-1 grid-cols-[1.35fr_1fr] gap-1.5 p-1.5">
        {cell(0)}
        <div className="grid min-h-0 grid-rows-2 gap-1.5">
          {cell(1)}
          {cell(2)}
        </div>
      </div>
    );
  return <div className="grid min-h-0 flex-1 grid-cols-2 grid-rows-2 gap-1.5 p-1.5">{[cell(0), cell(1), cell(2), cell(3)]}</div>;
}

function Panel({ index, kind }: { index: number; kind: ViewKind }) {
  const t = useT();
  const [tap] = useState(() => makeDoubleTap());
  const setPanel = useUI((s) => s.setPanel);
  return (
    <div className="relative flex min-h-0 min-w-0 flex-col overflow-hidden rounded-lg bg-black ring-1 ring-white/[0.07]">
      <div className="@container z-10 flex h-8 shrink-0 items-center gap-2 border-b border-white/5 bg-[#0a0d16] px-2">
        <div className="relative">
          <select
            value={kind}
            onChange={(e) => setPanel(index, e.target.value as ViewKind)}
            className="appearance-none rounded bg-transparent py-0.5 pr-5 pl-6 text-[12px] font-medium text-slate-200 outline-none hover:bg-white/5"
          >
            {(['realistic', 'map', 'curvature', 'field', 'data'] as ViewKind[]).map((v) => (
              <option key={v} value={v} className="bg-slate-900">
                {t(`views.${v}`)}
              </option>
            ))}
          </select>
          <span className="pointer-events-none absolute top-1/2 left-1.5 -translate-y-1/2 text-orange-300">{ICONS[kind]}</span>
          <span className="pointer-events-none absolute top-1/2 right-1 -translate-y-1/2 text-[9px] text-slate-500">▼</span>
        </div>
        <div className="ml-auto flex min-w-0 items-center gap-2">
          <PanelOptions kind={kind} />
          {kind !== 'data' && (
            <button
              onClick={() => engine.fitAll(kind === 'realistic' ? 'camera' : 'frame')}
              title={t('fitAllHint')}
              className="flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium text-slate-400 transition hover:bg-white/10 hover:text-slate-100"
            >
              <Scan size={12} />
              <span className="hidden @[720px]:inline">{t('fitAll')}</span>
            </button>
          )}
        </div>
      </div>
      <div
        className="relative min-h-0 flex-1"
        onPointerDown={(e) => tap.down(e)}
        onPointerUp={(e) => {
          // Double-click (in select mode) shows this view alone; again restores the layout.
          const st = useUI.getState();
          if (tap.up(e) !== 'double' || st.tool !== 'select' || isHandled(e.nativeEvent)) return;
          useUI.setState({ maximized: st.maximized == null ? index : null });
        }}
      >
        {kind === 'map' && <MapView />}
        {kind === 'curvature' && (
          <>
            <CurvatureView />
            <DilationLegend />
          </>
        )}
        {kind === 'field' && (
          <>
            <FieldView />
            <FieldLegend />
          </>
        )}
        {kind === 'realistic' && (
          <>
            <RealisticView />
            <div className="pointer-events-none absolute bottom-2 left-3 text-[10px] text-slate-400/70">{t('real.note')}</div>
          </>
        )}
        {kind === 'data' && <DataView />}
      </div>
    </div>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] font-medium transition ${on ? 'bg-white/10 text-slate-100' : 'text-slate-500 hover:text-slate-300'}`}
    >
      {children}
    </button>
  );
}

function PanelOptions({ kind }: { kind: ViewKind }) {
  const t = useT();
  const map = useUI((s) => s.map);
  const setMap = useUI((s) => s.setMap);
  const curv = useUI((s) => s.curvature);
  const setCurv = useUI((s) => s.setCurvature);
  const field = useUI((s) => s.field);
  const setField = useUI((s) => s.setField);
  const real = useUI((s) => s.realistic);
  const lookAtId = useUI((s) => s.lookAtId);
  useUI((s) => (kind === 'realistic' && s.lookAtId != null ? s.tick : 0));
  const lookAt = lookAtId != null ? engine.sim.get(lookAtId) : undefined;
  const setReal = useUI((s) => s.setRealistic);
  useUI((s) => (kind === 'curvature' ? s.tick : 0));

  if (kind === 'map')
    return (
      <>
        {(['trails', 'grid', 'labels', 'zones'] as const).map((k) => (
          <Chip key={k} on={map[k]} onClick={() => setMap({ [k]: !map[k] })}>
            {t(`map.${k}`)}
          </Chip>
        ))}
      </>
    );
  if (kind === 'curvature')
    return (
      <>
        <span className="hidden whitespace-nowrap text-[10px] text-slate-500 2xl:inline">{t('curv.exaggeration')}</span>
        <div className="w-20">
          <Slider value={Math.log10(curv.exaggeration)} min={-1} max={1} step={0.01} onChange={(v) => setCurv({ exaggeration: 10 ** v })} />
        </div>
        <span className="w-16 font-mono text-[10px] text-slate-300" title={t('curv.trueScale') + ' = ×1'}>
          ×{fmtNum(engine.curvatureScale, 2)}
        </span>
        <Chip on={curv.trails} onClick={() => setCurv({ trails: !curv.trails })}>
          {t('map.trails')}
        </Chip>
        <Chip on={curv.labels} onClick={() => setCurv({ labels: !curv.labels })}>
          {t('map.labels')}
        </Chip>
      </>
    );
  if (kind === 'field')
    return (
      <>
        <Segmented
          size="sm"
          value={field.volume ? 'volume' : 'plane'}
          onChange={(v) => setField({ volume: v === 'volume' })}
          options={[
            { value: 'plane', label: t('field.plane') },
            { value: 'volume', label: t('field.volume') },
          ]}
        />
        <Segmented
          size="sm"
          value={field.density}
          onChange={(v) => setField({ density: v })}
          options={[
            { value: 'normal', label: t('field.normal') },
            { value: 'fine', label: t('field.fine') },
          ]}
        />
        <Chip on={field.labels} onClick={() => setField({ labels: !field.labels })}>
          {t('map.labels')}
        </Chip>
      </>
    );
  if (kind === 'realistic')
    return (
      <>
        {lookAt && (
          <button
            onClick={() => engine.clearLookAt()}
            title={t('real.lookAtClear')}
            className="flex shrink-0 items-center gap-1 whitespace-nowrap rounded bg-sky-400/15 px-1.5 py-0.5 text-[10px] font-medium text-sky-100 ring-1 ring-sky-300/30 hover:bg-sky-400/25"
          >
            <Eye size={11} /> {lookAt.name} · {engine.cam.fov < 1 ? engine.cam.fov.toFixed(2) : engine.cam.fov.toFixed(1)}° <X size={11} />
          </button>
        )}
        <Segmented
          size="sm"
          value={real.mode}
          onChange={(v) => setReal({ mode: v })}
          options={[
            { value: 'physical', label: t('real.physical') },
            { value: 'cinematic', label: t('real.cinematic') },
          ]}
        />
        <div className="hidden w-16 xl:block" title={t('real.exposure')}>
          <Slider value={Math.log10(real.exposure)} min={-1.5} max={1.5} step={0.01} onChange={(v) => setReal({ exposure: 10 ** v })} />
        </div>
        <Segmented
          size="sm"
          value={real.quality}
          onChange={(v) => setReal({ quality: v })}
          options={[
            { value: 'low', label: t('real.low') },
            { value: 'auto', label: t('real.auto') },
            { value: 'high', label: t('real.high') },
          ]}
        />
        <Chip on={real.labels} onClick={() => setReal({ labels: !real.labels })}>
          {t('map.labels')}
        </Chip>
        <span title={t('real.fromHostHint')}>
          <Chip on={real.fromHost} onClick={() => setReal({ fromHost: !real.fromHost })}>
            {t('real.fromHost')}
          </Chip>
        </span>
      </>
    );
  return null;
}

function DilationLegend() {
  const t = useT();
  return (
    <div className="pointer-events-none absolute bottom-2 left-2 w-[236px] rounded-md bg-black/55 px-2 py-1.5 text-[10px] text-slate-400 backdrop-blur-sm">
      <div className="mb-1 flex justify-between font-mono">
        <span>dτ/dt = 0</span>
        <span>0.5</span>
        <span>1</span>
      </div>
      <div className="h-1.5 rounded-full" style={{ background: 'linear-gradient(90deg, #000 0%, #d91f1a 8%, #fa9438 60%, #8f6bfa 90%, #4dc7fa 100%)' }} />
      <div className="mt-1 leading-snug text-slate-500">{t('curv.note')}</div>
    </div>
  );
}

function FieldLegend() {
  const t = useT();
  useUI((s) => s.tick);
  const [lo, hi] = engine.fieldRange;
  return (
    <div className="pointer-events-none absolute bottom-2 left-2 w-[260px] rounded-md bg-black/55 px-2 py-1.5 text-[10px] text-slate-400 backdrop-blur-sm">
      <div className="mb-1 flex justify-between font-mono">
        <span>{hi > 0 ? `${fmtNum(lo, 2)} m/s²` : '-'}</span>
        <span>{hi > 0 ? `${fmtNum(hi, 2)} m/s²` : ''}</span>
      </div>
      <div className="h-1.5 rounded-full" style={{ background: 'linear-gradient(90deg, rgba(41,140,217,0.25) 0%, #8c66f2 40%, #fa8c33 80%, #ffeecc 100%)' }} />
      <div className="mt-1 leading-snug text-slate-500">{t('field.note')}</div>
    </div>
  );
}
