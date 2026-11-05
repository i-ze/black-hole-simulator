export const MAX_BH = 4;
export const MAX_SPH = 12;

export const raytraceVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

/**
 * Backward ray tracing of null geodesics.
 *
 * In units where the camera distance is 1 and c = 1, a photon in the field of a
 * Schwarzschild mass obeys (affine parameter, Euclidean-embedded coordinates)
 *     d²x/dλ² = -(3/2) r_s h² x / r⁵,   h = |x × dx/dλ|,
 * which reproduces the exact orbit equation u'' + u = (3/2) r_s u². Several holes
 * are superposed (approximation). The thin disk uses a Novikov-Thorne-like
 * temperature profile; the observed frequency ratio of an emitter on a circular
 * Keplerian orbit is the exact Schwarzschild expression
 *     g = sqrt(1 - 3M/r) / (1 - Ω b),  Ω = sqrt(M/r³),  b = photon L_z / E,
 * giving T_obs = g T and bolometric intensity ∝ g⁴ T⁴.
 */
export const raytraceFrag = /* glsl */ `
precision highp float;
varying vec2 vUv;

#define MAX_BH ${MAX_BH}
#define MAX_SPH ${MAX_SPH}

uniform vec2 uRes;
uniform vec3 uCamPos;
uniform mat3 uCamRot;
uniform float uTanHalfFov;
uniform float uTime;
uniform float uExposure;
uniform int uMode;
uniform int uMaxSteps;
uniform float uFar;
uniform float uPixAngle;

uniform int uBhCount;
uniform vec4 uBh[MAX_BH];        // xyz position, w = r_s
uniform vec4 uBhDisk[MAX_BH];    // x = r_in, y = r_out, z = peak T (K), w = enabled
uniform vec4 uBhGlow[MAX_BH];    // rgb colour, w = intensity
uniform float uBhGlowSize[MAX_BH];

uniform int uSphCount;
uniform vec4 uSph[MAX_SPH];      // xyz centre, w radius
uniform vec4 uSphCol[MAX_SPH];   // rgb, w = 1 emissive (star), 0 lit (planet)
uniform vec4 uSphLight[MAX_SPH]; // xyz light position, w intensity
uniform vec4 uSphInfo[MAX_SPH];  // x texture slot (-1 none), y spin angle, z axial tilt, w 1 = Earth
uniform vec4 uSphExtra[MAX_SPH]; // x ring inner, y ring outer (planet radii), z limb haze, w ring texture slot
uniform vec3 uSphGlow[MAX_SPH];  // thermal emission of molten surfaces (linear RGB)

// Planet textures (equirectangular), see PLANET_TEXTURES.
uniform sampler2D uTex0;
uniform sampler2D uTex1;
uniform sampler2D uTex2;
uniform sampler2D uTex3;
uniform sampler2D uTex4;
uniform sampler2D uTex5;
uniform sampler2D uTex6;
uniform sampler2D uTex7;
uniform sampler2D uTex8;
uniform sampler2D uTex9;
uniform sampler2D uTex10;
uniform sampler2D uTex11;

// Sampler arrays may only use constant indices, hence the explicit chain. Level 0 avoids the
// mip seam at the longitude wrap.
vec4 planetTex(int i, vec2 uv) {
  if (i == 0) return textureLod(uTex0, uv, 0.0);
  if (i == 1) return textureLod(uTex1, uv, 0.0);
  if (i == 2) return textureLod(uTex2, uv, 0.0);
  if (i == 3) return textureLod(uTex3, uv, 0.0);
  if (i == 4) return textureLod(uTex4, uv, 0.0);
  if (i == 5) return textureLod(uTex5, uv, 0.0);
  if (i == 6) return textureLod(uTex6, uv, 0.0);
  if (i == 7) return textureLod(uTex7, uv, 0.0);
  if (i == 8) return textureLod(uTex8, uv, 0.0);
  if (i == 9) return textureLod(uTex9, uv, 0.0);
  if (i == 10) return textureLod(uTex10, uv, 0.0);
  return textureLod(uTex11, uv, 0.0);
}

// ---------------------------------------------------------------- utilities
float hash13(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.zyx + 31.32);
  return fract((p.x + p.y) * p.z);
}
vec3 hash33(vec3 p) {
  p = fract(p * vec3(0.1031, 0.1030, 0.0973));
  p += dot(p, p.yxz + 33.33);
  return fract((p.xxy + p.yxx) * p.zyx);
}
float noise3(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float n000 = hash13(i);
  float n100 = hash13(i + vec3(1, 0, 0));
  float n010 = hash13(i + vec3(0, 1, 0));
  float n110 = hash13(i + vec3(1, 1, 0));
  float n001 = hash13(i + vec3(0, 0, 1));
  float n101 = hash13(i + vec3(1, 0, 1));
  float n011 = hash13(i + vec3(0, 1, 1));
  float n111 = hash13(i + vec3(1, 1, 1));
  return mix(mix(mix(n000, n100, f.x), mix(n010, n110, f.x), f.y), mix(mix(n001, n101, f.x), mix(n011, n111, f.x), f.y), f.z);
}
float fbm(vec3 p) {
  float s = 0.0;
  float a = 0.5;
  for (int i = 0; i < 5; i++) {
    s += a * noise3(p);
    p = p * 2.03 + 17.1;
    a *= 0.5;
  }
  return s;
}

// Black-body chromaticity (Tanner Helland fit), normalised so that max channel = 1.
vec3 blackbody(float t) {
  t = clamp(t, 1000.0, 40000.0) / 100.0;
  vec3 c;
  if (t <= 66.0) {
    c.r = 1.0;
    c.g = clamp((99.4708025861 * log(t) - 161.1195681661) / 255.0, 0.0, 1.0);
    c.b = t <= 19.0 ? 0.0 : clamp((138.5177312231 * log(t - 10.0) - 305.0447927307) / 255.0, 0.0, 1.0);
  } else {
    c.r = clamp(329.698727446 * pow(t - 60.0, -0.1332047592) / 255.0, 0.0, 1.0);
    c.g = clamp(288.1221695283 * pow(t - 60.0, -0.0755148492) / 255.0, 0.0, 1.0);
    c.b = 1.0;
  }
  // sRGB -> linear
  return pow(c, vec3(2.2));
}

vec3 aces(vec3 x) {
  const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}

// ---------------------------------------------------------------- sky
vec3 starLayer(vec3 d, float scale, float density, float bright) {
  vec3 c = d * scale;
  vec3 id = floor(c);
  vec3 f = fract(c);
  vec3 h = hash33(id);
  if (h.x > density) return vec3(0.0);
  vec3 sp = 0.25 + 0.5 * hash33(id + 7.7);
  float dist = length(f - sp);
  float w = max(uPixAngle * scale * 0.9, 0.012);
  float mag = pow(h.y, 6.0) * bright;
  float temp = mix(3200.0, 12000.0, pow(h.z, 1.5));
  return blackbody(temp) * mag * exp(-dist * dist / (w * w)) * (0.012 / w) * (0.012 / w);
}

vec3 sky(vec3 d) {
  vec3 col = vec3(0.0);
  col += starLayer(d, 70.0, 0.55, 30.0);
  col += starLayer(d, 160.0, 0.6, 9.0);
  col += starLayer(d, 340.0, 0.7, 3.0);
  // Milky Way band.
  vec3 gn = normalize(vec3(0.25, 0.85, 0.46));
  float gl = dot(d, gn);
  float band = exp(-gl * gl * 14.0);
  float n = fbm(d * 3.0);
  float dust = smoothstep(0.35, 0.7, fbm(d * 7.0 + 3.1));
  vec3 mw = mix(vec3(0.55, 0.6, 0.75), vec3(1.0, 0.85, 0.65), smoothstep(0.2, 0.9, n));
  col += mw * band * (0.25 + 0.75 * n) * (1.0 - 0.75 * dust * band) * 0.05;
  col += starLayer(d, 600.0, 0.85 * band, 1.5) * band;
  // Faint nebulosity.
  float neb = fbm(d * 1.6 + 11.0);
  col += vec3(0.25, 0.12, 0.35) * pow(neb, 3.0) * 0.03 + vec3(0.06, 0.12, 0.2) * pow(fbm(d * 2.3 - 5.0), 4.0) * 0.04;
  return col;
}

// ---------------------------------------------------------------- disk
vec3 diskEmission(int k, vec3 q, vec3 v, out float alpha) {
  vec4 bh = uBh[k];
  vec4 dk = uBhDisk[k];
  vec3 r = q - bh.xyz;
  float rho = length(r.xy);
  alpha = 0.0;
  if (rho < dk.x || rho > dk.y) return vec3(0.0);
  float rs = bh.w;
  float x = rho / dk.x;
  // Thin-disk effective temperature normalised to its peak at r = 49/36 r_in.
  float prof = pow(x, -0.75) * pow(max(1.0 - sqrt(1.0 / x), 0.0), 0.25) / 0.4877;
  float T = dk.z * prof;
  float Omega = sqrt(0.5 * rs / (rho * rho * rho));
  float Lz = -(r.x * v.y - r.y * v.x);
  float g = sqrt(max(1.0 - 1.5 * rs / rho, 1e-3)) / max(1.0 - Omega * Lz, 0.05);
  // Fine ring structure, slowly varying along the orbit (illustrative rotation speed).
  float phi = atan(r.y, r.x);
  float wvis = 0.35 * pow(x, -1.5);
  float ang = phi - wvis * uTime;
  float lx = log(x);
  float n = fbm(vec3(lx * 22.0, cos(ang) * 1.6, sin(ang) * 1.6));
  float n2 = fbm(vec3(lx * 6.0 + 3.0, cos(ang) * 3.5, sin(ang) * 3.5));
  float streaks = 0.45 + 0.85 * n * (0.6 + 0.8 * n2);
  float edgeIn = smoothstep(1.0, 1.04, x);
  float edgeOut = 1.0 - smoothstep(0.35, 1.0, rho / dk.y);
  float tn = T / dk.z;
  vec3 c;
  float lum;
  if (uMode == 0) {
    // Physical: observed colour temperature g T, bolometric intensity g^4 T^4.
    lum = pow(g, 4.0) * pow(tn, 4.0);
    c = blackbody(g * T) * lum * 1.1;
  } else {
    float td = mix(1600.0, 6500.0, pow(tn, 1.3)) * g;
    lum = pow(g, 3.0) * pow(tn, 2.4);
    c = blackbody(td) * lum * 1.6;
  }
  // Opacity follows the local surface brightness: bright inner regions are optically thick,
  // the faint outskirts thin out (as in radiatively inefficient, low-accretion-rate flows).
  float thick = smoothstep(0.0, 0.25, pow(tn, 2.0));
  alpha = clamp(thick * (0.5 + 0.6 * n) * edgeIn * edgeOut, 0.0, 0.96);
  return c * streaks * edgeIn * edgeOut;
}

bool sphereHit(vec3 o, vec3 d, vec4 s, out float t) {
  vec3 oc = o - s.xyz;
  float a = dot(d, d);
  float b = dot(oc, d);
  float c = dot(oc, oc) - s.w * s.w;
  float disc = b * b - a * c;
  if (disc < 0.0) return false;
  float sq = sqrt(disc);
  t = (-b - sq) / a;
  if (t < 0.0 || t > 1.0) {
    if (c < 0.0) { t = 0.0; return true; }
    return false;
  }
  return true;
}

vec3 shadeSphere(int i, vec3 p, vec3 dir) {
  vec4 s = uSph[i];
  vec4 col = uSphCol[i];
  vec3 n = normalize(p - s.xyz);
  vec3 V = -normalize(dir);
  float mu = max(dot(n, V), 0.0);
  if (col.w > 0.5) {
    // Photosphere: limb darkening (Eddington approximation), boiling granulation and faint spots.
    float limb = 0.4 + 0.6 * mu;
    float gran = 0.7 + 0.3 * fbm(n * 42.0 + vec3(uTime * 0.07));
    float spots = 1.0 - 0.6 * smoothstep(0.7, 0.76, fbm(n * 9.0 + 11.0)) * step(abs(n.z), 0.5);
    vec3 hot = mix(col.rgb, vec3(1.0, 0.98, 0.94), 0.55 * mu);
    return hot * limb * gran * spots * 1.7;
  }
  vec4 L = uSphLight[i];
  vec3 ld = normalize(L.xyz - p);
  float ndl = dot(n, ld);
  float diff = max(ndl, 0.0);
  vec4 info = uSphInfo[i];
  vec4 extra = uSphExtra[i];
  vec3 base;
  if (info.x >= 0.0) {
    // Planet frame: undo the axial tilt (about x; the pole leans towards +y, ecliptic longitude 90°),
    // then the spin (about the pole).
    float ct = cos(info.z);
    float st = sin(info.z);
    vec3 nt = vec3(n.x, ct * n.y - st * n.z, st * n.y + ct * n.z);
    float cs = cos(info.y);
    float ss = sin(info.y);
    vec3 np = vec3(cs * nt.x + ss * nt.y, -ss * nt.x + cs * nt.y, nt.z);
    vec2 uv = vec2(atan(np.y, np.x) / 6.2831853 + 0.5, 0.5 + asin(clamp(np.z, -1.0, 1.0)) / 3.1415927);
    vec3 tex = planetTex(int(info.x + 0.5), uv).rgb;
    if (info.w > 0.5) {
      // Earth: day side, city lights at night, clouds, ocean glint and blue atmosphere.
      vec3 night = planetTex(1, uv).rgb;
      float cloud = planetTex(2, uv + vec2(uTime * 0.002, 0.0)).r;
      float ocean = smoothstep(0.02, 0.12, tex.b - max(tex.r, tex.g));
      float spec = pow(max(dot(reflect(-ld, n), V), 0.0), 40.0) * ocean * (1.0 - cloud) * 0.8;
      vec3 day = tex * diff * L.w + spec * L.w;
      vec3 lights = night * vec3(1.0, 0.78, 0.5) * 1.6 * (1.0 - smoothstep(-0.12, 0.08, ndl)) * (1.0 - cloud * 0.8);
      vec3 c = day + lights;
      c = mix(c, vec3(1.0) * diff * L.w, cloud * 0.85);
      float rim = pow(1.0 - mu, 2.2);
      c += vec3(0.28, 0.52, 1.0) * rim * smoothstep(-0.3, 0.4, ndl) * 0.9 * L.w;
      return c;
    }
    base = tex * (diff * L.w + 0.015);
  } else {
    float bands = 0.85 + 0.15 * sin(n.z * 24.0 + fbm(n * 6.0) * 4.0);
    base = col.rgb * (diff * L.w * bands + 0.015);
  }
  // Limb haze of thick atmospheres.
  base += col.rgb * extra.z * pow(1.0 - mu, 3.0) * smoothstep(-0.2, 0.3, ndl) * L.w;
  // Magma ocean after a giant impact: glowing cracks between darker crust plates.
  vec3 glow = uSphGlow[i];
  if (glow.r + glow.g + glow.b > 0.0) {
    float f = fbm(n * 6.0 + vec3(uTime * 0.005));
    float cracks = 1.0 - smoothstep(0.0, 0.035, abs(f - 0.5));
    base = base * 0.6 + glow * (cracks + 0.08);
  }
  return base;
}

void main() {
  vec2 ndc = (vUv * 2.0 - 1.0);
  ndc.x *= uRes.x / uRes.y;
  vec3 dir = normalize(uCamRot * vec3(ndc * uTanHalfFov, 1.0));
  vec3 p = uCamPos;
  vec3 v = dir;
  vec3 col = vec3(0.0);
  float trans = 1.0;
  float minD[MAX_BH];
  // Closest approach of the ray to each sphere, in units of its radius (for coronae and haloes).
  float minS[MAX_SPH];
  for (int k = 0; k < MAX_SPH; k++) minS[k] = 1e9;
  for (int k = 0; k < MAX_BH; k++) minD[k] = 1e9;
  bool done = false;

  for (int i = 0; i < 600; i++) {
    if (i >= uMaxSteps || done) break;
    vec3 a = vec3(0.0);
    float ds = 1e9;
    for (int k = 0; k < MAX_BH; k++) {
      if (k >= uBhCount) break;
      vec4 bh = uBh[k];
      vec3 r = p - bh.xyz;
      float r2 = dot(r, r);
      float rl = sqrt(r2);
      minD[k] = min(minD[k], rl);
      if (rl < bh.w) { trans = 0.0; done = true; break; }
      vec3 h = cross(r, v);
      a += -1.5 * bh.w * dot(h, h) * r / (r2 * r2 * rl);
      ds = min(ds, max(0.07 * rl, 0.03 * bh.w) * (rl < 6.0 * bh.w ? 0.7 : 1.0));
    }
    if (done) break;
    if (uBhCount == 0) ds = uFar * 2.0;
    ds = min(ds, uFar * 0.25);
    v += a * ds;
    vec3 pn = p + v * ds;

    // Thin accretion disks in each hole's equatorial plane.
    for (int k = 0; k < MAX_BH; k++) {
      if (k >= uBhCount) break;
      if (uBhDisk[k].w < 0.5) continue;
      float z0 = p.z - uBh[k].z;
      float z1 = pn.z - uBh[k].z;
      if (z0 * z1 < 0.0) {
        float t = z0 / (z0 - z1);
        vec3 q = mix(p, pn, t);
        float al;
        vec3 e = diskEmission(k, q, v, al);
        col += trans * al * e;
        trans *= 1.0 - al;
      }
    }

    // Stars and planets.
    float tBest = 2.0;
    int hit = -1;
    for (int s = 0; s < MAX_SPH; s++) {
      if (s >= uSphCount) break;
      vec4 sp = uSph[s];
      vec3 d = pn - p;
      float tc = clamp(dot(sp.xyz - p, d) / max(dot(d, d), 1e-30), 0.0, 1.0);
      minS[s] = min(minS[s], length(p + d * tc - sp.xyz) / sp.w);
      // Planetary rings in the (tilted) equatorial plane.
      vec4 ex = uSphExtra[s];
      if (ex.y > 0.0) {
        float tl = uSphInfo[s].z;
        vec3 N = vec3(0.0, sin(tl), cos(tl));
        float d0 = dot(p - sp.xyz, N);
        float d1 = dot(pn - sp.xyz, N);
        if (d0 * d1 < 0.0) {
          vec3 q = mix(p, pn, d0 / (d0 - d1));
          float rho = length(q - sp.xyz) / sp.w;
          if (rho > ex.x && rho < ex.y) {
            vec4 rc = planetTex(int(ex.w + 0.5), vec2((rho - ex.x) / (ex.y - ex.x), 0.5));
            vec3 ldr = normalize(uSphLight[s].xyz - q);
            // Shadow of the planet on the rings.
            vec3 oc = q - sp.xyz;
            float bb = dot(oc, ldr);
            float shadow = (bb < 0.0 && dot(oc, oc) - bb * bb < sp.w * sp.w) ? 0.15 : 1.0;
            float a = rc.a * 0.95;
            col += trans * a * rc.rgb * (0.25 + 0.75 * abs(dot(N, ldr))) * uSphLight[s].w * shadow;
            trans *= 1.0 - a;
          }
        }
      }
      float t;
      if (sphereHit(p, d, sp, t) && t < tBest) { tBest = t; hit = s; }
    }
    if (hit >= 0) {
      vec3 hp = mix(p, pn, tBest);
      col += trans * shadeSphere(hit, hp, v);
      trans = 0.0;
      done = true;
      break;
    }
    p = pn;
    if (trans < 0.01) { done = true; break; }
    if (length(p) > uFar && dot(p, v) > 0.0) break;
  }

  if (!done && trans > 0.0) col += trans * sky(normalize(v));

  // Stellar coronae (glow hugging the limb and fading outward) and thin planetary atmospheres.
  // Uses the bent ray's closest approach, so the glow is lensed like everything else.
  for (int k = 0; k < MAX_SPH; k++) {
    if (k >= uSphCount) break;
    float x = max(minS[k], 1.0);
    vec4 sc = uSphCol[k];
    if (sc.w > 0.5) {
      float corona = 0.7 * exp(-(x - 1.0) * 7.0) + 0.08 * exp(-(x - 1.0) * 1.3) + 0.02 / (x * x);
      col += trans * sc.rgb * corona * 1.4;
    } else if (uSphInfo[k].w > 0.5) {
      col += trans * vec3(0.3, 0.55, 1.0) * exp(-(x - 1.0) / 0.018) * 0.6 * uSphLight[k].w;
    }
  }

  // Point-like emission (Hawking radiation, accretion flares) around each hole.
  for (int k = 0; k < MAX_BH; k++) {
    if (k >= uBhCount) break;
    float w = uBhGlowSize[k];
    if (uBhGlow[k].w <= 0.0) continue;
    float d = minD[k];
    col += uBhGlow[k].rgb * uBhGlow[k].w * (w * w / (d * d + w * w));
  }

  col *= uExposure;
  col = aces(col);
  col = pow(col, vec3(1.0 / 2.2));
  // Subtle vignette.
  vec2 q = vUv - 0.5;
  col *= 1.0 - 0.25 * dot(q, q);
  gl_FragColor = vec4(col, 1.0);
}
`;
