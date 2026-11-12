// The AlfiePRO Circuit: a club season (a pointscore of race days on your home water, then the Club
// Championship) and, for those who qualify and hold the licence, a Regional season (three ranking
// regattas in your home state, then the two-day State Championship on its main water), a National
// season (two ranking regattas, then three days of the Australian Championship in heats under HMS)
// and a World season (the Oceania Championship in New Zealand, then four days of the World
// Championship in heats under SHRS), on the clubs' real waters (see circuitWaters.ts), against a cast of
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
import { windAt, type Region } from '@/sim/venue';
import { NATIONAL_POOL, NATIONAL_ROTATION, OCEANIA_WATER, REGION_TITLE, REGION_WATERS, REAL_WATERS, WORLD_ROTATION, regionalPool, waterName } from './circuitWaters';
import { STANDARD_DROPS, standings, type SeriesRace, type StandingRow } from './series';
import type { Cause } from './ledger';
import type { TrainLink } from './stats';
import { WON_COLOURS } from './yacht';
import { dayWeather, kindOf, type DayWeather, type RaceConditions } from './conditions';
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
  /** Game money: the entry fee, and the prize for first, second and third. */
  fee?: number; prize?: [number, number, number];
}
/** The club season: six race days of the pointscore, then the Championship. */
export const CLUB_SEASON: CareerEvent[] = [
  { name: 'Pointscore 1', kind: 'raceday', races: 6, perDay: 6, sail: 3, prize: [60, 40, 20], wind: 'medium', character: 'steady' },
  { name: 'Pointscore 2', kind: 'raceday', races: 6, perDay: 6, sail: 3, prize: [60, 40, 20], wind: 'light', character: 'oscillating' },
  { name: 'Pointscore 3', kind: 'raceday', races: 6, perDay: 6, sail: 3, prize: [60, 40, 20], wind: 'medium', character: 'puffy' },
  { name: 'Pointscore 4', kind: 'raceday', races: 6, perDay: 6, sail: 3, prize: [60, 40, 20], wind: 'fresh', character: 'oscillating' },
  { name: 'Pointscore 5', kind: 'raceday', races: 6, perDay: 6, sail: 3, prize: [60, 40, 20], wind: 'medium', character: 'persistent' },
  { name: 'Pointscore 6', kind: 'raceday', races: 6, perDay: 6, sail: 3, prize: [60, 40, 20], wind: 'light', character: 'puffy' },
  { name: 'Club Championship', kind: 'championship', races: 12, perDay: 12, sail: 3, prize: [200, 120, 60], wind: 'medium', character: 'oscillating' },
];
/** The Regional season: three ranking regattas on the Circuit's waters, then two days at Aurel Lake. */
export const REGIONAL_SEASON: CareerEvent[] = [
  { name: 'Lantern Quay Regatta', kind: 'regatta', fee: 150, prize: [300, 200, 100], races: 8, perDay: 8, sail: 3, wind: 'medium', water: 'circuit-lantern-quay', picks: [0] },
  { name: 'Heron Reach Regatta', kind: 'regatta', fee: 150, prize: [300, 200, 100], races: 8, perDay: 8, sail: 3, wind: 'light', water: 'circuit-heron-reach', picks: [0] },
  { name: 'Kestrelwater Regatta', kind: 'regatta', fee: 150, prize: [300, 200, 100], races: 8, perDay: 8, sail: 3, wind: 'fresh', water: 'circuit-kestrelwater', picks: [0] },
  { name: 'Regional Championship', kind: 'championship', fee: 300, prize: [600, 400, 200], races: 16, perDay: 8, sail: 3, wind: 'medium', water: 'circuit-aurel-lake', picks: [0, 2] },
];
/** The National season: two ranking regattas, then three days of Nationals: 32 boats in three heats under HMS. */
export const NATIONAL_SEASON: CareerEvent[] = [
  { name: 'Skerry Sound Regatta', kind: 'regatta', fee: 300, prize: [600, 400, 200], races: 8, perDay: 8, sail: 3, wind: 'fresh', water: 'circuit-skerry-sound', picks: [0] },
  { name: 'Aurel Lake Regatta', kind: 'regatta', fee: 300, prize: [600, 400, 200], races: 8, perDay: 8, sail: 3, wind: 'medium', water: 'circuit-aurel-lake', picks: [1] },
  { name: 'National Championship', kind: 'championship', fee: 600, prize: [1200, 800, 400], entries: 32, heat: { system: 'hms', heats: 3, promotion: 4 }, races: 18, perDay: 6, sail: 3, wind: 'medium', water: 'circuit-tamarind-lagoon', picks: [0, 1, 0] },
];
/** The World season: a lead-up regatta, then the AlfiePRO World Championship: 48 boats in four heats under SHRS, qualifying for two days and finals for two. */
export const WORLD_SEASON: CareerEvent[] = [
  { name: 'Port Meridian Pre-Worlds', kind: 'regatta', fee: 600, prize: [1200, 800, 400], races: 8, perDay: 8, sail: 3, wind: 'medium', water: 'circuit-port-meridian', picks: [1] },
  { name: 'AlfiePRO World Championship', kind: 'championship', fee: 1500, prize: [3000, 2000, 1000], entries: 48, heat: { system: 'shrs', heats: 4, qualifying: 12 }, races: 24, perDay: 6, sail: 3, wind: 'medium', water: 'circuit-port-meridian', picks: [0, 1, 0, 2] },
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
/**
 * One race of the day as you sailed it, for Alfie's report: where you came, your start, and the
 * lengths you gave away by cause (from the race's ledger, when it has one).
 */
export interface RaceNote {
  place: number | null; of: number; status: 'finished' | 'dsq' | 'ocs' | 'dnf' | 'racing';
  late: number | null; ocs: boolean; penalties: number;
  parts?: { cause: Cause; lengths: number }[]; speedUp?: number; tacks?: number;
}
/** A race day under way: the event it's for and the races sailed or simulated so far (a heat event keeps its heats instead), and notes on the races you sailed. */
export interface CareerDay {
  event: number; races: DayRace[]; startedAt: number; heat?: HeatLog; notes?: RaceNote[];
  /** How this Championship is sailed, fixed when it opens (a change of mind applies to the next one). */
  pick?: HeatChoice;
}
/** You against one of the cast, over every event you've both finished: days you finished ahead and behind, and the last time. */
export interface HeadToHead { w: number; l: number; last?: { event: string; season: number; me: number; them: number } }
/** Alfie's report on an event, written when it ends. */
export interface Report {
  season: number; tier: Tier; event: string; at: number; rank: number; of: number;
  headline: string; paras: string[];
  /** What to work on, and the practice for it. */
  work?: { cause: Cause; text: string; link: TrainLink };
}
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
  /** Game money (it can go below nothing: an entry you couldn't cover is paid from your next winnings), what you've bought or won, this season's sponsor, and the latest comings and goings. */
  money?: number; owned?: string[]; sponsor?: Deal; ledger?: Entry[];
  /** Seasons sailed in this tier before this one: each redraws the calendar (see calendarOf). Not given: the first. */
  calendar?: number;
  /**
   * Sailed on the clubs' real waters (every season begun since they came; one already under way keeps
   * the invented waters until it ends), and your home state for the Regional season, worked out from
   * your club's water when the season began (New South Wales when there was none to go on).
   */
  real?: boolean; home?: Region;
  /** Every meeting with each of the cast (by id), across seasons and tiers: who finished ahead. */
  h2h?: Record<string, HeadToHead>;
  /** Your rival, once there's history to choose one: kept until someone else is clearly closer. */
  rivalId?: string;
  /** Alfie's reports on your events, newest first (the last dozen). */
  reports?: Report[];
  /** How each tier's Championship is sailed: one fleet, or heats under HMS or SHRS (see HEAT_DEFAULT). */
  heats?: HeatPrefs;
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
/** Where each tier's lead-up regattas can be sailed. A new season in the same tier moves them round these. */
const LEAD_WATERS: Record<Tier, string[]> = {
  club: [],
  state: ['circuit-lantern-quay', 'circuit-heron-reach', 'circuit-kestrelwater', 'circuit-skerry-sound'],
  national: ['circuit-skerry-sound', 'circuit-aurel-lake', 'circuit-kestrelwater', 'circuit-heron-reach'],
  world: ['circuit-port-meridian', 'circuit-tamarind-lagoon', 'circuit-skerry-sound'],
};
const WATER_NAME: Record<string, string> = {
  'circuit-lantern-quay': 'Lantern Quay', 'circuit-heron-reach': 'Heron Reach', 'circuit-kestrelwater': 'Kestrelwater', 'circuit-aurel-lake': 'Aurel Lake',
  'circuit-skerry-sound': 'Skerry Sound', 'circuit-tamarind-lagoon': 'Tamarind Lagoon', 'circuit-port-meridian': 'Port Meridian',
};
const BREEZES: CareerEvent['wind'][] = ['medium', 'light', 'fresh'];

/** Where a season on the real waters is: your home state, and whether it is (a season begun before them has neither). */
export interface Where { real?: boolean; home?: Region }

/** A tier's season on the clubs' real waters, in its nth season there (see calendarOf). */
function realCalendar(tier: Tier, redraw: number, home: Region): CareerEvent[] {
  const base = SEASONS[tier];
  const breeze = (i: number) => (redraw > 0 ? BREEZES[(i + redraw) % BREEZES.length] : base[i].wind);
  const regatta = (e: CareerEvent, i: number, water: string, name = `${waterName(water)} Regatta`): CareerEvent => ({ ...e, water, name, wind: breeze(i) });
  if (tier === 'state') {
    const pool = regionalPool(home), main = REGION_WATERS[home][0];
    return base.map((e, i) => (e.kind === 'regatta' ? regatta(e, i, pool[(i + 3 * redraw) % pool.length]) : { ...e, water: main, name: REGION_TITLE[home] }));
  }
  if (tier === 'national') {
    const champ = NATIONAL_ROTATION[redraw % NATIONAL_ROTATION.length];
    const pool = NATIONAL_POOL.filter(w => w !== champ);
    return base.map((e, i) => (e.kind === 'regatta' ? regatta(e, i, pool[(i + 2 * redraw) % pool.length]) : { ...e, water: champ, name: 'Australian Championship' }));
  }
  const worlds = WORLD_ROTATION[redraw % WORLD_ROTATION.length];
  return base.map((e, i) => (e.kind === 'regatta' ? regatta(e, i, OCEANIA_WATER, 'Oceania Championship') : { ...e, water: worlds, name: 'World Championship' }));
}

/**
 * A tier's calendar in its nth season there (0: the first). Each new season redraws it: the lead-up
 * regattas move round the Circuit's waters with new breezes, and the club's race days swap theirs,
 * so a second season isn't the first again. On the real waters the Regional season is sailed in your
 * home state and ends with its State Championship on the state's main water; the Australian
 * Championship and the World Championship move round the main waters a season at a time. On the
 * invented waters the Championship stays where it is, with its title to defend.
 */
export function calendarOf(tier: Tier, redraw = 0, where: Where = {}): CareerEvent[] {
  const base = SEASONS[tier];
  if (where.real && tier !== 'club') return realCalendar(tier, Math.max(0, redraw), where.home ?? 'NSW');
  if (redraw <= 0) return base;
  if (tier === 'club') {
    const days = base.filter(e => e.kind === 'raceday');
    return base.map((e, i) => {
      if (e.kind !== 'raceday') return e;
      const from = days[(i + redraw) % days.length];
      return { ...e, wind: from.wind, character: from.character };
    });
  }
  const pool = LEAD_WATERS[tier];
  return base.map((e, i) => {
    if (e.kind !== 'regatta') return e;
    const water = pool[(i + redraw) % pool.length];
    return { ...e, water, name: `${WATER_NAME[water]} ${tier === 'world' ? 'Pre-Worlds' : 'Regatta'}`, wind: BREEZES[(i + redraw) % BREEZES.length] };
  });
}
export const seasonOf = (career: Career): CareerEvent[] => {
  const tier = tierOf(career), cal = calendarOf(tier, career.calendar ?? 0, career);
  if (tier === 'club') return cal;
  const out = cal.map((e, i) => (e.kind === 'championship' ? withHeats(e, tier, career.day?.event === i && career.day.pick ? career.day.pick : heatPick(career, tier)) : e));
  // Nothing changed (the formats as the calendar has them): the calendar itself.
  return out.every((e, i) => e === cal[i]) ? cal : out;
};

// ───────────────────────── How Championships are sailed ─────────────────────────

/** A Championship in one fleet, or in heats under HMS or SHRS. */
export type HeatChoice = 'fleet' | 'hms' | 'shrs';
export type HeatTier = Exclude<Tier, 'club'>;
export type HeatPrefs = Partial<Record<HeatTier, HeatChoice>>;
/** As the Circuit has always sailed them: the Regional in one fleet, the Nationals under HMS, the Worlds under SHRS. */
export const HEAT_DEFAULT: Record<HeatTier, HeatChoice> = { state: 'fleet', national: 'hms', world: 'shrs' };
/** What each tier's Championship can be sailed as: 32 or 48 boats are always in heats. */
export const HEAT_OPTIONS: Record<HeatTier, HeatChoice[]> = { state: ['fleet', 'hms', 'shrs'], national: ['hms', 'shrs'], world: ['shrs', 'hms'] };
/** How many heats each Championship is split into (the Regional's 16 boats: two heats of eight). */
const HEAT_COUNT: Record<HeatTier, number> = { state: 2, national: 3, world: 4 };
export const heatPick = (career: Career, tier: Tier): HeatChoice => (tier === 'club' ? 'fleet' : career.heats?.[tier] && HEAT_OPTIONS[tier].includes(career.heats[tier]!) ? career.heats[tier]! : HEAT_DEFAULT[tier]);

/** A Championship as it's to be sailed: in one fleet, or in heats (HMS promoting four; SHRS qualifying for half the rounds, then finals). */
export function withHeats(e: CareerEvent, tier: Tier, pick: HeatChoice): CareerEvent {
  if (tier === 'club' || e.kind !== 'championship') return e;
  if (pick === 'fleet') { if (!e.heat) return e; const { heat: _h, ...rest } = e; void _h; return rest; }
  if (e.heat?.system === pick) return e;
  const heats = HEAT_COUNT[tier];
  const heat: HeatSpec = pick === 'hms' ? { system: 'hms', heats, promotion: 4 } : { system: 'shrs', heats, qualifying: Math.round(e.races / 2) };
  return { ...e, heat };
}
/** Set how a tier's Championship is sailed (one already under way keeps its format). */
export function setHeats(career: Career, tier: HeatTier, pick: HeatChoice, now: number): Career {
  // A Championship already opened keeps the format it opened with.
  const d = career.day, open = d && !d.pick && tierOf(career) === tier && seasonOf(career)[d.event]?.kind === 'championship';
  return { ...career, ...(open ? { day: { ...d!, pick: heatPick(career, tier) } } : {}), heats: { ...(career.heats ?? {}), [tier]: pick }, at: now };
}
/** Won this tier's Championship last season, and racing it again: the title to defend. */
export const defending = (career: Career): boolean => {
  const last = career.history[career.history.length - 1];
  return !!last && (last.tier ?? 'club') === tierOf(career) && last.championship === 1;
};

/** A new career, in the club season: on the real waters, with your home state when your club's water says it. */
export function newCareer(cls: ClassId, now: number, home?: Region | null): Career {
  return { cls, season: 1, fleet: draw(1), day: null, done: [], medals: [], history: [], at: now, money: START_MONEY, owned: [], sponsor: deal('club', 1), ledger: [], real: true, ...(home ? { home } : {}) };
}
/** A season beginning: on the real waters from now on, with your home state worked out again (kept when there's nothing to go on). */
const begin = (c: Career, home: Region | null | undefined): Pick<Career, 'real' | 'home'> => ({ real: true, ...(home ?? c.home ? { home: (home ?? c.home)! } : {}) });

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
  return { from: w.from, name: w.name, character: w.character, note: w.note, water: REAL_WATERS[def.id] ? waterName(def.id) : def.name, place: def.place };
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
  const day: CareerDay = career.day ?? { event: index, races: [], startedAt: now, heat: openHeats(career, event), pick: heatPick(career, tierOf(career)) };
  const c0 = { ...(career.day ? career : payEntry(career, event, now)), day };
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


// ───────────────────────── Money: sponsors, entries, prizes, the shop ─────────────────────────
// Game money only: nothing is ever bought with real money, and nothing bought or won makes a boat
// faster. What can be bought is paint (class-legal on every class: see the career design doc) and,
// for an IOM, the B rig, the one real piece of kit, which you need to sail a fresh day properly.

export interface Entry { at: number; text: string; amount: number }
export type GoalId = 'podium' | 'win' | 'champ';
export interface Goal { id: GoalId; text: string; pay: number }
export interface Sponsor { id: string; name: string; what: string; goals: Goal[] }
/** A season's sponsor, and the goals met so far. */
export interface Deal { sponsor: string; season: number; tier: Tier; met: GoalId[] }

/** The sponsors (invented), one for each season of the Circuit, and what they pay for. */
export const SPONSORS: Record<Tier, Sponsor> = {
  club: { id: 'harbourlight', name: 'Harbourlight Chandlery', what: 'the chandlery by the club', goals: [{ id: 'podium', text: 'A podium at a race day', pay: 100 }, { id: 'win', text: 'Win a race', pay: 60 }, { id: 'champ', text: 'Top five in the Club Championship', pay: 200 }] },
  state: { id: 'fairlead', name: 'Fairlead Sailcloth', what: 'a sailmaker', goals: [{ id: 'podium', text: 'A podium at a ranking regatta', pay: 200 }, { id: 'win', text: 'Win a race', pay: 120 }, { id: 'champ', text: 'Top five at the Regional Championship', pay: 400 }] },
  national: { id: 'bluewake', name: 'Bluewake Marine', what: 'a national boating brand', goals: [{ id: 'podium', text: 'A podium at a ranking regatta', pay: 350 }, { id: 'win', text: 'Win a heat', pay: 200 }, { id: 'champ', text: 'Top ten at the National Championship', pay: 700 }] },
  world: { id: 'lodestar', name: 'Lodestar Yachting', what: 'an international yachting house', goals: [{ id: 'podium', text: 'A podium at the Pre-Worlds', pay: 600 }, { id: 'win', text: 'Win a race in the Gold fleet', pay: 400 }, { id: 'champ', text: 'Sail the Worlds finals in Gold', pay: 1200 }] },
};
/** How good a Championship finish meets the sponsor's goal. */
const CHAMP_GOAL: Record<Tier, number> = { club: 5, state: 5, national: 10, world: 12 };
/** What you start the Circuit with, and the travel grant when you move up to a season. */
export const START_MONEY = 150;
export const GRANT: Record<Tier, number> = { club: 0, state: 300, national: 600, world: 1200 };

export interface ShopItem { id: string; name: string; text: string; price: number; classes?: ClassId[]; wonBy?: string }
export const SHOP: ShopItem[] = [
  { id: 'deck', name: 'Deck colour', text: 'Paint her deck any colour in the locker, instead of the light deck that goes with her hull.', price: 120, wonBy: 'Your first podium on the Circuit' },
  { id: 'bottom', name: 'Two-tone hull', text: 'Her lower hull in a colour of its own, under a band of her hull colour at the sheer.', price: 160, wonBy: 'A podium at a Championship' },
  { id: 'rigB', name: 'IOM B rig', text: 'The smaller rig for a fresh breeze. Without it you sail a fresh day on the A rig, overpowered.', price: 250, classes: ['IOM'] },
];
/** A colour that can only be won: the Championship of each season has its own. */
export const CHAMPION_PAINT: Record<Tier, { name: string; hex: string }> = { club: WON_COLOURS[0], state: WON_COLOURS[1], national: WON_COLOURS[2], world: WON_COLOURS[3] };

export const moneyOf = (c: Career): number => c.money ?? START_MONEY;
export const owns = (c: Career | null | undefined, id: string): boolean => !!c?.owned?.includes(id);
/** The colours you've won, to add to the paint locker. */
export const wonPaints = (c: Career | null | undefined) => TIERS.filter(t => owns(c, `paint:${t}`)).map(t => CHAMPION_PAINT[t]);
const deal = (tier: Tier, season: number): Deal => ({ sponsor: SPONSORS[tier].id, season, tier, met: [] });
const book = (c: Career, text: string, amount: number, at: number): Career => ({ ...c, money: moneyOf(c) + amount, ledger: [{ at, text, amount }, ...(c.ledger ?? [])].slice(0, 12) });
/** This season's sponsor and their goals (a career from before sponsors gets the one for its season). */
export const dealOf = (c: Career): Deal => (c.sponsor && c.sponsor.season === c.season && c.sponsor.tier === tierOf(c) ? c.sponsor : deal(tierOf(c), c.season));

/** Buy something from the shop: when you have the money, and don't have it already. */
export function buy(c: Career, id: string, now: number): Career {
  const it = SHOP.find(s => s.id === id);
  if (!it || owns(c, id) || moneyOf(c) < it.price) return c;
  return { ...book(c, it.name, -it.price, now), owned: [...(c.owned ?? []), id] };
}

/** Pay the entry for the event about to open (nothing on your home water). */
function payEntry(c: Career, event: CareerEvent, now: number): Career {
  return event.fee ? book(c, `Entry: ${event.name}`, -event.fee, now) : c;
}

/** The settings for the next race of the day: your set-up, with the day's fleet (in a heat event, your heat), water, breeze and its own seed. */
/**
 * The weather on a day of the event you're in (0 is its first day): its own breeze, building or
 * easing through the day as the water allows (see conditions.ts). `venue`: the water a club season is
 * sailed on (an event on the Circuit's waters has its own).
 */
export function dayWeatherOf(career: Career, dayNo: number, venue?: string | null): DayWeather {
  const { event, index } = eventAt(career);
  const seed = (career.season * 7919 + index * 104729 + dayNo * 1299709 + TIERS.indexOf(tierOf(career)) * 15485863 + 77) >>> 0;
  return dayWeather(seed, kindOf(event.water ?? venue), event.perDay, event.wind);
}
/** The conditions for race (or round) `no` of the event you're in, counting from 1. */
export function raceConditions(career: Career, no: number, venue?: string | null): RaceConditions {
  const { event } = eventAt(career);
  const d = Math.floor((no - 1) / event.perDay);
  return dayWeatherOf(career, d, venue).races[(no - 1) % event.perDay];
}

export function careerRace(career: Career, base: RaceSettings): RaceSettings {
  const { event, index } = eventAt(career);
  const hn = heatNow(career);
  const no = hn ? hn.round : (career.day?.races.length ?? 0) + 1;
  const wind = eventWind(event, Math.floor((no - 1) / event.perDay));
  const cond = raceConditions(career, no, base.venue);
  const others = hn ? hn.ids.filter(id => id !== ME) : career.fleet.slice(0, TIER_FLEET[tierOf(career)] - 1);
  return {
    ...base, classId: career.cls, fleetSize: others.length + 1, level: tierOf(career),
    windStrength: cond.wind, seaState: cond.sea, windCharacter: wind?.character ?? event.character ?? 'oscillating', windKnots: undefined,
    ...(wind ? { venue: event.water, windFrom: wind.from, venueSpot: undefined } : {}),
    cast: others.map(castOf).filter((m): m is CastMember => !!m).map(m => ({ id: m.id, name: m.name, sail: m.sail, hull: m.hull, level: m.level, country: m.country })),
    seed: (career.season * 100003 + index * 1009 + no * 31 + (hn?.heat ? hn.heat.charCodeAt(0) * 7 : 0) + [17, 7001, 9001, 11003][TIERS.indexOf(tierOf(career))]) >>> 0,
    // An IOM on a fresh day without the B rig: the A rig, overpowered. Otherwise the right rig for the breeze.
    rig: career.cls === 'IOM' && cond.wind === 'fresh' && !owns(career, 'rigB') ? 'A' : undefined,
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
  const day: CareerDay = career.day ?? { event: index, races: [], startedAt: now, ...(event.kind === 'championship' && tierOf(career) !== 'club' ? { pick: heatPick(career, tierOf(career)) } : {}) };
  if (day.races.length >= seasonOf(career)[day.event].races) return career;
  const paid = career.day ? career : payEntry(career, event, now);
  return { ...paid, day: { ...day, races: [...day.races, { no: day.races.length + 1, sailed: true, rows }] }, at: now };
}

/**
 * You left a race after the gun, before the finish: it counts, as a DNF for you, and the rest of the
 * fleet finishes as they would have (each by her strength, with a race's luck). So walking away from
 * a bad race can't take it back. `castIds`: the race's other boats (its cast), in boat order.
 */
export function abandonRace(career: Career, castIds: string[], now: number): Career {
  const st = dayState(career);
  if (career.day && st.left === 0) return career;
  const salt = (career.day?.races.length ?? 0) + (career.day?.heat?.sails.length ?? 0);
  const rng = new Rng((career.season * 7919 + st.index * 131 + salt * 17 + 424243) >>> 0);
  const order = castIds.filter(id => id !== ME).map(id => ({ id, v: castStrength(id) + rng.gauss() * SPREAD })).sort((a, z) => z.v - a.v);
  const rows: RowResult[] = [{ id: ME, place: null, code: 'DNF' }, ...order.map((x, k) => ({ id: x.id, place: k + 1, code: null }))];
  return recordRace(career, rows, now);
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

/** What closing an event earned: prize money, sponsor goals met, and anything unlocked. */
export interface Earned { prize: number; goals: Goal[]; unlocked: string[] }
export const UNLOCK_NAME = (id: string): string => (id.startsWith('paint:') ? CHAMPION_PAINT[id.slice(6) as Tier]?.name ?? id : SHOP.find(s => s.id === id)?.name ?? id);

/** Did you win a race you sailed in this event (in a World season: in the Gold fleet's finals)? */
function wonARace(career: Career, event: CareerEvent): boolean {
  const day = career.day;
  if (!day) return false;
  if (event.heat && day.heat) {
    const me = day.heat.ids.indexOf(ME);
    return day.heat.sails.some(s => s.me && s.o[0] === me && (tierOf(career) !== 'world' || (s.h === 'A' && s.r > (event.heat!.qualifying ?? 0))));
  }
  return tierOf(career) !== 'world' && day.races.some(r => r.sailed && r.rows.find(x => x.id === ME)?.place === 1);
}

/** Close a race day that's complete: its result goes in the season, a podium earns a medal and prize money, the sponsor pays for any goal met, and after the Championship a new season begins. */
export function finishDay(career: Career, me: Me, now: number, home?: Region | null): { career: Career; result: DayResult; medal: Medal | null; earned: Earned } | null {
  if (!career.day || !dayState(career).complete) return null;
  const rows = dayStandings(career, me);
  const mine = rows.find(r => r.userId === ME);
  if (!mine) return null;
  const tier = tierOf(career), event = seasonOf(career)[career.day.event];
  const result: DayResult = { event: career.day.event, order: rows.map(r => r.userId), rank: mine.rank, net: mine.net, at: now };
  const medal: Medal | null = mine.rank <= 3
    ? { kind: mine.rank === 1 ? 'gold' : mine.rank === 2 ? 'silver' : 'bronze', event: event.name, season: career.season, cls: career.cls, at: now, ...(event.kind === 'championship' && mine.rank === 1 ? { trophy: true } : {}) }
    : null;
  // Money: the prize, then the sponsor's goals met at this event.
  let next: Career = { ...career, day: null, done: [...career.done, result], medals: medal ? [...career.medals, medal] : career.medals, at: now };
  // Who finished ahead of whom, remembered for every meeting; and your rival from it.
  next = { ...next, h2h: meet(career.h2h, result.order, event.name, career.season) };
  next = { ...next, rivalId: pickRival(next, me) ?? career.rivalId };
  const prize = mine.rank <= 3 ? event.prize?.[mine.rank - 1] ?? 0 : 0;
  if (prize) next = book(next, `${ordinalWord(mine.rank)}, ${event.name}`, prize, now);
  const d = dealOf(career), sp = SPONSORS[d.tier];
  const metNow = sp.goals.filter(g => !d.met.includes(g.id) && (
    g.id === 'podium' ? event.kind !== 'championship' && mine.rank <= 3
      : g.id === 'win' ? wonARace(career, event)
        : event.kind === 'championship' && mine.rank <= CHAMP_GOAL[d.tier]));
  for (const g of metNow) next = book(next, `${sp.name}: ${g.text.toLowerCase()}`, g.pay, now);
  next = { ...next, sponsor: { ...d, met: [...d.met, ...metNow.map(g => g.id)] } };
  // Prizes that are things: a deck colour for a first podium, a two-tone hull for a Championship podium, the season's own colour for its title.
  const unlocked: string[] = [];
  const give = (id: string) => { if (!owns(next, id) && !unlocked.includes(id)) unlocked.push(id); };
  if (mine.rank <= 3) give('deck');
  if (event.kind === 'championship' && mine.rank <= 3) give('bottom');
  if (event.kind === 'championship' && mine.rank === 1) give(`paint:${tier}`);
  if (unlocked.length) next = { ...next, owned: [...(next.owned ?? []), ...unlocked] };
  if (event.kind === 'championship') {
    const ps = seasonStandings(next, me).find(r => r.userId === ME)?.rank ?? rows.length;
    // A finish this good in the Championship is a place in the season above (taken up with the licence: see moveUp).
    const up = tierAbove(tier);
    const ticket: Tier | undefined = up && mine.rank <= QUALIFY[tier] && TIERS.indexOf(up) > TIERS.indexOf(career.ticket ?? tier) ? up : career.ticket;
    next = { ...next, ...begin(career, home), season: career.season + 1, calendar: (career.calendar ?? 0) + 1, fleet: draw(career.season + 1, tier), done: [], sponsor: deal(tier, career.season + 1), ...(ticket ? { ticket } : {}), history: [...career.history, { season: career.season, pointscore: ps, championship: mine.rank, of: rows.length, tier }] };
  }
  return { career: next, result, medal, earned: { prize, goals: metNow, unlocked } };
}
const ordinalWord = (n: number) => (n === 1 ? 'First' : n === 2 ? 'Second' : 'Third');

/** Take up a place in the tier above (between events only): a new season there, against its fleet. */
export function moveUp(career: Career, now: number, home?: Region | null): Career {
  if (!career.ticket || career.day) return career;
  const tier = career.ticket;
  const { ticket: _used, ...rest } = career;
  void _used;
  const season = career.season + (career.done.length ? 1 : 0);
  const up: Career = { ...rest, ...begin(career, home), tier, season, calendar: 0, fleet: draw(season, tier), done: [], at: now, sponsor: deal(tier, season) };
  return GRANT[tier] ? book(up, `Travel grant: the ${TIER_NAME[tier]} season`, GRANT[tier], now) : up;
}

/** You against each of the cast after an event: one more meeting with everyone in its order. */
export function meet(h2h: Record<string, HeadToHead> | undefined, order: string[], event: string, season: number): Record<string, HeadToHead> {
  const out = { ...(h2h ?? {}) };
  const mine = order.indexOf(ME);
  if (mine < 0) return out;
  order.forEach((id, k) => {
    if (id === ME) return;
    const was = out[id] ?? { w: 0, l: 0 };
    out[id] = { w: was.w + (mine < k ? 1 : 0), l: was.l + (mine < k ? 0 : 1), last: { event, season, me: mine + 1, them: k + 1 } };
  });
  return out;
}

/**
 * Your rival in this season's fleet: the one you've met most often with the closest record, with a
 * little weight to whoever is next to you in the standings. The one you have stays until someone else
 * is clearly closer, so a rivalry carries over from event to event and season to season. Null with no
 * history yet.
 */
export function pickRival(career: Career, me: Me): string | null {
  const h = career.h2h ?? {};
  const rows = seasonStandings(career, me);
  const i = rows.findIndex(r => r.userId === ME);
  const next = new Set(i >= 0 ? [rows[i - 1]?.userId, rows[i + 1]?.userId].filter(Boolean) as string[] : []);
  const score = (id: string): number => {
    const r = h[id];
    if (!r) return -1;
    const m = r.w + r.l;
    return (1 - Math.abs(r.w - r.l) / m) * Math.min(m, 10) + (next.has(id) ? 1.5 : 0);
  };
  let best: string | null = null;
  for (const id of career.fleet) if (h[id] && (best === null || score(id) > score(best))) best = id;
  const kept = career.rivalId && career.fleet.includes(career.rivalId) ? career.rivalId : null;
  if (kept && best && score(kept) >= score(best) - 1.5) return kept;
  return best;
}

/**
 * Your rival: the one you've built a rivalry with (see pickRival), or before there's any history the
 * skipper next to you in the pointscore; where they stand against you, and your record together.
 */
export function rival(career: Career, me: Me): { skipper: CastMember; ahead: boolean; gap: number; record: HeadToHead | null } | null {
  const rows = seasonStandings(career, me);
  const i = rows.findIndex(r => r.userId === ME);
  const kept = career.rivalId && career.fleet.includes(career.rivalId) ? career.rivalId : null;
  if (kept) {
    const skipper = castOf(kept);
    const j = rows.findIndex(r => r.userId === kept);
    if (skipper) return { skipper, ahead: i >= 0 && j >= 0 ? j < i : false, gap: i >= 0 && j >= 0 ? Math.abs(rows[j].net - rows[i].net) : 0, record: career.h2h?.[kept] ?? null };
  }
  if (i < 0 || rows.length < 2) return null;
  const other = rows[i === 0 ? 1 : i - 1];
  const skipper = castOf(other.userId);
  return skipper ? { skipper, ahead: i !== 0, gap: Math.abs(other.net - rows[i].net), record: career.h2h?.[other.userId] ?? null } : null;
}

/** A note on a race of today you've just sailed (from its summary), for Alfie's report. */
export function noteRace(career: Career, note: RaceNote): Career {
  if (!career.day) return career;
  return { ...career, day: { ...career.day, notes: [...(career.day.notes ?? []), note] } };
}

/** Keep Alfie's report on an event (the last dozen). */
export const keepReport = (career: Career, report: Report): Career => ({ ...career, reports: [report, ...(career.reports ?? [])].slice(0, 12) });

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
