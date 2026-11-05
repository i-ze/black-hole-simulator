import { ChevronDown, ChevronRight, Search, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { engine } from '../engine/engine';
import { shipById } from '../engine/ships';
import { starHex } from '../engine/simulation';
import type { Body, BodyKind } from '../engine/types';
import { useT } from '../i18n';
import { wavelengthCss } from '../physics/spectrum';
import { fmtMass } from '../physics/units';
import { useUI } from '../store';
import { ShipIcon } from './ShipIcon';
import { PlanetIcon } from './PlanetIcon';
import { planetById } from '../engine/planets';

const GROUPS: { key: string; kinds: BodyKind[]; collapsed?: boolean }[] = [
  { key: 'blackHole', kinds: ['blackHole'] },
  { key: 'star', kinds: ['star', 'neutronStar', 'whiteDwarf'] },
  { key: 'planet', kinds: ['planet'] },
  { key: 'ship', kinds: ['ship'] },
  { key: 'photon', kinds: ['photon'], collapsed: true },
  { key: 'meteor', kinds: ['meteor', 'debris'], collapsed: true },
];

/** Long groups (swarms, debris) only list this many entries. */
const MAX_ROWS = 200;

export function ObjectList() {
  const t = useT();
  useUI((s) => s.tick);
  const selectedId = useUI((s) => s.selectedId);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [menu, setMenu] = useState<{ x: number; y: number; id: number } | null>(null);
  const q = query.trim().toLowerCase();
  const bodies = engine.sim.bodies.filter((b) => !q || b.name.toLowerCase().includes(q) || (shipById(b.model)?.franchise.toLowerCase().includes(q) ?? false));

  return (
    <aside className="panel-glass flex w-[250px] shrink-0 flex-col overflow-hidden border-l border-white/5">
      <div className="flex items-center gap-2 border-b border-white/5 px-3 py-2.5">
        <h3 className="flex-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
          {t('list.title')} <span className="text-slate-600">· {engine.sim.bodies.length}</span>
        </h3>
        <button className="rounded p-1 text-slate-500 hover:bg-white/5 hover:text-white" onClick={() => useUI.setState({ listOpen: false })} aria-label={t('about.close')}>
          <X size={14} />
        </button>
      </div>
      <div className="border-b border-white/5 px-3 py-2">
        <div className="flex items-center gap-2 rounded-md bg-white/[0.04] px-2 py-1 ring-1 ring-white/5 focus-within:ring-sky-400/40">
          <Search size={13} className="text-slate-500" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('list.search')}
            className="w-full bg-transparent text-[12px] text-slate-200 outline-none placeholder:text-slate-600"
          />
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto py-1">
        {GROUPS.map((g) => {
          const items = bodies.filter((b) => g.kinds.includes(b.kind));
          if (!items.length) return null;
          const isOpen = open[g.key] ?? (!g.collapsed || !!q);
          return (
            <div key={g.key}>
              <button
                className="flex w-full items-center gap-1.5 px-3 py-1.5 text-left text-[11px] font-medium text-slate-400 hover:text-slate-200"
                onClick={() => setOpen({ ...open, [g.key]: !isOpen })}
              >
                {isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                <span className="flex-1">{t(`list.groups.${g.key}`)}</span>
                <span className="font-mono text-[10px] text-slate-600">{items.length}</span>
              </button>
              {isOpen &&
                items.slice(0, MAX_ROWS).map((b) => (
                  <Row key={b.id} b={b} selected={b.id === selectedId} onMenu={(x, y) => setMenu({ x, y, id: b.id })} />
                ))}
              {isOpen && items.length > MAX_ROWS && (
                <div className="px-8 py-1 text-[10px] text-slate-600">+{items.length - MAX_ROWS}</div>
              )}
            </div>
          );
        })}
        {bodies.length === 0 && <div className="px-4 py-3 text-[12px] text-slate-600">{t('list.empty')}</div>}
      </div>
      <div className="border-t border-white/5 px-3 py-2 text-[10px] text-slate-600">{t('list.hint')}</div>
      {menu && <ContextMenu {...menu} onClose={() => setMenu(null)} />}
    </aside>
  );
}

function Row({ b, selected, onMenu }: { b: Body; selected: boolean; onMenu: (x: number, y: number) => void }) {
  const model = shipById(b.model);
  const sub =
    b.kind === 'ship' ? (model?.franchise ?? '') : b.kind === 'photon' ? `${Math.round(engine.sim.photonWavelength(b))} nm` : fmtMass(b.mass);
  return (
    <button
      onClick={() => useUI.setState({ selectedId: b.id, follow: true })}
      onDoubleClick={() => engine.zoomTo(b.id)}
      onContextMenu={(e) => {
        e.preventDefault();
        onMenu(e.clientX, e.clientY);
      }}
      className={`flex w-full items-center gap-2 px-3 py-1 text-left transition ${selected ? 'bg-sky-400/10 text-white' : 'text-slate-300 hover:bg-white/[0.04]'}`}
    >
      <span className="flex w-[40px] shrink-0 justify-center">
        {b.kind === 'ship' && model ? <ShipIcon id={model.id} beam={model.beam} /> : b.kind === 'planet' && planetById(b.model) ? <PlanetIcon id={b.model!} size={18} /> : <Swatch b={b} />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[12px]">{b.name}</span>
        <span className="block truncate text-[10px] text-slate-500">{sub}</span>
      </span>
    </button>
  );
}

/**
 * Right-click menu of a list row. "Look at this from <selected>" keeps the realistic camera at the
 * selected body, always facing this one.
 */
function ContextMenu({ x, y, id, onClose }: { x: number; y: number; id: number; onClose: () => void }) {
  const t = useT();
  const selectedId = useUI((s) => s.selectedId);
  const lookAtId = useUI((s) => s.lookAtId);
  const body = engine.sim.get(id);
  const from = engine.sim.get(selectedId);
  useEffect(() => {
    const close = () => onClose();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('pointerdown', close);
    window.addEventListener('keydown', onKey);
    window.addEventListener('wheel', close);
    return () => {
      window.removeEventListener('pointerdown', close);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('wheel', close);
    };
  }, [onClose]);
  if (!body) return null;
  const canLook = !!from && from.id !== id;
  const item = (label: string, action: (() => void) | null, accent = false) => (
    <button
      disabled={!action}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={() => {
        action?.();
        onClose();
      }}
      className={`block w-full px-3 py-1.5 text-left text-[12px] transition ${
        !action ? 'cursor-default text-slate-600' : accent ? 'text-sky-100 hover:bg-sky-400/15' : 'text-slate-200 hover:bg-white/[0.06]'
      }`}
    >
      {label}
    </button>
  );
  return (
    <div
      className="fixed z-50 min-w-[220px] overflow-hidden rounded-md border border-white/10 bg-[#0b0f1a]/98 py-1 shadow-2xl backdrop-blur"
      style={{ left: Math.min(x, window.innerWidth - 240), top: Math.min(y, window.innerHeight - 160) }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="truncate px-3 pt-1 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">{body.name}</div>
      {canLook ? item(t('list.menu.lookAt', { from: from!.name }), () => engine.setLookAt(id), true) : item(t('list.menu.needFrom'), null)}
      {item(t('list.menu.select'), () => useUI.setState({ selectedId: id, follow: true }))}
      {item(t('list.menu.zoom'), () => engine.zoomTo(id))}
      {lookAtId != null && item(t('list.menu.clear'), () => engine.clearLookAt())}
    </div>
  );
}

function Swatch({ b }: { b: Body }) {
  if (b.kind === 'blackHole')
    return <span className="h-3.5 w-3.5 rounded-full bg-black" style={{ boxShadow: '0 0 0 1.5px rgba(251,146,60,0.9), 0 0 8px rgba(251,146,60,0.5)' }} />;
  const color =
    b.kind === 'photon' ? wavelengthCss(engine.sim.photonWavelength(b)) : b.kind === 'planet' || b.kind === 'meteor' || b.kind === 'debris' ? b.color : starHex(b.temperature);
  const size = b.kind === 'meteor' || b.kind === 'debris' || b.kind === 'photon' ? 6 : 11;
  return <span className="rounded-full" style={{ width: size, height: size, background: color, boxShadow: `0 0 6px ${color}` }} />;
}
