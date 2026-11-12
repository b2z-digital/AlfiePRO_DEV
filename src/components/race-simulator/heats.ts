// Heat racing on the Circuit: the Nationals under HMS and the Worlds under SHRS, run by AlfiePRO's
// own heat systems, the ones Race Management uses for real events: the seeding, promotion and
// relegation (hmsHeatSystem.ts, heatUtils.ts), SHRS's movement tables and finals fleets
// (shrsHeatSystem.ts), and the results engine's scoring. Nothing here decides who goes up or down,
// or what anyone scores: that is all theirs. This file only says who finished where in each heat.
//
// What's kept is small: everyone in the event in seeding order (best first), and each heat sailed,
// as a finishing order. The heat management is rebuilt from that by running the heat systems again,
// so the event is always exactly what AlfiePRO's rules make of those results.
//
// You sail your own heat. The heats before it in the round (sailed lowest first, as HMS sails them)
// are simulated, and so are the ones after it, unless you've been promoted into the next heat up:
// then you sail that one too. Nothing here is written to any club's events or results.
import type { HeatDesignation, HeatManagement, HeatAssignment } from '@/types/heat';
import type { Skipper } from '@/types';
import type { RaceEvent } from '@/types/race';
import { seedInitialHeats } from '@/utils/hmsHeatSystem';
import { completeHeat, convertHeatResultsToRaceResults, updateHeatResult } from '@/utils/heatUtils';
import { computeEventResults } from '@/utils/eventResultsEngine';
import { Rng } from '@/sim/math';
import { STANDARD_DROPS, type Score, type StandingRow } from './series';

export type HeatSystem = 'hms' | 'shrs';
export interface HeatSpec {
  system: HeatSystem;
  heats: number;
  /** HMS: boats promoted from each heat to the one above (4 or 6). */
  promotion?: number;
  /** SHRS: races in the qualifying series; the rest are finals, in fleets. */
  qualifying?: number;
}
export type Code = 'DNF' | 'OCS' | 'DSQ';
/** One heat sailed: its round, its letter, everyone who finished in order, the rest with a letter score, and whether you sailed it. */
export interface HeatSail { r: number; h: HeatDesignation; o: number[]; x?: [number, Code][]; me?: boolean }
export interface HeatLog {
  /** Everyone in the event, in seeding order (the best first); you are 'me'. */
  ids: string[];
  sails: HeatSail[];
}

export const LETTERS: HeatDesignation[] = ['A', 'B', 'C', 'D', 'E', 'F'];
export const FLEET_NAME: Partial<Record<HeatDesignation, string>> = { A: 'Gold', B: 'Silver', C: 'Bronze', D: 'Copper' };
const quiet = <T,>(f: () => T): T => {
  // (The heat systems explain themselves on the console as they go; that's for Race Management, not a game.)
  // (HMS also reports, as an error, the promoted boats it lists in two heats at the end of a round, then sorts them out: so does Race Management.)
  const l = console.log, w = console.warn, e = console.error;
  console.log = () => undefined; console.warn = () => undefined; console.error = () => undefined;
  try { return f(); } finally { console.log = l; console.warn = w; console.error = e; }
};
const skippersOf = (ids: string[]): Skipper[] => ids.map((id, i) => ({ name: id, sailNo: String(i + 1), sailNumber: String(i + 1), club: '', boatModel: '', startHcap: 100 }) as unknown as Skipper);

/** The first round's heats, from the seeding order: HMS's own seeding by ranking, or SHRS's 1, 2, 3, 4, 4, 3, 2, 1 (rule 3.1.i). */
export function seed(spec: HeatSpec, n: number): HeatAssignment[] {
  if (spec.system === 'hms') {
    return quiet(() => seedInitialHeats(skippersOf(Array.from({ length: n }, (_, i) => String(i))), { numberOfHeats: spec.heats, promotionCount: spec.promotion ?? 4, seedingMethod: 'ranking' }, Array.from({ length: n }, (_, i) => ({ skipperIndex: i, ranking: i + 1 }))));
  }
  const out = LETTERS.slice(0, spec.heats).map(h => ({ heatDesignation: h, skipperIndices: [] as number[] }));
  for (let i = 0; i < n; i++) { const k = i % (2 * spec.heats); out[k < spec.heats ? k : 2 * spec.heats - 1 - k].skipperIndices.push(i); }
  return out;
}

/** The heat management these sails make, as AlfiePRO's heat systems run it. */
export function replay(spec: HeatSpec, log: HeatLog): HeatManagement {
  let hm: HeatManagement = {
    configuration: {
      enabled: true, numberOfHeats: spec.heats, promotionCount: spec.system === 'hms' ? spec.promotion ?? 4 : 0, seedingMethod: 'manual', autoAssign: false, scoringSystem: spec.system,
      ...(spec.system === 'shrs' ? { shrsAssignmentMode: 'progressive' as const, shrsQualifyingRounds: spec.qualifying ?? 0, heatLabelStyle: 'letters' as const } : {}),
    },
    rounds: [{ round: 1, heatAssignments: seed(spec, log.ids.length), results: [], completed: false }],
    currentRound: 1, currentHeat: null,
  };
  quiet(() => {
    for (const s of log.sails) {
      hm = { ...hm, currentRound: s.r };
      s.o.forEach((idx, k) => { hm = updateHeatResult(hm, { skipperIndex: idx, position: k + 1, heatDesignation: s.h, race: s.r, round: s.r }); });
      for (const [idx, code] of s.x ?? []) hm = updateHeatResult(hm, { skipperIndex: idx, position: null, letterScore: code, heatDesignation: s.h, race: s.r, round: s.r });
      hm = completeHeat(hm, s.h, spec.system);
      if (s.r >= (spec.qualifying ?? Infinity) && spec.system === 'shrs') hm = { ...hm, configuration: { ...hm.configuration, shrsFinalsStarted: true } };
    }
  });
  return hm;
}

export interface HeatState {
  hm: HeatManagement;
  /** Rounds finished, and the round under way (or next). */
  complete: number; round: number;
  /** This round's heats, the order they're sailed in (lowest first), and those not sailed yet. */
  assignments: HeatAssignment[]; order: HeatDesignation[]; left: HeatDesignation[];
  /** The next heat to sail, and whether you're in it. */
  next: HeatDesignation | null; mine: boolean;
  /** Your heat this round (the highest you're in, once promoted). */
  myHeat: HeatDesignation | null;
  /** SHRS: in the finals. */
  finals: boolean;
}

export function heatState(spec: HeatSpec, log: HeatLog): HeatState {
  const hm = replay(spec, log);
  const complete = hm.rounds.filter(r => r.completed).length;
  const round = complete + 1;
  const rd = hm.rounds.find(r => r.round === round);
  const assignments = rd?.heatAssignments ?? [];
  const order = [...LETTERS.slice(0, spec.heats)].reverse();
  const sailed = new Set(log.sails.filter(s => s.r === round).map(s => s.h));
  const left = order.filter(h => !sailed.has(h));
  const me = log.ids.indexOf('me');
  const next = left[0] ?? null;
  const inHeat = (h: HeatDesignation) => !!assignments.find(a => a.heatDesignation === h)?.skipperIndices.includes(me);
  const myHeats = LETTERS.slice(0, spec.heats).filter(inHeat);
  return { hm, complete, round, assignments, order, left, next, mine: !!next && inHeat(next), myHeat: myHeats[0] ?? null, finals: spec.system === 'shrs' && round > (spec.qualifying ?? Infinity) };
}

/** Who's in a heat this round. */
export const heatOf = (st: HeatState, h: HeatDesignation): number[] => st.assignments.find(a => a.heatDesignation === h)?.skipperIndices ?? [];

/**
 * How a heat goes when it isn't sailed: everyone finishes in the order of how good they are, give
 * or take. A spread of 2.3 makes a level beat the level below it in 62% of meetings, as the
 * simulator's own skippers do (measured over twenty races, 12 Nov 2026).
 */
export const SPREAD = 2.3;
export function simulateHeat(st: HeatState, h: HeatDesignation, strength: (idx: number) => number, seedNo: number): HeatSail {
  const rng = new Rng(seedNo >>> 0);
  const who = heatOf(st, h);
  const o = who.map(idx => ({ idx, v: strength(idx) + rng.gauss() * SPREAD })).sort((a, z) => z.v - a.v).map(x => x.idx);
  return { r: st.round, h, o };
}

/** Sail (simulate) heats in order until `stop` says so, or the rounds run out. */
export function simulateUntil(spec: HeatSpec, log: HeatLog, strength: (idx: number) => number, seedBase: number, stop: (st: HeatState) => boolean, rounds: number): HeatLog {
  let cur = log;
  for (let guard = 0; guard < 400; guard++) {
    const st = heatState(spec, cur);
    if (st.complete >= rounds || !st.next || stop(st)) return cur;
    cur = { ...cur, sails: [...cur.sails, simulateHeat(st, st.next, strength, seedBase + st.round * 131 + LETTERS.indexOf(st.next) * 17)] };
  }
  return cur;
}

/** The event's standings, scored by AlfiePRO's results engine as Race Management scores a heat event; and each skipper's heat in each round. */
export function heatStandings(spec: HeatSpec, log: HeatLog, names: (id: string) => { name: string; sail: string | null }): { rows: StandingRow[]; heats: Record<string, (HeatDesignation | null)[]>; races: number } {
  const hm = replay(spec, log);
  const done = hm.rounds.filter(r => r.completed);
  if (!done.length) return { rows: [], heats: {}, races: 0 };
  const skippers = skippersOf(log.ids);
  const raceResults = convertHeatResultsToRaceResults(hm, skippers);
  const event = {
    id: 'virtual', eventName: '', clubName: '', date: '', venue: '', raceClass: 'IOM', raceFormat: 'scratch', skippers, raceResults, heatManagement: hm,
    dropRules: STANDARD_DROPS, scoringSystem: spec.system, lastCompletedRace: done.length, completed: true, numRaces: done.length,
  } as unknown as RaceEvent;
  const res = quiet(() => computeEventResults(event, event));
  const scores = (res.resolvedScores ?? {}) as Record<string, number>;
  const drops = res.drops as Record<string, boolean>;
  const totals = res.totals as Record<number, { gross: number; net: number }>;
  const order = ((res.displaySkippers ?? res.sortedSkippersResolved) as { index: number }[]);
  const heats: Record<string, (HeatDesignation | null)[]> = {};
  for (const id of log.ids) heats[id] = done.map(() => null);
  done.forEach((rd, k) => {
    // (The heat a boat finished the round in: the highest she sailed, for a boat promoted in HMS.)
    for (const a of [...rd.heatAssignments].sort((x, z) => (x.heatDesignation < z.heatDesignation ? 1 : -1))) for (const i of a.skipperIndices) heats[log.ids[i]][k] = a.heatDesignation;
  });
  const rows: StandingRow[] = order.map((s, k) => {
    const id = log.ids[s.index], n = names(id);
    const row = done.map((rd): Score => {
      const key = `${s.index}-${rd.round}`;
      const res1 = rd.results.filter(r => r.skipperIndex === s.index).sort((x, z) => (x.heatDesignation < z.heatDesignation ? -1 : 1))[0];
      const code = (res1?.letterScore as Score['code']) ?? null;
      return { points: key in scores ? scores[key] : null, place: res1?.position ?? null, code: code === 'DNF' || code === 'OCS' || code === 'DSQ' ? code : null, counted: key in scores, pending: false, dropped: !!drops[key] };
    });
    const t = totals[s.index] ?? { gross: 0, net: 0 };
    return { userId: id, name: n.name, sail: n.sail, scores: row, total: t.gross, net: t.net, rank: k + 1 };
  });
  return { rows, heats, races: done.length };
}
