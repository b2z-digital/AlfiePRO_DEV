/**
 * The race being started and sailed on the phone (Race Management board, "Starting" page).
 * What sails next comes from the desktop's own rules (utils/raceProgress). The start time,
 * roll call and boats marked during the race are kept on this phone (they survive leaving the
 * screen or a restart, and work with no signal) until the finish pad records the results.
 */
import type { Skipper } from '../types';
import type { HeatDesignation, HeatManagement } from '../types/heat';
import { getHeatDisplayLabel } from '../types/heat';
import type { RaceEvent } from '../types/race';
import type { FinishingEntry } from '../utils/finishOrder';
import { nextDayToScore } from '../utils/scoringStart';
import { heatManagementOf, scoringStateOf } from '../utils/raceSetup';
import {
  currentHeatRound, firstIncompleteHeat, handicapForRace, heatProgress, heatSailingOrder, isWithdrawnFor, nextRaceNumber, roundLabel,
} from '../utils/raceProgress';

export interface RaceMark { skipperIndex: number; code: 'OCS'; atMs: number }

export interface RaceSession {
  eventId: string;
  race: number;
  heat: HeatDesignation | null;
  sequenceId?: string | null;
  /** When the start signal went (ms since epoch). */
  gunAt?: number | null;
  marks: RaceMark[];
  rollCall: { ready: number[]; absent: number[] };
  recalls: number;
  /** The finish pad's order (finish pad boat indices: the heat's boats for heats), once started. */
  finish?: FinishingEntry[] | null;
  /** Boats in the order they were called, for "undo the last finish". */
  added?: number[];
  /** The finish pad's boats (pad index → event skipper, sail, name), so spotters' calls can be applied anywhere in the app. */
  pad?: PadInfo;
  /** Who called each finish (pad index), shown when two phones disagree. */
  callers?: Record<number, { who: string; at: number }>;
  /** Places two phones recorded differently, waiting for the scorer to decide. */
  conflicts?: FinishConflict[];
}

export interface PadInfo {
  globalOf: number[];
  boats: { sail: string; name: string }[];
  raceLabel: string;
  heatLabel: string;
  heatIndex: number;
}

export interface FinishConflict {
  id: string;
  place: number;
  /** The boat recorded first for the place (pad index), and who recorded it. */
  a: number; aWho: string; aAt: number;
  /** The other phone's boat for the same place, now one place lower until decided. */
  b: number; bWho: string; bAt: number;
}

export interface NextHeat { heat: HeatDesignation; label: string; boats: number; promoted: number; from: string }

export interface NextUp {
  race: number;
  /** "Race 3", "Qualifying Rd 2", "Final 1 - Gold Fleet". */
  raceLabel: string;
  heat: HeatDesignation | null;
  heatLabel: string;
  /** Position of the heat in the round's heat list (for its colour). */
  heatIndex: number;
  /** Which heat this is in the sailing order, from 1. */
  sails: number;
  skipperIndices: number[];
  handicap: boolean;
  nextHeat: NextHeat | null;
  /** Every heat of this round is scored: the scoring sheet moves heats on to the next round. */
  roundComplete: boolean;
  /** All planned races are scored. */
  allDone: boolean;
}

/** The event as the scoring screen works with it: multi-day events on the day still to score. */
export function forScoring(e: RaceEvent): RaceEvent {
  return e.multiDay ? { ...e, currentDay: nextDayToScore(e) } : e;
}

export function nextUp(event: RaceEvent): NextUp {
  const e = forScoring(event);
  const st = scoringStateOf(e);
  const hm = heatManagementOf(e);
  const handicap = e.raceFormat === 'handicap';
  if (hm?.configuration?.enabled && hm.rounds?.length) return nextHeatUp(e, hm, st.raceResults, handicap);

  const numRaces = e.numRaces || 0;
  const race = numRaces ? nextRaceNumber(st.lastCompletedRace, numRaces) : st.lastCompletedRace + 1;
  const skippers = st.skippers;
  return {
    race,
    raceLabel: `Race ${race}`,
    heat: null,
    heatLabel: '',
    heatIndex: 0,
    sails: 1,
    skipperIndices: skippers.map((_, i) => i).filter(i => !isWithdrawnFor(skippers[i], race)),
    handicap,
    nextHeat: null,
    roundComplete: false,
    allDone: !!numRaces && st.lastCompletedRace >= numRaces,
  };
}

function nextHeatUp(e: RaceEvent, hm: HeatManagement, raceResults: any[], handicap: boolean): NextUp {
  const round = currentHeatRound(hm);
  const order = heatSailingOrder(hm);
  const heat = firstIncompleteHeat(hm, raceResults);
  const complete = (h: HeatDesignation) => { const p = heatProgress(hm, raceResults, h); return p.scored >= p.total && p.total > 0; };
  const roundComplete = order.length > 0 && order.every(complete);
  const assignment = round?.heatAssignments.find(a => a.heatDesignation === heat);
  const pos = heat ? order.indexOf(heat) : -1;
  const after = pos >= 0 ? order[pos + 1] : undefined;
  const afterAssignment = after ? round?.heatAssignments.find(a => a.heatDesignation === after) : undefined;
  const cfg = hm.configuration;
  // HMS promotes the top boats of each heat into the next heat from race 2 (Schedule B/C)
  const promoted = cfg.scoringSystem !== 'shrs' && hm.currentRound > 1
    ? (cfg.promotionCountOverrides?.[hm.currentRound] ?? cfg.promotionCount ?? 0) : 0;
  const heatIdx = (h: HeatDesignation | null) => Math.max(0, (round?.heatAssignments || []).map(a => a.heatDesignation).sort().indexOf(h as HeatDesignation));
  const lastRound = hm.rounds.length;
  return {
    race: hm.currentRound,
    raceLabel: roundLabel(hm, hm.currentRound, heat),
    heat,
    heatLabel: heat ? getHeatDisplayLabel(heat, cfg) : '',
    heatIndex: heatIdx(heat),
    sails: pos + 1,
    skipperIndices: (assignment?.skipperIndices || []).filter(i => i >= 0 && i < (e.skippers?.length || 0)),
    handicap,
    nextHeat: after && afterAssignment ? {
      heat: after,
      label: getHeatDisplayLabel(after, cfg),
      boats: afterAssignment.skipperIndices.length,
      promoted,
      from: heat ? getHeatDisplayLabel(heat, cfg) : '',
    } : null,
    roundComplete,
    allDone: roundComplete && !!e.numRaces && hm.currentRound >= e.numRaces && hm.currentRound >= lastRound,
  };
}

export interface HandicapGroup { hcap: number; skipperIndices: number[] }

/**
 * Handicap starts: a handicap is a head start in seconds (handicapCalculator: 1st −30, race 1
 * seeding 0/10/20…), so the biggest head start goes first and scratch boats (0) go last, on the
 * gun. Uses the handicap the scoring screen uses for this race.
 */
export function handicapGroups(event: RaceEvent, race: number, indices: number[]): HandicapGroup[] {
  const e = forScoring(event);
  const st = scoringStateOf(e);
  const by = new Map<number, number[]>();
  for (const i of indices) {
    const h = handicapForRace(st.skippers, st.raceResults, race, i);
    by.set(h, [...(by.get(h) || []), i]);
  }
  return [...by.entries()].sort((a, b) => b[0] - a[0]).map(([hcap, skipperIndices]) => ({ hcap, skipperIndices }));
}

/* ─────────────── kept on this phone ─────────────── */

const KEY = (eventId: string) => `alfie-m-race:${eventId}`;

export function loadSession(eventId: string, up: Pick<NextUp, 'race' | 'heat'>): RaceSession {
  const fresh: RaceSession = { eventId, race: up.race, heat: up.heat, marks: [], rollCall: { ready: [], absent: [] }, recalls: 0, gunAt: null };
  try {
    const raw = localStorage.getItem(KEY(eventId));
    if (!raw) return fresh;
    const s = JSON.parse(raw) as RaceSession;
    // A different race or heat is up now (this one was scored): start clean
    if (s.race !== up.race || (s.heat || null) !== (up.heat || null)) return fresh;
    return { ...fresh, ...s, rollCall: s.rollCall || fresh.rollCall, marks: s.marks || [], added: s.added || [] };
  } catch {
    return fresh;
  }
}

export const SESSION_EVENT = 'alfie-race-session';

/** Saves the race session; screens and Score together hear about it (alfie-race-session). */
export function saveSession(s: RaceSession) {
  try { localStorage.setItem(KEY(s.eventId), JSON.stringify(s)); } catch { /* private mode: kept for this visit only */ }
  try { window.dispatchEvent(new CustomEvent(SESSION_EVENT, { detail: s })); } catch { /* no window */ }
}

/** The race session as stored, whatever race is up (Score together applies calls to it). */
export function storedSession(eventId: string): RaceSession | null {
  try { const raw = localStorage.getItem(KEY(eventId)); return raw ? JSON.parse(raw) as RaceSession : null; } catch { return null; }
}

export function clearSession(eventId: string) {
  try { localStorage.removeItem(KEY(eventId)); } catch { /* ignore */ }
}

/** The race running on this phone for an event, if the gun has gone. */
export function runningSession(event: RaceEvent): RaceSession | null {
  const s = loadSession(event.id, nextUp(event));
  return s.gunAt ? s : null;
}

export const sailOf = (s?: Skipper) => String(s?.sailNo || (s as any)?.sailNumber || '').trim();

export function clock(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000)), h = Math.floor(s / 3600);
  return h ? `${h}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}` : `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

export const countdown = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
