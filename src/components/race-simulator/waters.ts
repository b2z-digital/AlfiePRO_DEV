// Clubs' own water: the venues club admins have built from their saved venue location and the map
// (sim_venues), loaded for the simulator to race at, and saved from the set-up screen. Reading
// follows the table's rules: everyone sees published water, a club's admins see its drafts too.
import type { VenueDef, VenueLook, VenueTraits } from '@/sim/venue';
import { VENUES, registerVenue } from '@/sim/venues';
import { parseWaterId, venueFromRow, waterId, type VenueRow, type VenueShape } from '@/sim/venueJson';
import { venueQuery, type OsmElement } from '@/sim/venueBuild';

/** A club's water as loaded: the venue the engine sails, and the row it came from. */
export interface Water { def: VenueDef; rowId: string; clubId: string; venueId: string | null; published: boolean; version: number }

const COLS = 'id, club_id, venue_id, name, short_name, place, latitude, longitude, shape, version, traits, look, is_published';

async function db() {
  const { supabase } = await import('@/utils/supabase');
  return supabase;
}

function waterOf(row: VenueRow): Water | null {
  const def = venueFromRow(row);
  if (!def) return null;
  registerVenue(def);
  return { def, rowId: row.id, clubId: row.club_id, venueId: row.venue_id, published: !!row.is_published, version: row.version };
}

/** Every club's water you can see, registered with the engine. Null if it couldn't be read. */
export async function loadWaters(): Promise<Water[] | null> {
  try {
    const supabase = await db();
    const { data, error } = await supabase.from('sim_venues').select(COLS).order('name').limit(200);
    if (error || !Array.isArray(data)) return null;
    return (data as VenueRow[]).map(waterOf).filter((w): w is Water => !!w);
  } catch { return null; }
}

const asked = new Map<string, Promise<boolean>>();
/**
 * Make sure the engine has a venue before a race is laid on it: true for the practice pond, a
 * built-in venue or a club's water that's loaded or can be fetched now. A race set on an earlier
 * version of a water that has since changed is sailed on the water as it is today.
 */
export function ensureVenue(id: string | undefined | null): Promise<boolean> {
  if (!id || VENUES[id]) return Promise.resolve(true);
  const w = parseWaterId(id);
  if (!w) return Promise.resolve(false);
  let p = asked.get(id);
  if (!p) {
    p = (async () => {
      try {
        const supabase = await db();
        const { data, error } = await supabase.from('sim_venues').select(COLS).eq('id', w.rowId).maybeSingle();
        if (error || !data) return false;
        const got = waterOf(data as VenueRow);
        if (!got) return false;
        registerVenue(got.def, id);
        return true;
      } catch { return false; }
    })();
    asked.set(id, p);
    void p.then(ok => { if (!ok) asked.delete(id); });
  }
  return p;
}

/** A club's saved venues that have a location to build from. */
export interface SavedVenue { id: string; name: string; address: string; lat: number; lon: number; primary: boolean }
export async function clubVenues(clubId: string): Promise<SavedVenue[]> {
  try {
    const supabase = await db();
    const [own, linked] = await Promise.all([
      supabase.from('venues').select('id, name, address, latitude, longitude, is_default').eq('club_id', clubId).limit(50),
      supabase.from('club_venues').select('is_primary, venues(id, name, address, latitude, longitude)').eq('club_id', clubId).limit(50),
    ]);
    const out = new Map<string, SavedVenue>();
    const add = (v: Record<string, unknown> | null | undefined, primary: boolean) => {
      if (!v || typeof v.id !== 'string') return;
      const lat = Number(v.latitude), lon = Number(v.longitude);
      if (v.latitude == null || v.longitude == null || !Number.isFinite(lat) || !Number.isFinite(lon) || (lat === 0 && lon === 0)) return;
      const had = out.get(v.id);
      out.set(v.id, { id: v.id, name: String(v.name ?? 'Venue'), address: String(v.address ?? ''), lat, lon, primary: primary || !!had?.primary });
    };
    for (const r of (linked.data ?? []) as unknown as { is_primary: boolean | null; venues: Record<string, unknown> | Record<string, unknown>[] | null }[]) {
      for (const v of Array.isArray(r.venues) ? r.venues : [r.venues]) add(v, !!r.is_primary);
    }
    for (const v of (own.data ?? []) as Record<string, unknown>[]) add(v, !!v.is_default);
    return [...out.values()].sort((a, b) => Number(b.primary) - Number(a.primary) || a.name.localeCompare(b.name));
  } catch { return []; }
}

export interface WaterDraft {
  rowId: string | null; clubId: string; venueId: string | null;
  name: string; short: string; place: string; lat: number; lon: number;
  shape: VenueShape; traits: VenueTraits; look: VenueLook; published: boolean;
}

/** Save a club's water (a new one, or changes to one). Returns it as loaded, or a message to show. */
export async function saveWater(d: WaterDraft): Promise<Water | string> {
  try {
    const supabase = await db();
    const row = {
      club_id: d.clubId, venue_id: d.venueId, name: d.name.trim(), short_name: d.short.trim(), place: d.place.trim(),
      latitude: d.lat, longitude: d.lon, shape: d.shape, traits: d.traits, look: d.look, is_published: d.published,
    };
    const q = d.rowId ? supabase.from('sim_venues').update(row).eq('id', d.rowId) : supabase.from('sim_venues').insert(row);
    const { data, error } = await q.select(COLS).maybeSingle();
    if (error) {
      if (error.code === '23505') return 'This venue already has a simulator water. Open that one to change it.';
      if (error.code === '42501') return "Only your club's admins can set up its water.";
      return "That didn't save. Check your connection and try again.";
    }
    if (!data) return "That didn't save: you may not be an admin of this club.";
    const w = waterOf(data as VenueRow);
    return w ?? "That saved, but the simulator couldn't read it back. Rebuild it from the map and save again.";
  } catch { return "That didn't save. Check your connection and try again."; }
}

export async function removeWater(rowId: string): Promise<boolean> {
  try {
    const supabase = await db();
    const { error } = await supabase.from('sim_venues').delete().eq('id', rowId);
    return !error;
  } catch { return false; }
}

/** The id a water has now, for a set-up that remembers an earlier version of it. */
export function currentId(waters: Water[], id: string): string | null {
  const w = parseWaterId(id);
  if (!w) return null;
  const now = waters.find(x => x.rowId === w.rowId);
  return now ? waterId(now.rowId, now.version) : null;
}

// ───────────────────────── The map ─────────────────────────

const OVERPASS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];

/**
 * What OpenStreetMap has round a point, from the Overpass API (asked from this browser; the map's
 * servers are often busy, so it tries a few times and a second server). Map data © OpenStreetMap
 * contributors, ODbL.
 */
export async function fetchMap(lat: number, lon: number, half: number, signal?: AbortSignal): Promise<OsmElement[] | string> {
  const body = `data=${encodeURIComponent(venueQuery(lat, lon, Math.round(half * 1.42), 600))}`;
  let busy = false;
  for (let tries = 0; tries < 4; tries++) {
    if (signal?.aborted) return 'Stopped.';
    try {
      const r = await fetch(OVERPASS[tries % OVERPASS.length], { method: 'POST', body, headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, signal });
      if (r.ok) {
        const j = (await r.json()) as { elements?: OsmElement[] };
        if (Array.isArray(j.elements)) return j.elements;
      } else if (r.status === 429 || r.status >= 500) busy = true;
    } catch {
      if (signal?.aborted) return 'Stopped.';
    }
    await new Promise(res => setTimeout(res, 2500 * (tries + 1)));
  }
  return busy ? "The map's servers are busy right now. Give it a minute and try again." : "Couldn't reach the map. Check your connection and try again.";
}
