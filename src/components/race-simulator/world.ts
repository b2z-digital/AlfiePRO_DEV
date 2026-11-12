// The world: the daily race, the weekly World Regatta and the four Majors a year, one set for each
// class, opened by the database's schedule (see the sim_world migration); world points from each
// event's final places; and the world, country and club tables. Each world event is a platform-wide
// virtual event (events.ts), so it's sailed and scored on the event screen like any other.
//
// Nobody appears on the world's boards or tables until they choose to: a racing profile
// (sim_skippers), asked once, the first time they'd appear. Until then they can sail the world's
// races for practice. Nothing here touches a club's real events or results.
import type { ClassId } from '@/sim/classes';
import type { SkipperLevel } from '@/sim/types';
import type { EventRace, SimEvent } from './events';
import type { Account } from './sync';

export type WorldKind = 'daily' | 'regatta' | 'major';
export interface WorldEvent extends SimEvent { kind: WorldKind; class_id: ClassId; world_key: string; final_at: string | null }

/** How a member appears to the world. */
export interface Skipper {
  user_id: string;
  /** 'racing': under their racing name; 'own': under their own name, from their AlfiePRO profile. */
  shown: 'racing' | 'own';
  racing_name: string;
  /** What everyone sees (the racing name, or their own name). */
  label: string;
  /** ISO 3166-1 alpha-2, or null for no flag. */
  country: string | null;
  club_id: string | null;
  club_name: string | null;
  rating: number | null;
  level: SkipperLevel | null;
  medals: number;
  titles: number;
  hidden: boolean;
}

export interface TableRow {
  pos: number; user_id: string; label: string; country: string | null; club_name: string | null;
  points: number; events: number; wins: number; podiums: number;
  rating: number | null; level: SkipperLevel | null; medals: number; titles: number;
}

export interface WorldResult { event_id: string; kind: WorldKind; class_id: ClassId; place: number; of_n: number; points: number; closed_at: string }

export const KIND_NAME: Record<WorldKind, string> = { daily: 'Daily race', regatta: 'World Regatta', major: 'Major' };
/** World points for first place, before the size of the field is counted (as in the database). */
export const KIND_BASE: Record<WorldKind, number> = { daily: 10, regatta: 100, major: 400 };
/** How many results count in the world tables, over how long. */
export const BEST_OF = 16, TABLE_DAYS = 365;
/** The Majors: ISO weeks and waters (as the schedule opens them). */
export const MAJORS: { week: number; water: string; name: string }[] = [
  { week: 10, water: 'paradise', name: 'The Gold Coast Major' },
  { week: 23, water: 'jackadder', name: 'The Perth Major' },
  { week: 36, water: 'lmryc', name: 'The Lake Macquarie Major' },
  { week: 49, water: 'plrmyc', name: 'The Melbourne Major' },
];

/**
 * World points for a place (the same sum as the database's): the base for the kind, times how far up
 * the field you finished (to the power 1.5), times the size of the field (in full at 50 entrants).
 * At least 1.
 */
export function worldPoints(kind: WorldKind, place: number, n: number): number {
  if (n <= 0 || place < 1) return 0;
  const share = Math.pow((n - place + 1) / n, 1.5);
  const size = Math.min(1, Math.log(n + 1) / Math.log(51));
  return Math.max(1, Math.round(KIND_BASE[kind] * share * size));
}

/** The Monday (UTC) of the ISO week holding this moment, and that week's number. */
export function isoWeek(at: number): { monday: number; week: number; year: number } {
  const d = new Date(at);
  const day = (d.getUTCDay() + 6) % 7;
  const monday = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day);
  const thursday = new Date(monday + 3 * 86400000);
  const jan1 = Date.UTC(thursday.getUTCFullYear(), 0, 1);
  return { monday, week: 1 + Math.floor((thursday.getTime() - jan1) / (7 * 86400000)), year: thursday.getUTCFullYear() };
}

/** The next Major from this moment (this week's if it's under way): its name, water and the Monday it opens. */
export function nextMajor(at: number): { name: string; water: string; opens: number; now: boolean } {
  const { monday } = isoWeek(at);
  for (let k = 0; k < 60; k++) {
    const m = monday + k * 7 * 86400000;
    const w = isoWeek(m).week;
    const major = MAJORS.find(x => x.week === w);
    if (major) return { ...major, opens: m, now: k === 0 };
  }
  return { ...MAJORS[0], opens: monday, now: false };
}

/** A racing name the database will take: 3 to 20 letters, numbers, spaces, dots, apostrophes and hyphens, starting with a letter or number. */
export function nameProblem(name: string): string | null {
  const n = name.trim();
  if (n.length < 3) return 'At least three characters.';
  if (n.length > 20) return 'Twenty characters at most.';
  if (!/^[A-Za-z0-9][A-Za-z0-9 .'-]{1,18}[A-Za-z0-9.]$/.test(n)) return "Letters, numbers, spaces, dots, apostrophes and hyphens; start with a letter or a number and end with one (or a dot).";
  return null;
}

/** Is this a world event (rather than a club's or a one-off)? */
export const isWorld = (ev: SimEvent | null | undefined): ev is WorldEvent => !!ev && !!(ev as Partial<WorldEvent>).kind;

/** The world's events for a class: what's open now (today's daily race, this week's regatta or Major) and the latest closed. */
export function worldNow(events: WorldEvent[], cls: ClassId, now = Date.now()): { daily: WorldEvent | null; regatta: WorldEvent | null; major: WorldEvent | null; closed: WorldEvent[] } {
  const mine = events.filter(e => e.class_id === cls);
  const openNow = (e: WorldEvent) => e.races.some(r => Date.parse(r.opens_at) <= now && (!r.closes_at || now < Date.parse(r.closes_at)));
  const pick = (k: WorldKind) => mine.filter(e => e.kind === k && openNow(e)).sort((a, b) => b.created_at.localeCompare(a.created_at))[0] ?? null;
  const closed = mine.filter(e => !openNow(e) && e.races.length > 0 && e.races.every(r => r.closes_at && Date.parse(r.closes_at) <= now))
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  return { daily: pick('daily'), regatta: pick('regatta'), major: pick('major'), closed };
}

async function db() {
  const { supabase } = await import('@/utils/supabase');
  return supabase;
}

const RACE_COLS = 'id, club_id, title, description, settings, opens_at, closes_at, created_at, event_id, race_no';
const WORLD_COLS = `id, club_id, title, description, tries, drops, created_at, kind, class_id, world_key, final_at, races:sim_challenges(${RACE_COLS})`;
const SKIPPER_COLS = 'user_id, shown, racing_name, label, country, club_id, club_name, rating, level, medals, titles, hidden';

/** The world's events (the newest first, every class). Null when the world isn't there (not set up, or offline). */
export async function listWorld(limit = 40): Promise<WorldEvent[] | null> {
  try {
    const supabase = await db();
    const { data, error } = await supabase.from('sim_events').select(WORLD_COLS).not('kind', 'is', null).order('created_at', { ascending: false }).limit(limit);
    if (error) return null;
    return ((data ?? []) as unknown as WorldEvent[]).map(e => ({ ...e, races: [...(e.races ?? [])].sort((a: EventRace, b: EventRace) => a.race_no - b.race_no) }));
  } catch { return null; }
}

/** How you appear (null: you don't; undefined: couldn't tell just now). */
export async function mySkipper(a: Account): Promise<Skipper | null | undefined> {
  try {
    const supabase = await db();
    const { data, error } = await supabase.from('sim_skippers').select(SKIPPER_COLS).eq('user_id', a.userId).maybeSingle();
    if (error) return undefined;
    return (data as Skipper | null) ?? null;
  } catch { return undefined; }
}

export interface Appear { shown: 'racing' | 'own'; racing_name: string; country: string | null; club_id: string | null }

/** Appear (or change how you appear). A string is what went wrong, in words. */
export async function saveSkipper(a: Account, p: Appear, stats?: { rating: number | null; level: SkipperLevel | null; medals: number; titles: number }): Promise<Skipper | string> {
  try {
    const supabase = await db();
    const row = { user_id: a.userId, shown: p.shown, racing_name: p.racing_name.trim(), country: p.country, club_id: p.club_id, ...(stats ?? {}) };
    const { data, error } = await supabase.from('sim_skippers').upsert(row, { onConflict: 'user_id' }).select(SKIPPER_COLS).single();
    if (error) {
      if (error.code === '23505') return 'Someone is already racing under that name. Try another.';
      if (error.code === '23514') return nameProblem(p.racing_name) ?? "That name can't be used.";
      return "Couldn't save just now. Try again in a moment.";
    }
    return data as Skipper;
  } catch { return "Couldn't save just now. Try again in a moment."; }
}

/** Keep your level, rating and medals on the tables up to date (only when they've changed). */
export async function syncSkipperStats(a: Account, s: Skipper, stats: { rating: number | null; level: SkipperLevel | null; medals: number; titles: number }): Promise<void> {
  if (s.rating === stats.rating && s.level === stats.level && s.medals === stats.medals && s.titles === stats.titles) return;
  try {
    const supabase = await db();
    await supabase.from('sim_skippers').update(stats).eq('user_id', a.userId);
  } catch { /* next time */ }
}

/** Stop appearing: off every board and table (your results stay yours). */
export async function stopAppearing(a: Account): Promise<boolean> {
  try {
    const supabase = await db();
    const { error } = await supabase.from('sim_skippers').delete().eq('user_id', a.userId);
    return !error;
  } catch { return false; }
}

/** The skippers behind some entries: flags, clubs and levels for a board. */
export async function skippersOf(ids: string[]): Promise<Map<string, Skipper>> {
  const out = new Map<string, Skipper>();
  if (!ids.length) return out;
  try {
    const supabase = await db();
    const { data } = await supabase.from('sim_skippers').select(SKIPPER_COLS).in('user_id', [...new Set(ids)].slice(0, 500));
    for (const s of (data ?? []) as Skipper[]) out.set(s.user_id, s);
  } catch { /* no flags this time */ }
  return out;
}

/** A world table: by class (null: every class), country and club. */
export async function worldTable(o: { cls: ClassId | null; country?: string | null; club?: string | null; limit?: number }): Promise<TableRow[] | null> {
  try {
    const supabase = await db();
    const { data, error } = await supabase.rpc('sim_world_table', { p_class: o.cls, p_country: o.country ?? null, p_club: o.club ?? null, p_limit: o.limit ?? 100 });
    if (error) return null;
    return ((data ?? []) as TableRow[]).map(r => ({ ...r, pos: Number(r.pos), points: Number(r.points), events: Number(r.events), wins: Number(r.wins), podiums: Number(r.podiums) }));
  } catch { return null; }
}

/** The name of a club you're in (to offer showing it with your name). */
export async function clubName(clubId: string): Promise<string | null> {
  try {
    const supabase = await db();
    const { data } = await supabase.from('clubs').select('name').eq('id', clubId).maybeSingle();
    return (data as { name: string } | null)?.name ?? null;
  } catch { return null; }
}

/** Your own world results, newest first. */
export async function myResults(a: Account, limit = 30): Promise<WorldResult[] | null> {
  try {
    const supabase = await db();
    const { data, error } = await supabase.from('sim_world_results').select('event_id, kind, class_id, place, of_n, points, closed_at').eq('user_id', a.userId).order('closed_at', { ascending: false }).limit(limit);
    if (error) return null;
    return (data ?? []) as WorldResult[];
  } catch { return null; }
}
