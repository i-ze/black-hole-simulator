import * as THREE from 'three';
import { engine } from '../engine/engine';
import { useUI } from '../store';
import { makeDoubleTap, markHandled } from './doubleTap';

export interface Pickable {
  id: number;
  pos: THREE.Vector3;
  /** Preferred over particles at similar distance. */
  massive: boolean;
}

/**
 * Click selection for the 3D views: a click (not a drag) selects the nearest projected body
 * within 14 px; a double-click on a body zooms to it instead of maximizing the panel.
 */
export function attachPicking(el: HTMLElement, camera: () => THREE.Camera, items: () => Pickable[]): () => void {
  const v = new THREE.Vector3();
  const nearest = (e: MouseEvent): number | null => {
    const r = el.getBoundingClientRect();
    const mx = e.clientX - r.left;
    const my = e.clientY - r.top;
    let best: number | null = null;
    let bestD = 14;
    const cam = camera();
    for (const it of items()) {
      v.copy(it.pos).project(cam);
      if (v.z > 1 || v.z < -1) continue;
      const sx = (v.x * 0.5 + 0.5) * r.width;
      const sy = (-v.y * 0.5 + 0.5) * r.height;
      const d = Math.hypot(sx - mx, sy - my) - (it.massive ? 4 : 0);
      if (d < bestD) {
        bestD = d;
        best = it.id;
      }
    }
    return best;
  };
  const tap = makeDoubleTap();
  const onDown = (e: PointerEvent) => tap.down(e);
  const onUp = (e: PointerEvent) => {
    if (useUI.getState().tool !== 'select') return;
    const kind = tap.up(e);
    if (kind === 'drag') return;
    const id = nearest(e);
    if (kind === 'double' && id != null) {
      // Double-click on a body zooms to it instead of maximizing the panel.
      markHandled(e);
      engine.zoomTo(id);
    } else if (kind === 'click' && id != null) useUI.setState({ selectedId: id });
  };
  el.addEventListener('pointerdown', onDown);
  el.addEventListener('pointerup', onUp);
  return () => {
    el.removeEventListener('pointerdown', onDown);
    el.removeEventListener('pointerup', onUp);
  };
}
