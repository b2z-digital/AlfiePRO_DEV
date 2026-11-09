/**
 * Race desk data for the phone (Race Management board, "Race desk" page).
 * Reads the same events and series as the desktop Race Management page and builds round
 * events with the same mapping (utils/scoringStart.seriesRoundToEvent). Starting scoring goes
 * through prepareEventForScoring — the exact steps the desktop "Start scoring" button takes.
 */
import { getStoredRaceEvents, getStoredRaceSeries, storeRaceEvent, storeRaceSeries } from '../utils/raceStorage';
import { findSignOn, getSignOnSheet } from '../utils/raceSignOnStorage';
import { nextDayToScore, prepareEventForScoring, seriesRoundToEvent } from '../utils/scoringStart';
import type { RaceEvent, RaceSeries } from '../types/race';
import { todayISO } from './data';

export type DeskState = 'today' | 'in_progress' | 'not_scored' | 'upcoming' | 'done' | 'cancelled';

export interface DeskItem {
  key: string;               // 'q-<id>' or 's-<seriesId>-<roundIndex>'
  event: RaceEvent;
  title: string;
  seriesName?: string;
  roundName?: string;
  date: string;
  venue: string;
  state: DeskState;
  entered: number;
  racesDone: number;
  racesPlanned: number | null;
  heats: 'hms' | 'shrs' | null;
  proMemberId?: string;
  proName?: string;
}

export interface DeskSeries {
  series: RaceSeries;
  rounds: DeskItem[];
  done: number;
  next?: DeskItem;
  inProgress?: DeskItem;
  registered: number;
}

const heatSystemOf = (e: RaceEvent): 'hms' | 'shrs' | null => {
  const hm: any = e.heatManagement;
  if (!hm?.configuration?.enabled) return null;
  return hm.configuration.scoringSystem === 'shrs' || e.scoringSystem === 'shrs' ? 'shrs' : 'hms';
};

function stateOf(e: RaceEvent, today: string): DeskState {
  if (e.cancelled) return 'cancelled';
  if (e.completed) return 'done';
  const d = (e.date || '').slice(0, 10);
  if ((e.lastCompletedRace || 0) > 0) return 'in_progress';
  if (d === today) return 'today';
  if (d < today) return 'not_scored';
  return 'upcoming';
}

function toItem(key: string, e: RaceEvent, extra: Partial<DeskItem>, today: string): DeskItem {
  return {
    key,
    event: e,
    title: e.eventName || `${e.raceClass} ${e.raceFormat}`,
    date: (e.date || '').slice(0, 10),
    venue: e.venue || '',
    state: stateOf(e, today),
    entered: (e.skippers?.length || e.attendees?.length || 0),
    racesDone: e.lastCompletedRace || 0,
    racesPlanned: e.numRaces || null,
    heats: heatSystemOf(e),
    proMemberId: e.proMemberId,
    proName: e.proMemberName,
    ...extra,
  };
}

export async function loadDesk(): Promise<{ items: DeskItem[]; series: DeskSeries[] }> {
  const today = todayISO();
  const [events, series] = await Promise.all([getStoredRaceEvents().catch(() => [] as RaceEvent[]), getStoredRaceSeries().catch(() => [] as RaceSeries[])]);
  const items: DeskItem[] = [];
  for (const e of events) {
    if (!e.date || (e as any).is_simulated) continue;
    items.push(toItem(`q-${e.id}`, e, {}, today));
  }
  const deskSeries: DeskSeries[] = [];
  for (const s of series) {
    const rounds = (s.rounds || []).map((r, i) => {
      const e = seriesRoundToEvent(s, i);
      return toItem(`s-${s.id}-${i}`, e, { title: `${s.seriesName} · ${r.name}`, seriesName: s.seriesName, roundName: r.name }, today);
    }).filter(r => r.date);
    items.push(...rounds);
    const active = rounds.filter(r => r.state !== 'cancelled');
    deskSeries.push({
      series: s,
      rounds,
      done: active.filter(r => r.state === 'done').length,
      inProgress: active.find(r => r.state === 'in_progress'),
      next: active.filter(r => r.state === 'today' || r.state === 'upcoming').sort((a, b) => a.date.localeCompare(b.date))[0],
      registered: s.skippers?.length || Math.max(0, ...rounds.map(r => r.entered)),
    });
  }
  items.sort((a, b) => a.date.localeCompare(b.date));
  return { items, series: deskSeries };
}

/** Event skippers signed on today (the sign-on screen's count; walk-ups are counted separately there). */
export async function signedOnCount(e: RaceEvent): Promise<number | null> {
  if ((e.date || '').slice(0, 10) !== todayISO()) return null;
  const list = await getSignOnSheet(e.id, todayISO()).catch(() => []);
  return (e.skippers || []).filter(s => findSignOn(list, s)).length;
}

export const DESK_FORMAT = (e: RaceEvent) => `${e.raceClass}${e.raceFormat ? ` · ${e.raceFormat === 'handicap' ? 'Handicap' : 'Scratch'}` : ''}`;

/** Drops as the board says them: "After races 4 and 8". */
export function dropsLabel(e: RaceEvent): string {
  const rules = (e.dropRules || [4, 8, 16, 24, 32, 40]).filter(n => !e.numRaces || n <= e.numRaces);
  if (!rules.length) return 'No drops';
  const shown = rules.slice(0, 3);
  return `After races ${shown.length > 1 ? `${shown.slice(0, -1).join(', ')} and ${shown[shown.length - 1]}` : shown[0]}${rules.length > 3 ? '…' : ''}`;
}

export function heatsLabel(e: RaceEvent): string {
  const hm: any = e.heatManagement;
  const sys = heatSystemOf(e);
  if (!sys) return 'One fleet';
  const n = hm?.configuration?.numberOfHeats;
  const promo = hm?.configuration?.promotionCount;
  return `${sys === 'shrs' ? 'SHRS' : 'HMS'}${n ? ` · ${n} heats` : ''}${sys === 'hms' && promo ? ` · promote ${promo}` : ''}`;
}

/**
 * Start (or continue) scoring: the desktop's own preparation, then the scoring screen.
 * Until the phone finish pad is built, the scoring screen is the desktop YachtRaceManager
 * (with its Touch mode), so results are recorded exactly as they are today.
 */
export async function startScoring(e: RaceEvent, clubId: string | undefined): Promise<string | null> {
  const r = await prepareEventForScoring(e, clubId, e.multiDay ? nextDayToScore(e) : 1);
  if (r.ok === false) return r.error;
  window.dispatchEvent(new CustomEvent('alfie-start-scoring'));
  return null;
}

/* ─────────────── New event ─────────────── */

export async function createSingleEvent(opts: { name: string; date: string; startTime?: string; venue: string; raceClass: string; raceFormat: 'scratch' | 'handicap'; clubId?: string; clubName: string }): Promise<RaceEvent> {
  const event: RaceEvent = {
    id: crypto.randomUUID(),
    eventName: opts.name,
    clubName: opts.clubName,
    date: opts.date,
    startTime: opts.startTime || '',
    venue: opts.venue,
    raceClass: opts.raceClass as any,
    raceFormat: opts.raceFormat as any,
    multiDay: false,
    numberOfDays: 1,
    currentDay: 1,
    raceResults: [],
    skippers: [],
    lastCompletedRace: 0,
    hasDeterminedInitialHcaps: false,
    isManualHandicaps: false,
    dayResults: {},
    clubId: opts.clubId,
  };
  await storeRaceEvent(event);
  return event;
}

/** Adds a round to a series, carrying over the last round's race count and drops. */
export async function addSeriesRound(series: RaceSeries, opts: { date: string; venue: string; startTime?: string; name?: string }): Promise<number> {
  const last = series.rounds[series.rounds.length - 1];
  const index = series.rounds.length;
  const round: any = {
    name: opts.name || `Round ${index + 1}`,
    date: opts.date,
    venue: opts.venue,
    startTime: opts.startTime || '',
    results: [],
    completed: false,
    lastCompletedRace: 0,
    hasDeterminedInitialHcaps: false,
    isManualHandicaps: last?.isManualHandicaps || false,
    ...(last?.numRaces ? { numRaces: last.numRaces } : {}),
    ...(last?.dropRules ? { dropRules: last.dropRules } : {}),
  };
  await storeRaceSeries({ ...series, rounds: [...series.rounds, round] });
  return index;
}
