// Building a venue from the map. Give it what OpenStreetMap has around a club's saved location (an
// Overpass API answer: water, coastline, parks, woods, buildings, piers, roads and paths, with their
// geometry) and it makes the simulator's venue: the water's edge and islands, what's on the bank,
// the places you can see across the water, and a first guess at where the skippers stand.
//
// The water is worked out on a fine grid rather than by joining shapes: every mapped piece of water
// (a lake, a river and the bay it opens into, the sea inside a coastline) is painted onto the grid,
// the body of water at the club is picked out, and its edge is traced back off the grid. That copes
// with whatever way a place happens to be mapped, and cuts the water cleanly at the edge of the
// extract. Pure and deterministic: the same map gives the same venue on every device.
//
// Map data © OpenStreetMap contributors, Open Database Licence (ODbL).
import type { V2 } from './math';
import { controlNear, type Feature, type FeatureKind } from './venue';

export { controlNear };

export interface OsmPoint { lat: number; lon: number }
export interface OsmElement {
  type: 'node' | 'way' | 'relation';
  id: number;
  tags?: Record<string, string>;
  lat?: number; lon?: number;
  geometry?: (OsmPoint | null)[];
  members?: { type: string; role?: string; geometry?: (OsmPoint | null)[] }[];
}

export interface BuiltVenue {
  lat: number; lon: number;
  /** Outer shore (anticlockwise, water on its left) and islands (clockwise), as x0, y0, x1, y1, … metres. */
  water: number[];
  islands: number[][];
  features: [FeatureKind, string, number[]][];
  landmarks: { name: string; at: V2 }[];
  control: [V2, V2];
  /** The name of the water, if the map gives one. */
  waterName: string;
  /** Half the side of the square the water was cut to, metres: shore edges along it are open water. */
  cut: number;
}

export interface BuildOptions {
  /** Half the side of the square of water kept round the club, metres. */
  half?: number;
  /** Grid cell, metres. */
  cell?: number;
  /** How far from the club the bank's features are kept, metres. */
  near?: number;
  /** A point on the club's water (metres from its saved location), when the nearest water isn't it. */
  pick?: V2;
}

/** The Overpass query for a venue: everything buildVenue uses, within `half` (water) and `near` (the bank) metres. */
export function venueQuery(lat: number, lon: number, half = 1200, near = 600): string {
  const a = `(around:${half},${lat},${lon})`, b = `(around:${near},${lat},${lon})`;
  return `[out:json][timeout:90];(
way["natural"="coastline"]${a};way["natural"="water"]${a};relation["natural"="water"]${a};way["natural"="bay"]${a};relation["natural"="bay"]${a};
way["waterway"~"riverbank|dock|canal"]${a};way["waterway"~"^(river|stream)$"]["name"]${b};relation["waterway"="riverbank"]${a};way["landuse"~"reservoir|basin"]${a};
way["leisure"~"park|pitch|playground|garden|golf_course|nature_reserve"]${b};relation["leisure"~"park|nature_reserve"]${b};
way["landuse"~"forest|grass|recreation_ground|meadow"]${b};way["natural"~"wood|scrub|beach|wetland|sand"]${b};relation["natural"~"wood|wetland"]${b};
way["building"]${b};way["man_made"~"pier|breakwater|groyne"]${a};way["amenity"="parking"]${b};
way["highway"~"residential|tertiary|secondary|primary|trunk|motorway|unclassified|service|footway|path|cycleway|pedestrian|track"]${b};
way["bridge"]["highway"](around:${Math.round(half * 1.1)},${lat},${lon});way["bridge"]["railway"](around:${Math.round(half * 1.1)},${lat},${lon});
node["place"~"suburb|locality|island|village|town"](around:${half * 2},${lat},${lon});node["natural"~"cape|bay|peak"](around:${half * 2},${lat},${lon});
);out geom;`;
}

const R1 = (v: number) => Math.round(v * 10) / 10;

/** Douglas–Peucker: drop points that are within `tol` of the line between their neighbours. */
function simplify(p: V2[], tol: number): V2[] {
  if (p.length < 3) return p;
  const keep = new Uint8Array(p.length);
  keep[0] = keep[p.length - 1] = 1;
  const stack: [number, number][] = [[0, p.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    const ax = p[a].x, ay = p[a].y, ex = p[b].x - ax, ey = p[b].y - ay, L2 = ex * ex + ey * ey;
    let far = -1, fd = tol * tol;
    for (let i = a + 1; i < b; i++) {
      const t = L2 > 1e-9 ? Math.max(0, Math.min(1, ((p[i].x - ax) * ex + (p[i].y - ay) * ey) / L2)) : 0;
      const dx = p[i].x - (ax + ex * t), dy = p[i].y - (ay + ey * t), d = dx * dx + dy * dy;
      if (d > fd) { fd = d; far = i; }
    }
    if (far >= 0) { keep[far] = 1; stack.push([a, far], [far, b]); }
  }
  return p.filter((_, i) => keep[i]);
}

/** A closed ring simplified: finer near the club than far from it. */
function simplifyRing(ring: V2[], nearTol: number, farTol: number, nearR: number): V2[] {
  if (ring.length < 8) return ring;
  // Start at the point furthest from the club, so the join isn't where it matters.
  let s = 0, sd = -1;
  ring.forEach((q, i) => { const d = q.x * q.x + q.y * q.y; if (d > sd) { sd = d; s = i; } });
  const open = [...ring.slice(s), ...ring.slice(0, s), ring[s]];
  // Split into runs near and far from the club, simplify each with its own tolerance.
  const out: V2[] = [];
  let i = 0;
  while (i < open.length - 1) {
    const near = Math.hypot(open[i].x, open[i].y) < nearR;
    let j = i + 1;
    while (j < open.length - 1 && (Math.hypot(open[j].x, open[j].y) < nearR) === near) j++;
    const run = simplify(open.slice(i, j + 1), near ? nearTol : farTol);
    out.push(...run.slice(0, -1));
    i = j;
  }
  return out.length >= 3 ? out : ring;
}

const area = (r: V2[]) => { let a = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += r[j].x * r[i].y - r[i].x * r[j].y; return a / 2; };
const flat = (r: V2[]) => r.flatMap(q => [R1(q.x), R1(q.y)]);

const WATER = (t: Record<string, string>) => t.natural === 'water' || t.natural === 'bay' || t.waterway === 'riverbank' || t.waterway === 'dock' || (t.waterway === 'canal' && t.area === 'yes') || t.landuse === 'reservoir' || t.landuse === 'basin';

function kindOf(t: Record<string, string>): FeatureKind | null {
  if (t.building) return 'bld';
  if (t.man_made === 'pier' || t.man_made === 'breakwater' || t.man_made === 'groyne') return 'pier';
  if (t.leisure === 'pitch') return 'pitch';
  if (t.leisure === 'playground') return 'playground';
  if (t.amenity === 'parking') return 'parking';
  if (t.natural === 'wood' || t.natural === 'scrub' || t.landuse === 'forest') return 'wood';
  if (t.natural === 'beach' || t.natural === 'sand') return 'sand';
  if (t.natural === 'wetland' || t.leisure === 'park' || t.leisure === 'garden' || t.leisure === 'golf_course' || t.leisure === 'nature_reserve' || t.landuse === 'grass' || t.landuse === 'recreation_ground' || t.landuse === 'meadow') return 'park';
  // A bridge is kept as itself, whatever it carries: it's what you see across the water.
  if ((t.highway || t.railway) && t.bridge && t.bridge !== 'no') return 'bridge';
  if (t.highway) return /^(footway|path|cycleway|pedestrian|track)$/.test(t.highway) ? 'path' : 'road';
  return null;
}

export function buildVenue(elements: OsmElement[], lat: number, lon: number, opts: BuildOptions = {}): BuiltVenue | null {
  const half = opts.half ?? 900, cell = opts.cell ?? 1.5, nearR = opts.near ?? 600;
  const kx = 111320 * Math.cos((lat * Math.PI) / 180), ky = 110574;
  const P = (q: OsmPoint): V2 => ({ x: (q.lon - lon) * kx, y: (q.lat - lat) * ky });
  const line = (g: (OsmPoint | null)[] | undefined): V2[] => (g ?? []).filter((q): q is OsmPoint => !!q).map(P);

  // ── The water, painted onto a grid ──
  const n = Math.ceil((2 * half) / cell);
  const grid = new Uint8Array(n * n);
  const X0 = -half, Y0 = -half;
  /** Even-odd fill of a set of closed loops (in any order, as a bag of edges). */
  const fill = (loops: V2[][], value: 0 | 1) => {
    const edges: [number, number, number, number][] = [];
    let y0 = Infinity, y1 = -Infinity;
    for (const l of loops) for (let i = 0; i + 1 < l.length; i++) {
      const a = l[i], b = l[i + 1];
      if (a.y === b.y) continue;
      edges.push([a.x, a.y, b.x, b.y]);
      y0 = Math.min(y0, a.y, b.y); y1 = Math.max(y1, a.y, b.y);
    }
    if (!edges.length) return;
    const j0 = Math.max(0, Math.floor((y0 - Y0) / cell)), j1 = Math.min(n - 1, Math.ceil((y1 - Y0) / cell));
    const xs: number[] = [];
    for (let j = j0; j <= j1; j++) {
      const y = Y0 + (j + 0.5) * cell;
      xs.length = 0;
      for (const e of edges) if ((e[1] > y) !== (e[3] > y)) xs.push(e[0] + ((y - e[1]) * (e[2] - e[0])) / (e[3] - e[1]));
      xs.sort((p, q) => p - q);
      for (let m = 0; m + 1 < xs.length; m += 2) {
        const i0 = Math.max(0, Math.ceil((xs[m] - X0) / cell - 0.5)), i1 = Math.min(n - 1, Math.floor((xs[m + 1] - X0) / cell - 0.5));
        for (let i = i0; i <= i1; i++) grid[j * n + i] = value;
      }
    }
  };
  const closed = (l: V2[]) => l.length > 3 && Math.hypot(l[0].x - l[l.length - 1].x, l[0].y - l[l.length - 1].y) < 0.5;
  const names: { name: string; pts: V2[] }[] = [];
  const inners: V2[][] = [];
  for (const e of elements) {
    const t = e.tags ?? {};
    if (!WATER(t)) continue;
    if (e.type === 'way') {
      const l = line(e.geometry);
      if (closed(l)) { fill([l], 1); if (t.name) names.push({ name: t.name, pts: l }); }
    } else if (e.type === 'relation') {
      const outer = (e.members ?? []).filter(m => m.type === 'way' && m.role !== 'inner').map(m => line(m.geometry));
      fill(outer, 1);
      for (const m of e.members ?? []) if (m.type === 'way' && m.role === 'inner') inners.push(line(m.geometry));
      if (t.name) names.push({ name: t.name, pts: outer.flat() });
    }
  }
  // Islands (the holes in the water shapes) are land.
  if (inners.length) fill(inners, 0);
  // Rivers and creeks drawn as a line give the water its name where the shape itself has none.
  for (const e of elements) if (e.type === 'way' && e.tags?.name && e.tags.waterway && !WATER(e.tags)) names.push({ name: e.tags.name, pts: line(e.geometry) });

  // ── The sea inside a coastline: the coast is a wall, and the water is to the right of the way it's drawn ──
  const coast = elements.filter(e => e.type === 'way' && e.tags?.natural === 'coastline').map(e => line(e.geometry)).filter(l => l.length > 1);
  if (coast.length) {
    const wall = new Uint8Array(n * n);
    const idx = (x: number, y: number) => { const i = Math.floor((x - X0) / cell), j = Math.floor((y - Y0) / cell); return i < 0 || j < 0 || i >= n || j >= n ? -1 : j * n + i; };
    const seeds: number[] = [], lands: number[] = [];
    for (const l of coast) for (let i = 0; i + 1 < l.length; i++) {
      const a = l[i], b = l[i + 1], L = Math.hypot(b.x - a.x, b.y - a.y), steps = Math.max(1, Math.ceil(L / (cell * 0.5)));
      for (let s = 0; s <= steps; s++) { const k = idx(a.x + ((b.x - a.x) * s) / steps, a.y + ((b.y - a.y) * s) / steps); if (k >= 0) wall[k] = 1; }
      if (L > 2 * cell) {
        const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2, rx = (b.y - a.y) / L, ry = -(b.x - a.x) / L;
        const sea = idx(mx + rx * 2.5 * cell, my + ry * 2.5 * cell), land = idx(mx - rx * 2.5 * cell, my - ry * 2.5 * cell);
        if (sea >= 0) seeds.push(sea);
        if (land >= 0) lands.push(land);
      }
    }
    const mark = new Uint8Array(n * n); // 1 sea, 2 land
    const flood = (from: number, v: 1 | 2) => {
      if (wall[from] || mark[from]) return;
      const q = [from]; mark[from] = v;
      while (q.length) {
        const c = q.pop()!, i = c % n, j = (c - i) / n;
        for (const d of [i > 0 ? c - 1 : -1, i < n - 1 ? c + 1 : -1, j > 0 ? c - n : -1, j < n - 1 ? c + n : -1]) if (d >= 0 && !wall[d] && !mark[d]) { mark[d] = v; q.push(d); }
      }
    };
    // Land first: where the coast has a gap in the extract, land and sea would run together, and
    // calling that water would flood the bank.
    for (const s of lands) flood(s, 2);
    for (const s of seeds) flood(s, 1);
    for (let k = 0; k < grid.length; k++) if (mark[k] === 1) grid[k] = 1;
  }

  // ── The body of water at the club ──
  // Every separate piece of water within 300 m of the saved location is a candidate. The club's is
  // the biggest of those about as close as the closest (a river beats the ornamental pond beside
  // it), or the one under `pick` when the club has pointed at its water.
  const label = new Int32Array(n * n);
  const bodies: { d: number; cells: number }[] = [];
  const floodBody = (from: number, id: number): number => {
    const q = [from]; label[from] = id;
    let cells = 0;
    while (q.length) {
      const c = q.pop()!, i = c % n, j = (c - i) / n;
      cells++;
      for (const d of [i > 0 ? c - 1 : -1, i < n - 1 ? c + 1 : -1, j > 0 ? c - n : -1, j < n - 1 ? c + n : -1]) if (d >= 0 && grid[d] && !label[d]) { label[d] = id; q.push(d); }
    }
    return cells;
  };
  const px = opts.pick ? Math.floor((opts.pick.x - X0) / cell) : Math.floor(n / 2), py = opts.pick ? Math.floor((opts.pick.y - Y0) / cell) : Math.floor(n / 2);
  const reach = Math.ceil((opts.pick ? 60 : 300) / cell);
  for (let j = Math.max(0, py - reach); j <= Math.min(n - 1, py + reach); j++) for (let i = Math.max(0, px - reach); i <= Math.min(n - 1, px + reach); i++) {
    const k = j * n + i;
    if (!grid[k]) continue;
    const d = Math.hypot(i - px, j - py) * cell;
    if (d > reach * cell) continue;
    if (!label[k]) { bodies.push({ d, cells: floodBody(k, bodies.length + 1) }); }
    const b = bodies[label[k] - 1];
    if (d < b.d) b.d = d;
  }
  if (!bodies.length) return null;
  const nearest = Math.min(...bodies.map(b => b.d));
  let chosen = 0;
  bodies.forEach((b, k) => {
    const c = bodies[chosen];
    if (opts.pick ? b.d < c.d : b.d <= nearest + 120 && (c.d > nearest + 120 || b.cells > c.cells)) chosen = k;
  });
  const body = new Uint8Array(n * n);
  for (let k = 0; k < body.length; k++) if (label[k] === chosen + 1) body[k] = 1;

  // ── Its edge, traced off the grid: the water on the left of every step ──
  const W = n + 1;
  const next = new Map<number, number[]>();
  const add = (ax: number, ay: number, bx: number, by: number) => { const k = ay * W + ax; const v = next.get(k); if (v) v.push(by * W + bx); else next.set(k, [by * W + bx]); };
  const wet = (i: number, j: number) => i >= 0 && j >= 0 && i < n && j < n && body[j * n + i] === 1;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    if (!body[j * n + i]) continue;
    if (!wet(i, j - 1)) add(i, j, i + 1, j);
    if (!wet(i + 1, j)) add(i + 1, j, i + 1, j + 1);
    if (!wet(i, j + 1)) add(i + 1, j + 1, i, j + 1);
    if (!wet(i - 1, j)) add(i, j + 1, i, j);
  }
  const rings: V2[][] = [];
  for (const [k0, outs0] of next) {
    while (outs0.length) {
      const loop: number[] = [k0];
      let prev = k0, cur = outs0.pop()!;
      for (let guard = 0; guard < 8 * n * n && cur !== k0; guard++) {
        loop.push(cur);
        const outs = next.get(cur);
        if (!outs || !outs.length) break;
        let pick = 0;
        if (outs.length > 1) {
          // Two ways on (the water touches itself corner to corner here): turn left, which keeps
          // each piece of water's edge to itself.
          const dx = (cur % W) - (prev % W), dy = Math.floor(cur / W) - Math.floor(prev / W);
          pick = outs.findIndex(o => { const ex = (o % W) - (cur % W), ey = Math.floor(o / W) - Math.floor(cur / W); return dx * ey - dy * ex > 0; });
          if (pick < 0) pick = 0;
        }
        prev = cur;
        cur = outs.splice(pick, 1)[0];
      }
      if (loop.length < 4) continue;
      // The middle of each step, which turns staircases into slopes; steps along the edge of the
      // extract stay on it.
      const v = loop.map(k => ({ x: X0 + (k % W) * cell, y: Y0 + Math.floor(k / W) * cell }));
      const onEdge = (q: V2) => Math.abs(Math.abs(q.x) - half) < 1e-6 || Math.abs(Math.abs(q.y) - half) < 1e-6;
      const mids: V2[] = [];
      for (let i = 0; i < v.length; i++) {
        const a = v[i], b = v[(i + 1) % v.length];
        if (onEdge(a) && onEdge(b)) { if (!mids.length || mids[mids.length - 1] !== a) mids.push(a); mids.push(b); } else mids.push({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
      }
      const ring = simplifyRing(mids, 0.8 * cell, 3 * cell, 320);
      if (Math.abs(area(ring)) >= 14) rings.push(ring);
    }
  }
  if (!rings.length) return null;
  rings.sort((p, q) => area(q) - area(p));
  const outer = rings[0];
  if (area(outer) <= 0) return null;
  const islands = rings.slice(1).filter(r => area(r) < 0);

  // ── What's on the bank ──
  /** How much of a shape is water (parks and reserves are often drawn right across the water they sit beside). */
  const wetShare = (l: V2[]): number => {
    let y0 = Infinity, y1 = -Infinity;
    for (const q of l) { y0 = Math.min(y0, q.y); y1 = Math.max(y1, q.y); }
    const j0 = Math.max(0, Math.floor((y0 - Y0) / cell)), j1 = Math.min(n - 1, Math.ceil((y1 - Y0) / cell));
    const stride = Math.max(1, Math.floor((j1 - j0) / 60));
    let all = 0, wetCells = 0;
    const xs: number[] = [];
    for (let j = j0; j <= j1; j += stride) {
      const y = Y0 + (j + 0.5) * cell;
      xs.length = 0;
      for (let i = 0, k = l.length - 1; i < l.length; k = i++) if ((l[i].y > y) !== (l[k].y > y)) xs.push(l[i].x + ((y - l[i].y) * (l[k].x - l[i].x)) / (l[k].y - l[i].y));
      xs.sort((p, q) => p - q);
      for (let m = 0; m + 1 < xs.length; m += 2) {
        const i0 = Math.max(0, Math.ceil((xs[m] - X0) / cell - 0.5)), i1 = Math.min(n - 1, Math.floor((xs[m + 1] - X0) / cell - 0.5));
        for (let i = i0; i <= i1; i += stride) { all++; if (grid[j * n + i]) wetCells++; }
      }
    }
    return all ? wetCells / all : 0;
  };
  const feats: { kind: FeatureKind; name: string; pts: V2[]; d: number }[] = [];
  for (const e of elements) {
    const t = e.tags ?? {};
    if (WATER(t) || t.natural === 'coastline') continue;
    const kind = kindOf(t);
    if (!kind) continue;
    const loops = e.type === 'way' ? [line(e.geometry)] : e.type === 'relation' ? (e.members ?? []).filter(m => m.type === 'way' && m.role !== 'inner').map(m => line(m.geometry)).filter(closed) : [];
    for (const l0 of loops) {
      if (l0.length < 2) continue;
      const d = Math.min(...l0.map(q => Math.hypot(q.x, q.y)));
      if (d > (kind === 'bridge' ? half * 1.5 : nearR)) continue;
      let l = simplify(l0, kind === 'bld' ? 0.4 : kind === 'road' || kind === 'path' ? 1.2 : 1);
      const isLine = kind === 'road' || kind === 'path' || kind === 'pier' || kind === 'bridge';
      // A shape's last point repeats its first; a line that comes back to its start (a pontoon drawn
      // as its outline) keeps it, so it's known to be closed.
      if (closed(l) && !isLine) l = l.slice(0, -1);
      if (l.length < 2 || (!isLine && l.length < 3)) continue;
      if (!isLine && kind !== 'bld' && wetShare(l) > 0.3) continue;
      feats.push({ kind, name: kind === 'road' || kind === 'park' || kind === 'bld' || kind === 'bridge' ? t.name ?? '' : '', pts: l, d });
    }
  }
  // Nearest first, and not more of any kind than the bank view can use.
  const CAP: Partial<Record<FeatureKind, number>> = { bld: 220, road: 70, path: 60, pier: 60, park: 30, wood: 30, bridge: 30 };
  feats.sort((p, q) => p.d - q.d);
  const count: Partial<Record<FeatureKind, number>> = {};
  const features: [FeatureKind, string, number[]][] = [];
  for (const f of feats) {
    const c = (count[f.kind] = (count[f.kind] ?? 0) + 1);
    if (c > (CAP[f.kind] ?? 20)) continue;
    features.push([f.kind, f.name, flat(f.pts)]);
  }

  // ── Places you can see across the water ──
  const landmarks: { name: string; at: V2; d: number }[] = [];
  for (const e of elements) {
    if (e.type !== 'node' || !e.tags?.name || e.lat == null || e.lon == null) continue;
    if (!e.tags.place && !e.tags.natural) continue;
    const at = P({ lat: e.lat, lon: e.lon }), d = Math.hypot(at.x, at.y);
    if (d < 250 || d > 2600) continue;
    landmarks.push({ name: e.tags.name, at: { x: Math.round(at.x), y: Math.round(at.y) }, d });
  }
  landmarks.sort((p, q) => p.d - q.d);

  // An edge along the side of the square the water was cut to is open water, not a bank.
  const side = (q: V2) => (Math.abs(q.x - half) < 2 ? 1 : 0) | (Math.abs(q.x + half) < 2 ? 2 : 0) | (Math.abs(q.y - half) < 2 ? 4 : 0) | (Math.abs(q.y + half) < 2 ? 8 : 0);
  const isOpen = (a: V2, b: V2) => (side(a) & side(b)) !== 0;
  const control = controlNear([outer, ...islands], { x: 0, y: 0 }, isOpen);
  if (!control) return null;
  // The water's name: the named water with a point on (or right beside) this body nearest the club.
  const onBody = (q: V2) => {
    const i = Math.floor((q.x - X0) / cell), j = Math.floor((q.y - Y0) / cell);
    for (let dj = -2; dj <= 2; dj++) for (let di = -2; di <= 2; di++) if (i + di >= 0 && j + dj >= 0 && i + di < n && j + dj < n && body[(j + dj) * n + i + di]) return true;
    return false;
  };
  let waterName = '', nameD = Infinity;
  for (const nm of names) for (let i = 0; i < nm.pts.length; i++) {
    // Along each stretch, not only at its ends: a river's line can have its points far apart.
    const a = nm.pts[i], b = nm.pts[Math.min(i + 1, nm.pts.length - 1)];
    const steps = Math.max(1, Math.min(200, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 15)));
    for (let k = 0; k < steps; k++) {
      const q = { x: a.x + ((b.x - a.x) * k) / steps, y: a.y + ((b.y - a.y) * k) / steps };
      const d = Math.hypot(q.x, q.y);
      if (d < nameD && onBody(q)) { nameD = d; waterName = nm.name; }
    }
  }
  return {
    lat, lon, water: flat(outer), islands: islands.map(flat), features,
    landmarks: landmarks.slice(0, 6).map(({ name, at }) => ({ name, at })), control, waterName, cut: half,
  };
}

/** What a venue built from the map adds to a Feature list. */
export function featuresOf(b: BuiltVenue): Feature[] {
  return b.features.map(([kind, name, a]) => {
    const pts: V2[] = [];
    for (let i = 0; i + 1 < a.length; i += 2) pts.push({ x: a[i], y: a[i + 1] });
    return { kind, name: name || undefined, pts };
  });
}
