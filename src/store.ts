import { create } from 'zustand';
import type { StarPreset, PlanetPreset } from './engine/bodies';

export type ViewKind = 'map' | 'curvature' | 'field' | 'realistic' | 'data';
export type Layout = 'single' | 'split2' | 'split3' | 'quad';
export type ToolKind = 'select' | 'blackHole' | 'star' | 'planet' | 'ship' | 'meteors' | 'photons';
export type VelocityMode = 'orbit' | 'drag' | 'rest';
export type Lang = 'hu' | 'en';

export interface ToolParams {
  /** log10 of black hole mass in kg */
  bhMassLog: number;
  bhSpin: number;
  bhDisk: boolean;
  starPreset: StarPreset;
  planetPreset: PlanetPreset;
  meteorCount: number;
  photonCount: number;
  shipModel: string;
  /** Photon beam wavelength, nm. */
  photonWavelength: number;
  /** Spread the beam across the visible spectrum. */
  photonRainbow: boolean;
  velocityMode: VelocityMode;
}

export interface MapOptions {
  trails: boolean;
  grid: boolean;
  labels: boolean;
  zones: boolean;
}

export interface CurvatureOptions {
  exaggeration: number;
  trails: boolean;
  labels: boolean;
}

export interface FieldOptions {
  density: 'normal' | 'fine';
  /** Several layers above and below the orbital plane instead of a single plane. */
  volume: boolean;
  labels: boolean;
}

export interface RealisticOptions {
  mode: 'physical' | 'cinematic';
  exposure: number;
  quality: 'auto' | 'low' | 'high';
  labels: boolean;
  particles: boolean;
  /** Look at the selected body from the body it orbits (e.g. the Moon as seen from the Earth). */
  fromHost: boolean;
}

interface UIState {
  lang: Lang;
  layout: Layout;
  panels: ViewKind[];
  running: boolean;
  warp: number;
  selectedId: number | null;
  follow: boolean;
  tool: ToolKind;
  params: ToolParams;
  scenarioId: string;
  map: MapOptions;
  curvature: CurvatureOptions;
  field: FieldOptions;
  realistic: RealisticOptions;
  aboutOpen: boolean;
  /** Object list panel on the right. */
  listOpen: boolean;
  /** Realistic camera stays at the selected body and keeps facing this body (or null). */
  lookAtId: number | null;
  /** Panel shown alone (double-click on a view), or null. */
  maximized: number | null;
  /** Bumped ~8x per second so panels showing live numbers re-render. */
  tick: number;
  set: (p: Partial<UIState>) => void;
  setParams: (p: Partial<ToolParams>) => void;
  setPanel: (i: number, v: ViewKind) => void;
  setMap: (p: Partial<MapOptions>) => void;
  setCurvature: (p: Partial<CurvatureOptions>) => void;
  setField: (p: Partial<FieldOptions>) => void;
  setRealistic: (p: Partial<RealisticOptions>) => void;
}

// Optional URL parameters (shareable links): ?scenario=gw150914&layout=split2&views=realistic,map&lang=en
const query = new URLSearchParams(window.location.search);
const VIEW_KINDS: ViewKind[] = ['map', 'curvature', 'field', 'realistic', 'data'];
const LAYOUTS: Layout[] = ['single', 'split2', 'split3', 'quad'];
const queryViews = (query.get('views') ?? '').split(',').filter((v): v is ViewKind => VIEW_KINDS.includes(v as ViewKind));
const defaultPanels: ViewKind[] = ['realistic', 'map', 'curvature', 'data'];
const initialPanels = defaultPanels.map((v, i) => queryViews[i] ?? v);
const queryLayout = query.get('layout') as Layout | null;

const initialLang: Lang =
  (query.get('lang') as Lang | null) ??
  (localStorage.getItem('bhs.lang') as Lang | null) ??
  (navigator.language?.startsWith('hu') ? 'hu' : 'en');

export const useUI = create<UIState>((set) => ({
  lang: initialLang,
  layout: queryLayout && LAYOUTS.includes(queryLayout) ? queryLayout : 'split3',
  panels: initialPanels,
  running: true,
  warp: 1,
  selectedId: null,
  follow: true,
  tool: 'select',
  params: {
    bhMassLog: Math.log10(10 * 1.98847e30),
    bhSpin: 0,
    bhDisk: false,
    starPreset: 'sun',
    planetPreset: 'earth',
    meteorCount: 120,
    photonCount: 24,
    shipModel: 'enterprise',
    photonWavelength: 560,
    photonRainbow: false,
    velocityMode: 'orbit',
  },
  scenarioId: query.get('scenario') ?? 'sgrA',
  map: { trails: true, grid: true, labels: true, zones: true },
  curvature: { exaggeration: 1, trails: true, labels: true },
  field: { density: 'normal', volume: true, labels: true },
  realistic: { mode: 'physical', exposure: 1, quality: 'auto', labels: true, particles: true, fromHost: false },
  aboutOpen: false,
  listOpen: false,
  maximized: null,
  lookAtId: null,
  tick: 0,
  set: (p) => set(p),
  setParams: (p) => set((s) => ({ params: { ...s.params, ...p } })),
  setPanel: (i, v) =>
    set((s) => {
      const panels = [...s.panels];
      panels[i] = v;
      return { panels };
    }),
  setMap: (p) => set((s) => ({ map: { ...s.map, ...p } })),
  setCurvature: (p) => set((s) => ({ curvature: { ...s.curvature, ...p } })),
  setField: (p) => set((s) => ({ field: { ...s.field, ...p } })),
  setRealistic: (p) => set((s) => ({ realistic: { ...s.realistic, ...p } })),
}));

useUI.subscribe((s, prev) => {
  if (s.lang !== prev.lang) localStorage.setItem('bhs.lang', s.lang);
});

export const WARP_MIN = 1e-6;
export const WARP_MAX = 1e15;
