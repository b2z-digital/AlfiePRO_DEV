// Virtual race events: a series of races, each sailed any time in its own window and the same race
// for everyone (fleet, wind and shifts), scored as a regatta (series.ts). Each race is a challenge
// (sim_challenges with event_id and race_no) and its results are the challenge entries. Whoever
// runs the event chooses whether a skipper's first try at each race counts (from the gun) or her
// best. Row-level security keeps it fair: see the 20261110200000_sim_events migration.
import { levelName } from './rating';
import type { RaceSettings } from '@/sim/types';
import type { WindCharacter, WindStrength } from '@/sim/wind';
import { VENUES } from '@/sim/venues';
import { CLASSES } from '@/sim/classes';
import { Challenge, ChallengeEntry, isOpen } from './challenges';
import { SeriesRace, STANDARD_DROPS } from './series';
import type { Account } from './sync';

export interface EventRace extends Challenge {
  event_id: string;
  race_no: number;
}

export interface SimEvent {
  id: string;
  club_id: string | null;
  title: string;
  description: string | null;
  /** 'first': your first try at each race counts (from the gun); 'best': your best. */
  tries: 'first' | 'best';
  /** Races dropped from each total: one once this many are sailed, two at the next, ... */
  drops: number[];
  created_at: string;
  races: EventRace[];
}

export type Schedule = 'together' | 'weekly' | 'daily';

/** When the races open: all together (for two weeks), one a week (each open a week), or one a day
 *  (each open two days, so a missed day can be caught up). */
export const SCHEDULES: Record<Schedule, { label: string; days: number; gap: number; hint: string }> = {
  together: { label: 'All at once', days: 14, gap: 0, hint: 'Every race open for two weeks' },
  weekly: { label: 'One a week', days: 7, gap: 7, hint: 'A new race each week, open for the week' },
  daily: { label: 'One a day', days: 2, gap: 1, hint: 'A new race each day, open for two days' },
};

export function raceWindows(n: number, schedule: Schedule, start: Date): { opens: Date; closes: Date }[] {
  const s = SCHEDULES[schedule];
  return Array.from({ length: n }, (_, k) => {
    const opens = new Date(start.getTime() + k * s.gap * 864e5);
    return { opens, closes: new Date(opens.getTime() + s.days * 864e5) };
  });
}

/** Mixed conditions: a different breeze for each race, as a real series gets (and, at a venue, a
 *  different direction off the club's usual one). */
const MIX: { windStrength: WindStrength; windCharacter: WindCharacter; turn: number }[] = [
  { windStrength: 'medium', windCharacter: 'oscillating', turn: 0 },
  { windStrength: 'light', windCharacter: 'puffy', turn: -20 },
  { windStrength: 'fresh', windCharacter: 'oscillating', turn: 15 },
  { windStrength: 'medium', windCharacter: 'persistent', turn: -10 },
  { windStrength: 'light', windCharacter: 'steady', turn: 25 },
  { windStrength: 'fresh', windCharacter: 'puffy', turn: -25 },
  { windStrength: 'medium', windCharacter: 'puffy', turn: 10 },
  { windStrength: 'light', windCharacter: 'oscillating', turn: -15 },
  { windStrength: 'fresh', windCharacter: 'persistent', turn: 20 },
  { windStrength: 'medium', windCharacter: 'steady', turn: -5 },
];

/**
 * Each race's settings: the race set up (class, fleet, skippers, venue, laps), with its own shifts
 * (seed) and, for mixed conditions, its own breeze. Nobody's name or number: the same for all.
 */
export function eventRaceSettings(base: RaceSettings, n: number, mixed: boolean, seed: () => number): RaceSettings[] {
  const { player: _p, seed: _s, ...rest } = base;
  void _p; void _s;
  const venue = base.venue ? VENUES[base.venue] : undefined;
  return Array.from({ length: n }, (_, k) => {
    const s: RaceSettings = { ...rest, seed: seed() };
    if (!mixed) return s;
    const m = MIX[k % MIX.length];
    return {
      ...s, windStrength: m.windStrength, windCharacter: m.windCharacter, windKnots: undefined,
      windFrom: venue ? (((venue.usualWind + m.turn) % 360) + 360) % 360 : base.windFrom,
    };
  });
}

/** "5 races · IOM · 8 boats · Regional skippers · LMRYC · 2 laps". */
export function eventLine(ev: SimEvent): string {
  const s = ev.races[0]?.settings;
  const parts = [`${ev.races.length} race${ev.races.length === 1 ? '' : 's'}`];
  if (!s) return parts[0];
  parts.push(CLASSES[s.classId]?.name ?? s.classId, `${s.fleetSize} boats`, `${levelName(s.level)} skippers`);
  const v = s.venue ? VENUES[s.venue] : undefined;
  parts.push(v ? v.short : 'Practice pond');
  parts.push(`${s.laps} lap${s.laps > 1 ? 's' : ''}`);
  return parts.join(' · ');
}

const STRENGTH: Record<WindStrength, string> = { light: 'Light', medium: 'Medium', fresh: 'Fresh' };
const CHARACTER: Record<WindCharacter, string> = { steady: 'steady', oscillating: 'shifty', puffy: 'puffy', persistent: 'swinging' };

/** "Fresh, shifty", "Light, puffy, 6 kn". */
export function breezeText(s: RaceSettings): string {
  return `${STRENGTH[s.windStrength]}, ${CHARACTER[s.windCharacter]}${s.windKnots != null ? `, ${Math.round(s.windKnots)} kn` : ''}`;
}

/** Where the event stands: the races open now, the next to open, and whether it's all over. */
export function eventState(ev: SimEvent, now = Date.now()): { open: EventRace[]; next: EventRace | null; done: boolean; started: boolean } {
  const races = [...ev.races].sort((a, b) => a.race_no - b.race_no);
  const open = races.filter(r => isOpen(r, now));
  const next = races.find(r => Date.parse(r.opens_at) > now) ?? null;
  const done = races.length > 0 && races.every(r => r.closes_at != null && Date.parse(r.closes_at) <= now);
  const started = races.some(r => Date.parse(r.opens_at) <= now);
  return { open, next, done, started };
}

/** "Race 2 open · closes in 3 days", "Race 1 opens Mon 17 Nov", "Finished". */
export function eventStatusText(ev: SimEvent, now = Date.now()): string {
  const st = eventState(ev, now);
  if (st.done) return 'Finished';
  if (st.open.length === 1) {
    const r = st.open[0];
    return `Race ${r.race_no} open${r.closes_at ? ` · closes ${whenText(r.closes_at, now)}` : ''}`;
  }
  if (st.open.length > 1) return `${st.open.length} races open`;
  if (st.next) return `Race ${st.next.race_no} opens ${whenText(st.next.opens_at, now)}`;
  return 'Between races';
}

/** "in 3 h", "in 2 days", "Mon 17 Nov". */
export function whenText(iso: string, now = Date.now()): string {
  const ms = Date.parse(iso) - now;
  const h = ms / 3.6e6;
  if (ms <= 0) return 'now';
  if (h < 1) return 'within the hour';
  if (h < 24) return `in ${Math.round(h)} h`;
  if (h < 24 * 6.5) return `in ${Math.round(h / 24)} day${Math.round(h / 24) === 1 ? '' : 's'}`;
  return new Date(iso).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
}

/** The event's races and their entries, for the standings. */
export function seriesRaces(ev: SimEvent, entries: ChallengeEntry[], now = Date.now()): SeriesRace[] {
  return [...ev.races].sort((a, b) => a.race_no - b.race_no).map(r => ({
    no: r.race_no,
    opened: Date.parse(r.opens_at) <= now,
    open: isOpen(r, now),
    entries: entries.filter(e => e.challenge_id === r.id).map(e => ({ userId: e.user_id, name: e.display_name, sail: e.sail_number, status: e.status, elapsed: e.elapsed_s, sailedAt: e.sailed_at })),
  }));
}

async function db() {
  const { supabase } = await import('@/utils/supabase');
  return supabase;
}

const RACE_COLS = 'id, club_id, title, description, settings, opens_at, closes_at, created_at, event_id, race_no';
const EVENT_COLS = `id, club_id, title, description, tries, drops, created_at, races:sim_challenges(${RACE_COLS})`;

/** The events you can see (your club's and the platform's), newest first. */
export async function listEvents(limit = 12): Promise<SimEvent[] | null> {
  try {
    const supabase = await db();
    // (The world's events, the daily race and the rest, have their own screen: see world.ts. Before the
    // world was set up there's no kind to filter on, so ask again without it.)
    let { data, error } = await supabase.from('sim_events').select(EVENT_COLS).is('kind', null).order('created_at', { ascending: false }).limit(limit);
    if (error) ({ data, error } = await supabase.from('sim_events').select(EVENT_COLS).order('created_at', { ascending: false }).limit(limit));
    if (error) return null;
    return ((data ?? []) as unknown as SimEvent[]).map(e => ({ ...e, races: [...(e.races ?? [])].sort((a, b) => a.race_no - b.race_no) }));
  } catch { return null; }
}

/** Every entry in the event's races. */
export async function eventEntries(ev: SimEvent): Promise<ChallengeEntry[] | null> {
  try {
    if (!ev.races.length) return [];
    const supabase = await db();
    const { data, error } = await supabase.from('sim_challenge_entries')
      .select('id, challenge_id, user_id, display_name, sail_number, place, status, elapsed_s, summary, sailed_at')
      .in('challenge_id', ev.races.map(r => r.id)).limit(2000);
    if (error) return null;
    return (data ?? []) as ChallengeEntry[];
  } catch { return null; }
}

export interface NewEvent {
  clubId: string | null;
  title: string;
  description?: string;
  tries: 'first' | 'best';
  drops: number[];
  races: { settings: RaceSettings; opens: Date; closes: Date }[];
}

/** Set up an event and its races (club admins for their club; super admins for every club). */
export async function createEvent(a: Account, e: NewEvent): Promise<SimEvent | string> {
  try {
    const supabase = await db();
    const { data: ev, error } = await supabase.from('sim_events').insert({
      club_id: e.clubId, title: e.title.trim(), description: e.description?.trim() || null,
      tries: e.tries, drops: e.drops, created_by: a.userId,
    }).select('id, club_id, title, description, tries, drops, created_at').single();
    if (error || !ev) return error?.message ?? 'Something went wrong';
    const rows = e.races.map((r, k) => {
      const { player: _p, ...settings } = r.settings;
      void _p;
      return {
        club_id: e.clubId, title: `Race ${k + 1}`, settings, opens_at: r.opens.toISOString(), closes_at: r.closes.toISOString(),
        created_by: a.userId, event_id: (ev as { id: string }).id, race_no: k + 1,
      };
    });
    const { data: races, error: rErr } = await supabase.from('sim_challenges').insert(rows).select(RACE_COLS);
    if (rErr) {
      await supabase.from('sim_events').delete().eq('id', (ev as { id: string }).id);
      return rErr.message;
    }
    return { ...(ev as Omit<SimEvent, 'races'>), races: ((races ?? []) as EventRace[]).sort((x, y) => x.race_no - y.race_no) };
  } catch (err) { return err instanceof Error ? err.message : 'Something went wrong'; }
}

/** Remove an event and its races (the club's admins). */
export async function deleteEvent(id: string): Promise<boolean> {
  try {
    const supabase = await db();
    const { error } = await supabase.from('sim_events').delete().eq('id', id);
    return !error;
  } catch { return false; }
}

/**
 * A first-try race: your try starts at the gun. Held on the leaderboard as "started" until you
 * finish (and a DNF if you don't). 'used' when you've already had your try.
 */
export async function startTry(a: Account, race: EventRace, me: { name: string; sail: string | null }): Promise<'ok' | 'used' | 'error'> {
  try {
    const supabase = await db();
    const { error } = await supabase.from('sim_challenge_entries').insert({
      challenge_id: race.id, user_id: a.userId, display_name: me.name.slice(0, 60), sail_number: me.sail, status: 'started', sailed_at: new Date().toISOString(),
    });
    if (!error) return 'ok';
    return error.code === '23505' ? 'used' : 'error';
  } catch { return 'error'; }
}

export { STANDARD_DROPS };
