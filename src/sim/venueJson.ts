// A club's own water as it's kept in the database (sim_venues): the venue's shape as plain JSON, the
// club's local knowledge, and the look of the country round it. Rows are written by club admins, so
// everything read back is checked before the engine sails on it: a row that isn't a sound venue
// gives null, never a broken race. Pure: no database or network here.
import type { V2 } from './math';
import type { WindCharacter } from './wind';
import { pts, type Feature, type FeatureKind, type VenueDef, type VenueLook, type VenueTraits, type VenueWind } from './venue';

/** The shape column: a venue's geometry, metres from its saved location (x east, y north). */
export interface VenueShape {
  v: 1;
  /** x0, y0, x1, y1, … */
  water: number[];
  islands: number[][];
  features: [FeatureKind, string, number[]][];
  landmarks: [string, number, number][];
  /** Where the skippers stand: x0, y0, x1, y1. */
  control: [number, number, number, number];
  cut?: number;
  credit: string;
}

/** A sim_venues row, as selected. */
export interface VenueRow {
  id: string; club_id: string; venue_id: string | null;
  name: string; short_name: string; place: string;
  latitude: number; longitude: number;
  shape: unknown; version: number; traits: unknown; look: unknown;
  is_published: boolean;
}

const KINDS: FeatureKind[] = ['park', 'wood', 'sand', 'pier', 'road', 'bridge', 'path', 'bld', 'pitch', 'playground', 'parking', 'pond'];
const CHARACTERS: WindCharacter[] = ['steady', 'oscillating', 'puffy', 'persistent'];
const LIMIT = 6000; // metres: nothing in a venue is further than this from the club

/** The id the engine knows a database venue by: its row and the version of its shape. */
export const waterId = (rowId: string, version: number) => `db-${rowId}-v${version}`;
export function parseWaterId(id: string | undefined | null): { rowId: string; version: number } | null {
  const m = /^db-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})-v(\d{1,6})$/.exec(id ?? '');
  return m ? { rowId: m[1], version: Number(m[2]) } : null;
}

const flat = (r: V2[]) => r.flatMap(p => [Math.round(p.x * 10) / 10, Math.round(p.y * 10) / 10]);

/** A venue's geometry as the shape column. */
export function shapeOf(def: Pick<VenueDef, 'water' | 'islands' | 'features' | 'landmarks' | 'control' | 'cut' | 'credit'>): VenueShape {
  return {
    v: 1,
    water: flat(def.water),
    islands: def.islands.map(flat),
    features: def.features.map(f => [f.kind, f.name ?? '', flat(f.pts)]),
    landmarks: def.landmarks.map(l => [l.name, Math.round(l.at.x), Math.round(l.at.y)]),
    control: [def.control[0].x, def.control[0].y, def.control[1].x, def.control[1].y],
    cut: def.cut,
    credit: def.credit,
  };
}

const str = (v: unknown, max: number): string => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
function coords(v: unknown, min: number, max: number): number[] | null {
  if (!Array.isArray(v) || v.length < 2 * min || v.length > 2 * max || v.length % 2) return null;
  for (const n of v) if (typeof n !== 'number' || !Number.isFinite(n) || Math.abs(n) > LIMIT) return null;
  return v as number[];
}
const area = (r: V2[]) => { let a = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += r[j].x * r[i].y - r[i].x * r[j].y; return a / 2; };

/** The club's local knowledge, tidied: only what the simulator understands, within sensible lengths. */
export function traitsFrom(v: unknown): VenueTraits {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  const winds: VenueWind[] = [];
  for (const w of Array.isArray(o.winds) ? o.winds.slice(0, 8) : []) {
    const r = (w && typeof w === 'object' ? w : {}) as Record<string, unknown>;
    const from = num(r.from), name = str(r.name, 40);
    if (from === null || !name) continue;
    const character = CHARACTERS.includes(r.character as WindCharacter) ? (r.character as WindCharacter) : 'oscillating';
    const wind: VenueWind = { from: ((Math.round(from) % 360) + 360) % 360, name, character };
    const when = str(r.when, 60), note = str(r.note, 240);
    if (when) wind.when = when;
    if (note) wind.note = note;
    if (r.pays === 'bank' || r.pays === 'out') wind.pays = r.pays;
    winds.push(wind);
  }
  const notes = (Array.isArray(o.notes) ? o.notes : []).map(n => str(n, 200)).filter(Boolean).slice(0, 8);
  return { about: str(o.about, 400), winds, notes };
}

export function lookFrom(v: unknown): VenueLook | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const o = v as Record<string, unknown>;
  const c = (x: unknown) => Math.max(0, Math.min(1, num(x) ?? 1));
  return { hills: c(o.hills), trees: c(o.trees), houses: c(o.houses) };
}

/** A row as the venue the engine sails on, or null if it isn't a sound one. */
export function venueFromRow(row: VenueRow): VenueDef | null {
  const s = (row.shape && typeof row.shape === 'object' ? row.shape : null) as Partial<VenueShape> | null;
  if (!s || s.v !== 1) return null;
  const lat = num(row.latitude), lon = num(row.longitude), version = num(row.version);
  if (lat === null || lon === null || version === null || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  const w = coords(s.water, 3, 6000);
  const ctl = coords(s.control, 2, 2);
  if (!w || !ctl) return null;
  // The water side of every shore edge is to its left: the outer shore anticlockwise, islands clockwise.
  let water = pts(w);
  if (area(water) < 0) water = water.reverse();
  if (area(water) < 400) return null;
  const islands: V2[][] = [];
  for (const i of Array.isArray(s.islands) ? s.islands.slice(0, 200) : []) {
    const c = coords(i, 3, 2000);
    if (!c) continue;
    const r = pts(c);
    islands.push(area(r) > 0 ? r.reverse() : r);
  }
  const features: Feature[] = [];
  for (const f of Array.isArray(s.features) ? s.features.slice(0, 900) : []) {
    if (!Array.isArray(f) || !KINDS.includes(f[0] as FeatureKind)) continue;
    const c = coords(f[2], 2, 800);
    if (!c) continue;
    features.push({ kind: f[0] as FeatureKind, name: str(f[1], 80) || undefined, pts: pts(c) });
  }
  const landmarks: VenueDef['landmarks'] = [];
  for (const l of Array.isArray(s.landmarks) ? s.landmarks.slice(0, 8) : []) {
    if (!Array.isArray(l)) continue;
    const name = str(l[0], 60), x = num(l[1]), y = num(l[2]);
    if (name && x !== null && y !== null && Math.abs(x) <= LIMIT && Math.abs(y) <= LIMIT) landmarks.push({ name, at: { x, y } });
  }
  const name = str(row.name, 80), short = str(row.short_name, 60);
  if (name.length < 2 || short.length < 2) return null;
  const traits = traitsFrom(row.traits);
  const cut = num(s.cut);
  return {
    id: waterId(row.id, version),
    name, short, place: str(row.place, 160),
    lat, lon,
    usualWind: traits.winds[0]?.from ?? 0, usualWindName: traits.winds[0]?.name ?? 'usual breeze',
    control: [{ x: ctl[0], y: ctl[1] }, { x: ctl[2], y: ctl[3] }],
    water, islands, features, landmarks,
    credit: str(s.credit, 80) || '© OpenStreetMap contributors',
    cut: cut !== null && cut >= 100 && cut <= LIMIT ? cut : undefined,
    clubs: [row.club_id], venueId: row.venue_id ?? undefined,
    traits, look: lookFrom(row.look),
  };
}
