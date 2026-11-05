import { useEffect } from 'react';
import { engine } from './engine/engine';
import { useUI } from './store';
import { AboutModal } from './ui/AboutModal';
import { Inspector } from './ui/Inspector';
import { ObjectList } from './ui/ObjectList';
import { PanelGrid } from './ui/PanelGrid';
import { TimeBar } from './ui/TimeBar';
import { Toolbox } from './ui/Toolbox';
import { TopBar } from './ui/TopBar';

export default function App() {
  const listOpen = useUI((s) => s.listOpen);
  useEffect(() => {
    engine.loadScenario(useUI.getState().scenarioId);
    engine.start();
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      const s = useUI.getState();
      if (e.code === 'Space') {
        e.preventDefault();
        useUI.setState({ running: !s.running });
      } else if (e.key === 'Escape') {
        if (s.lookAtId != null) engine.clearLookAt();
        useUI.setState({ tool: 'select', maximized: null });
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && s.selectedId != null) {
        engine.sim.remove(s.selectedId);
      } else if (e.key === 'l') {
        useUI.setState({ listOpen: !s.listOpen });
      } else if (e.key === 'f') {
        useUI.setState({ follow: !s.follow });
      } else if (e.key === '[' || e.key === ']') {
        useUI.setState({ warp: Math.min(1e15, Math.max(1e-6, s.warp * (e.key === ']' ? 10 : 0.1))) });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="flex h-full flex-col">
      <TopBar />
      <div className="flex min-h-0 flex-1">
        <Toolbox />
        <main className="flex min-w-0 flex-1 flex-col bg-ink-950">
          <PanelGrid />
        </main>
        {listOpen && <ObjectList />}
        <Inspector />
      </div>
      <TimeBar />
      <AboutModal />
    </div>
  );
}
