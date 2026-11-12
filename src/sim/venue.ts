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
import type { WindCharacter } from './wind';
import { dcos, dhypot, dsin } from './dmath';

export type FeatureKind = 'park' | 'wood' | 'sand' | 'pier' | 'road' | 'bridge' | 'path' | 'bld' | 'pitch' | 'playground' | 'parking' | 'pond';
export interface Feature { kind: FeatureKind; name?: string; pts: V2[] }

/** One of the winds a club gets, and what it does on their water. */
export interface VenueWind {
  /** Compass degrees it blows from. */
  from: number;
  /** "NE sea breeze" */
  name: string;
  /** "Summer afternoons" */
  when?: string;
  /** How it behaves here: steady, shifty (oscillating), gusty (puffy) or swinging one way (persistent). */
  character: WindCharacter;
  /** What it does here, in the club's words. */
  note?: string;
  /** Where the better breeze is in this wind: along the bank the skippers stand on, or out away from it. */
  pays?: 'bank' | 'out';
}

/** What a club knows about its own water: shown before you race there, and sailed by the wind and by Alfie. */
export interface VenueTraits {
  /** A line on the place. */
  about: string;
  /** The winds it gets, the usual one first. */
  winds: VenueWind[];
  /** Local knowledge: short tips in the club's words. */
  notes: string[];
}

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
  /** An invented water of the AlfiePRO Circuit: not a real place, and not from a map. */
  invented?: boolean;
  /** Half the side of the square the water was cut to (venues built from the map): shore edges along it are open water. */
  cut?: number;
  /** The clubs whose home water this is, and the venue it was built from (ids in the app's database). */
  clubs?: string[];
  venueId?: string;
  /** What the club knows about its water. */
  traits?: VenueTraits;
  /** How the country round the water looks from the bank (all 1 when not given). */
  look?: VenueLook;
}

/** The lie of the land round a venue, for the bank view: 0 is none, 1 is the full amount. */
export interface VenueLook {
  /** Hills behind the far shores (0 for flat country). */
  hills: number;
  /** Trees along the banks. */
  trees: number;
  /** Houses on the far shores. */
  houses: number;
}

/** The line shown wherever a venue is drawn: its map credit, or that it's invented. */
export const creditLine = (def: VenueDef): string => (def.invented ? 'An invented water of the AlfiePRO Circuit' : `Map data ${def.credit}`);

/** The winds a venue gets, the usual one first (just its usual breeze when the club hasn't said more). */
export function windsOf(def: VenueDef): VenueWind[] {
  return def.traits?.winds.length ? def.traits.winds : [{ from: def.usualWind, name: def.usualWindName, character: 'oscillating' }];
}

/** One of a venue's winds by its place in the list (the usual breeze when there's no such place). */
export function windAt(def: VenueDef, i?: number | null): VenueWind {
  const all = windsOf(def);
  return all[i ?? 0] ?? all[0];
}

/** The venue wind a direction belongs to: the nearest within 30°, or none. */
export function venueWindFor(def: VenueDef, from: number): VenueWind | null {
  let best: VenueWind | null = null, bd = 30.0001;
  for (const w of def.traits?.winds ?? []) {
    const d = Math.abs(((from - w.from + 540) % 360) - 180);
    if (d < bd) { bd = d; best = w; }
  }
  return best;
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
  return { rot, S, u: { x: dsin(a), y: dcos(a) }, r: { x: dcos(a), y: -dsin(a) } };
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
/** The venue's water within half a kilometre of the control area, on a 2 m grid (built once for each). */
function venueGrid(def: VenueDef, control: [V2, V2]): WaterGrid {
  const c = mid(control);
  const key = `${def.id}:${c.x.toFixed(1)}:${c.y.toFixed(1)}`;
  let g = grids.get(key);
  if (!g) {
    if (grids.size > 8) grids.clear();
    g = new WaterGrid([def.water, ...def.islands], c.x - 500, c.y - 500, c.x + 500, c.y + 500, 2);
    grids.set(key, g);
  }
  return g;
}

/** Is this shore edge where the map was cut, with open water beyond, and not a bank? */
export function cutEdge(def: VenueDef): (a: V2, b: V2) => boolean {
  if (def.cut != null) {
    const h = def.cut;
    const side = (q: V2) => (Math.abs(q.x - h) < 2 ? 1 : 0) | (Math.abs(q.x + h) < 2 ? 2 : 0) | (Math.abs(q.y - h) < 2 ? 4 : 0) | (Math.abs(q.y + h) < 2 ? 8 : 0);
    return (a, b) => (side(a) & side(b)) !== 0;
  }
  // An older extract: edges along the water's bounding box.
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of def.water) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
  const onBox = (g: V2) => Math.abs(g.x - x0) < 2 || Math.abs(g.x - x1) < 2 || Math.abs(g.y - y0) < 2 || Math.abs(g.y - y1) < 2;
  return (a, b) => onBox(a) && onBox(b);
}

const R1 = (v: number) => Math.round(v * 10) / 10;

/**
 * Where the skippers would stand to sail near `p`: a 38 m stretch of the nearest bank, a step back
 * from the water. `rings` have the water on the left of every edge; `isOpen` edges aren't banks.
 */
export function controlNear(rings: V2[][], p: V2, isOpen?: (a: V2, b: V2) => boolean): [V2, V2] | null {
  let best = Infinity, br = -1, bi = -1, bt = 0;
  rings.forEach((r, k) => {
    for (let i = 0; i < r.length; i++) {
      const a = r[i], b = r[(i + 1) % r.length];
      if (isOpen?.(a, b)) continue;
      const [d, t] = segD2(p.x, p.y, a.x, a.y, b.x, b.y);
      if (d < best) { best = d; br = k; bi = i; bt = t; }
    }
  });
  if (br < 0) return null;
  const r = rings[br], n = r.length;
  // Walk along the bank each way from the nearest point.
  const walk = (dirn: 1 | -1, dist: number): { q: V2; nx: number; ny: number } => {
    let i = bi, t = bt, left = dist;
    for (let guard = 0; guard < n + 2; guard++) {
      const a = r[i], b = r[(i + 1) % n];
      const ex = b.x - a.x, ey = b.y - a.y, L = Math.sqrt(ex * ex + ey * ey) || 1e-6;
      const room = dirn > 0 ? (1 - t) * L : t * L;
      // Land is to the right of a shore edge (the water is on its left).
      const nx = ey / L, ny = -ex / L;
      if (room >= left) { const tt = t + (dirn * left) / L; return { q: { x: a.x + ex * tt, y: a.y + ey * tt }, nx, ny }; }
      left -= room;
      if (dirn > 0) { i = (i + 1) % n; t = 0; } else { i = (i - 1 + n) % n; t = 1; }
    }
    const a = r[bi];
    return { q: { x: a.x, y: a.y }, nx: 0, ny: 0 };
  };
  const A = walk(-1, 19), B = walk(1, 19);
  // One step back from the water, square to the line between the two ends (so a wiggly bank doesn't twist it).
  const ex = B.q.x - A.q.x, ey = B.q.y - A.q.y, L = Math.sqrt(ex * ex + ey * ey) || 1;
  let nx = ey / L, ny = -ex / L;
  if (nx * (A.nx + B.nx) + ny * (A.ny + B.ny) < 0) { nx = -nx; ny = -ny; }
  return [{ x: R1(A.q.x + nx * 1.5), y: R1(A.q.y + ny * 1.5) }, { x: R1(B.q.x + nx * 1.5), y: R1(B.q.y + ny * 1.5) }];
}

/**
 * Where the skippers stand for a race: the club's own control area, or, when a spot has been picked
 * on the venue's map, the stretch of bank nearest it.
 */
export function controlAt(def: VenueDef, spot?: V2 | null): [V2, V2] {
  if (!spot) return def.control;
  return controlNear([def.water, ...def.islands], spot, cutEdge(def)) ?? def.control;
}

const mid = (s: [V2, V2]): V2 => ({ x: (s[0].x + s[1].x) / 2, y: (s[0].y + s[1].y) / 2 });

const pierCache = new WeakMap<VenueDef, V2[]>();
/** Points every couple of metres along the venue's piers. */
function pierPoints(def: VenueDef): V2[] {
  let out = pierCache.get(def);
  if (out) return out;
  out = [];
  for (const f of def.features) {
    if (f.kind !== 'pier') continue;
    for (let i = 0; i + 1 < f.pts.length; i++) {
      const a = f.pts[i], b = f.pts[i + 1];
      const n = Math.max(1, Math.ceil(dhypot(b.x - a.x, b.y - a.y) / 2.5));
      for (let k = 0; k <= n; k++) out.push({ x: a.x + ((b.x - a.x) * k) / n, y: a.y + ((b.y - a.y) * k) / n });
    }
  }
  pierCache.set(def, out);
  return out;
}

/** Distance from a point to a rectangle (0 inside). */
function rectDist(p: V2, x0: number, y0: number, x1: number, y1: number): number {
  const dx = Math.max(x0 - p.x, 0, p.x - x1), dy = Math.max(y0 - p.y, 0, p.y - y1);
  return dhypot(dx, dy);
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
export function layCourse(def: VenueDef, rot: number, c: Course, control: [V2, V2] = def.control): V2 | null {
  const grid = venueGrid(def, control);
  const L = c.L, B = c.bounds;
  const f0 = frameAt(rot, { x: 0, y: 0 });
  const ctrl = mid(control);
  const area = raceArea(c);

  // Race-frame points that must be on open water: each mark with a ring four lengths round it,
  // and a grid over the water the fleet races on.
  const must: V2[] = [];
  for (const m of c.marks) {
    must.push(m.p);
    for (let k = 0; k < 8; k++) must.push({ x: m.p.x + dcos((k * Math.PI) / 4) * 4 * L, y: m.p.y + dsin((k * Math.PI) / 4) * 4 * L });
  }
  for (let i = 0; i <= 6; i++) for (let j = 0; j <= 8; j++) must.push({ x: area.x0 + ((area.x1 - area.x0) * i) / 6, y: area.y0 + ((area.y1 - area.y0) * j) / 8 });
  // The rest of the pond: better mostly water, but the near bank can cut into it.
  const soft: V2[] = [];
  for (let i = 0; i <= 8; i++) for (let j = 0; j <= 8; j++) soft.push({ x: -B.across + (2 * B.across * i) / 8, y: B.alongMin + ((B.alongMax - B.alongMin) * j) / 8 });

  const geoOf = (S: V2, p: V2) => ({ x: S.x + p.x * f0.r.x + p.y * f0.u.x, y: S.y + p.x * f0.r.y + p.y * f0.u.y });
  // Piers and jetties near the skippers, as points along them: nothing is raced through those.
  const piers = pierPoints(def).filter(p => Math.abs(p.x - ctrl.x) < 420 && Math.abs(p.y - ctrl.y) < 420);
  const pm = 2 * L;
  const score = (S: V2): number => {
    for (const p of must) { const g = geoOf(S, p); if (!grid.wet(g.x, g.y)) return Infinity; }
    for (const p of piers) {
      const dx = p.x - S.x, dy = p.y - S.y;
      const x = dx * f0.r.x + dy * f0.r.y, y = dx * f0.u.x + dy * f0.u.y;
      if (x > area.x0 - pm && x < area.x1 + pm && y > area.y0 - pm && y < area.y1 + pm) return Infinity;
    }
    let wet = 0;
    for (const p of soft) { const g = geoOf(S, p); if (grid.wet(g.x, g.y)) wet++; }
    // Where the skippers stand, in the race frame: close beside the racing, not in it, and as far as
    // the water allows level with the start line, so they look straight down it from the bank (with
    // the wind along the bank, the course then runs along it in front of them, as clubs set it).
    const dx = ctrl.x - S.x, dy = ctrl.y - S.y;
    const q = { x: dx * f0.r.x + dy * f0.r.y, y: dx * f0.u.x + dy * f0.u.y };
    const dc = rectDist(q, area.x0, area.y0, area.x1, area.y1);
    return Math.abs(dc - 6 * L) + 0.35 * Math.abs(q.y) + 0.03 * Math.abs(q.x) + 25 * L * (1 - wet / soft.length);
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
        if (segD2(g.x, g.y, r[j].x, r[j].y, r[i].x, r[i].y)[0] < 3.6 * L * (3.6 * L)) return false;
      }
      return true;
    });
    if (ok) return best.S;
  }
  return null;
}

/** A race laid at a venue: where the skippers stand, the start line centre and the course that fits. */
export interface Site { control: [V2, V2]; S: V2; course: Course }

/**
 * Lay a race at a venue for a wind from `rot`. The skippers stand on the bank nearest `spot` (the
 * place picked on the venue's map) or, with no spot or when no course fits off it in this wind, at
 * the club's own control area. `courses` are the same course at the length asked for and then each
 * shorter one: on narrow water a long course across the wind won't fit in front of the skippers,
 * and like a race officer we set a shorter one there before setting it where they can't see it.
 */
export function siteFor(def: VenueDef, rot: number, spot: V2 | null, courses: Course[]): Site | null {
  const lay = (control: [V2, V2]): Site | null => {
    let got: Site | null = null;
    const m = mid(control);
    for (const c of courses) {
      const S = layCourse(def, rot, c, control);
      if (!S) continue;
      got = got ?? { control, S, course: c };
      // Near enough to see: every mark within 90 lengths of where they stand.
      const q = toRace(frameAt(rot, S), m);
      let far = 0;
      for (const k of c.marks) far = Math.max(far, dhypot(k.p.x - q.x, k.p.y - q.y));
      if (far <= 90 * c.L) return { control, S, course: c };
    }
    return got;
  };
  return (spot ? lay(controlAt(def, spot)) : null) ?? lay(def.control);
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

export function venueScene(def: VenueDef, f: Frame, control: [V2, V2] = def.control): VenueScene {
  const T = (p: V2) => toRace(f, p);
  // Edges where the map was cut aren't the shore.
  const cut = cutEdge(def);
  return {
    def, frame: f,
    water: def.water.map(T),
    islands: def.islands.map(r => r.map(T)),
    features: def.features.map(ft => ({ ...ft, pts: ft.pts.map(T) })),
    control: [T(control[0]), T(control[1])],
    landmarks: def.landmarks.map(l => ({ name: l.name, at: T(l.at) })),
    open: (a: V2, b: V2) => cut(toGeo(f, a), toGeo(f, b)),
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
