// Real venues. A venue is a club's water and foreshore from OpenStreetMap (© OpenStreetMap
// contributors, ODbL), in metres from the club's saved location: x east, y north.
//
// A race at a venue runs in the race frame, exactly as on the practice pond: the start line centre
// at the origin and the wind at the start blowing from +y. layCourse() lays the course where a race
// officer would for the day's wind: close to the control area, with every mark and the water the
// fleet sails on well clear of the shore. venueScene() then carries the water, the bank and the
// control area into the race frame, and shoreFor() gives the physics and the AI the water's edge.

import type { V2 } from './math';
import type { Course } from './course';

export type FeatureKind = 'park' | 'wood' | 'pier' | 'road' | 'path' | 'bld' | 'pitch' | 'playground' | 'parking' | 'pond';
export interface Feature { kind: FeatureKind; name?: string; pts: V2[] }

export interface VenueDef {
  id: string;
  /** "Lake Macquarie RYC" */
  name: string;
  /** "LMRYC · Booragul" */
  short: string;
  /** "Booragul foreshore, Lake Macquarie" */
  place: string;
  /** The club's saved location: the venue's origin. */
  lat: number; lon: number;
  /** The breeze it usually races in: compass degrees it blows from, and what it's called. */
  usualWind: number; usualWindName: string;
  /** The control area: the stretch of bank the skippers stand on. */
  control: [V2, V2];
  /** The water's edge: the outer shore runs anticlockwise (water on its left), islands clockwise. */
  water: V2[];
  islands: V2[][];
  /** What's on the bank: parks, woods, buildings, piers, roads and paths. */
  features: Feature[];
  /** Places you can see across the water, named in the bank view. */
  landmarks: { name: string; at: V2 }[];
  /** The map data's licence credit, shown wherever the venue is drawn. */
  credit: string;
}

/** [x0, y0, x1, y1, …] → points. */
export function pts(a: number[]): V2[] {
  const out: V2[] = [];
  for (let i = 0; i + 1 < a.length; i += 2) out.push({ x: a[i], y: a[i + 1] });
  return out;
}

// ───────────────────────── Geometry ─────────────────────────

/** Point in polygon (even-odd). */
export function pip(x: number, y: number, ring: V2[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if ((a.y > y) !== (b.y > y) && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** On the water: inside the outer shore and not on an island. */
export function wetIn(rings: V2[][], x: number, y: number): boolean {
  let wet = false;
  for (const r of rings) if (pip(x, y, r)) wet = !wet;
  return wet;
}

/** Squared distance from (px, py) to segment a-b, and the parameter of the closest point. */
function segD2(px: number, py: number, ax: number, ay: number, bx: number, by: number): [number, number] {
  const ex = bx - ax, ey = by - ay;
  const L2 = ex * ex + ey * ey;
  const t = L2 > 1e-12 ? Math.max(0, Math.min(1, ((px - ax) * ex + (py - ay) * ey) / L2)) : 0;
  const qx = ax + ex * t - px, qy = ay + ey * t - py;
  return [qx * qx + qy * qy, t];
}

/** A coarse grid of where the water is, for quick tests (drawing, laying the course). */
export class WaterGrid {
  private cells: Uint8Array;
  private nx: number;
  private ny: number;
  constructor(private rings: V2[][], private x0: number, private y0: number, x1: number, y1: number, private cell: number) {
    this.nx = Math.max(1, Math.ceil((x1 - x0) / cell));
    this.ny = Math.max(1, Math.ceil((y1 - y0) / cell));
    this.cells = new Uint8Array(this.nx * this.ny);
    // Scanlines: where each row crosses the shore, sorted; water between alternate crossings.
    const xs: number[] = [];
    for (let j = 0; j < this.ny; j++) {
      const y = y0 + (j + 0.5) * cell;
      xs.length = 0;
      for (const r of rings) {
        for (let i = 0, k = r.length - 1; i < r.length; k = i++) {
          const a = r[i], b = r[k];
          if ((a.y > y) !== (b.y > y)) xs.push(a.x + ((y - a.y) * (b.x - a.x)) / (b.y - a.y));
        }
      }
      xs.sort((p, q) => p - q);
      for (let m = 0; m + 1 < xs.length; m += 2) {
        const i0 = Math.max(0, Math.ceil((xs[m] - x0) / cell - 0.5));
        const i1 = Math.min(this.nx - 1, Math.floor((xs[m + 1] - x0) / cell - 0.5));
        for (let i = i0; i <= i1; i++) this.cells[j * this.nx + i] = 1;
      }
    }
  }
  wet(x: number, y: number): boolean {
    const i = Math.floor((x - this.x0) / this.cell), j = Math.floor((y - this.y0) / this.cell);
    if (i < 0 || j < 0 || i >= this.nx || j >= this.ny) return wetIn(this.rings, x, y);
    return this.cells[j * this.nx + i] === 1;
  }
}

// ───────────────────────── The race frame ─────────────────────────

/** Race frame ↔ venue metres: race x is to the right looking into the wind at the start, y towards it. */
export interface Frame {
  /** Compass bearing of the race frame's +y: where the wind comes from at the start. */
  rot: number;
  /** The race origin (the start line centre), venue metres. */
  S: V2;
  u: V2;
  r: V2;
}

export function frameAt(rot: number, S: V2): Frame {
  const a = (rot * Math.PI) / 180;
  return { rot, S, u: { x: Math.sin(a), y: Math.cos(a) }, r: { x: Math.cos(a), y: -Math.sin(a) } };
}
export function toRace(f: Frame, g: V2): V2 {
  const dx = g.x - f.S.x, dy = g.y - f.S.y;
  return { x: dx * f.r.x + dy * f.r.y, y: dx * f.u.x + dy * f.u.y };
}
export function toGeo(f: Frame, p: V2): V2 {
  return { x: f.S.x + p.x * f.r.x + p.y * f.u.x, y: f.S.y + p.x * f.r.y + p.y * f.u.y };
}

// ───────────────────────── Laying the course ─────────────────────────

const grids = new Map<string, WaterGrid>();
/** The venue's water within half a kilometre of the control area, on a 2 m grid (built once). */
function venueGrid(def: VenueDef): WaterGrid {
  let g = grids.get(def.id);
  if (!g) {
    const c = mid(def.control);
    g = new WaterGrid([def.water, ...def.islands], c.x - 500, c.y - 500, c.x + 500, c.y + 500, 2);
    grids.set(def.id, g);
  }
  return g;
}

const mid = (s: [V2, V2]): V2 => ({ x: (s[0].x + s[1].x) / 2, y: (s[0].y + s[1].y) / 2 });

/** Distance from a point to a rectangle (0 inside). */
function rectDist(p: V2, x0: number, y0: number, x1: number, y1: number): number {
  const dx = Math.max(x0 - p.x, 0, p.x - x1), dy = Math.max(y0 - p.y, 0, p.y - y1);
  return Math.hypot(dx, dy);
}

/** The water the fleet races on, in the race frame (the course frame at a venue, where the axis is 0). */
function raceArea(c: Course) {
  const L = c.L;
  const W = c.byId.W.p, G = c.byId.GP.p;
  const half = Math.abs(c.start.stbd.x - c.start.pin.x) / 2;
  // Across: the line and a little more, or half the beat, where most boats tack.
  const X = Math.max(half + 6 * L, 0.5 * W.y);
  return { x0: -X, x1: X, y0: G.y - 5 * L, y1: W.y + 5 * L };
}

/**
 * Where to put the start line centre (venue metres) so that, with the wind from `rot`, every mark
 * is at least four lengths from the shore, the water the fleet races on is all lake, and the
 * control area is close beside it. Null if the venue can't fit this course in this wind.
 */
export function layCourse(def: VenueDef, rot: number, c: Course): V2 | null {
  const grid = venueGrid(def);
  const L = c.L, B = c.bounds;
  const f0 = frameAt(rot, { x: 0, y: 0 });
  const ctrl = mid(def.control);
  const area = raceArea(c);

  // Race-frame points that must be on open water: each mark with a ring four lengths round it,
  // and a grid over the water the fleet races on.
  const must: V2[] = [];
  for (const m of c.marks) {
    must.push(m.p);
    for (let k = 0; k < 8; k++) must.push({ x: m.p.x + Math.cos((k * Math.PI) / 4) * 4 * L, y: m.p.y + Math.sin((k * Math.PI) / 4) * 4 * L });
  }
  for (let i = 0; i <= 6; i++) for (let j = 0; j <= 8; j++) must.push({ x: area.x0 + ((area.x1 - area.x0) * i) / 6, y: area.y0 + ((area.y1 - area.y0) * j) / 8 });
  // The rest of the pond: better mostly water, but the near bank can cut into it.
  const soft: V2[] = [];
  for (let i = 0; i <= 8; i++) for (let j = 0; j <= 8; j++) soft.push({ x: -B.across + (2 * B.across * i) / 8, y: B.alongMin + ((B.alongMax - B.alongMin) * j) / 8 });

  const geoOf = (S: V2, p: V2) => ({ x: S.x + p.x * f0.r.x + p.y * f0.u.x, y: S.y + p.x * f0.r.y + p.y * f0.u.y });
  const score = (S: V2): number => {
    for (const p of must) { const g = geoOf(S, p); if (!grid.wet(g.x, g.y)) return Infinity; }
    let wet = 0;
    for (const p of soft) { const g = geoOf(S, p); if (grid.wet(g.x, g.y)) wet++; }
    // Where the skippers stand, in the race frame: close beside the racing, not in it.
    const dx = ctrl.x - S.x, dy = ctrl.y - S.y;
    const q = { x: dx * f0.r.x + dy * f0.r.y, y: dx * f0.u.x + dy * f0.u.y };
    const dc = rectDist(q, area.x0, area.y0, area.x1, area.y1);
    return Math.abs(dc - 6 * L) + 0.03 * Math.hypot(q.x, q.y) + 25 * L * (1 - wet / soft.length);
  };

  // Coarse search round the control area, then refine round the best few.
  const found: { S: V2; s: number }[] = [];
  const R = 160, step = 3;
  for (let a = -R; a <= R; a += step) {
    for (let k = -R; k <= R; k += step) {
      const S = { x: ctrl.x + a * f0.u.x + k * f0.r.x, y: ctrl.y + a * f0.u.y + k * f0.r.y };
      const s = score(S);
      if (s < Infinity) found.push({ S, s });
    }
  }
  if (!found.length) return null;
  found.sort((p, q) => p.s - q.s);
  const rings = [def.water, ...def.islands];
  for (const cand of found.slice(0, 12)) {
    let best = cand;
    for (let a = -step; a <= step; a += 1) {
      for (let k = -step; k <= step; k += 1) {
        const S = { x: cand.S.x + a * f0.u.x + k * f0.r.x, y: cand.S.y + a * f0.u.y + k * f0.r.y };
        const s = score(S);
        if (s < best.s) best = { S, s };
      }
    }
    // Check exactly: every mark clear of the shore by four lengths, less a little for the grid.
    const ok = c.marks.every(m => {
      const g = geoOf(best.S, m.p);
      if (!wetIn(rings, g.x, g.y)) return false;
      for (const r of rings) for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
        if (segD2(g.x, g.y, r[j].x, r[j].y, r[i].x, r[i].y)[0] < (3.6 * L) ** 2) return false;
      }
      return true;
    });
    if (ok) return best.S;
  }
  return null;
}

// ───────────────────────── The venue in the race frame ─────────────────────────

export interface VenueScene {
  def: VenueDef;
  frame: Frame;
  /** The outer shore and the islands, in the race frame (same winding as the venue's). */
  water: V2[];
  islands: V2[][];
  features: Feature[];
  /** The control area, race frame. */
  control: [V2, V2];
  landmarks: { name: string; at: V2 }[];
  /** Shore edges that run along the edge of the map extract, not a real bank (open water beyond). */
  open: (a: V2, b: V2) => boolean;
}

export function venueScene(def: VenueDef, f: Frame): VenueScene {
  const T = (p: V2) => toRace(f, p);
  // The extract's bounding box: edges along it are where the map was cut, not the shore.
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of def.water) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
  const onBox = (g: V2) => Math.abs(g.x - x0) < 2 || Math.abs(g.x - x1) < 2 || Math.abs(g.y - y0) < 2 || Math.abs(g.y - y1) < 2;
  return {
    def, frame: f,
    water: def.water.map(T),
    islands: def.islands.map(r => r.map(T)),
    features: def.features.map(ft => ({ ...ft, pts: ft.pts.map(T) })),
    control: [T(def.control[0]), T(def.control[1])],
    landmarks: def.landmarks.map(l => ({ name: l.name, at: T(l.at) })),
    open: (a: V2, b: V2) => onBox(toGeo(f, a)) && onBox(toGeo(f, b)),
  };
}

/** The water's edge for the physics and the AI, race frame. */
export interface Shore {
  /** Every ring: the outer shore first, then the islands. */
  rings: V2[][];
  /** Shore edges near the course, as x1 y1 x2 y2, each with the water on its left. */
  segs: Float64Array;
  /** Quick water test within half a kilometre of the course. */
  grid: WaterGrid;
}

export function shoreFor(v: VenueScene, c: Course): Shore {
  const rings = [v.water, ...v.islands];
  const B = c.bounds, m = 40;
  const out: number[] = [];
  for (const r of rings) {
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      const a = r[j], b = r[i];
      if (Math.max(a.x, b.x) < -B.across - m || Math.min(a.x, b.x) > B.across + m) continue;
      if (Math.max(a.y, b.y) < B.alongMin - m || Math.min(a.y, b.y) > B.alongMax + m) continue;
      out.push(a.x, a.y, b.x, b.y);
    }
  }
  return { rings, segs: new Float64Array(out), grid: new WaterGrid(rings, -450, -450, 450, 450, 2) };
}

/** On the water (exact). */
export function shoreWet(sh: Shore, p: V2): boolean { return wetIn(sh.rings, p.x, p.y); }

/** The nearest bit of shore near the course: its distance and the closest point. */
export function nearestShore(sh: Shore, p: V2): { d: number; q: V2 } {
  const s = sh.segs;
  let best = Infinity, bx = 0, by = 0;
  for (let i = 0; i < s.length; i += 4) {
    const [d2, t] = segD2(p.x, p.y, s[i], s[i + 1], s[i + 2], s[i + 3]);
    if (d2 < best) { best = d2; bx = s[i] + (s[i + 2] - s[i]) * t; by = s[i + 1] + (s[i + 3] - s[i + 1]) * t; }
  }
  return { d: Math.sqrt(best), q: { x: bx, y: by } };
}

/** How far you can go from p along unit vector v before reaching the shore (Infinity if no shore near). */
export function shoreRay(sh: Shore, p: V2, v: V2): number {
  const s = sh.segs;
  let best = Infinity;
  for (let i = 0; i < s.length; i += 4) {
    const ax = s[i], ay = s[i + 1], ex = s[i + 2] - ax, ey = s[i + 3] - ay;
    const den = v.x * ey - v.y * ex;
    if (Math.abs(den) < 1e-12) continue;
    const t = ((ax - p.x) * ey - (ay - p.y) * ex) / den;
    const u = ((ax - p.x) * v.y - (ay - p.y) * v.x) / den;
    if (t > 0 && u >= 0 && u <= 1 && t < best) best = t;
  }
  return best;
}
