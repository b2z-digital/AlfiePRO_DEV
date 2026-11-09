/**
 * Find racing: every upcoming public event, club race and series round on AlfiePRO,
 * placed on the map by its venue — the same sources and venue matching as the
 * desktop Location Explorer (RaceCalendar.fetchAllPublicEvents + enrichEventsWithDistance).
 */
import { supabase } from '../utils/supabase';
import { getPublicEvents, convertToRaceEvent } from '../utils/publicEventStorage';
import { calculateDistance } from '../utils/locationUtils';
import { todayISO } from './data';

export interface FoundEvent {
  id: string;
  title: string;
  date: string;
  endDate?: string;
  venue: string;
  clubName: string;
  raceClass?: string;
  level: 'club' | 'state' | 'national';
  lat?: number;
  lng?: number;
  distanceKm?: number;
  norUrl?: string | null;
}

const norm = (s?: string | null) => (s || '').trim().toLowerCase();

export async function loadAllRacing(): Promise<FoundEvent[]> {
  const today = todayISO();
  const [pub, qr, sr, venues] = await Promise.all([
    getPublicEvents().catch(() => []),
    supabase.from('quick_races').select('id, event_name, club_name, race_date, end_date, race_venue, race_class, club_id, notice_of_race_url')
      .eq('completed', false).neq('is_simulated', true).gte('race_date', today).order('race_date', { ascending: true }),
    supabase.from('race_series_rounds').select('id, round_name, date, venue, race_class, club_id, series_id')
      .eq('cancelled', false).eq('completed', false).gte('date', today).order('date', { ascending: true }),
    supabase.from('venues').select('id, name, latitude, longitude, city'),
  ]);

  const clubIds = [...new Set([...(qr.data || []), ...(sr.data || [])].map((r: any) => r.club_id).filter(Boolean))];
  const seriesIds = [...new Set((sr.data || []).map((r: any) => r.series_id).filter(Boolean))];
  const [{ data: clubs }, { data: series }] = await Promise.all([
    clubIds.length ? supabase.from('clubs').select('id, name').in('id', clubIds) : Promise.resolve({ data: [] as any[] }),
    seriesIds.length ? supabase.from('race_series').select('id, series_name').in('id', seriesIds) : Promise.resolve({ data: [] as any[] }),
  ]);
  const clubName = new Map((clubs || []).map((c: any) => [c.id, c.name]));
  const seriesName = new Map((series || []).map((s: any) => [s.id, s.series_name]));
  const venueList = (venues.data || []).filter((v: any) => v.latitude && v.longitude);
  const byName = new Map(venueList.map((v: any) => [norm(v.name), v]));

  const out: FoundEvent[] = [];
  const seen = new Set<string>();
  const add = (e: FoundEvent) => {
    if (seen.has(e.id) || !e.date || e.date < today) return;
    seen.add(e.id);
    const v: any = byName.get(norm(e.venue));
    out.push(v ? { ...e, lat: v.latitude, lng: v.longitude } : e);
  };
  (pub || []).forEach((p: any) => {
    const e: any = convertToRaceEvent(p);
    if (!e) return;
    add({ id: e.id, title: e.eventName || 'Event', date: e.date, endDate: e.endDate, venue: e.venue || '', clubName: e.clubName || '', raceClass: e.raceClass, level: (e.eventLevel === 'national' ? 'national' : e.eventLevel === 'state' ? 'state' : 'club'), norUrl: e.noticeOfRaceUrl });
  });
  (qr.data || []).forEach((r: any) => add({ id: r.id, title: r.event_name || 'Race day', date: r.race_date, endDate: r.end_date, venue: r.race_venue || '', clubName: r.club_name || clubName.get(r.club_id) || '', raceClass: r.race_class, level: 'club', norUrl: r.notice_of_race_url }));
  (sr.data || []).forEach((r: any) => {
    const s = seriesName.get(r.series_id);
    add({ id: r.id, title: s ? `${s} · ${r.round_name || 'Round'}` : r.round_name || 'Series round', date: r.date, venue: r.venue || '', clubName: clubName.get(r.club_id) || '', raceClass: r.race_class, level: 'club' });
  });
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

export function withDistance(list: FoundEvent[], from: { lat: number; lng: number } | null): FoundEvent[] {
  if (!from) return list;
  return list.map(e => (e.lat != null && e.lng != null ? { ...e, distanceKm: calculateDistance(from.lat, from.lng, e.lat, e.lng, 'km') } : e));
}

/** Where to measure from: the phone's location, or the club's home venue. */
export async function startingPoint(clubId?: string): Promise<{ lat: number; lng: number; label: string } | null> {
  const here = await new Promise<{ lat: number; lng: number } | null>(resolve => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(p => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }), () => resolve(null), { timeout: 8000, maximumAge: 300000 });
  });
  if (here) return { ...here, label: 'you' };
  if (!clubId) return null;
  const { data } = await supabase.from('venues').select('name, latitude, longitude, is_default').eq('club_id', clubId).not('latitude', 'is', null).order('is_default', { ascending: false }).limit(1);
  const v = data?.[0];
  return v ? { lat: v.latitude, lng: v.longitude, label: v.name } : null;
}
