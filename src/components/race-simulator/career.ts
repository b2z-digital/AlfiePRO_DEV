// The AlfiePRO Circuit: a club season (a pointscore of race days on your home water, then the Club
// Championship) and, for those who qualify and hold the licence, a Regional season (three ranking
// regattas on the Circuit's own waters, then the two-day Regional Championship), a National season
// (two ranking regattas, then three days of Nationals in heats under HMS) and a World season (a
// lead-up regatta, then four days of the World Championship in heats under SHRS), against a cast of
// invented skippers. Heat events are run by AlfiePRO's own heat systems (see heats.ts). A day is several races; you sail at least three and the rest can be simulated
// from how those went. Every day is scored by AlfiePRO's own
// results engine (see series.ts), and a podium earns a medal. The season is kept with your
// training progress, so it follows you to every device. Pure: nothing stored here.
//
// Everyone in the cast is invented, and so are their clubs. Nothing here is written to a club's
// real events or results.
import type { ClassId } from '@/sim/classes';
import type { RaceSettings, SkipperLevel } from '@/sim/types';
import type { WindCharacter, WindStrength } from '@/sim/wind';
import { Rng } from '@/sim/math';
import { VENUES } from '@/sim/venues';
import { windAt } from '@/sim/venue';
import { STANDARD_DROPS, standings, type SeriesRace, type StandingRow } from './series';
import { SPREAD, heatOf, heatStandings, heatState, simulateUntil, type HeatLog, type HeatSpec } from './heats';

/** The seasons of the Circuit: the club's, then Regional, National and World, each earned from the one below. */
export type Tier = 'club' | 'state' | 'national' | 'world';
export const TIERS: Tier[] = ['club', 'state', 'national', 'world'];
export const TIER_NAME: Record<Tier, string> = { club: 'Club', state: 'Regional', national: 'National', world: 'World' };

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
  // The Regional fleet: skippers from the Circuit's other clubs.
  c('weller', 'Jonas Weller', 'GER', '11', '#38BDF8', 'national', 'Lantern Quay'),
  c('okafor', 'Maya Okafor', 'GBR', '23', '#F97316', 'national', 'Aurel Lake'),
  c('lindqvist', 'Freya Lindqvist', 'SWE', '58', '#FACC15', 'national', 'Kestrelwater'),
  c('bianchetti', 'Luca Bianchetti', 'ITA', '77', '#EF4444', 'state', 'Lantern Quay'),
  c('kovar', 'Hana Kovar', 'CZE', '34', '#C084FC', 'state', 'Heron Reach'),
  c('ferran', 'Mateo Ferran', 'ARG', '92', '#2DD4BF', 'state', 'Aurel Lake'),
  c('sione', 'Tavita Sione', 'SAM', '16', '#FB7185', 'state', 'Heron Reach'),
  c('tanabe', 'Yuki Tanabe', 'JPN', '41', '#A3E635', 'state', 'Kestrelwater'),
  c('roux', 'Camille Roux', 'FRA', '65', '#818CF8', 'state', 'Lantern Quay'),
  c('salas', 'Diego Salas', 'ESP', '08', '#F472B6', 'state', 'Aurel Lake'),
  c('wikaire', 'Aroha Wikaire', 'NZL', '53', '#22C55E', 'state', 'Heron Reach'),
  c('antunes', 'Pedro Antunes', 'POR', '29', '#EAB308', 'state', 'Kestrelwater'),
  c('akerlund', 'Sven Akerlund', 'SWE', '86', '#0EA5E9', 'state', 'Aurel Lake'),
  c('mokoena', 'Zanele Mokoena', 'RSA', '47', '#E11D48', 'state', 'Lantern Quay'),
  c('dahl', 'Henrik Dahl', 'DEN', '74', '#14B8A6', 'club', 'Kestrelwater'),
  c('menon', 'Ravi Menon', 'IND', '38', '#D946EF', 'club', 'Heron Reach'),
  // The National fleet's own: skippers who win their regions.
  c('brandt', 'Nils Brandt', 'GER', '24', '#3B82F6', 'national', 'Skerry Sound'),
  c('ferreira', 'Ana Ferreira', 'BRA', '62', '#F59E0B', 'national', 'Tamarind Lagoon'),
  c('kowalczyk', 'Marek Kowalczyk', 'POL', '17', '#10B981', 'national', 'Skerry Sound'),
  c('hartmann', 'Elise Hartmann', 'SUI', '43', '#EC4899', 'national', 'Port Meridian'),
  c('obi', 'Chidi Obi', 'NGR', '81', '#8B5CF6', 'national', 'Tamarind Lagoon'),
  c('varela', 'Lucia Varela', 'URU', '35', '#06B6D4', 'national', 'Aurel Lake'),
  c('nakamura', 'Daichi Nakamura', 'JPN', '68', '#EF4444', 'national', 'Port Meridian'),
  c('lund', 'Ingrid Lund', 'NOR', '12', '#84CC16', 'national', 'Kestrelwater'),
  c('caruso', 'Marco Caruso', 'ITA', '57', '#F97316', 'national', 'Lantern Quay'),
  c('reyes', 'Isabel Reyes', 'MEX', '93', '#14B8A6', 'national', 'Tamarind Lagoon'),
  c('osei', 'Kwame Osei', 'GHA', '26', '#A855F7', 'national', 'Heron Reach'),
  c('moreau', 'Julien Moreau', 'FRA', '79', '#0EA5E9', 'national', 'Skerry Sound'),
  // The world's best: the fleet at the top of the Circuit.
  c('vandenberg', 'Pieter van den Berg', 'NED', '05', '#F43F5E', 'world', 'Port Meridian'),
  c('sorensen', 'Mette Sorensen', 'DEN', '13', '#22D3EE', 'world', 'Skerry Sound'),
  c('ishikawa', 'Haruto Ishikawa', 'JPN', '21', '#FACC15', 'world', 'Port Meridian'),
  c('baptiste', 'Noah Baptiste', 'CAN', '31', '#4ADE80', 'world', 'Heron Reach'),
  c('albrecht', 'Clara Albrecht', 'AUT', '37', '#FB923C', 'world', 'Kestrelwater'),
  c('quinn', 'Declan Quinn', 'IRL', '44', '#60A5FA', 'world', 'Lantern Quay'),
  c('santos', 'Rafael Santos', 'POR', '49', '#E879F9', 'world', 'Tamarind Lagoon'),
  c('petrova', 'Anya Petrova', 'BUL', '51', '#34D399', 'world', 'Aurel Lake'),
  c('haugen', 'Erik Haugen', 'NOR', '55', '#F472B6', 'world', 'Kestrelwater'),
  c('khumalo', 'Thandi Khumalo', 'RSA', '59', '#38BDF8', 'world', 'Port Meridian'),
  c('laurent', 'Sophie Laurent', 'FRA', '60', '#A3E635', 'world', 'Lantern Quay'),
  c('ortega', 'Javier Ortega', 'CHI', '66', '#FB7185', 'world', 'Tamarind Lagoon'),
  c('kimsy', 'Seo-yeon Kim', 'KOR', '72', '#818CF8', 'world', 'Port Meridian'),
  c('whitfield', 'Harriet Whitfield', 'GBR', '76', '#2DD4BF', 'world', 'Skerry Sound'),
  c('tane', 'Manaia Tane', 'NZL', '83', '#FCD34D', 'world', 'Heron Reach'),
  c('novak', 'Tomas Novak', 'SLO', '89', '#C084FC', 'world', 'Aurel Lake'),
  c('greer', 'Callum Greer', 'GBR', '91', '#F87171', 'world', 'Skerry Sound'),
  c('aziz', 'Samir Aziz', 'EGY', '95', '#4ADE80', 'world', 'Tamarind Lagoon'),
  c('holm', 'Astrid Holm', 'SWE', '97', '#FBBF24', 'world', 'Kestrelwater'),
  c('marchetti', 'Giulia Marchetti', 'ITA', '98', '#22C55E', 'world', 'Lantern Quay'),
  c('chen', 'Wei Chen', 'CHN', '03', '#E11D48', 'world', 'Port Meridian'),
];
const CLUB_MATES = CAST.filter(m => m.home === 'Dunmere Pond').map(m => m.id);
const BY_LEVEL = (...ls: SkipperLevel[]) => CAST.filter(m => m.home !== 'Dunmere Pond' && ls.includes(m.level)).map(m => m.id);
/** The Regional fleet: the regions' skippers (the cast as it was before the National fleet joined), and the two best of your own club. */
const REGIONAL = [...CAST.slice(0, 28).filter(m => m.home !== 'Dunmere Pond').map(m => m.id), 'ridder', 'castellan'];
/** Who a season's fleet is drawn from: each group in turn, until the fleet is full. */
const POOL: Record<Tier, string[][]> = {
  club: [CLUB_MATES],
  state: [REGIONAL],
  // (The Nationals: the nations' best, the regions' best, and a few from the world fleet.)
  national: [BY_LEVEL('national'), [...BY_LEVEL('state'), 'ridder', 'castellan'], BY_LEVEL('world')],
  world: [BY_LEVEL('world', 'national'), BY_LEVEL('state')],
};
export const castOf = (id: string): CastMember | null => CAST.find(m => m.id === id) ?? null;

export type MedalKind = 'gold' | 'silver' | 'bronze';
export interface Medal { kind: MedalKind; event: string; season: number; cls: ClassId; at: number; /** A title: the Club Championship won. */ trophy?: boolean }

export interface CareerEvent {
  name: string; kind: 'raceday' | 'regatta' | 'championship';
  /** Boats in the event, you included (not given: the season's fleet). Over sixteen it's sailed in heats. */
  entries?: number;
  /** Sailed in heats: under HMS or SHRS, run by AlfiePRO's heat systems. `races` is then the number of rounds. */
  heat?: HeatSpec;
  /** Races in the event and in each of its days (twelve a day at most), and the fewest you must sail yourself each day. */
  races: number; perDay: number; sail: number;
  wind: WindStrength;
  /** On your home water: what the breeze does. */
  character?: WindCharacter;
  /** One of the Circuit's waters, and which of its winds blows each day. */
  water?: string; picks?: number[];
}
/** The club season: six race days of the pointscore, then the Championship. */
export const CLUB_SEASON: CareerEvent[] = [
  { name: 'Pointscore 1', kind: 'raceday', races: 6, perDay: 6, sail: 3, wind: 'medium', character: 'steady' },
  { name: 'Pointscore 2', kind: 'raceday', races: 6, perDay: 6, sail: 3, wind: 'light', character: 'oscillating' },
  { name: 'Pointscore 3', kind: 'raceday', races: 6, perDay: 6, sail: 3, wind: 'medium', character: 'puffy' },
  { name: 'Pointscore 4', kind: 'raceday', races: 6, perDay: 6, sail: 3, wind: 'fresh', character: 'oscillating' },
  { name: 'Pointscore 5', kind: 'raceday', races: 6, perDay: 6, sail: 3, wind: 'medium', character: 'persistent' },
  { name: 'Pointscore 6', kind: 'raceday', races: 6, perDay: 6, sail: 3, wind: 'light', character: 'puffy' },
  { name: 'Club Championship', kind: 'championship', races: 12, perDay: 12, sail: 3, wind: 'medium', character: 'oscillating' },
];
/** The Regional season: three ranking regattas on the Circuit's waters, then two days at Aurel Lake. */
export const REGIONAL_SEASON: CareerEvent[] = [
  { name: 'Lantern Quay Regatta', kind: 'regatta', races: 8, perDay: 8, sail: 3, wind: 'medium', water: 'circuit-lantern-quay', picks: [0] },
  { name: 'Heron Reach Regatta', kind: 'regatta', races: 8, perDay: 8, sail: 3, wind: 'light', water: 'circuit-heron-reach', picks: [0] },
  { name: 'Kestrelwater Regatta', kind: 'regatta', races: 8, perDay: 8, sail: 3, wind: 'fresh', water: 'circuit-kestrelwater', picks: [0] },
  { name: 'Regional Championship', kind: 'championship', races: 16, perDay: 8, sail: 3, wind: 'medium', water: 'circuit-aurel-lake', picks: [0, 2] },
];
/** The National season: two ranking regattas, then three days of Nationals: 32 boats in three heats under HMS. */
export const NATIONAL_SEASON: CareerEvent[] = [
  { name: 'Skerry Sound Regatta', kind: 'regatta', races: 8, perDay: 8, sail: 3, wind: 'fresh', water: 'circuit-skerry-sound', picks: [0] },
  { name: 'Aurel Lake Regatta', kind: 'regatta', races: 8, perDay: 8, sail: 3, wind: 'medium', water: 'circuit-aurel-lake', picks: [1] },
  { name: 'National Championship', kind: 'championship', entries: 32, heat: { system: 'hms', heats: 3, promotion: 4 }, races: 18, perDay: 6, sail: 3, wind: 'medium', water: 'circuit-tamarind-lagoon', picks: [0, 1, 0] },
];
/** The World season: a lead-up regatta, then the AlfiePRO World Championship: 48 boats in four heats under SHRS, qualifying for two days and finals for two. */
export const WORLD_SEASON: CareerEvent[] = [
  { name: 'Port Meridian Pre-Worlds', kind: 'regatta', races: 8, perDay: 8, sail: 3, wind: 'medium', water: 'circuit-port-meridian', picks: [1] },
  { name: 'AlfiePRO World Championship', kind: 'championship', entries: 48, heat: { system: 'shrs', heats: 4, qualifying: 12 }, races: 24, perDay: 6, sail: 3, wind: 'medium', water: 'circuit-port-meridian', picks: [0, 1, 0, 2] },
];
export const SEASONS: Record<Tier, CareerEvent[]> = { club: CLUB_SEASON, state: REGIONAL_SEASON, national: NATIONAL_SEASON, world: WORLD_SEASON };
/** Boats on the line in a season's regattas, you included (a heat event has its own entries). */
export const TIER_FLEET: Record<Tier, number> = { club: 10, state: 16, national: 16, world: 16 };
/** A finish in the Championship this good qualifies you for the tier above. */
export const QUALIFY: Record<Tier, number> = { club: 3, state: 5, national: 5, world: 0 };
export const tierAbove = (t: Tier): Tier | null => TIERS[TIERS.indexOf(t) + 1] ?? null;
/** The most boats a season ever puts on the water at once (the entries of its biggest event). */
const entriesOf = (tier: Tier): number => Math.max(TIER_FLEET[tier], ...SEASONS[tier].map(e => e.entries ?? 0));
export const MAX_RACES = 12, FLEET = 10;
/** You, in every table. */
export const ME = 'me';

export interface RowResult { id: string; place: number | null; code: 'DNF' | 'OCS' | 'DSQ' | null }
export interface DayRace { no: number; sailed: boolean; rows: RowResult[] }
/** A race day under way: the event it's for and the races sailed or simulated so far (a heat event keeps its heats instead). */
export interface CareerDay { event: number; races: DayRace[]; startedAt: number; heat?: HeatLog }
/** A race day finished: everyone in the order they finished it. */
export interface DayResult { event: number; order: string[]; rank: number; net: number; at: number }

export interface Career {
  cls: ClassId;
  /** The season you're in (1, 2, ...), and the cast you're racing this season. */
  season: number; fleet: string[];
  /** Which season it is: the club's when not given. */
  tier?: Tier;
  /** Qualified for the tier above by your Championship finish, and not yet moved up. */
  ticket?: Tier;
  day: CareerDay | null;
  done: DayResult[];
  medals: Medal[];
  /** Seasons finished: where you came in the pointscore and the Championship. */
  history: { season: number; pointscore: number; championship: number; of: number; tier?: Tier }[];
  at: number;
}

/** This season's cast, the same all season: enough for its biggest event, drawn from its pool (the strongest part of it first). */
function draw(season: number, tier: Tier = 'club'): string[] {
  const rng = new Rng(7919 * season + [13, 4001, 6007, 8009][TIERS.indexOf(tier)]);
  const shuffle = (xs: string[]) => { const a = [...xs]; for (let i = a.length - 1; i > 0; i--) { const j = rng.int(0, i); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  return POOL[tier].flatMap(shuffle).slice(0, entriesOf(tier) - 1);
}
export const tierOf = (career: Career): Tier => career.tier ?? 'club';
export const seasonOf = (career: Career): CareerEvent[] => SEASONS[tierOf(career)];

export function newCareer(cls: ClassId, now: number): Career {
  return { cls, season: 1, fleet: draw(1), day: null, done: [], medals: [], history: [], at: now };
}

export const fleetOf = (career: Career): CastMember[] => career.fleet.map(castOf).filter((m): m is CastMember => !!m);
/** The event that's next (or under way), and its place in the season. */
export const eventAt = (career: Career): { event: CareerEvent; index: number } => {
  const season = seasonOf(career);
  const index = career.day ? career.day.event : Math.min(career.done.length, season.length - 1);
  return { event: season[index], index };
};

/** The breeze for a day of an event on one of the Circuit's waters (null on your home water). */
export function eventWind(event: CareerEvent, day: number): { from: number; name: string; character: WindCharacter; note?: string; water: string; place: string } | null {
  const def = event.water ? VENUES[event.water] : undefined;
  if (!def) return null;
  const w = windAt(def, event.picks?.[Math.min(day, (event.picks?.length ?? 1) - 1)] ?? 0);
  return { from: w.from, name: w.name, character: w.character, note: w.note, water: def.name, place: def.place };
}

/** How good a skipper of the cast is, on the heat systems' scale: her level (Club 0 to World 3), and a little of her own. */
export function castStrength(id: string): number {
  const m = castOf(id);
  if (!m) return 0;
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return TIERS.indexOf(m.level as Tier) + ((h % 1000) / 1000 - 0.5) * 0.7;
}
/** An approximate inverse of the normal curve (for turning a share of a heat beaten into a strength). */
const probit = (p: number) => { const q = Math.min(0.95, Math.max(0.05, p)); const t = Math.sqrt(-2 * Math.log(q < 0.5 ? q : 1 - q)); const z = t - (2.515517 + 0.802853 * t + 0.010328 * t * t) / (1 + 1.432788 * t + 0.189269 * t * t + 0.001308 * t * t * t); return q < 0.5 ? -z : z; };

/** How good you are in this event: from the heats you've sailed in it (who you beat, and how good they were), or, before any, about the level of the season. */
export function myStrength(career: Career): number {
  const log = career.day?.heat;
  const prior = TIERS.indexOf(tierOf(career)) - 0.5;
  const mine = (log?.sails ?? []).filter(s => s.me);
  if (!log || !mine.length) return prior;
  const me = log.ids.indexOf(ME);
  const est = mine.map(s => {
    const all = [...s.o, ...(s.x ?? []).map(([i]) => i)], others = all.filter(i => i !== me);
    const at = s.o.indexOf(me);
    const beat = at < 0 ? 0 : (others.length - at) / Math.max(1, others.length);
    const m = others.reduce((sum, i) => sum + castStrength(log.ids[i]), 0) / Math.max(1, others.length);
    return m + SPREAD * Math.SQRT2 * probit(beat);
  });
  return est.reduce((s, x) => s + x, 0) / est.length;
}
const strengthFor = (career: Career, log: HeatLog) => { const mine = myStrength(career); return (i: number) => (log.ids[i] === ME ? mine : castStrength(log.ids[i])); };
const heatSeed = (career: Career, index: number) => (career.season * 7907 + index * 389 + TIERS.indexOf(tierOf(career)) * 104729) >>> 0;

/** Begin a heat event: everyone in it, seeded by ranking (the strongest first, you where your level puts you). */
function openHeats(career: Career, event: CareerEvent): HeatLog {
  const ids = [ME, ...career.fleet.slice(0, (event.entries ?? TIER_FLEET[tierOf(career)]) - 1)];
  const prior = TIERS.indexOf(tierOf(career)) - 0.5;
  return { ids: ids.sort((a, z) => (z === ME ? prior : castStrength(z)) - (a === ME ? prior : castStrength(a))), sails: [] };
}

/**
 * Before you sail in a heat event: open it if it isn't yet, and sail (simulate) the heats that come
 * before yours in the round, so the next heat is the one you're in. Not a heat event: as it was.
 */
export function prepareRace(career: Career, now: number): Career {
  const { event, index } = eventAt(career);
  if (!event.heat) return career;
  const day: CareerDay = career.day ?? { event: index, races: [], startedAt: now, heat: openHeats(career, event) };
  const c0 = { ...career, day };
  const log = simulateUntil(event.heat, day.heat!, strengthFor(c0, day.heat!), heatSeed(career, index), st => st.mine, event.races);
  return { ...c0, day: { ...day, heat: log }, at: now };
}

/** In a heat event: the round, your heat and who's in it (null when it isn't one, or before it's opened). */
export function heatNow(career: Career): { round: number; rounds: number; heat: string | null; ids: string[]; finals: boolean; spec: HeatSpec } | null {
  const { event } = eventAt(career);
  const log = career.day?.heat;
  if (!event.heat || !log) return null;
  const st = heatState(event.heat, log);
  return { round: st.round, rounds: event.races, heat: st.mine ? st.next : st.myHeat, ids: st.next ? heatOf(st, st.next).map(i => log.ids[i]) : [], finals: st.finals, spec: event.heat };
}

/** The settings for the next race of the day: your set-up, with the day's fleet (in a heat event, your heat), water, breeze and its own seed. */
export function careerRace(career: Career, base: RaceSettings): RaceSettings {
  const { event, index } = eventAt(career);
  const hn = heatNow(career);
  const no = hn ? hn.round : (career.day?.races.length ?? 0) + 1;
  const wind = eventWind(event, Math.floor((no - 1) / event.perDay));
  const others = hn ? hn.ids.filter(id => id !== ME) : career.fleet.slice(0, TIER_FLEET[tierOf(career)] - 1);
  return {
    ...base, classId: career.cls, fleetSize: others.length + 1, level: tierOf(career),
    windStrength: event.wind, windCharacter: wind?.character ?? event.character ?? 'oscillating', windKnots: undefined,
    ...(wind ? { venue: event.water, windFrom: wind.from, venueSpot: undefined } : {}),
    cast: others.map(castOf).filter((m): m is CastMember => !!m).map(m => ({ id: m.id, name: m.name, sail: m.sail, hull: m.hull, level: m.level })),
    seed: (career.season * 100003 + index * 1009 + no * 31 + (hn?.heat ? hn.heat.charCodeAt(0) * 7 : 0) + [17, 7001, 9001, 11003][TIERS.indexOf(tierOf(career))]) >>> 0,
    crew: undefined, seat: undefined, noPlayer: undefined, windShifts: undefined, lineBias: undefined, flatWind: undefined,
  };
}

/** Put a race you've sailed on the day's sheet (opening the day with the first). In a heat event: your heat, and then the heats after it, unless you've been promoted into the next one up. */
export function recordRace(career: Career, rows: RowResult[], now: number): Career {
  const { event, index } = eventAt(career);
  if (event.heat) {
    const c = prepareRace(career, now), log = c.day!.heat!;
    const st = heatState(event.heat, log);
    if (!st.next || !st.mine) return c;
    const idx = (id: string) => log.ids.indexOf(id);
    const fin = rows.filter(r => r.place !== null && idx(r.id) >= 0).sort((a, z) => a.place! - z.place!);
    const sail = { r: st.round, h: st.next, o: fin.map(r => idx(r.id)), x: rows.filter(r => r.place === null && idx(r.id) >= 0).map(r => [idx(r.id), r.code ?? 'DNF'] as [number, 'DNF' | 'OCS' | 'DSQ']), me: true };
    const after = { ...log, sails: [...log.sails, sail] };
    const c2 = { ...c, day: { ...c.day!, heat: after } };
    const round = st.round;
    const next = simulateUntil(event.heat, after, strengthFor(c2, after), heatSeed(c2, index), s => s.mine || s.round > round, event.races);
    return { ...c2, day: { ...c2.day, heat: next }, at: now };
  }
  const day: CareerDay = career.day ?? { event: index, races: [], startedAt: now };
  if (day.races.length >= seasonOf(career)[day.event].races) return career;
  return { ...career, day: { ...day, races: [...day.races, { no: day.races.length + 1, sailed: true, rows }] }, at: now };
}

export interface DayState {
  event: CareerEvent; index: number;
  /** Races you've sailed in the event, races on its sheet, and races still to go in it. */
  sailed: number; raced: number; left: number;
  /** Today (0 is the first day), the event's days, and today's races: sailed by you, and still to go. */
  day: number; days: number; sailedToday: number; leftToday: number;
  /** Enough of today sailed that the rest of it can be simulated. */
  canSimulate: boolean;
  /** Every race of the event is on the sheet. */
  complete: boolean;
}

/** Where the event stands: what's been sailed, what's left today and in all, and whether the rest of today can be simulated. */
export function dayState(career: Career): DayState {
  const { event, index } = eventAt(career);
  const days = Math.ceil(event.races / event.perDay);
  let raced: number, sailedRounds: number[];
  if (event.heat && career.day?.heat) {
    // A heat event: a round counts when all its heats are sailed; you've sailed it if you sailed any of its heats.
    const log = career.day.heat;
    raced = heatState(event.heat, log).complete;
    sailedRounds = [...new Set(log.sails.filter(s => s.me).map(s => s.r))];
  } else {
    const races = career.day?.races ?? [];
    raced = races.length;
    sailedRounds = races.filter(r => r.sailed).map(r => r.no);
  }
  const left = event.races - raced;
  const day = Math.min(days - 1, Math.floor(raced / event.perDay));
  const sailedToday = sailedRounds.filter(n => n > day * event.perDay && n <= (day + 1) * event.perDay).length;
  const leftToday = left === 0 ? 0 : (day + 1) * event.perDay - raced;
  return { event, index, sailed: sailedRounds.length, raced, left, day, days, sailedToday, leftToday, canSimulate: sailedToday >= event.sail && leftToday > 0, complete: !!career.day && left === 0 };
}

/**
 * Simulate the rest of today's races from the ones you've sailed in the event: everyone, you
 * included, finishes about where they've been finishing, give or take. The same day always simulates the same way.
 */
export function simulateRest(career: Career, now: number): Career {
  const st = dayState(career);
  if (!career.day || !st.canSimulate) return career;
  if (st.event.heat && career.day.heat) {
    const end = (st.day + 1) * st.event.perDay, log = career.day.heat;
    return { ...career, day: { ...career.day, heat: simulateUntil(st.event.heat, log, strengthFor(career, log), heatSeed(career, st.index) + 50021, s => s.complete >= end, st.event.races) }, at: now };
  }
  const ids = [ME, ...career.fleet], n = ids.length;
  const sailedRaces = career.day.races.filter(r => r.sailed);
  const mean = new Map(ids.map(id => [id, sailedRaces.reduce((s, r) => s + (r.rows.find(x => x.id === id)?.place ?? n), 0) / sailedRaces.length]));
  const races = [...career.day.races];
  for (let no = races.length + 1, last = races.length + st.leftToday; no <= last; no++) {
    const rng = new Rng((career.season * 9973 + career.day.event * 613 + no * 97 + (tierOf(career) === 'club' ? 5 : 3301)) >>> 0);
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
  if (!career.day) return [];
  const { event } = eventAt(career);
  if (event.heat && career.day.heat) return heatStandings(event.heat, career.day.heat, namer(me)).rows;
  return standings(sheet(career.day.races, namer(me)), STANDARD_DROPS);
}

/** In a heat event: each skipper's heat in each round finished (for the sheet). */
export function dayHeats(career: Career, me: Me): Record<string, (string | null)[]> | null {
  const { event } = eventAt(career);
  return event.heat && career.day?.heat ? heatStandings(event.heat, career.day.heat, namer(me)).heats : null;
}

/** The pointscore (the ranking, in a Regional season): each event finished is a race of the season; the Championship is its own title. */
export function seasonStandings(career: Career, me: Me): StandingRow[] {
  const days = career.done.filter(d => seasonOf(career)[d.event].kind !== 'championship');
  return standings(sheet(days.map((d, k) => ({ no: k + 1, sailed: true, rows: d.order.map((id, i) => ({ id, place: i + 1, code: null })) })), namer(me)), STANDARD_DROPS);
}

/** Close a race day that's complete: its result goes in the season, a podium earns a medal, and after the Championship a new season begins. */
export function finishDay(career: Career, me: Me, now: number): { career: Career; result: DayResult; medal: Medal | null } | null {
  if (!career.day || !dayState(career).complete) return null;
  const rows = dayStandings(career, me);
  const mine = rows.find(r => r.userId === ME);
  if (!mine) return null;
  const tier = tierOf(career), event = seasonOf(career)[career.day.event];
  const result: DayResult = { event: career.day.event, order: rows.map(r => r.userId), rank: mine.rank, net: mine.net, at: now };
  const medal: Medal | null = mine.rank <= 3
    ? { kind: mine.rank === 1 ? 'gold' : mine.rank === 2 ? 'silver' : 'bronze', event: event.name, season: career.season, cls: career.cls, at: now, ...(event.kind === 'championship' && mine.rank === 1 ? { trophy: true } : {}) }
    : null;
  let next: Career = { ...career, day: null, done: [...career.done, result], medals: medal ? [...career.medals, medal] : career.medals, at: now };
  if (event.kind === 'championship') {
    const ps = seasonStandings(next, me).find(r => r.userId === ME)?.rank ?? rows.length;
    // A finish this good in the Championship is a place in the season above (taken up with the licence: see moveUp).
    const up = tierAbove(tier);
    const ticket: Tier | undefined = up && mine.rank <= QUALIFY[tier] && TIERS.indexOf(up) > TIERS.indexOf(career.ticket ?? tier) ? up : career.ticket;
    next = { ...next, season: career.season + 1, fleet: draw(career.season + 1, tier), done: [], ...(ticket ? { ticket } : {}), history: [...career.history, { season: career.season, pointscore: ps, championship: mine.rank, of: rows.length, tier }] };
  }
  return { career: next, result, medal };
}

/** Take up a place in the tier above (between events only): a new season there, against its fleet. */
export function moveUp(career: Career, now: number): Career {
  if (!career.ticket || career.day) return career;
  const tier = career.ticket;
  const { ticket: _used, ...rest } = career;
  void _used;
  return { ...rest, tier, season: career.season + (career.done.length ? 1 : 0), fleet: draw(career.season + (career.done.length ? 1 : 0), tier), done: [], at: now };
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
  const far = (x: Career) => TIERS.indexOf(x.tier ?? 'club') * 100000 + x.season * 1000 + x.done.length * 20 + (x.day?.races.length ?? 0) + (x.day?.heat?.sails.length ?? 0) / 100;
  return far(b) > far(a) || (far(b) === far(a) && b.at > a.at) ? b : a;
}

/** A finished race as the day's sheet keeps it. `results` is the engine's, in finishing order; boat 0 is yours and the rest are the race's cast in order (`castIds`; not given: the season's). */
export function raceRows(career: Career, results: { boat: number; isPlayer: boolean; status: string; place: number }[], castIds?: (string | undefined)[]): RowResult[] {
  return results.map(r => {
    const id = r.isPlayer ? ME : castIds?.[r.boat - 1] ?? career.fleet[r.boat - 1] ?? `b${r.boat}`;
    const code: RowResult['code'] = r.status === 'dsq' ? 'DSQ' : r.status === 'ocs' ? 'OCS' : r.isPlayer && r.status !== 'finished' ? 'DNF' : null;
    // (One of the computer's skippers still racing when the race is called is placed where she lies.)
    return { id, place: code ? null : r.place, code };
  });
}
