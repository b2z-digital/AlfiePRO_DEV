/**
 * What a broadcast, a race video or an AlfieTV tile needs to know about the event it belongs to:
 * the event's name, the venue (name + photo), the host club and which race is being sailed.
 *
 * A broadcast's event_id can be a single event (quick_races), a series round (race_series_rounds)
 * or a state/national event (public_events, possibly with a "-round-N" / "-day-N" suffix).
 * Club events store their venue by name, so the photo is found on the club's venues by name.
 */
import { supabase } from './supabase';

export interface LiveEventMeta {
  eventId: string;
  eventName: string | null;
  venueName: string | null;
  venueImage: string | null;
  clubId: string | null;
  clubName: string | null;
  clubLogo: string | null;
}

const baseId = (id: string) => id.replace(/-round-\d+$/, '').replace(/-day-\d+$/, '');
const isUuid = (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

/** Looks up several events at once. Missing pieces come back as null; it never throws. */
export async function resolveLiveEvents(eventIds: string[], fallbackClubId?: string | null): Promise<Map<string, LiveEventMeta>> {
  const out = new Map<string, LiveEventMeta>();
  const ids = [...new Set(eventIds.filter(Boolean))];
  if (ids.length === 0) return out;
  const uuidIds = [...new Set(ids.map(baseId).filter(isUuid))];

  try {
    const [quickRes, roundRes, publicRes] = await Promise.all([
      uuidIds.length ? supabase.from('quick_races').select('id, event_name, race_venue, club_id').in('id', uuidIds) : Promise.resolve({ data: [] as any[] }),
      uuidIds.length ? supabase.from('race_series_rounds').select('id, round_name, venue, club_id, series_id').in('id', uuidIds) : Promise.resolve({ data: [] as any[] }),
      uuidIds.length ? supabase.from('public_events').select('id, event_name, venue_id').in('id', uuidIds) : Promise.resolve({ data: [] as any[] }),
    ]);
    const quick = new Map(((quickRes as any).data || []).map((r: any) => [String(r.id), r]));
    const rounds = new Map(((roundRes as any).data || []).map((r: any) => [String(r.id), r]));
    const publics = new Map(((publicRes as any).data || []).map((r: any) => [String(r.id), r]));

    const seriesIds = [...new Set([...rounds.values()].map((r: any) => r.series_id).filter(Boolean))];
    const { data: series } = seriesIds.length
      ? await supabase.from('race_series').select('id, series_name').in('id', seriesIds)
      : { data: [] as any[] };
    const seriesName = new Map((series || []).map((s: any) => [String(s.id), s.series_name as string]));

    // Per event: name, venue name/id and club
    const draft = ids.map(id => {
      const key = baseId(id);
      const q: any = quick.get(key);
      const r: any = rounds.get(key);
      const p: any = publics.get(key);
      const eventName = q?.event_name
        || (r ? [seriesName.get(String(r.series_id)), r.round_name].filter(Boolean).join(' · ') : null)
        || p?.event_name || null;
      return {
        id,
        eventName,
        venueName: (q?.race_venue || r?.venue || null) as string | null,
        venueId: (p?.venue_id || null) as string | null,
        clubId: (q?.club_id || r?.club_id || fallbackClubId || null) as string | null,
      };
    });

    const venueIds = [...new Set(draft.map(d => d.venueId).filter(Boolean))] as string[];
    const venueNames = [...new Set(draft.map(d => d.venueName).filter(Boolean))] as string[];
    const [byIdRes, byNameRes] = await Promise.all([
      venueIds.length ? supabase.from('venues').select('id, name, image, club_id').in('id', venueIds) : Promise.resolve({ data: [] as any[] }),
      venueNames.length ? supabase.from('venues').select('id, name, image, club_id').in('name', venueNames) : Promise.resolve({ data: [] as any[] }),
    ]);
    const venuesById = new Map(((byIdRes as any).data || []).map((v: any) => [String(v.id), v]));
    const venuesByName: any[] = (byNameRes as any).data || [];

    const clubIds = [...new Set(draft.map(d => d.clubId).filter(Boolean))] as string[];
    const { data: clubs } = clubIds.length
      ? await supabase.from('clubs').select('id, name, logo, cover_image_url, featured_image_url').in('id', clubIds)
      : { data: [] as any[] };
    const clubsById = new Map((clubs || []).map((c: any) => [String(c.id), c]));

    for (const d of draft) {
      let venue: any = d.venueId ? venuesById.get(d.venueId) : null;
      if (!venue && d.venueName) {
        const same = venuesByName.filter(v => v.name === d.venueName);
        venue = same.find(v => v.club_id === d.clubId && v.image) || same.find(v => v.image) || same[0] || null;
      }
      const club: any = d.clubId ? clubsById.get(d.clubId) : null;
      out.set(d.id, {
        eventId: d.id,
        eventName: d.eventName,
        venueName: venue?.name || d.venueName,
        venueImage: venue?.image || club?.cover_image_url || club?.featured_image_url || null,
        clubId: d.clubId,
        clubName: club?.name || null,
        clubLogo: club?.logo || null,
      });
    }
  } catch (err) {
    console.warn('[liveEventInfo] Could not resolve events:', err);
  }
  return out;
}

export async function resolveLiveEvent(eventId: string, fallbackClubId?: string | null): Promise<LiveEventMeta | null> {
  const map = await resolveLiveEvents([eventId], fallbackClubId);
  return map.get(eventId) || null;
}

/**
 * The race being sailed right now, from scoring: the race after the last scored one.
 * Heat events report their heat/round label instead. Null when the event can't be read.
 */
export async function fetchScoringRace(eventId: string): Promise<{ raceNumber: number; label: string } | null> {
  const key = baseId(eventId);
  if (!isUuid(key)) return null;
  try {
    let row: any = (await supabase.from('quick_races').select('last_completed_race, heat_management, current_day').eq('id', key).maybeSingle()).data;
    if (!row) row = (await supabase.from('race_series_rounds').select('last_completed_race, heat_management').eq('id', key).maybeSingle()).data;
    if (!row) return null;
    const hm = row.heat_management;
    if (hm?.rounds?.length) {
      const round = hm.currentRound || 1;
      const heat = hm.currentHeat || 'A';
      return { raceNumber: round, label: `Round ${round} · Heat ${heat}` };
    }
    if (hm?.heats?.length) {
      const heat = hm.heats.find((h: any) => h.heat_number === row.current_day) || hm.heats.find((h: any) => !h.completed) || hm.heats[hm.heats.length - 1];
      const n = heat?.heat_number || 1;
      return { raceNumber: n, label: `Heat ${n}` };
    }
    const n = (row.last_completed_race || 0) + 1;
    return { raceNumber: n, label: `Race ${n}` };
  } catch {
    return null;
  }
}

/** "IOM Scratch … - Round 9 - Live Coverage" → "IOM Scratch … - Round 9" */
export const stripBroadcastSuffix = (title: string) =>
  title.replace(/\s*[-–|·]\s*live coverage\s*$/i, '').replace(/\s*[-–|·]\s*live\s*$/i, '').trim();

/** The number in a race label ("Race 5" → 5, "Round 2 · Heat A" → 2) */
export const raceNumberFromLabel = (label: string): number | null => {
  const m = label.match(/(\d+)/);
  return m ? Number(m[1]) : null;
};
