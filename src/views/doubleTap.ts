/**
 * Double-click / double-tap detection from pointer events. The native 'dblclick' is unreliable
 * when views use pointer capture, so two quick clicks (no drag) at nearly the same spot count.
 */
export function makeDoubleTap(maxDelay = 350, maxDist = 8) {
  let downX = 0;
  let downY = 0;
  let lastUp = -Infinity;
  let lastX = 0;
  let lastY = 0;
  return {
    down(e: { clientX: number; clientY: number }) {
      downX = e.clientX;
      downY = e.clientY;
    },
    /** Call on pointerup; returns 'drag', 'click' or 'double'. */
    up(e: { clientX: number; clientY: number; timeStamp: number }): 'drag' | 'click' | 'double' {
      if (Math.hypot(e.clientX - downX, e.clientY - downY) > 5) return 'drag';
      const isDouble = e.timeStamp - lastUp < maxDelay && Math.hypot(e.clientX - lastX, e.clientY - lastY) < maxDist;
      lastUp = isDouble ? -Infinity : e.timeStamp;
      lastX = e.clientX;
      lastY = e.clientY;
      return isDouble ? 'double' : 'click';
    },
  };
}

/** Marks a native event as consumed by a view (e.g. double-click zoom), so the panel ignores it. */
export const markHandled = (e: Event) => ((e as Event & { bhsHandled?: boolean }).bhsHandled = true);
export const isHandled = (e: Event) => !!(e as Event & { bhsHandled?: boolean }).bhsHandled;
