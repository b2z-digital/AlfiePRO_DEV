// The 3D country round a venue (see host.ts). Built once from the venue's baked files
// (public/sim-venues/<id>/, made by scripts/sim-venues/scenery/bake.js), then drawn each frame from
// the bank camera into a canvas the bank view lays over its water.
//
// Coordinates: venue metres, x east, y north, z up; in three.js that's (x, z, -y).
// Colours are kept in sRGB from end to end (no conversions), so a photo's pixel comes out as it went in.

import * as THREE from 'three';
import { treeAtlas, TREE_CELLS } from './trees';

export interface WorldView {
  /** Where the eye is, venue metres, and how high above the water. */
  x: number; y: number; eye: number;
  /** Compass heading looked along, how far down (degrees), and the horizontal field of view. */
  yaw: number; pitch: number; fov: number;
  /** The view's size in CSS pixels, and how many device pixels to draw for each. */
  w: number; h: number; scale: number;
  /** Seconds, for the traffic and the flags. */
  t: number;
  /** How strongly the water mirrors the shore, 0 (none) to 1. */
  reflect: number;
  /** Where the wind blows from (compass degrees), for the flags. */
  windFrom: number;
}

export interface World {
  credit: string;
  /** Draws one layer of the view: the shore mirrored in the water (to lay over the water only), or the land. */
  render(v: WorldView, layer: 'reflection' | 'land'): HTMLCanvasElement;
  dispose(): void;
}

interface SceneData {
  v: number; id: string; near: number; wide: number; credit: string;
  /** Ground below this height is water (the survey can catch a tidal water surface above zero). */
  water?: number;
  roads: { c: number; n: string; one: number; p: number[] }[];
  blds: { n: string; h: number; z: number; roof: string | null; p: number[] }[];
  piers: { n: string; a: number; w: number; p: number[] }[];
  /** Road bridges over the water: the deck's centre line (x, y, z), its width, and whether it's an old through truss. */
  bridges?: { n: string; w: number; truss: number; p: number[] }[];
  power: number[][];
  masts: number[][];
  houses: [number, number, number, number, number, number, number, string, number, number][];
  boats: number[][];
  dinghies: number[][];
  flags: [number, number, number, number, string][];
  landmarks: ({ k: 'shed'; x: number; y: number; z: number; yaw: number; s: number[]; roof: string; wall: string } | { k: 'chimera'; x: number; y: number; z: number; h: number })[];
  trees: number;
}

/** The haze the far shore fades into: the bottom of the bank view's sky. */
const FOG = new THREE.Color(0xc9dceb);
const WATER_TINT = new THREE.Color(0x4e7598);
/** Ground below this (m above the lake) is water, left for the bank view to draw, unless the venue says otherwise. */
const WATER_CUT = 0.22;

/** Part of the way to a soft grey: photo colours and paint, seen through a kilometre of air. */
const soften = (c: [number, number, number], k: number): [number, number, number] => { const l = 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2]; return [c[0] + (l - c[0]) * k, c[1] + (l - c[1]) * k, c[2] + (l - c[2]) * k]; };
const rgb = (hex: string): [number, number, number] => { const v = parseInt(hex.slice(1), 16); return [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255]; };

// ───────────────────────── Shaders ─────────────────────────

// The mirror pass draws everything upside down about the water; the fragment side gets the
// right-way-up position to decide what's under water.
const VERT_COMMON = /* glsl */`
uniform float uReflect;
varying vec3 vW;
varying float vD;
vec4 place(vec3 w) {
  vW = w;
  vec3 p = w;
  if (uReflect > 0.5) p.y = -p.y;
  vD = distance(p, cameraPosition);
  return projectionMatrix * viewMatrix * vec4(p, 1.0);
}`;
const FRAG_COMMON = /* glsl */`
uniform vec3 uFog;
uniform float uFogK;
uniform float uNearCut;
uniform float uCut;
varying vec3 vW;
varying float vD;
void cutAway() {
  if (vW.y < uCut) discard;
  vec2 d = vW.xz - cameraPosition.xz;
  if (dot(d, d) < uNearCut * uNearCut) discard;
}
vec4 finish(vec3 col) {
  float f = 1.0 - exp(-(vD * uFogK) * (vD * uFogK));
  return vec4(mix(col, uFog, clamp(f, 0.0, 1.0)), 1.0);
}`;

function makeUniforms() {
  return {
    uReflect: { value: 0 },
    uFog: { value: FOG.clone() },
    uFogK: { value: 0.00011 },
    uNearCut: { value: 14 },
    uTime: { value: 0 },
  };
}
type Shared = ReturnType<typeof makeUniforms>;

function terrainMaterial(S: Shared, map: THREE.Texture, hole: [number, number, number, number] | null, cut: number) {
  return new THREE.ShaderMaterial({
    uniforms: { ...S, uCut: { value: cut }, map: { value: map }, uHole: { value: new THREE.Vector4(...(hole ?? [1, -1, 1, -1])) } },
    vertexShader: VERT_COMMON + /* glsl */`
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = place((modelMatrix * vec4(position, 1.0)).xyz); }`,
    fragmentShader: FRAG_COMMON + /* glsl */`
      uniform sampler2D map;
      uniform vec4 uHole;
      varying vec2 vUv;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
      }
      void main() {
        cutAway();
        if (vW.x > uHole.x && vW.x < uHole.y && vW.z > uHole.z && vW.z < uHole.w) discard;
        vec3 c = texture2D(map, vUv).rgb;
        // A photo taken from straight above, seen side-on: a touch less saturated and a little lifted.
        // Far off it greys a little; close in, the lawn keeps its green.
        float l = dot(c, vec3(0.3, 0.59, 0.11));
        float far = smoothstep(250.0, 2500.0, vD);
        c = mix(c, vec3(l), 0.2 * far - 0.15 * (1.0 - far)) * (1.06 - 0.1 * (1.0 - far)) + 0.015;
        // Close in, the photo's metre-wide pixels: break them up into tufts and patches.
        float near = 1.0 - smoothstep(120.0, 700.0, vD);
        if (near > 0.0) {
          float n = noise(vW.xz * 0.45) * 0.55 + noise(vW.xz * 1.9) * 0.3 + noise(vW.xz * 6.0) * 0.15;
          c *= mix(1.0, 0.8 + 0.42 * n, near);
        }
        gl_FragColor = finish(c);
      }`,
    side: THREE.DoubleSide,
  });
}

function colourMaterial(S: Shared, cut = 0) {
  return new THREE.ShaderMaterial({
    uniforms: { ...S, uCut: { value: cut } },
    vertexShader: VERT_COMMON + /* glsl */`
      attribute vec3 col;
      varying vec3 vCol;
      void main() {
        vCol = col;
        #ifdef USE_INSTANCING
          gl_Position = place((modelMatrix * instanceMatrix * vec4(position, 1.0)).xyz);
        #else
          gl_Position = place((modelMatrix * vec4(position, 1.0)).xyz);
        #endif
      }`,
    fragmentShader: FRAG_COMMON + /* glsl */`
      varying vec3 vCol;
      void main() { cutAway(); gl_FragColor = finish(vCol); }`,
    side: THREE.DoubleSide,
  });
}

/** Cars: one box each, coloured per car. */
function carMaterial(S: Shared) {
  return new THREE.ShaderMaterial({
    uniforms: { ...S, uCut: { value: 0 } },
    vertexShader: VERT_COMMON + /* glsl */`
      attribute vec3 col;
      attribute vec3 iCol;
      varying vec3 vCol;
      void main() {
        vCol = col * iCol;
        gl_Position = place((modelMatrix * instanceMatrix * vec4(position, 1.0)).xyz);
      }`,
    fragmentShader: FRAG_COMMON + /* glsl */`
      varying vec3 vCol;
      void main() { cutAway(); gl_FragColor = finish(vCol); }`,
    side: THREE.DoubleSide,
  });
}

function treeMaterial(S: Shared, atlas: THREE.Texture) {
  return new THREE.ShaderMaterial({
    uniforms: { ...S, uCut: { value: 0.05 }, map: { value: atlas } },
    vertexShader: VERT_COMMON + /* glsl */`
      attribute vec3 iPos;
      attribute vec2 iSize;
      attribute vec3 iCol;
      attribute float iCell;
      varying vec2 vUv;
      varying vec3 vCol;
      void main() {
        // Turned to face you, standing upright.
        vec3 right = normalize(vec3(viewMatrix[0][0], 0.0, viewMatrix[2][0]));
        vec3 w = iPos + right * position.x * iSize.x + vec3(0.0, position.y * iSize.y, 0.0);
        vUv = vec2((iCell + 0.04 + (position.x + 0.5) * 0.92) / ${TREE_CELLS.toFixed(1)}, position.y);
        vCol = iCol;
        gl_Position = place(w);
      }`,
    fragmentShader: FRAG_COMMON + /* glsl */`
      uniform sampler2D map;
      varying vec2 vUv;
      varying vec3 vCol;
      void main() {
        vec4 t = texture2D(map, vUv);
        if (t.a < 0.42) discard;
        cutAway();
        // Red is the light on it; green is how much is leaf (the rest is bark).
        vec3 leaf = vCol * t.r * 1.6;
        float ll = dot(leaf, vec3(0.3, 0.59, 0.11));
        leaf = mix(leaf, vec3(ll) * vec3(0.92, 1.0, 0.9), 0.3);
        vec3 bark = vec3(0.66, 0.63, 0.58) * t.r;
        gl_FragColor = finish(mix(bark, leaf, t.g));
      }`,
    side: THREE.DoubleSide,
  });
}

function flagMaterial(S: Shared, color: string) {
  return new THREE.ShaderMaterial({
    uniforms: { ...S, uCut: { value: 0 }, uColor: { value: new THREE.Color(color) } },
    vertexShader: VERT_COMMON + /* glsl */`
      uniform float uTime;
      varying float vShade;
      void main() {
        vec3 p = position;
        float k = p.x / 1.8;
        float wave = sin(p.x * 3.2 - uTime * 7.0) * 0.16 * k;
        p.z += wave;
        vShade = 0.8 + 0.2 * cos(p.x * 3.2 - uTime * 7.0);
        gl_Position = place((modelMatrix * vec4(p, 1.0)).xyz);
      }`,
    fragmentShader: FRAG_COMMON + /* glsl */`
      uniform vec3 uColor;
      varying float vShade;
      void main() { cutAway(); gl_FragColor = finish(uColor * vShade); }`,
    side: THREE.DoubleSide,
  });
}

function lineMaterial(S: Shared) {
  return new THREE.ShaderMaterial({
    uniforms: { ...S, uCut: { value: -1 } },
    vertexShader: VERT_COMMON + /* glsl */`
      void main() { gl_Position = place((modelMatrix * vec4(position, 1.0)).xyz); }`,
    fragmentShader: FRAG_COMMON + /* glsl */`
      void main() {
        // A wire is a few centimetres across: past a few hundred metres it's lost against the sky.
        if (vD > 650.0) discard;
        vec4 c = finish(vec3(0.36, 0.37, 0.38));
        gl_FragColor = vec4(mix(c.rgb, uFog, 0.35 + 0.65 * smoothstep(120.0, 650.0, vD)), 1.0);
      }`,
  });
}

// ───────────────────────── Geometry helpers ─────────────────────────

/** Triangles with a colour each corner, in venue coordinates. */
class Builder {
  pos: number[] = [];
  col: number[] = [];
  v(x: number, y: number, z: number, c: [number, number, number]) { this.pos.push(x, z, -y); this.col.push(c[0], c[1], c[2]); }
  tri(a: number[], b: number[], c: number[], col: [number, number, number]) { this.v(a[0], a[1], a[2], col); this.v(b[0], b[1], b[2], col); this.v(c[0], c[1], c[2], col); }
  quad(a: number[], b: number[], c: number[], d: number[], col: [number, number, number]) { this.tri(a, b, c, col); this.tri(a, c, d, col); }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('col', new THREE.Float32BufferAttribute(this.col, 3));
    g.computeBoundingSphere();
    return g;
  }
}

// The sun: high in the north (the southern hemisphere's midday-ish light).
const SUN = { x: Math.sin((-20 * Math.PI) / 180), y: Math.cos((-20 * Math.PI) / 180) };
const lit = (c: [number, number, number], nx: number, ny: number, k = 1): [number, number, number] => {
  const s = (0.68 + 0.32 * Math.max(0, nx * SUN.x + ny * SUN.y)) * k;
  return [c[0] * s, c[1] * s, c[2] * s];
};

/** A wall from a to b (plan), z0 up to z1, shaded by which way it faces. */
function wall(B: Builder, a: number[], b: number[], z0: number, z1: number, c: [number, number, number]) {
  const ex = b[0] - a[0], ey = b[1] - a[1], L = Math.hypot(ex, ey) || 1;
  B.quad([a[0], a[1], z0], [b[0], b[1], z0], [b[0], b[1], z1], [a[0], a[1], z1], lit(c, ey / L, -ex / L));
}

/** A box turned to a heading (degrees, the way its length runs), centred on (x, y). */
function box(B: Builder, x: number, y: number, z0: number, z1: number, len: number, wid: number, yaw: number, side: [number, number, number], top?: [number, number, number]) {
  const r = (yaw * Math.PI) / 180, fx = Math.sin(r), fy = Math.cos(r), rx = Math.cos(r), ry = -Math.sin(r);
  const P = (a: number, b: number) => [x + fx * a + rx * b, y + fy * a + ry * b];
  const c = [P(len / 2, wid / 2), P(-len / 2, wid / 2), P(-len / 2, -wid / 2), P(len / 2, -wid / 2)];
  for (let i = 0; i < 4; i++) wall(B, c[i], c[(i + 1) % 4], z0, z1, side);
  B.quad([c[0][0], c[0][1], z1], [c[1][0], c[1][1], z1], [c[2][0], c[2][1], z1], [c[3][0], c[3][1], z1], top ?? side);
}

/** A square-section member from a to b (venue x, y, z): a girder, a truss chord, a column. */
function beam(B: Builder, a: number[], b: number[], t: number, c: [number, number, number]) {
  const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], L = Math.hypot(d[0], d[1], d[2]) || 1;
  const u = [d[0] / L, d[1] / L, d[2] / L];
  // Two directions square to the member.
  let r = Math.abs(u[2]) > 0.9 ? [1, 0, 0] : [-u[1], u[0], 0];
  const rl = Math.hypot(r[0], r[1], r[2]) || 1; r = [r[0] / rl, r[1] / rl, r[2] / rl];
  const q = [u[1] * r[2] - u[2] * r[1], u[2] * r[0] - u[0] * r[2], u[0] * r[1] - u[1] * r[0]];
  const h = t / 2;
  const off = (p: number[], i: number, j: number) => [p[0] + (r[0] * i + q[0] * j) * h, p[1] + (r[1] * i + q[1] * j) * h, p[2] + (r[2] * i + q[2] * j) * h];
  const sides: [number, number][] = [[1, 1], [-1, 1], [-1, -1], [1, -1]];
  for (let k = 0; k < 4; k++) {
    const [i0, j0] = sides[k], [i1, j1] = sides[(k + 1) % 4];
    const nx = (r[0] * (i0 + i1) + q[0] * (j0 + j1)) / 2, ny = (r[1] * (i0 + i1) + q[1] * (j0 + j1)) / 2;
    const nl = Math.hypot(nx, ny) || 1;
    B.quad(off(a, i0, j0), off(b, i0, j0), off(b, i1, j1), off(a, i1, j1), Math.hypot(nx, ny) < 0.2 ? c : lit(c, nx / nl, ny / nl));
  }
}

/** A road bridge: deck and girders, railings, piers down into the water, and an old steel through truss when it has one. */
function bridge(B: Builder, br: NonNullable<SceneData['bridges']>[number], ground: (x: number, y: number) => number) {
  const p: number[][] = [];
  for (let i = 0; i < br.p.length; i += 3) p.push([br.p[i], br.p[i + 1], br.p[i + 2]]);
  const CON: [number, number, number] = [0.74, 0.73, 0.7], ROAD: [number, number, number] = [0.36, 0.37, 0.38], STEEL: [number, number, number] = [0.58, 0.63, 0.63];
  const hw = br.w / 2;
  // Resample the centre line every few metres, so the deck can curve up off its abutments smoothly.
  const pts: number[][] = [];
  for (let i = 0; i + 1 < p.length; i++) {
    const a = p[i], b = p[i + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.ceil(L / 6));
    for (let k = 0; k < n; k++) { const t = k / n; pts.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]); }
  }
  pts.push(p[p.length - 1]);
  const side = (i: number) => { const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)]; const ex = b[0] - a[0], ey = b[1] - a[1], L = Math.hypot(ex, ey) || 1; return [ey / L, -ex / L]; };
  let run = 0, nextPier = 30, panel = 0;
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i], b = pts[i + 1], na = side(i), nb = side(i + 1);
    const al = [a[0] - na[0] * hw, a[1] - na[1] * hw], ar = [a[0] + na[0] * hw, a[1] + na[1] * hw];
    const bl = [b[0] - nb[0] * hw, b[1] - nb[1] * hw], brr = [b[0] + nb[0] * hw, b[1] + nb[1] * hw];
    B.quad([al[0], al[1], a[2]], [bl[0], bl[1], b[2]], [brr[0], brr[1], b[2]], [ar[0], ar[1], a[2]], ROAD);
    // The girders' faces and soffit.
    const dep = 1.7;
    wall(B, [al[0], al[1]], [bl[0], bl[1]], Math.min(a[2], b[2]) - dep, Math.min(a[2], b[2]), CON);
    wall(B, [brr[0], brr[1]], [ar[0], ar[1]], Math.min(a[2], b[2]) - dep, Math.min(a[2], b[2]), CON);
    B.quad([al[0], al[1], a[2] - dep], [ar[0], ar[1], a[2] - dep], [brr[0], brr[1], b[2] - dep], [bl[0], bl[1], b[2] - dep], [CON[0] * 0.6, CON[1] * 0.6, CON[2] * 0.6]);
    // Barriers.
    beam(B, [al[0], al[1], a[2] + 0.55], [bl[0], bl[1], b[2] + 0.55], 0.5, CON);
    beam(B, [ar[0], ar[1], a[2] + 0.55], [brr[0], brr[1], b[2] + 0.55], 0.5, CON);
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    run += L;
    const g = ground((a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
    const clear = (a[2] + b[2]) / 2 - Math.max(0, g);
    // Piers: a pair of columns under a headstock, where the deck stands clear of the ground.
    if (run >= nextPier) {
      nextPier = run + 34;
      if (clear > 3) {
        const zt = b[2] - dep, zb = Math.min(-1, g - 0.5);
        for (const k of [-0.55, 0.55]) beam(B, [b[0] + nb[0] * hw * k, b[1] + nb[1] * hw * k, zb], [b[0] + nb[0] * hw * k, b[1] + nb[1] * hw * k, zt], 1.4, CON);
        beam(B, [bl[0], bl[1], zt - 0.6], [brr[0], brr[1], zt - 0.6], 1.2, CON);
      }
    }
    // An old through truss: two steel trusses either side of the road, braced across the top.
    if (br.truss && clear > 4) {
      const H = 6.5, o = 0.4;
      const lA = [a[0] - na[0] * (hw + o), a[1] - na[1] * (hw + o)], rA = [a[0] + na[0] * (hw + o), a[1] + na[1] * (hw + o)];
      const lB = [b[0] - nb[0] * (hw + o), b[1] - nb[1] * (hw + o)], rB = [b[0] + nb[0] * (hw + o), b[1] + nb[1] * (hw + o)];
      for (const [A, Bp] of [[lA, lB], [rA, rB]]) {
        beam(B, [A[0], A[1], a[2] + H], [Bp[0], Bp[1], b[2] + H], 0.45, STEEL);
        beam(B, [A[0], A[1], a[2]], [Bp[0], Bp[1], b[2]], 0.45, STEEL);
        beam(B, [A[0], A[1], a[2]], [A[0], A[1], a[2] + H], 0.35, STEEL);
        if (panel % 2 === 0) beam(B, [A[0], A[1], a[2]], [Bp[0], Bp[1], b[2] + H], 0.3, STEEL);
        else beam(B, [A[0], A[1], a[2] + H], [Bp[0], Bp[1], b[2]], 0.3, STEEL);
      }
      if (panel % 2 === 0) beam(B, [lA[0], lA[1], a[2] + H], [rA[0], rA[1], a[2] + H], 0.3, STEEL);
      panel++;
    }
  }
}

/** A house: walls, then a hipped roof along its longer side (or a flat one on a block). */
function house(B: Builder, x: number, y: number, z: number, yaw: number, w: number, d: number, levels: number, roof: [number, number, number], wallC: [number, number, number], flat: boolean) {
  const r = (yaw * Math.PI) / 180, sx = Math.sin(r), sy = Math.cos(r), nx = Math.cos(r), ny = -Math.sin(r);
  const P = (a: number, b: number) => [x + sx * a + nx * b, y + sy * a + ny * b];
  const z0 = z - 0.6, z1 = z + 2.9 * levels + 0.3;
  const c = [P(w / 2, d / 2), P(-w / 2, d / 2), P(-w / 2, -d / 2), P(w / 2, -d / 2)];
  for (let i = 0; i < 4; i++) wall(B, c[i], c[(i + 1) % 4], z0, z1, wallC);
  const o = 0.45; // the eaves
  const e = [P(w / 2 + o, d / 2 + o), P(-w / 2 - o, d / 2 + o), P(-w / 2 - o, -d / 2 - o), P(w / 2 + o, -d / 2 - o)].map(p => [p[0], p[1], z1]);
  if (flat) { B.quad(e[0], e[1], e[2], e[3], roof); return; }
  const long = w >= d, half = (Math.min(w, d) + 2 * o) / 2, rise = half * 0.62;
  const run = Math.max(0, (Math.max(w, d) - Math.min(w, d)) / 2);
  const A = long ? P(run, 0) : P(0, run), Bq = long ? P(-run, 0) : P(0, -run);
  const ra = [A[0], A[1], z1 + rise], rb = [Bq[0], Bq[1], z1 + rise];
  const sh = (k: number) => [roof[0] * k, roof[1] * k, roof[2] * k] as [number, number, number];
  if (long) {
    B.quad(e[0], ra, rb, e[1], sh(1.0)); // the +d side
    B.quad(e[2], rb, ra, e[3], sh(0.86));
    B.tri(e[3], ra, e[0], sh(0.93));
    B.tri(e[1], rb, e[2], sh(0.93));
  } else {
    B.quad(e[3], ra, rb, e[2], sh(1.0));
    B.quad(e[1], rb, ra, e[0], sh(0.86));
    B.tri(e[0], ra, e[3], sh(0.93));
    B.tri(e[2], rb, e[1], sh(0.93));
  }
}

// ───────────────────────── Loading ─────────────────────────

async function loadImage(url: string): Promise<HTMLImageElement> {
  const im = new Image();
  im.crossOrigin = 'anonymous';
  im.decoding = 'async';
  im.src = url;
  await im.decode();
  return im;
}

/** A heights PNG back to metres: (h + 20) * 100 in red (high byte) and green (low). */
function heights(im: HTMLImageElement): { f: Float32Array; n: number } {
  const n = im.naturalWidth;
  const c = document.createElement('canvas'); c.width = n; c.height = n;
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.drawImage(im, 0, 0);
  const d = g.getImageData(0, 0, n, n).data;
  const f = new Float32Array(n * n);
  for (let i = 0; i < n * n; i++) f[i] = (d[i * 4] * 256 + d[i * 4 + 1]) / 100 - 20;
  return { f, n };
}

function sampler(dem: { f: Float32Array; n: number }, half: number) {
  const { f, n } = dem;
  return (x: number, y: number) => {
    const fx = ((x + half) / (2 * half)) * (n - 1), fy = ((half - y) / (2 * half)) * (n - 1);
    const i = Math.max(0, Math.min(n - 2, Math.floor(fx))), j = Math.max(0, Math.min(n - 2, Math.floor(fy)));
    const u = Math.min(1, Math.max(0, fx - i)), v = Math.min(1, Math.max(0, fy - j));
    const k = j * n + i;
    return f[k] * (1 - u) * (1 - v) + f[k + 1] * u * (1 - v) + f[k + n] * (1 - u) * v + f[k + n + 1] * u * v;
  };
}

/** A square of terrain, x and y from -half to half, `cells` across, textured from a photo of `imgHalf`. */
function terrain(half: number, cells: number, h: (x: number, y: number) => number, imgHalf: number) {
  const n = cells + 1, pos = new Float32Array(n * n * 3), uv = new Float32Array(n * n * 2);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const x = -half + (2 * half * i) / cells, y = half - (2 * half * j) / cells;
    const k = j * n + i;
    pos[k * 3] = x; pos[k * 3 + 1] = h(x, y); pos[k * 3 + 2] = -y;
    uv[k * 2] = (x + imgHalf) / (2 * imgHalf); uv[k * 2 + 1] = (y + imgHalf) / (2 * imgHalf);
  }
  const idx = new Uint32Array(cells * cells * 6);
  let o = 0;
  for (let j = 0; j < cells; j++) for (let i = 0; i < cells; i++) {
    const a = j * n + i, b = a + 1, c = a + n, d = c + 1;
    idx[o++] = a; idx[o++] = c; idx[o++] = b; idx[o++] = b; idx[o++] = c; idx[o++] = d;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.computeBoundingSphere();
  return g;
}

// ───────────────────────── Traffic ─────────────────────────

interface Lane { pts: Float32Array; cum: Float32Array; len: number }
interface Car { lane: number; s0: number; v: number; back: boolean; off: number }

/** OSM splits roads into many short ways: join them end to end into long runs for the cars. */
function chainRoads(roads: SceneData['roads']): { p: number[]; c: number; one: boolean }[] {
  const key = (x: number, y: number) => `${Math.round(x * 2)},${Math.round(y * 2)}`;
  const items = roads.map(r => ({ p: r.p.slice(), c: r.c, one: !!r.one, used: false }));
  const ends = new Map<string, number[]>();
  items.forEach((r, i) => {
    for (const at of [0, r.p.length - 3]) { const k = key(r.p[at], r.p[at + 1]); (ends.get(k) ?? ends.set(k, []).get(k)!).push(i); }
  });
  const out: { p: number[]; c: number; one: boolean }[] = [];
  for (let i = 0; i < items.length; i++) {
    if (items[i].used) continue;
    items[i].used = true;
    let p = items[i].p.slice();
    const grow = (forward: boolean) => {
      for (;;) {
        const at = forward ? p.length - 3 : 0;
        const k = key(p[at], p[at + 1]);
        const next = (ends.get(k) ?? []).find(j => !items[j].used && items[j].c === items[i].c && items[j].one === items[i].one);
        if (next == null) return;
        items[next].used = true;
        let q = items[next].p.slice();
        const qs = key(q[0], q[1]) === k;
        // Line it up so it joins at the right end.
        const flip = (arr: number[]) => { const r: number[] = []; for (let m = arr.length - 3; m >= 0; m -= 3) r.push(arr[m], arr[m + 1], arr[m + 2]); return r; };
        if (forward) { if (!qs) q = flip(q); p = p.concat(q.slice(3)); } else { if (qs) q = flip(q); p = q.slice(0, -3).concat(p); }
      }
    };
    grow(true); grow(false);
    out.push({ p, c: items[i].c, one: items[i].one });
  }
  return out;
}

// ───────────────────────── The world ─────────────────────────

export interface WorldOptions {
  /** Where the skippers stand, venue metres: the bank right there is eased down to the water, so a
   * knoll at your feet doesn't hide the racing (the real ground is kept from a few hundred metres out). */
  flatAt?: { x: number; y: number };
}

export async function createWorld(base: string, opts: WorldOptions = {}): Promise<World> {
  const [scene, treeBuf, demN, demW, imgN, imgW] = await Promise.all([
    fetch(base + 'scene.json').then(r => { if (!r.ok) throw new Error('scene ' + r.status); return r.json() as Promise<SceneData>; }),
    fetch(base + 'trees.bin').then(r => { if (!r.ok) throw new Error('trees ' + r.status); return r.arrayBuffer(); }),
    loadImage(base + 'dem-near.png'), loadImage(base + 'dem-wide.png'),
    loadImage(base + 'near.webp'), loadImage(base + 'wide.webp'),
  ]);
  const NEAR = scene.near, WIDE = scene.wide, CUT = scene.water ?? WATER_CUT;
  const hN = sampler(heights(demN), NEAR), hW = sampler(heights(demW), WIDE);
  const F0 = opts.flatAt;
  const ease = (x: number, y: number, h: number) => {
    if (!F0) return h;
    const d = Math.hypot(x - F0.x, y - F0.y);
    if (d > 320) return h;
    const k = Math.min(1, Math.max(0.3, (d - 90) / 230));
    return h > 0.3 ? 0.3 + (h - 0.3) * k : h;
  };
  const hNe = (x: number, y: number) => ease(x, y, hN(x, y));
  const height = (x: number, y: number) => (Math.abs(x) < NEAR && Math.abs(y) < NEAR ? hNe(x, y) : hW(x, y));

  const canvas = document.createElement('canvas');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, premultipliedAlpha: true, powerPreference: 'high-performance' });
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace; // no conversions: sRGB in, sRGB out
  renderer.setClearColor(0x000000, 0);
  renderer.autoClear = false;
  const maxAniso = renderer.capabilities.getMaxAnisotropy();
  const tex = (im: HTMLImageElement) => {
    const t = new THREE.Texture(im);
    t.colorSpace = THREE.NoColorSpace; t.anisotropy = Math.min(8, maxAniso);
    t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; t.generateMipmaps = true;
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.needsUpdate = true;
    return t;
  };
  const texN = tex(imgN), texW = tex(imgW);

  const S = makeUniforms();
  const world = new THREE.Scene();
  const disposables: { dispose(): void }[] = [texN, texW];
  const add = (o: THREE.Mesh | THREE.LineSegments | THREE.InstancedMesh) => { o.frustumCulled = false; world.add(o); disposables.push(o.geometry, o.material as THREE.Material); };

  // ── Terrain: fine near the club, coarser further out, each ring with the next one's hole ──
  const INNER = Math.min(1600, NEAR / 2);
  add(new THREE.Mesh(terrain(INNER, Math.round((2 * INNER) / 10), hNe, NEAR), terrainMaterial(S, texN, null, CUT)));
  add(new THREE.Mesh(terrain(NEAR, Math.round((2 * NEAR) / 25), hN, NEAR), terrainMaterial(S, texN, [-INNER, INNER, -INNER, INNER], CUT)));
  add(new THREE.Mesh(terrain(WIDE, 256, hW, WIDE), terrainMaterial(S, texW, [-NEAR + 30, NEAR - 30, -NEAR + 30, NEAR - 30], CUT)));

  // ── Trees ──
  {
    const dv = new DataView(treeBuf), n = Math.floor(treeBuf.byteLength / 12);
    const iPos = new Float32Array(n * 3), iSize = new Float32Array(n * 2), iCol = new Float32Array(n * 3), iCell = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const o = i * 12;
      const x = dv.getInt16(o, true), y = dv.getInt16(o + 2, true), z = dv.getInt16(o + 4, true) / 10, h = dv.getUint8(o + 6) / 4, kind = dv.getUint8(o + 7);
      const wf = kind === 5 ? 0.42 : kind === 4 ? 1.35 : 0.8 + ((i * 7919) % 13) / 60;
      // Norfolk pines: not a parade ground. Some taller, some missing.
      const hv = kind === 5 ? h * (0.78 + ((i * 2654435761) >>> 0) % 37 / 100) : h;
      if (kind === 5 && ((i * 40503) >>> 0) % 7 === 0) { iSize[i * 2] = 0; iSize[i * 2 + 1] = 0; continue; }
      // Nothing stands in the water (tidal venues: the shore's lowest ground is left to the water).
      if (z < CUT) { iSize[i * 2] = 0; iSize[i * 2 + 1] = 0; continue; }
      iPos[i * 3] = x; iPos[i * 3 + 1] = ease(x, y, z) - 0.4; iPos[i * 3 + 2] = -y;
      iSize[i * 2] = hv * wf; iSize[i * 2 + 1] = hv;
      iCol[i * 3] = dv.getUint8(o + 8) / 255; iCol[i * 3 + 1] = dv.getUint8(o + 9) / 255; iCol[i * 3 + 2] = dv.getUint8(o + 10) / 255;
      iCell[i] = kind;
    }
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, 0, 0, 0.5, 0, 0, 0.5, 1, 0, -0.5, 1, 0], 3));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    g.setAttribute('iPos', new THREE.InstancedBufferAttribute(iPos, 3));
    g.setAttribute('iSize', new THREE.InstancedBufferAttribute(iSize, 2));
    g.setAttribute('iCol', new THREE.InstancedBufferAttribute(iCol, 3));
    g.setAttribute('iCell', new THREE.InstancedBufferAttribute(iCell, 1));
    g.instanceCount = n;
    const atlas = new THREE.CanvasTexture(treeAtlas());
    atlas.colorSpace = THREE.NoColorSpace; atlas.anisotropy = Math.min(4, maxAniso);
    disposables.push(atlas);
    add(new THREE.Mesh(g, treeMaterial(S, atlas)));
  }

  // ── Houses, buildings, jetties, boats and landmarks: one mesh of coloured triangles ──
  const B = new Builder();
  const WALLS: [number, number, number][] = [[0.6, 0.4, 0.32], [0.52, 0.4, 0.32], [0.86, 0.83, 0.77], [0.9, 0.9, 0.88], [0.72, 0.71, 0.68], [0.82, 0.78, 0.66]];
  for (const h of scene.houses) {
    const [x, y, z, yaw, w, d, lv, roof, wi, block] = h;
    house(B, x, y, ease(x, y, z), yaw, w, d, lv, soften(rgb(roof), 0.22), WALLS[wi % WALLS.length], !!block);
  }
  for (const b of scene.blds) {
    const p: number[][] = [];
    for (let i = 0; i < b.p.length; i += 2) p.push([b.p[i], b.p[i + 1]]);
    const bz = ease(p[0][0], p[0][1], b.z), z0 = bz - 0.6, z1 = bz + b.h;
    const wc: [number, number, number] = [0.86, 0.84, 0.79];
    for (let i = 0; i < p.length; i++) wall(B, p[i], p[(i + 1) % p.length], z0, z1, wc);
    const tris = THREE.ShapeUtils.triangulateShape(p.map(q => new THREE.Vector2(q[0], q[1])), []);
    const rc = b.roof ? rgb(b.roof) : [0.55, 0.56, 0.56] as [number, number, number];
    for (const t of tris) B.tri([p[t[0]][0], p[t[0]][1], z1], [p[t[1]][0], p[t[1]][1], z1], [p[t[2]][0], p[t[2]][1], z1], rc);
  }
  // Jetties: a timber deck on piles, with a rail.
  const DECK: [number, number, number] = [0.66, 0.63, 0.58], PILE: [number, number, number] = [0.36, 0.33, 0.29], RAIL: [number, number, number] = [0.8, 0.81, 0.79];
  for (const pr of scene.piers) {
    const p: number[][] = [];
    for (let i = 0; i < pr.p.length; i += 2) p.push([pr.p[i], pr.p[i + 1]]);
    if (pr.a) {
      const ring = p.slice(0, -1);
      const tris = THREE.ShapeUtils.triangulateShape(ring.map(q => new THREE.Vector2(q[0], q[1])), []);
      // A floating pontoon: a low concrete deck.
      for (const t of tris) B.tri([ring[t[0]][0], ring[t[0]][1], 0.55], [ring[t[1]][0], ring[t[1]][1], 0.55], [ring[t[2]][0], ring[t[2]][1], 0.55], [0.7, 0.69, 0.66]);
      for (let i = 0; i < ring.length; i++) wall(B, ring[i], ring[(i + 1) % ring.length], 0.0, 0.55, [0.62, 0.61, 0.58]);
      continue;
    }
    for (let i = 0; i + 1 < p.length; i++) {
      const a = p[i], b = p[i + 1], ex = b[0] - a[0], ey = b[1] - a[1], L = Math.hypot(ex, ey);
      if (L < 0.5) continue;
      const yaw = (Math.atan2(ex, ey) * 180) / Math.PI, mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
      const deckZ = Math.max(1.1, height(mx, my) + 0.3);
      box(B, mx, my, deckZ - 0.25, deckZ, L + 0.2, pr.w, yaw, DECK);
      const nx = ey / L, ny = -ex / L;
      for (const side of [-1, 1]) box(B, mx + nx * side * (pr.w / 2 - 0.05), my + ny * side * (pr.w / 2 - 0.05), deckZ + 0.95, deckZ + 1.05, L, 0.08, yaw, RAIL);
      for (let s = 0; s <= L; s += 3.5) for (const side of [-1, 1]) {
        const px = a[0] + (ex * s) / L + nx * side * (pr.w / 2 - 0.15), py = a[1] + (ey * s) / L + ny * side * (pr.w / 2 - 0.15);
        box(B, px, py, -0.4, deckZ + 1.05, 0.28, 0.28, yaw, PILE);
      }
    }
  }
  for (const br of scene.bridges ?? []) bridge(B, br, height);
  // Boats on moorings: a hull with a bow, then a cabin, or a mast.
  const HULL: [number, number, number] = [0.93, 0.93, 0.92], CABIN: [number, number, number] = [0.82, 0.84, 0.86], GLASS: [number, number, number] = [0.2, 0.25, 0.3];
  const hull = (x: number, y: number, z: number, yaw: number, L: number, beam: number, free: number) => {
    const r = (yaw * Math.PI) / 180, fx = Math.sin(r), fy = Math.cos(r), rx = Math.cos(r), ry = -Math.sin(r);
    const P = (a: number, b: number) => [x + fx * a + rx * b, y + fy * a + ry * b];
    const pts = [P(L / 2, 0), P(L * 0.15, beam / 2), P(-L / 2, beam / 2 * 0.9), P(-L / 2, -beam / 2 * 0.9), P(L * 0.15, -beam / 2)];
    for (let i = 0; i < 5; i++) wall(B, pts[i], pts[(i + 1) % 5], z - 0.2, z + free, HULL);
    const top = pts.map(q => [q[0], q[1], z + free]);
    B.tri(top[0], top[1], top[4], HULL); B.quad(top[1], top[2], top[3], top[4], HULL);
    return { fx, fy };
  };
  for (const [x, y, yaw, L, sail] of scene.boats) {
    hull(x, y, 0, yaw, L, L * 0.34, 0.9);
    if (sail) {
      box(B, x, y, 0.9, 0.9 + L * 1.35, 0.14, 0.14, yaw, [0.85, 0.86, 0.87]);
      box(B, x - Math.sin((yaw * Math.PI) / 180) * L * 0.15, y - Math.cos((yaw * Math.PI) / 180) * L * 0.15, 1.6, 1.75, L * 0.35, 0.12, yaw, [0.85, 0.86, 0.87]);
      box(B, x, y, 0.9, 1.5, L * 0.32, L * 0.2, yaw, CABIN);
    } else {
      box(B, x - Math.sin((yaw * Math.PI) / 180) * L * 0.05, y - Math.cos((yaw * Math.PI) / 180) * L * 0.05, 0.9, 2.1, L * 0.42, L * 0.26, yaw, CABIN, [0.95, 0.95, 0.95]);
      box(B, x + Math.sin((yaw * Math.PI) / 180) * L * 0.13, y + Math.cos((yaw * Math.PI) / 180) * L * 0.13, 1.3, 1.9, 0.1, L * 0.26, yaw, GLASS);
    }
  }
  // A sailing club's boat park: dinghies on trolleys, masts up.
  const DINGHY: [number, number, number][] = [[0.95, 0.95, 0.94], [0.85, 0.2, 0.18], [0.2, 0.35, 0.65], [0.96, 0.82, 0.25]];
  scene.dinghies.forEach(([x, y, z, yaw], i) => {
    const c = DINGHY[i % DINGHY.length];
    const r = (yaw * Math.PI) / 180, fx = Math.sin(r), fy = Math.cos(r), rx = Math.cos(r), ry = -Math.sin(r);
    const P = (a: number, b: number) => [x + fx * a + rx * b, y + fy * a + ry * b];
    const pts = [P(2.1, 0), P(0.6, 0.75), P(-2.1, 0.7), P(-2.1, -0.7), P(0.6, -0.75)];
    for (let k = 0; k < 5; k++) wall(B, pts[k], pts[(k + 1) % 5], z + 0.35, z + 0.85, c);
    box(B, x + fx * 0.6, y + fy * 0.6, z + 0.85, z + 7.2, 0.22, 0.22, yaw, [0.82, 0.83, 0.84]);
    box(B, x, y, z, z + 0.4, 1.8, 0.9, yaw, [0.3, 0.3, 0.3]);
  });
  for (const lm of scene.landmarks) {
    if (lm.k === 'shed') {
      const [len, wid, ht] = lm.s, wc = rgb(lm.wall), rc = rgb(lm.roof);
      const r = (lm.yaw * Math.PI) / 180, fx = Math.sin(r), fy = Math.cos(r), rx = Math.cos(r), ry = -Math.sin(r);
      const P = (a: number, b: number) => [lm.x + rx * a + fx * b, lm.y + ry * a + fy * b];
      const z0 = lm.z - 0.5, z1 = lm.z + ht;
      const c = [P(len / 2, wid / 2), P(-len / 2, wid / 2), P(-len / 2, -wid / 2), P(len / 2, -wid / 2)];
      for (let i = 0; i < 4; i++) wall(B, c[i], c[(i + 1) % 4], z0, z1, wc);
      // A gable roof and its two end triangles.
      const ridgeA = P(len / 2, 0), ridgeB = P(-len / 2, 0), rise = wid * 0.28;
      B.quad([c[0][0], c[0][1], z1], [c[1][0], c[1][1], z1], [ridgeB[0], ridgeB[1], z1 + rise], [ridgeA[0], ridgeA[1], z1 + rise], rc);
      B.quad([c[2][0], c[2][1], z1], [c[3][0], c[3][1], z1], [ridgeA[0], ridgeA[1], z1 + rise], [ridgeB[0], ridgeB[1], z1 + rise], [rc[0] * 0.85, rc[1] * 0.85, rc[2] * 0.85]);
      B.tri([c[3][0], c[3][1], z1], [c[0][0], c[0][1], z1], [ridgeA[0], ridgeA[1], z1 + rise], wc);
      B.tri([c[1][0], c[1][1], z1], [c[2][0], c[2][1], z1], [ridgeB[0], ridgeB[1], z1 + rise], wc);
      // Roller doors on the water side.
      box(B, P(0, -wid / 2 - 0.02)[0], P(0, -wid / 2 - 0.02)[1], z0 + 0.6, z0 + 3.4, 0.05, len * 0.7, lm.yaw, [0.62, 0.65, 0.66]);
    } else if (lm.k === 'chimera') {
      // A slender tower with a vane of three sails on top.
      for (let i = 0; i < 4; i++) { const t0 = i / 4, t1 = (i + 1) / 4; box(B, lm.x, lm.y, lm.z + lm.h * t0, lm.z + lm.h * t1, 0.9 - 0.5 * t1, 0.9 - 0.5 * t1, 45, [0.55, 0.57, 0.58]); }
      const zt = lm.z + lm.h;
      for (let k = 0; k < 3; k++) {
        const a = ((k * 120 + 15) * Math.PI) / 180;
        B.tri([lm.x, lm.y, zt + 0.2], [lm.x + Math.sin(a) * 2.2, lm.y + Math.cos(a) * 2.2, zt + 0.6], [lm.x, lm.y, zt + 4.2], [0.93, 0.94, 0.95]);
      }
    }
  }
  // Flagpoles (the flags themselves are separate, to flutter).
  for (const [x, y, z, h] of scene.flags) box(B, x, y, ease(x, y, z) - 0.3, ease(x, y, z) + h, 0.12, 0.12, 0, [0.92, 0.92, 0.92]);
  // Telecommunication masts.
  for (const [x, y, z, h] of scene.masts) {
    box(B, x, y, z, z + h * 0.6, 0.9, 0.9, 45, [0.7, 0.71, 0.72]);
    box(B, x, y, z + h * 0.6, z + h, 0.5, 0.5, 45, [0.74, 0.75, 0.76]);
  }
  // Power lines: towers at the corners, three wires sagging between.
  const wires: number[] = [];
  for (const line of scene.power) {
    const pts: number[][] = [];
    for (let i = 0; i < line.length; i += 3) pts.push([line[i], line[i + 1], line[i + 2]]);
    let span = 0;
    for (let i = 0; i + 1 < pts.length; i++) span = Math.max(span, Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]));
    const tall = span > 140 ? 28 : 13, arm = span > 140 ? 5 : 1.6;
    const heads: number[][][] = [];
    for (let i = 0; i < pts.length; i++) {
      const [x, y, z] = pts[i];
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
      const yaw = (Math.atan2(b[0] - a[0], b[1] - a[1]) * 180) / Math.PI + 90;
      // Slim: a lattice tower is mostly air, and a pole is a hand's span of weathered timber.
      if (span > 140) {
        for (let k = 0; k < 3; k++) { const t0 = k / 3, t1 = (k + 1) / 3; box(B, x, y, z + tall * t0, z + tall * t1, 1.2 - 0.9 * t1, 1.2 - 0.9 * t1, yaw, [0.62, 0.64, 0.65]); }
      } else box(B, x, y, z, z + tall, 0.2, 0.2, yaw, [0.4, 0.37, 0.33]);
      box(B, x, y, z + tall - 0.25, z + tall, arm * 2, 0.12, yaw, [0.5, 0.5, 0.49]);
      const r = (yaw * Math.PI) / 180, fx = Math.sin(r), fy = Math.cos(r);
      heads.push([-1, 0, 1].map(k => [x + fx * arm * k * 0.9, y + fy * arm * k * 0.9, z + tall - 0.5]));
    }
    for (let i = 0; i + 1 < heads.length; i++) for (let k = 0; k < 3; k++) {
      const A = heads[i][k], Bp = heads[i + 1][k], L = Math.hypot(Bp[0] - A[0], Bp[1] - A[1]), sag = L * 0.03;
      for (let s = 0; s < 10; s++) {
        const t0 = s / 10, t1 = (s + 1) / 10;
        const at = (t: number) => [A[0] + (Bp[0] - A[0]) * t, A[1] + (Bp[1] - A[1]) * t, A[2] + (Bp[2] - A[2]) * t - sag * 4 * t * (1 - t)];
        const p0 = at(t0), p1 = at(t1);
        wires.push(p0[0], p0[2], -p0[1], p1[0], p1[2], -p1[1]);
      }
    }
  }
  add(new THREE.Mesh(B.geometry(), colourMaterial(S, -0.05)));
  if (wires.length) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(wires, 3));
    add(new THREE.LineSegments(g, lineMaterial(S)));
  }

  // ── Flags ──
  const flags: THREE.Mesh[] = [];
  for (const [x, y, z, h, color] of scene.flags) {
    const g = new THREE.PlaneGeometry(1.8, 1.15, 10, 1);
    g.translate(0.9, 0, 0);
    const m = new THREE.Mesh(g, flagMaterial(S, color));
    m.position.set(x, ease(x, y, z) + h - 0.6, -y);
    add(m);
    flags.push(m);
  }

  // ── Traffic ──
  const lanes: Lane[] = [];
  const cars: Car[] = [];
  {
    let seed = 7;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const GAP: Record<number, number> = { 4: 32, 3: 42, 2: 65, 1: 95 };
    for (const ch of chainRoads(scene.roads)) {
      const n = ch.p.length / 3;
      if (n < 2) continue;
      const pts = new Float32Array(ch.p), cum = new Float32Array(n);
      for (let i = 1; i < n; i++) cum[i] = cum[i - 1] + Math.hypot(pts[i * 3] - pts[i * 3 - 3], pts[i * 3 + 1] - pts[i * 3 - 2]);
      const len = cum[n - 1];
      if (len < 60) continue;
      lanes.push({ pts, cum, len });
      const li = lanes.length - 1;
      for (const back of ch.one ? [false] : [false, true]) {
        const gap = GAP[ch.c] ?? 80;
        for (let s = rnd() * gap; s < len; s += gap * (0.5 + rnd())) cars.push({ lane: li, s0: s, v: 12 + rnd() * 5, back, off: ch.one ? 0 : 1.7 });
      }
    }
  }
  const CARS: [number, number, number][] = [[0.95, 0.95, 0.95], [0.95, 0.95, 0.95], [0.75, 0.77, 0.79], [0.15, 0.16, 0.17], [0.55, 0.57, 0.6], [0.7, 0.13, 0.12], [0.16, 0.3, 0.55], [0.92, 0.92, 0.9]];
  let carMesh: THREE.InstancedMesh | null = null;
  if (cars.length) {
    const cb = new Builder();
    box(cb, 0, 0, 0.25, 1.05, 4.4, 1.8, 0, [1, 1, 1]);
    box(cb, -0.3, 0, 1.05, 1.5, 2.3, 1.6, 0, [0.55, 0.58, 0.62], [0.85, 0.85, 0.85]);
    const g = cb.geometry();
    const ic = new Float32Array(cars.length * 3);
    cars.forEach((_, i) => { const c = CARS[(i * 2654435761 >>> 0) % CARS.length]; ic.set(c, i * 3); });
    g.setAttribute('iCol', new THREE.InstancedBufferAttribute(ic, 3));
    carMesh = new THREE.InstancedMesh(g, carMaterial(S), cars.length);
    add(carMesh);
  }
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), pv = new THREE.Vector3(), sv = new THREE.Vector3(1, 1, 1), up = new THREE.Vector3(0, 1, 0);
  const placeCars = (t: number) => {
    if (!carMesh) return;
    cars.forEach((c, i) => {
      const L = lanes[c.lane];
      let s = (c.s0 + c.v * t) % L.len;
      if (c.back) s = L.len - s;
      // Which segment, by bisection.
      let lo = 0, hi = L.cum.length - 1;
      while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (L.cum[mid] <= s) lo = mid; else hi = mid; }
      const segL = L.cum[hi] - L.cum[lo] || 1, k = (s - L.cum[lo]) / segL;
      const ax = L.pts[lo * 3], ay = L.pts[lo * 3 + 1], az = L.pts[lo * 3 + 2], bx = L.pts[hi * 3], by = L.pts[hi * 3 + 1], bz = L.pts[hi * 3 + 2];
      let dx = (bx - ax) / segL, dy = (by - ay) / segL;
      if (c.back) { dx = -dx; dy = -dy; }
      // Keep left.
      const x = ax + (bx - ax) * k - dy * c.off, y = ay + (by - ay) * k + dx * c.off, z = az + (bz - az) * k;
      const fade = Math.min(1, Math.min(s, L.len - s) / 12);
      q.setFromAxisAngle(up, -Math.atan2(dx, dy));
      pv.set(x, z, -y); sv.setScalar(Math.max(0.001, fade));
      m4.compose(pv, q, sv);
      carMesh!.setMatrixAt(i, m4);
    });
    carMesh.instanceMatrix.needsUpdate = true;
  };

  // ── The mirror pass: drawn into a half-size target, then laid over the water, faint and rippled ──
  const rt = new THREE.WebGLRenderTarget(4, 4, { depthBuffer: true, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
  disposables.push(rt);
  const quadScene = new THREE.Scene(), quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const quadMat = new THREE.ShaderMaterial({
    uniforms: { tR: { value: rt.texture }, uA: { value: 0.3 }, uTime: S.uTime, uTint: { value: WATER_TINT.clone() } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: /* glsl */`
      uniform sampler2D tR; uniform float uA; uniform float uTime; uniform vec3 uTint;
      varying vec2 vUv;
      void main() {
        vec2 uv = vUv + vec2(sin(vUv.y * 520.0 + uTime * 2.2) * 0.0007 + sin(vUv.y * 131.0 - uTime * 1.3) * 0.0006, 0.0);
        vec4 c = texture2D(tR, uv);
        float a = c.a * uA;
        vec3 col = mix(c.rgb, uTint, 0.38);
        gl_FragColor = vec4(col * a, a);
      }`,
    transparent: true,
    blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    depthTest: false, depthWrite: false,
  });
  quadScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), quadMat));
  disposables.push(quadMat);

  const cam = new THREE.PerspectiveCamera(30, 1, 2.5, 45000);
  let size = { W: 0, H: 0 };

  return {
    credit: scene.credit,
    render(v: WorldView, layer: 'reflection' | 'land') {
      const W = Math.max(2, Math.round(v.w * v.scale)), H = Math.max(2, Math.round(v.h * v.scale));
      if (W !== size.W || H !== size.H) {
        renderer.setPixelRatio(1);
        renderer.setSize(W, H, false);
        rt.setSize(Math.max(2, W >> 1), Math.max(2, H >> 1));
        size = { W, H };
      }
      cam.aspect = W / H;
      cam.fov = (2 * Math.atan(Math.tan((v.fov * Math.PI) / 360) * (H / W)) * 180) / Math.PI;
      cam.updateProjectionMatrix();
      cam.position.set(v.x, v.eye, -v.y);
      const yr = (v.yaw * Math.PI) / 180, pr = (v.pitch * Math.PI) / 180;
      cam.up.set(0, 1, 0);
      cam.lookAt(v.x + Math.sin(yr) * Math.cos(pr), v.eye - Math.sin(pr), -v.y - Math.cos(yr) * Math.cos(pr));
      cam.updateMatrixWorld();
      S.uTime.value = v.t;
      // A zoomed-in view sees further before the haze: keep the haze about the same on screen.
      S.uFogK.value = 0.000105 * Math.min(1, Math.max(0.55, v.fov / 50));
      const wr = (((v.windFrom + 180) % 360) * Math.PI) / 180;
      for (const f of flags) f.rotation.y = Math.atan2(Math.cos(wr), Math.sin(wr));
      placeCars(v.t);

      renderer.setRenderTarget(null);
      renderer.clear(true, true, true);
      if (layer === 'reflection') {
        S.uReflect.value = 1;
        renderer.setRenderTarget(rt);
        renderer.clear(true, true, true);
        renderer.render(world, cam);
        renderer.setRenderTarget(null);
        quadMat.uniforms.uA.value = Math.min(0.85, v.reflect);
        renderer.render(quadScene, quadCam);
        S.uReflect.value = 0;
        return canvas;
      }
      S.uReflect.value = 0;
      renderer.render(world, cam);
      return canvas;
    },
    dispose() {
      for (const d of disposables) d.dispose();
      renderer.dispose();
    },
  };
}
