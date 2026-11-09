// Live club data for website modules (public site and the site builder canvas).
// Every query here is one the public club pages already make, so it works signed out.
import { useEffect, useState } from 'react';
import { supabase } from '../../utils/supabase';
import { calculateEventStandings } from '../../utils/standingsCalculator';

export interface ClubRace { id: string; title: string; date: string; venue: string | null; raceClass: string | null; format: string | null; series: string | null; entryFee: number | null }
export interface ClubResult { id: string; title: string; date: string; raceClass: string | null; boats: number; podium: { name: string; sail: string | null; points: number | null }[] }
export interface ClubArticle { id: string; title: string; excerpt: string | null; image: string | null; date: string | null; source: 'club' | 'state' | 'national' }
export interface ClubClass { id: string; name: string; description: string | null; image: string | null }
export interface ClubOfficer { position: string; name: string | null; email: string | null }
export interface ClubVenue { id: string; name: string; address: string | null; image: string | null; lat: number | null; lng: number | null; isDefault: boolean }
export interface ClubListing { id: string; title: string; price: number | null; image: string | null; location: string | null }

const cache = new Map<string, Promise<unknown>>();
function once<T>(key: string, load: () => Promise<T>): Promise<T> {
  if (!cache.has(key)) {
    const p = load().catch(e => { cache.delete(key); throw e; });
    cache.set(key, p);
    setTimeout(() => cache.delete(key), 60_000);
  }
  return cache.get(key) as Promise<T>;
}

function useLoad<T>(key: string | null, load: () => Promise<T>, empty: T): { data: T; loading: boolean } {
  const [state, setState] = useState<{ data: T; loading: boolean }>({ data: empty, loading: !!key });
  useEffect(() => {
    if (!key) { setState({ data: empty, loading: false }); return; }
    let off = false;
    setState(s => ({ ...s, loading: true }));
    once(key, load).then(d => { if (!off) setState({ data: d, loading: false }); }).catch(() => { if (!off) setState({ data: empty, loading: false }); });
    return () => { off = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return state;
}

const today = () => new Date().toISOString().slice(0, 10);

async function loadRaces(clubId: string): Promise<ClubRace[]> {
  const t = today();
  const [{ data: quick }, { data: series }] = await Promise.all([
    supabase.from('quick_races').select('id, event_name, race_date, race_venue, race_class, race_format, entry_fee').eq('club_id', clubId).neq('is_simulated', true).gte('race_date', t).order('race_date').limit(30),
    supabase.from('race_series').select('id, series_name, rounds, race_class, race_format, entry_fee').eq('club_id', clubId),
  ]);
  const out: ClubRace[] = (quick || []).map((q: any) => ({
    id: q.id, title: q.event_name || `${q.race_class || 'Club'} race`, date: String(q.race_date).slice(0, 10), venue: q.race_venue || null,
    raceClass: q.race_class || null, format: q.race_format || null, series: null, entryFee: q.entry_fee ?? null,
  }));
  for (const s of (series || []) as any[]) {
    (Array.isArray(s.rounds) ? s.rounds : []).forEach((r: any, i: number) => {
      if (!r?.date || r.date < t || r.cancelled) return;
      out.push({ id: `${s.id}-round-${i}`, title: r.name || `Round ${i + 1}`, date: String(r.date).slice(0, 10), venue: r.venue || null, raceClass: s.race_class || null, format: s.race_format || null, series: s.series_name || null, entryFee: s.entry_fee ?? null });
    });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

function podium(raw: any): ClubResult['podium'] {
  try {
    const skippers = Array.isArray(raw.skippers) ? raw.skippers : [];
    if (!skippers.length) return [];
    const st = calculateEventStandings({ skippers, raceResults: raw.race_results || [], dropRules: raw.drop_rules || undefined } as any) as any[];
    return st.filter(x => x.hasResults !== false && x.name).slice(0, 3).map(x => ({
      name: String(x.name), sail: x.sailNo ? String(x.sailNo) : null,
      points: Number.isFinite(x.netTotal) && x.netTotal < Number.MAX_SAFE_INTEGER ? Math.round(x.netTotal * 10) / 10 : null,
    }));
  } catch { return []; }
}

async function loadResults(clubId: string): Promise<ClubResult[]> {
  const [{ data: quick }, { data: rounds }] = await Promise.all([
    supabase.from('quick_races').select('id, event_name, race_date, race_class, race_results, skippers, drop_rules').eq('club_id', clubId).eq('completed', true).neq('is_simulated', true).order('race_date', { ascending: false }).limit(8),
    supabase.from('race_series_rounds').select('id, round_name, date, race_class, race_results, skippers, drop_rules, race_series!inner(series_name)').eq('club_id', clubId).eq('completed', true).order('date', { ascending: false }).limit(8),
  ]);
  const all = [
    ...(quick || []).map((q: any) => ({ id: q.id, title: q.event_name || `${q.race_class || 'Club'} race`, date: String(q.race_date).slice(0, 10), raceClass: q.race_class || null, raw: q })),
    ...(rounds || []).map((r: any) => ({ id: r.id, title: `${r.round_name}${r.race_series?.series_name ? ` · ${r.race_series.series_name}` : ''}`, date: String(r.date).slice(0, 10), raceClass: r.race_class || null, raw: r })),
  ].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8);
  return all.map(a => ({ id: a.id, title: a.title, date: a.date, raceClass: a.raceClass, boats: Array.isArray(a.raw.skippers) ? a.raw.skippers.length : 0, podium: podium(a.raw) }));
}

async function loadNews(clubId: string): Promise<ClubArticle[]> {
  const { data: club } = await supabase.from('clubs').select('state_association_id').eq('id', clubId).maybeSingle();
  const state = (club as any)?.state_association_id as string | null;
  let national: string | null = null;
  if (state) {
    const { data } = await supabase.from('state_associations').select('national_association_id').eq('id', state).maybeSingle();
    national = (data as any)?.national_association_id ?? null;
  }
  const or = [`club_id.eq.${clubId}`];
  if (state) or.push(`state_association_id.eq.${state}`);
  if (national) or.push(`national_association_id.eq.${national}`);
  const { data } = await supabase.from('articles').select('id, title, excerpt, cover_image, published_at, club_id, state_association_id').eq('status', 'published').or(or.join(',')).order('published_at', { ascending: false }).limit(12);
  return (data || []).map((a: any) => ({
    id: a.id, title: a.title, excerpt: a.excerpt ? String(a.excerpt).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : null,
    image: a.cover_image || null, date: a.published_at || null,
    source: a.club_id === clubId ? 'club' : a.state_association_id ? 'state' : 'national',
  }));
}

async function loadClasses(clubId: string): Promise<ClubClass[]> {
  const { data } = await supabase.from('club_boat_classes').select('boat_classes (id, name, description, class_image)').eq('club_id', clubId);
  return (data || []).map((r: any) => r.boat_classes).filter(Boolean).map((b: any) => ({ id: b.id, name: b.name, description: b.description || null, image: b.class_image || null }));
}

async function loadCommittee(clubId: string): Promise<ClubOfficer[]> {
  const { data } = await supabase.from('committee_position_definitions')
    .select('position_name, committee_positions (name, email, members (first_name, last_name, email))')
    .eq('club_id', clubId).eq('show_on_website', true).order('display_order');
  const out: ClubOfficer[] = [];
  for (const d of (data || []) as any[]) {
    const list = Array.isArray(d.committee_positions) ? d.committee_positions : d.committee_positions ? [d.committee_positions] : [];
    if (!list.length) out.push({ position: d.position_name, name: null, email: null });
    for (const a of list) {
      out.push({ position: d.position_name, name: a.members ? `${a.members.first_name || ''} ${a.members.last_name || ''}`.trim() : a.name || null, email: a.members?.email || a.email || null });
    }
  }
  return out;
}

async function loadVenues(clubId: string): Promise<ClubVenue[]> {
  const { data } = await supabase.from('venues').select('id, name, address, image, latitude, longitude, is_default').eq('club_id', clubId).order('is_default', { ascending: false });
  return (data || []).map((v: any) => ({ id: v.id, name: v.name, address: v.address || null, image: v.image || null, lat: v.latitude ?? null, lng: v.longitude ?? null, isDefault: !!v.is_default }));
}

async function loadListings(clubId: string, clubOnly: boolean): Promise<ClubListing[]> {
  let q = supabase.from('classifieds').select('id, title, price, images, location, club_id').eq('status', 'active').order('created_at', { ascending: false }).limit(12);
  if (clubOnly) q = q.eq('club_id', clubId);
  const { data } = await q;
  return (data || []).map((c: any) => {
    const f = Array.isArray(c.images) ? c.images[0] : null;
    return { id: c.id, title: c.title, price: c.price ?? null, image: typeof f === 'string' ? f : f?.url || null, location: c.location || null };
  });
}

export const useClubRaces = (clubId?: string | null) => useLoad<ClubRace[]>(clubId ? `races:${clubId}` : null, () => loadRaces(clubId!), []);
export const useClubResults = (clubId?: string | null) => useLoad<ClubResult[]>(clubId ? `results:${clubId}` : null, () => loadResults(clubId!), []);
export const useClubNews = (clubId?: string | null) => useLoad<ClubArticle[]>(clubId ? `news:${clubId}` : null, () => loadNews(clubId!), []);
export const useClubClasses = (clubId?: string | null) => useLoad<ClubClass[]>(clubId ? `classes:${clubId}` : null, () => loadClasses(clubId!), []);
export const useClubCommittee = (clubId?: string | null) => useLoad<ClubOfficer[]>(clubId ? `committee:${clubId}` : null, () => loadCommittee(clubId!), []);
export const useClubVenues = (clubId?: string | null) => useLoad<ClubVenue[]>(clubId ? `venues:${clubId}` : null, () => loadVenues(clubId!), []);
export const useClubListings = (clubId?: string | null, clubOnly = false) => useLoad<ClubListing[]>(clubId ? `listings:${clubId}:${clubOnly}` : null, () => loadListings(clubId!, clubOnly), []);
