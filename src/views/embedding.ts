/**
 * Flamm embedding of the spatial Schwarzschild geometry (t = const, equatorial slice).
 *
 * Exterior:  z(r) = 2 sqrt(r_s (r - r_s))
 * Interior of a uniform-density star of radius R (Schwarzschild interior solution):
 *            z(r) = sqrt(R³/r_s) (1 - sqrt(1 - r_s r²/R³))
 * Both are written in cancellation-free form so that weak fields (r_s << R) work in float32.
 * The function returns the depth below the reference circle r_ref, i.e. z(r_ref) - z(r) >= 0.
 * Inside a black hole horizon the surface simply drops (the embedding ends at the throat).
 */
export function embeddingDepth(r: number, rs: number, R: number, rRef: number): number {
  if (rs <= 0) return 0;
  const sq = Math.sqrt(rs);
  const ext = (a: number, b: number) => (2 * sq * (b - a)) / (Math.sqrt(Math.max(b - rs, 0)) + Math.sqrt(Math.max(a - rs, 0)) || 1);
  if (R > rs * 1.0001) {
    if (r >= R) return ext(r, rRef);
    const k = Math.sqrt(rs / (R * R * R));
    const zin = (x: number) => (x * x * k) / (1 + Math.sqrt(Math.max(0, 1 - (rs * x * x) / (R * R * R))));
    return ext(R, rRef) + zin(R) - zin(r);
  }
  if (r >= rs) return ext(r, rRef);
  return ext(rs, rRef) + (rs - r) * 4;
}

export const embeddingGLSL = /* glsl */ `
float extDepth(float a, float b, float rs) {
  float den = sqrt(max(b - rs, 0.0)) + sqrt(max(a - rs, 0.0));
  return 2.0 * sqrt(rs) * (b - a) / max(den, 1e-12);
}
float embeddingDepth(float r, float rs, float R, float rRef) {
  if (rs <= 0.0) return 0.0;
  if (R > rs * 1.0001) {
    if (r >= R) return extDepth(r, rRef, rs);
    float k = sqrt(rs / (R * R * R));
    float zR = R * R * k / (1.0 + sqrt(max(0.0, 1.0 - rs / R)));
    float zr = r * r * k / (1.0 + sqrt(max(0.0, 1.0 - rs * r * r / (R * R * R))));
    return extDepth(R, rRef, rs) + zR - zr;
  }
  if (r >= rs) return extDepth(r, rRef, rs);
  return extDepth(rs, rRef, rs) + (rs - r) * 4.0;
}
`;
