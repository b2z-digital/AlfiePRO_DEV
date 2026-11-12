// The scoring bench: the same fleet sailed as a whole regatta under each scoring system AlfiePRO
// runs (low point in one fleet, HMS heats, SHRS heats and finals), with nobody watching, to see
// how each system ranks the same skippers. Every boat has a true strength (unknown to the systems);
// each race finishes by strength plus noise, with the odd letter score; and each system is run by
// AlfiePRO's own code, as Race Management runs it. Over many regattas the bench measures which system
// puts the best sailors at the top. Pure: nothing stored here, and nothing written anywhere.
import type { HeatAssignment, HeatDesignation, HeatManagement } from '@/types/heat';
import type { Skipper } from '@/types';
import type { RaceEvent } from '@/types/race';
import { calculateOptimalHeats as hmsHeats, seedInitialHeats } from '@/utils/hmsHeatSystem';
import { calculateOptimalHeats as shrsHeats } from '@/utils/shrsHeatSystem';
import { completeHeat, convertHeatResultsToRaceResults, updateHeatResult } from '@/utils/heatUtils';
import { computeEventResults } from '@/utils/eventResultsEngine';
import { Rng } from '@/sim/math';
import { LETTERS, SPREAD } from './heats';
import { STANDARD_DROPS, standings, type SeriesRace } from './series';

export type System = 'low' | 'hms' | 'shrs';
export const SYSTEM_NAME: Record<System, string> = { low: 'Low point, one fleet', hms: 'HMS heats', shrs: 'SHRS heats and finals' };
export type Mix = 'mixed' | 'close' | 'stars';
export const MIX_NAME: Record<Mix, string> = { mixed: 'Mixed: Club to World', close: 'Close: all one level', stars: 'A few stars and a pack' };
export type Code = 'DNF' | 'OCS' | 'DSQ';

export interface BenchSetup { fleet: number; races: number; mix: Mix; letters: boolean; seed: number }
export interface Entrant { name: string; sail: string; strength: number; level: string }

const FIRST = ['Alex', 'Sam', 'Jo', 'Kim', 'Lee', 'Max', 'Noa', 'Ren', 'Tia', 'Uma', 'Vic', 'Wyn', 'Ash', 'Bo', 'Cai', 'Dee'];
const LAST = ['Archer', 'Bell', 'Carver', 'Dane', 'Ellis', 'Ford', 'Grey', 'Hale', 'Irving', 'Jarvis', 'Keane', 'Lowe', 'Marsh', 'North', 'Oakes', 'Price', 'Quill', 'Reed', 'Shaw', 'Tate'];
const LEVEL = (s: number) => (s >= 2.5 ? 'World' : s >= 1.5 ? 'National' : s >= 0.5 ? 'Regional' : 'Club');

/** The fleet: invented skippers with a true strength each (0 Club to 3 World), drawn from the mix. */
export function fleetFor(b: BenchSetup): Entrant[] {
  const rng = new Rng(b.seed * 9176 + 11);
  return Array.from({ length: b.fleet }, (_, i) => {
    const strength = b.mix === 'mixed' ? rng.range(0, 3) : b.mix === 'close' ? 1.5 + rng.gauss() * 0.25 : i < Math.max(2, Math.round(b.fleet / 10)) ? 2.6 + rng.range(0, 0.4) : 0.8 + rng.gauss() * 0.4;
    return { name: `${FIRST[i % FIRST.length]} ${LAST[(i * 7 + Math.floor(i / FIRST.length)) % LAST.length]}`, sail: String(10 + i), strength: Math.round(strength * 100) / 100, level: LEVEL(strength) };
  });
}

/** How a race goes for a set of boats: everyone in order of strength plus noise; with letter scores on, about 1% over the line, 1.5% not finishing, 0.5% disqualified. */
function race(who: number[], fleet: Entrant[], rng: Rng, letters: boolean): { order: number[]; codes: [number, Code][] } {
  const codes: [number, Code][] = [];
  const order = who.map(i => ({ i, v: fleet[i].strength + rng.gauss() * SPREAD })).sort((a, z) => z.v - a.v).map(x => x.i).filter(i => {
    if (!letters) return true;
    const r = rng.next();
    const c: Code | null = r < 0.01 ? 'OCS' : r < 0.025 ? 'DNF' : r < 0.03 ? 'DSQ' : null;
    if (c) codes.push([i, c]);
    return !c;
  });
  return { order, codes };
}

const quiet = <T,>(f: () => T): T => {
  const l = console.log, w = console.warn, e = console.error;
  console.log = () => undefined; console.warn = () => undefined; console.error = () => undefined;
  try { return f(); } finally { console.log = l; console.warn = w; console.error = e; }
};
const skippersOf = (fleet: Entrant[]): Skipper[] => fleet.map(f => ({ name: f.name, sailNo: f.sail, sailNumber: f.sail, club: '', boatModel: '', startHcap: 100 }) as unknown as Skipper);

export interface Cell { text: string; heat?: HeatDesignation; dropped?: boolean }
export interface Ranked { index: number; rank: number; net: number; total: number; cells: Cell[] }
export interface Outcome {
  system: System; ran: boolean;
  /** Why it didn't run (too few boats for heats). */
  why?: string;
  heats?: number; promotion?: number; qualifying?: number;
  rows: Ranked[];
  /** Each race's heats, for the export. */
  hm?: HeatManagement;
}

/** Low point: every boat in every race, one fleet, scored by AlfiePRO's results engine. */
function runLow(b: BenchSetup, fleet: Entrant[]): Outcome {
  const rng = new Rng(b.seed * 31 + 1);
  const all = fleet.map((_, i) => i);
  const races: SeriesRace[] = Array.from({ length: b.races }, (_, k) => {
    const r = race(all, fleet, rng, b.letters);
    const at = (n: number) => new Date(Date.UTC(2026, 0, 1, 0, 0, n)).toISOString();
    return {
      no: k + 1, opened: true, open: false,
      entries: [
        ...r.order.map((i, p) => ({ userId: String(i), name: fleet[i].name, sail: fleet[i].sail, status: 'finished' as const, elapsed: p + 1, sailedAt: at(p) })),
        ...r.codes.map(([i, c], p) => ({ userId: String(i), name: fleet[i].name, sail: fleet[i].sail, status: (c === 'OCS' ? 'ocs' : c === 'DSQ' ? 'dsq' : 'dnf') as 'ocs' | 'dsq' | 'dnf', elapsed: null, sailedAt: at(200 + p) })),
      ],
    };
  });
  const rows = quiet(() => standings(races, STANDARD_DROPS));
  return {
    system: 'low', ran: true,
    rows: rows.map(r => ({ index: Number(r.userId), rank: r.rank, net: r.net, total: r.total, cells: r.scores.map(s => ({ text: !s ? '' : s.code ? `${s.code} ${s.points}` : String(s.points ?? ''), dropped: !!s?.dropped })) })),
  };
}

/** A heat regatta under HMS or SHRS, sailed round by round (lowest heat first), run by AlfiePRO's heat systems and scored by its results engine. */
function runHeats(system: 'hms' | 'shrs', b: BenchSetup, fleet: Entrant[]): Outcome {
  const n = fleet.length;
  const heats = system === 'hms' ? hmsHeats(n).numberOfHeats : shrsHeats(n);
  // (How many heats is AlfiePRO's own rule for each system: HMS sails one fleet under 16 boats.)
  if (!heats || heats < 2) return { system, ran: false, why: `${system.toUpperCase()} needs 16 or more boats to sail in heats (AlfiePRO's heat rule).`, rows: [] };
  const promotion = system === 'hms' ? hmsHeats(n).promotionCount : undefined;
  const qualifying = system === 'shrs' ? Math.ceil(b.races / 2) : undefined;
  // Seeded by ranking (a ranking list is the strongest first, as at a real event).
  const byStrength = fleet.map((_, i) => i).sort((a, z) => fleet[z].strength - fleet[a].strength);
  const L = LETTERS.slice(0, heats);
  let assign: HeatAssignment[];
  if (system === 'hms') {
    const seeded = quiet(() => seedInitialHeats(skippersOf(fleet), { numberOfHeats: heats, promotionCount: promotion ?? 4, seedingMethod: 'ranking' }, byStrength.map((idx, k) => ({ skipperIndex: idx, ranking: k + 1 }))));
    assign = seeded;
  } else {
    assign = L.map(h => ({ heatDesignation: h, skipperIndices: [] as number[] }));
    byStrength.forEach((idx, k) => { const m = k % (2 * heats); assign[m < heats ? m : 2 * heats - 1 - m].skipperIndices.push(idx); });
  }
  let hm: HeatManagement = {
    configuration: { enabled: true, numberOfHeats: heats, promotionCount: promotion ?? 0, seedingMethod: 'manual', autoAssign: false, scoringSystem: system, ...(system === 'shrs' ? { shrsAssignmentMode: 'progressive' as const, shrsQualifyingRounds: qualifying, heatLabelStyle: 'letters' as const } : {}) },
    rounds: [{ round: 1, heatAssignments: assign, results: [], completed: false }], currentRound: 1, currentHeat: null,
  };
  const rng = new Rng(b.seed * 53 + (system === 'hms' ? 3 : 7));
  quiet(() => {
    for (let r = 1; r <= b.races; r++) {
      hm = { ...hm, currentRound: r };
      for (const h of [...L].reverse()) {
        const who = hm.rounds.find(x => x.round === r)!.heatAssignments.find(a => a.heatDesignation === h)!.skipperIndices;
        const res = race(who, fleet, rng, b.letters);
        res.order.forEach((idx, k) => { hm = updateHeatResult(hm, { skipperIndex: idx, position: k + 1, heatDesignation: h, race: r, round: r }); });
        for (const [idx, code] of res.codes) hm = updateHeatResult(hm, { skipperIndex: idx, position: null, letterScore: code, heatDesignation: h, race: r, round: r });
        hm = completeHeat(hm, h, system);
      }
      if (system === 'shrs' && r >= (qualifying ?? Infinity)) hm = { ...hm, configuration: { ...hm.configuration, shrsFinalsStarted: true } };
    }
  });
  const skippers = skippersOf(fleet);
  const raceResults = convertHeatResultsToRaceResults(hm, skippers);
  const event = { id: 'bench', eventName: 'Scoring bench', clubName: '', date: '', venue: '', raceClass: 'IOM', raceFormat: 'scratch', skippers, raceResults, heatManagement: hm, dropRules: STANDARD_DROPS, scoringSystem: system, lastCompletedRace: b.races, completed: true, numRaces: b.races } as unknown as RaceEvent;
  const res = quiet(() => computeEventResults(event, event));
  const scores = (res.resolvedScores ?? {}) as Record<string, number>, drops = res.drops as Record<string, boolean>, totals = res.totals as Record<number, { gross: number; net: number }>;
  const order = (res.displaySkippers ?? res.sortedSkippersResolved) as { index: number }[];
  const done = hm.rounds.filter(r => r.completed);
  const rows: Ranked[] = order.map((s, k) => ({
    index: s.index, rank: k + 1, net: totals[s.index]?.net ?? 0, total: totals[s.index]?.gross ?? 0,
    cells: done.map(rd => {
      const mine = rd.results.filter(x => x.skipperIndex === s.index).sort((x, z) => (x.heatDesignation < z.heatDesignation ? -1 : 1))[0];
      const key = `${s.index}-${rd.round}`, pts = scores[key];
      return { text: mine?.letterScore ? `${mine.letterScore} ${pts ?? ''}`.trim() : pts !== undefined ? String(pts) : '', heat: mine?.heatDesignation, dropped: !!drops[key] };
    }),
  }));
  return { system, ran: true, heats, promotion, qualifying, rows, hm };
}

export function runSystem(system: System, b: BenchSetup, fleet = fleetFor(b)): Outcome {
  return system === 'low' ? runLow(b, fleet) : runHeats(system, b, fleet);
}

// ───────────────────────── Measuring a system ─────────────────────────

/** Spearman's rank correlation between two orderings of the same boats (1: the same order). */
export function spearman(a: number[], b: number[]): number {
  const n = a.length;
  if (n < 2) return 1;
  const pos = new Map(b.map((idx, k) => [idx, k]));
  const d2 = a.reduce((s, idx, k) => s + (k - (pos.get(idx) ?? k)) ** 2, 0);
  return 1 - (6 * d2) / (n * (n * n - 1));
}

export interface Score { system: System; regattas: number; rho: number; bestWins: number; bestRank: number; topTenRight: number }

/** How well a system finds the best sailors, over `count` regattas of the same set-up (different fleets and races each time). */
export function measure(system: System, b: BenchSetup, count: number): Score | null {
  let rho = 0, wins = 0, rankOfBest = 0, top = 0, ran = 0;
  for (let k = 0; k < count; k++) {
    const setup = { ...b, seed: b.seed * 1000 + k + 1 };
    const fleet = fleetFor(setup);
    const out = runSystem(system, setup, fleet);
    if (!out.ran) return null;
    ran++;
    const truth = fleet.map((_, i) => i).sort((a, z) => fleet[z].strength - fleet[a].strength);
    const result = out.rows.map(r => r.index);
    rho += spearman(truth, result);
    if (result[0] === truth[0]) wins++;
    rankOfBest += result.indexOf(truth[0]) + 1;
    const ten = new Set(truth.slice(0, 10));
    top += result.slice(0, 10).filter(i => ten.has(i)).length / Math.min(10, fleet.length);
  }
  return { system, regattas: ran, rho: rho / ran, bestWins: wins / ran, bestRank: rankOfBest / ran, topTenRight: top / ran };
}

// ───────────────────────── Taking the results away ─────────────────────────

/** A results table, rows of cells: a CSV for low point and HMS (Position, Skipper, Sail, Club, R1…, Total, Net), and SHRS in Race Management's import template (Name, Sail, Club, Q1…, F1…, Total, Net). */
export function exportRows(out: Outcome, fleet: Entrant[]): (string | number)[][] {
  const races = out.rows[0]?.cells.length ?? 0;
  if (out.system === 'shrs') {
    const q = out.qualifying ?? races;
    const head = ['Name', 'Sail', 'Club', ...Array.from({ length: races }, (_, k) => (k < q ? `Q${k + 1}` : `F${k - q + 1}`)), 'Total', 'Net'];
    const FL: Record<string, string> = { A: 'G', B: 'S', C: 'B', D: 'C' };
    return [head, ...out.rows.map(r => [fleet[r.index].name, `AUS ${fleet[r.index].sail}`, 'Bench', ...r.cells.map((c, k) => (k >= q && /[A-Z]{3}/.test(c.text) && c.heat ? `${c.text}${FL[c.heat] ?? ''}` : c.text)), r.total, r.net])];
  }
  const head = ['Position', 'Skipper', 'Sail', 'Club', ...Array.from({ length: races }, (_, k) => `R${k + 1}`), 'Total', 'Net'];
  return [head, ...out.rows.map(r => [r.rank, fleet[r.index].name, `AUS ${fleet[r.index].sail}`, 'Bench', ...r.cells.map(c => c.text), r.total, r.net])];
}
export const toCsv = (rows: (string | number)[][]): string => rows.map(r => r.map(c => (/[",\n]/.test(String(c)) ? `"${String(c).replace(/"/g, '""')}"` : String(c))).join(',')).join('\n');
