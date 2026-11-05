import { BookOpen, ChevronDown, Columns2, Expand, Grid2x2, List, PanelsLeftRight, Square } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { engine } from '../engine/engine';
import { SCENARIOS } from '../engine/scenarios';
import { useT } from '../i18n';
import { SCENARIO_TEXT } from '../i18n/scenarios';
import { useUI, type Layout } from '../store';
import { IconButton, Segmented } from './controls';

export function Logo() {
  return (
    <svg width="26" height="26" viewBox="0 0 64 64" aria-hidden>
      <defs>
        <radialGradient id="lg" cx="50%" cy="50%" r="50%">
          <stop offset="0.38" stopColor="#000" />
          <stop offset="0.47" stopColor="#ffe2a8" />
          <stop offset="0.62" stopColor="#ff8a2a" stopOpacity="0.65" />
          <stop offset="1" stopColor="#000" stopOpacity="0" />
        </radialGradient>
      </defs>
      <ellipse cx="32" cy="32" rx="30" ry="8" fill="#ff9a3c" opacity="0.55" />
      <circle cx="32" cy="32" r="24" fill="url(#lg)" />
      <circle cx="32" cy="32" r="9.5" fill="#000" />
    </svg>
  );
}

export function TopBar() {
  const t = useT();
  const lang = useUI((s) => s.lang);
  const layout = useUI((s) => s.layout);
  const scenarioId = useUI((s) => s.scenarioId);
  const listOpen = useUI((s) => s.listOpen);
  const [open, setOpen] = useState(false);
  const menu = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!menu.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [open]);

  const layouts: { value: Layout; icon: React.ReactNode }[] = [
    { value: 'single', icon: <Square size={14} /> },
    { value: 'split2', icon: <Columns2 size={14} /> },
    { value: 'split3', icon: <PanelsLeftRight size={14} /> },
    { value: 'quad', icon: <Grid2x2 size={14} /> },
  ];

  return (
    <header className="panel-glass relative z-30 flex h-12 shrink-0 items-center gap-4 border-b border-white/5 px-4">
      <div className="flex items-center gap-2.5">
        <Logo />
        <div className="leading-tight">
          <div className="text-[13px] font-semibold tracking-[0.18em] text-white">EVENT HORIZON</div>
          <div className="text-[10px] tracking-wide text-slate-500">{t('app.subtitle')}</div>
        </div>
      </div>

      <div className="relative ml-4" ref={menu}>
        <button
          onClick={() => setOpen(!open)}
          className="flex items-center gap-2 rounded-md bg-white/[0.04] px-3 py-1.5 text-[13px] text-slate-200 ring-1 ring-white/10 transition hover:bg-white/[0.07]"
        >
          <span className="text-[10px] uppercase tracking-wider text-slate-500">{t('scenario')}</span>
          <span className="max-w-[300px] truncate font-medium">{SCENARIO_TEXT[scenarioId]?.[lang].title}</span>
          <ChevronDown size={14} className="text-slate-400" />
        </button>
        {open && (
          <div className="absolute top-full left-0 mt-2 max-h-[75vh] w-[460px] overflow-y-auto rounded-lg border border-white/10 bg-[#0b0f1a]/98 p-1.5 shadow-2xl backdrop-blur">
            {SCENARIOS.map((s) => (
              <button
                key={s.id}
                onClick={() => {
                  engine.loadScenario(s.id);
                  setOpen(false);
                }}
                className={`block w-full rounded-md px-3 py-2 text-left transition ${s.id === scenarioId ? 'bg-orange-400/10' : 'hover:bg-white/[0.04]'}`}
              >
                <div className={`text-[13px] font-medium ${s.id === scenarioId ? 'text-orange-100' : 'text-slate-100'}`}>{SCENARIO_TEXT[s.id]?.[lang].title}</div>
                <div className="mt-0.5 text-[11px] leading-snug text-slate-400">{SCENARIO_TEXT[s.id]?.[lang].desc}</div>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="ml-auto flex items-center gap-3">
        <div className="flex items-center gap-0.5 rounded-md bg-white/[0.04] p-0.5 ring-1 ring-white/5">
          {layouts.map((l) => (
            <IconButton key={l.value} title={t(`layout.${l.value}`)} active={layout === l.value} onClick={() => useUI.setState({ layout: l.value })} className="h-7 w-7">
              {l.icon}
            </IconButton>
          ))}
        </div>
        <Segmented
          size="sm"
          value={lang}
          onChange={(v) => useUI.setState({ lang: v })}
          options={[
            { value: 'hu', label: 'HU' },
            { value: 'en', label: 'EN' },
          ]}
        />
        <button
          onClick={() => useUI.setState({ listOpen: !listOpen })}
          title={`${t('list.title')} (L)`}
          className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[12px] transition ${
            listOpen ? 'bg-sky-400/15 text-sky-100 ring-1 ring-sky-300/25' : 'text-slate-300 hover:bg-white/5 hover:text-white'
          }`}
        >
          <List size={14} />
          <span className="hidden lg:inline">{t('list.title')}</span>
        </button>
        <button
          onClick={() => useUI.setState({ aboutOpen: true })}
          className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[12px] text-slate-300 transition hover:bg-white/5 hover:text-white"
        >
          <BookOpen size={14} />
          <span className="hidden lg:inline">{t('about.open')}</span>
        </button>
        <IconButton
          title={t('fullscreen')}
          onClick={() => {
            if (document.fullscreenElement) document.exitFullscreen();
            else document.documentElement.requestFullscreen();
          }}
        >
          <Expand size={15} />
        </IconButton>
      </div>
    </header>
  );
}
