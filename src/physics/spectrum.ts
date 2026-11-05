/**
 * Approximate sRGB colour of monochromatic light (Dan Bruton's piecewise fit), 380-780 nm.
 * Outside the visible band the colour fades to dim violet (UV) or dim deep red (IR),
 * so strongly shifted light visibly "leaves" the visible range.
 */
export function wavelengthRGB(nm: number): [number, number, number] {
  let r = 0;
  let g = 0;
  let b = 0;
  const w = Math.max(380, Math.min(780, nm));
  if (w < 440) {
    r = -(w - 440) / 60;
    b = 1;
  } else if (w < 490) {
    g = (w - 440) / 50;
    b = 1;
  } else if (w < 510) {
    g = 1;
    b = -(w - 510) / 20;
  } else if (w < 580) {
    r = (w - 510) / 70;
    g = 1;
  } else if (w < 645) {
    r = 1;
    g = -(w - 645) / 65;
  } else {
    r = 1;
  }
  // Eye sensitivity falls off at the ends of the visible band.
  let k = 1;
  if (w > 700) k = 0.3 + (0.7 * (780 - w)) / 80;
  else if (w < 420) k = 0.3 + (0.7 * (w - 380)) / 40;
  // Beyond the visible band: keep a faint tint so the ray stays traceable.
  if (nm < 380) k *= Math.max(0.25, 1 - (380 - nm) / 200);
  if (nm > 780) k *= Math.max(0.25, 1 - (nm - 780) / 600);
  const gam = (v: number) => Math.pow(v * k, 0.8);
  return [gam(r), gam(g), gam(b)];
}

export function wavelengthCss(nm: number, alpha = 1): string {
  const [r, g, b] = wavelengthRGB(nm);
  return `rgba(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)},${alpha})`;
}
