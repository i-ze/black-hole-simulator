import { useEffect, useRef, type RefObject } from 'react';

export interface CanvasSize {
  width: number;
  height: number;
  dpr: number;
}

/** Tracks the CSS size of an element and its device pixel ratio without causing re-renders. */
export function useElementSize(ref: RefObject<HTMLElement | null>): RefObject<CanvasSize> {
  const size = useRef<CanvasSize>({ width: 1, height: 1, dpr: 1 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      const r = el.getBoundingClientRect();
      size.current = { width: Math.max(1, r.width), height: Math.max(1, r.height), dpr: Math.min(2, window.devicePixelRatio || 1) };
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return size;
}
