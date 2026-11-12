// The AlfiePRO Circuit, club season: a pointscore of race days on your home water against a cast
// of invented skippers, then the Club Championship. A race day is several races; you sail at least
// three and the rest can be simulated from how those went. Every day is scored by AlfiePRO's own
// results engine (see series.ts), and a podium earns a medal. The season is kept with your
// training progress, so it follows you to every device. Pure: nothing stored here.
//
// Everyone in the cast is invented, and so are their clubs. Nothing here is written to a club's
// real events or results.
import type { ClassId } from '@/sim/classes';
import type { RaceSettings, SkipperLevel } from '@/sim/types';
import type { WindCharacter, WindStrength } from '@/sim/wind';
import { Rng } from '@/sim/math';
import { STANDARD_DROPS, standings, type SeriesRace, type StandingRow } from './series';

export interface CastMember {
  id: string; name: string;
  /** Her country, as the three letters on a sail. */
  country: string;
  sail: string; hull: string;
  /** How well she sails, as one of the computer's levels. */
  level: SkipperLevel;
  home: string;
}

const c = (id: string, name: string, country: string, sail: string, hull: string, level: SkipperLevel, home: string): CastMember => ({ id, name, country, sail, hull, level, home });
/** The cast: invented skippers from many places. The first dozen are your club mates. */
export const CAST: CastMember[] = [
  c('ridder', 'Tomas Ridder', 'NED', '14', '#F59E0B', 'state', 'Dunmere Pond'),
  c('castellan', 'Mia Castellan', 'ESP', '27', '#EC4899', 'state', 'Dunmere Pond'),
  c('solberg', 'Ari Solberg', 'NOR', '52', '#22D3EE', 'club', 'Dunmere Pond'),
  c('aoyama', 'Kenji Aoyama', 'JPN', '88', '#F43F5E', 'club', 'Dunmere Pond'),
  c('haddad', 'Leila Haddad', 'FRA', '36', '#A78BFA', 'club', 'Dunmere Pond'),
  c('dlamini', 'Sipho Dlamini', 'RSA', '71', '#34D399', 'club', 'Dunmere Pond'),
  c('tamati', 'Rhys Tamati', 'NZL', '09', '#FBBF24', 'club', 'Dunmere Pond'),
  c('varga', 'Ines Varga', 'CRO', '63', '#60A5FA', 'club', 'Dunmere Pond'),
  c('marlow', 'Owen Marlow', 'GBR', '45', '#94A3B8', 'club', 'Dunmere Pond'),
  c('raman', 'Priya Raman', 'CAN', '19', '#FB923C', 'club', 'Dunmere Pond'),
  c('kuiper', 'Bram Kuiper', 'NED', '82', '#4ADE80', 'club', 'Dunmere Pond'),
  c('brennan', 'Niamh Brennan', 'GBR', '30', '#E879F9', 'club', 'Dunmere Pond'),
];
export const castOf = (id: string): CastMember | null => CAST.find(m => m.id === id) ?? null;

export type MedalKind = 'gold' | 'silver' | 'bronze';
export interface Medal { kind: MedalKind; event: string; season: number; cls: ClassId; at: number; /** A title: the Club Championship won. */ trophy?: boolean }

export interface CareerEvent {
  name: string; kind: 'raceday' | 'championship';
  /** Races in the day (twelve at most), and the fewest you must sail yourself. */
  races: number; sail: number;
  wind: WindStrength; character: WindCharacter;
}
/** The club season: six race days of the pointscore, then the Championship. */
export const CLUB_SEASON: CareerEvent[] = [
  { name: 'Pointscore 1', kind: 'raceday', races: 6, sail: 3, wind: 'medium', character: 'steady' },
  { name: 'Pointscore 2', kind: 'raceday', races: 6, sail: 3, wind: 'light', character: 'oscillating' },
  { name: 'Pointscore 3', kind: 'raceday', races: 6, sail: 3, wind: 'medium', character: 'puffy' },
  { name: 'Pointscore 4', kind: 'raceday', races: 6, sail: 3, wind: 'fresh', character: 'oscillating' },
  { name: 'Pointscore 5', kind: 'raceday', races: 6, sail: 3, wind: 'medium', character: 'persistent' },
  { name: 'Pointscore 6', kind: 'raceday', races: 6, sail: 3, wind: 'light', character: 'puffy' },
  { name: 'Club Championship', kind: 'championship', races: 12, sail: 3, wind: 'medium', character: 'oscillating' },
];
export const MAX_RACES = 12, FLEET = 10;
/** You, in every table. */
export const ME = 'me';

export interface RowResult { id: string; place: number | null; code: 'DNF' | 'OCS' | 'DSQ' | null }
export interface DayRace { no: number; sailed: boolean; rows: RowResult[] }
/** A race day under way: the event it's for and the races sailed or simulated so far. */
export interface CareerDay { event: number; races: DayRace[]; startedAt: number }
/** A race day finished: everyone in the order they finished it. */
export interface DayResult { event: number; order: string[]; rank: number; net: number; at: number }

export interface Career {
  cls: ClassId;
  /** The season you're in (1, 2, ...), and the cast you're racing this season. */
  season: number; fleet: string[];
  day: CareerDay | null;
  done: DayResult[];
  medals: Medal[];
  /** Seasons finished: where you came in the pointscore and the Championship. */
  history: { season: number; pointscore: number; championship: number; of: number }[];
  at: number;
}

/** This season's cast: nine of your club mates, the same nine all season. */
function draw(season: number): string[] {
  const rng = new Rng(7919 * season + 13);
  const pool = CAST.map(m => m.id);
  for (let i = pool.length - 1; i > 0; i--) { const j = rng.int(0, i); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  return pool.slice(0, FLEET - 1);
}

export function newCareer(cls: ClassId, now: number): Career {
  return { cls, season: 1, fleet: draw(1), day: null, done: [], medals: [], history: [], at: now };
}

export const fleetOf = (career: Career): CastMember[] => career.fleet.map(castOf).filter((m): m is CastMember => !!m);
/** The event that's next (or under way), and its place in the season. */
export const eventAt = (career: Career): { event: CareerEvent; index: number } => {
  const index = career.day ? career.day.event : Math.min(career.done.length, CLUB_SEASON.length - 1);
  return { event: CLUB_SEASON[index], index };
};

/** The settings for the next race of the day: your set-up, with the day's fleet, breeze and its own seed. */
export function careerRace(career: Career, base: RaceSettings): RaceSettings {
  const { event, index } = eventAt(career);
  const no = (career.day?.races.length ?? 0) + 1;
  return {
    ...base, classId: career.cls, fleetSize: FLEET, level: 'club',
    windStrength: event.wind, windCharacter: event.character, windKnots: undefined,
    cast: fleetOf(career).map(m => ({ name: m.name, sail: m.sail, hull: m.hull, level: m.level })),
    seed: (career.season * 100003 + index * 1009 + no * 31 + 17) >>> 0,
    crew: undefined, seat: undefined, noPlayer: undefined, windShifts: undefined, lineBias: undefined, flatWind: undefined,
  };
}

/** Put a race you've sailed on the day's sheet (opening the day with the first). */
export function recordRace(career: Career, rows: RowResult[], now: number): Career {
  const { index } = eventAt(career);
  const day: CareerDay = career.day ?? { event: index, races: [], startedAt: now };
  if (day.races.length >= CLUB_SEASON[day.event].races) return career;
  return { ...career, day: { ...day, races: [...day.races, { no: day.races.length + 1, sailed: true, rows }] }, at: now };
}

/** How many of the day's races you've sailed, how many are on the sheet, and whether the rest can be simulated. */
export function dayState(career: Career): { event: CareerEvent; index: number; sailed: number; raced: number; left: number; canSimulate: boolean; complete: boolean } {
  const { event, index } = eventAt(career);
  const races = career.day?.races ?? [];
  const sailed = races.filter(r => r.sailed).length, left = event.races - races.length;
  return { event, index, sailed, raced: races.length, left, canSimulate: sailed >= event.sail && left > 0, complete: !!career.day && left === 0 };
}

/**
 * Simulate the races you haven't sailed, from the ones you have: everyone, you included, finishes
 * about where they've been finishing today, give or take. The same day always simulates the same way.
 */
export function simulateRest(career: Career, now: number): Career {
  const st = dayState(career);
  if (!career.day || !st.canSimulate) return career;
  const ids = [ME, ...career.fleet], n = ids.length;
  const sailedRaces = career.day.races.filter(r => r.sailed);
  const mean = new Map(ids.map(id => [id, sailedRaces.reduce((s, r) => s + (r.rows.find(x => x.id === id)?.place ?? n), 0) / sailedRaces.length]));
  const races = [...career.day.races];
  for (let no = races.length + 1; no <= st.event.races; no++) {
    const rng = new Rng((career.season * 9973 + career.day.event * 613 + no * 97 + 5) >>> 0);
    const order = ids.map(id => ({ id, v: mean.get(id)! + rng.gauss() * (0.9 + n * 0.14) })).sort((a, z) => a.v - z.v);
    races.push({ no, sailed: false, rows: order.map((x, k) => ({ id: x.id, place: k + 1, code: null })) });
  }
  return { ...career, day: { ...career.day, races }, at: now };
}

const iso = (k: number) => new Date(Date.UTC(2026, 0, 1, 0, 0, k)).toISOString();
/** The day's sheet as the results engine scores it: a race of the event for each race of the day. */
function sheet(races: DayRace[], names: (id: string) => { name: string; sail: string | null }): SeriesRace[] {
  return races.map(r => ({
    no: r.no, opened: true, open: false,
    entries: r.rows.map((x, k) => ({
      userId: x.id, ...names(x.id), sailedAt: iso(k),
      status: x.place !== null ? 'finished' as const : x.code === 'OCS' ? 'ocs' as const : x.code === 'DSQ' ? 'dsq' as const : 'dnf' as const,
      elapsed: x.place,
    })),
  }));
}

export interface Me { name: string; sail: string }
const namer = (me: Me) => (id: string) => (id === ME ? { name: me.name, sail: me.sail } : { name: castOf(id)?.name ?? id, sail: castOf(id)?.sail ?? null });

/** The race day's standings so far, scored by AlfiePRO (low point; a race dropped once four count, two at eight). */
export function dayStandings(career: Career, me: Me): StandingRow[] {
  return career.day ? standings(sheet(career.day.races, namer(me)), STANDARD_DROPS) : [];
}

/** The pointscore: each race day finished is a race of the season (the Championship is its own title). */
export function seasonStandings(career: Career, me: Me): StandingRow[] {
  const days = career.done.filter(d => CLUB_SEASON[d.event].kind === 'raceday');
  return standings(sheet(days.map((d, k) => ({ no: k + 1, sailed: true, rows: d.order.map((id, i) => ({ id, place: i + 1, code: null })) })), namer(me)), STANDARD_DROPS);
}

/** Close a race day that's complete: its result goes in the season, a podium earns a medal, and after the Championship a new season begins. */
export function finishDay(career: Career, me: Me, now: number): { career: Career; result: DayResult; medal: Medal | null } | null {
  if (!career.day || !dayState(career).complete) return null;
  const rows = dayStandings(career, me);
  const mine = rows.find(r => r.userId === ME);
  if (!mine) return null;
  const event = CLUB_SEASON[career.day.event];
  const result: DayResult = { event: career.day.event, order: rows.map(r => r.userId), rank: mine.rank, net: mine.net, at: now };
  const medal: Medal | null = mine.rank <= 3
    ? { kind: mine.rank === 1 ? 'gold' : mine.rank === 2 ? 'silver' : 'bronze', event: event.name, season: career.season, cls: career.cls, at: now, ...(event.kind === 'championship' && mine.rank === 1 ? { trophy: true } : {}) }
    : null;
  let next: Career = { ...career, day: null, done: [...career.done, result], medals: medal ? [...career.medals, medal] : career.medals, at: now };
  if (event.kind === 'championship') {
    const ps = seasonStandings(next, me).find(r => r.userId === ME)?.rank ?? FLEET;
    next = { ...next, season: career.season + 1, fleet: draw(career.season + 1), done: [], history: [...career.history, { season: career.season, pointscore: ps, championship: mine.rank, of: rows.length }] };
  }
  return { career: next, result, medal };
}

/** Your rival: the skipper next to you in the pointscore (the one above, or below when you lead). Null before a race day is done. */
export function rival(career: Career, me: Me): { skipper: CastMember; ahead: boolean; gap: number } | null {
  const rows = seasonStandings(career, me);
  const i = rows.findIndex(r => r.userId === ME);
  if (i < 0 || rows.length < 2) return null;
  const other = rows[i === 0 ? 1 : i - 1];
  const skipper = castOf(other.userId);
  return skipper ? { skipper, ahead: i !== 0, gap: Math.abs(other.net - rows[i].net) } : null;
}

export const medalCount = (medals: Medal[]): Record<MedalKind, number> => ({ gold: medals.filter(m => m.kind === 'gold').length, silver: medals.filter(m => m.kind === 'silver').length, bronze: medals.filter(m => m.kind === 'bronze').length });

/** The newer of two careers (device and account): the one further on, then the one touched last. */
export function newerCareer(a: Career | undefined, b: Career | undefined): Career | undefined {
  if (!a || !b) return a ?? b;
  const far = (x: Career) => x.season * 1000 + x.done.length * 20 + (x.day?.races.length ?? 0);
  return far(b) > far(a) || (far(b) === far(a) && b.at > a.at) ? b : a;
}

/** A finished race as the day's sheet keeps it. `results` is the engine's, in finishing order; boat 0 is yours and the rest are the season's cast in order. */
export function raceRows(career: Career, results: { boat: number; isPlayer: boolean; status: string; place: number }[]): RowResult[] {
  return results.map(r => {
    const id = r.isPlayer ? ME : career.fleet[r.boat - 1] ?? `b${r.boat}`;
    const code: RowResult['code'] = r.status === 'dsq' ? 'DSQ' : r.status === 'ocs' ? 'OCS' : r.isPlayer && r.status !== 'finished' ? 'DNF' : null;
    // (One of the computer's skippers still racing when the race is called is placed where she lies.)
    return { id, place: code ? null : r.place, code };
  });
}
