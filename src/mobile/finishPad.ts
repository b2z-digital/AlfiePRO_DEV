/**
 * The finish pad (Race Management board, "Calling the finish"): the boats of the race or heat
 * as the desktop Touch mode sees them, the finish order rules from utils/finishOrder, and
 * matching typed or spoken sail numbers to boats.
 */
import type { Skipper } from '../types';
import type { RaceEvent } from '../types/race';
import type { HeatDesignation } from '../types/heat';
import { POSITION_PRESERVING_SCORES, addFinish, applyLetterScore, loadFinishOrder, moveFinish, sortFinishOrder, type FinishingEntry, type RaceResult } from '../utils/finishOrder';
import { heatRaceResultsFor, skippersScoredInOtherHeats } from '../utils/raceProgress';
import { heatManagementOf, scoringStateOf } from '../utils/raceSetup';
import { forScoring, loadSession, sailOf, saveSession, type NextUp, type PadInfo, type RaceSession } from './raceSession';

export interface PadBoats {
  /** The boats as Touch mode receives them: the heat's boats for heats, else every skipper. */
  skippers: Skipper[];
  /** Event skipper index of each pad boat. */
  globalOf: number[];
  /** The race's results with pad indices (Touch mode's raceResults). */
  results: RaceResult[];
}

export function padBoats(event: RaceEvent, up: NextUp): PadBoats {
  const e = forScoring(event);
  const st = scoringStateOf(e);
  const all = st.skippers || [];
  const hm = heatManagementOf(e);
  if (up.heat && hm?.configuration?.enabled) {
    // HeatScoringTable: heatSkippers, heatRaceResults → mappedRaceResults
    const globalOf = up.skipperIndices.filter(i => i >= 0 && i < all.length);
    const others = skippersScoredInOtherHeats(hm, up.heat as HeatDesignation);
    const results = heatRaceResultsFor(st.raceResults, globalOf, hm.currentRound, others)
      .map(r => ({ ...r, skipperIndex: globalOf.indexOf(r.skipperIndex) }));
    return { skippers: globalOf.map(i => all[i]), globalOf, results };
  }
  return { skippers: all, globalOf: all.map((_, i) => i), results: st.raceResults };
}

/** The finish order the pad starts from: what's already scored for this race, plus the OCS marks made at the start. */
export function startingOrder(boats: PadBoats, race: number, session: RaceSession): FinishingEntry[] {
  let order = loadFinishOrder(boats.skippers, boats.results, race).entries;
  for (const m of session.marks || []) {
    const local = boats.globalOf.indexOf(m.skipperIndex);
    if (local >= 0 && !order.some(e => e.skipperIndex === local)) order = applyLetterScore(order, boats.skippers, local, 'OCS');
  }
  return sortFinishOrder(order);
}

export const ordinal = (n: number) => {
  const s = n % 100 >= 11 && n % 100 <= 13 ? 'th' : n % 10 === 1 ? 'st' : n % 10 === 2 ? 'nd' : n % 10 === 3 ? 'rd' : 'th';
  return `${n}${s}`;
};

export const shortName = (s?: Skipper) => {
  const parts = String(s?.name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return parts[0] || '';
  return `${parts[0][0]}. ${parts[parts.length - 1]}`;
};

const norm = (s: string) => s.trim().toUpperCase();

/** Keypad: boats still to finish whose sail number starts with what's typed (numbers in order). */
export function keypadMatches(typed: string, skippers: Skipper[], open: number[]): number[] {
  const t = norm(typed);
  if (!t) return [];
  return open
    .filter(i => norm(sailOf(skippers[i])).startsWith(t))
    .sort((a, b) => {
      const x = norm(sailOf(skippers[a])), y = norm(sailOf(skippers[b]));
      return x.length - y.length || x.localeCompare(y, undefined, { numeric: true });
    });
}

/** The boat a typed number picks by itself: an exact sail number no other open boat's number starts with. */
export function keypadPick(typed: string, skippers: Skipper[], open: number[]): number | null {
  const m = keypadMatches(typed, skippers, open);
  const exact = m.filter(i => norm(sailOf(skippers[i])) === norm(typed));
  return exact.length === 1 && m.length === 1 ? exact[0] : null;
}

/* ─────────────── voice ─────────────── */

const UNITS: Record<string, number> = { zero: 0, oh: 0, o: 0, nought: 0, nil: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, niner: 9 };
/** Sounds-alike words, taken as a number only when that's all that was said ("for" → 4). */
const ALIKE: Record<string, number> = { won: 1, to: 2, too: 2, tree: 3, for: 4, fore: 4, ate: 8 };
const TEENS: Record<string, number> = { ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19 };
const TENS: Record<string, number> = { twenty: 20, thirty: 30, forty: 40, fourty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
/** "Oh" is a zero only next to other numbers ("one oh one"). */
const WEAK = new Set(['o', 'oh']);

export type Heard =
  | { kind: 'undo' }
  | { kind: 'number'; said: string; value: string };

/**
 * Splits what was said into sail numbers. Digit-by-digit ("one oh one") stays as separate digits
 * so the boats in the race decide how they join; "twenty three" and "one hundred and one" are
 * whole numbers. "Scratch that" (or "undo") takes the last finish back.
 */
export function parseSpoken(text: string): Heard[] {
  const words = text.toLowerCase().replace(/[-–]/g, ' ').replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean)
    .map(w => w.replace(/^(\d+)(st|nd|rd|th)$/, '$1'));
  if (words.length === 1 && words[0] in ALIKE) return [{ kind: 'number', said: words[0], value: String(ALIKE[words[0]]) }];
  const out: Heard[] = [];
  let i = 0;
  const isNumWord = (w?: string) => !!w && (/^\d+$/.test(w) || w in UNITS || w in TEENS || w in TENS || w === 'hundred');
  while (i < words.length) {
    const w = words[i];
    if ((w === 'scratch' && words[i + 1] === 'that') || w === 'undo' || (w === 'cancel' && words[i + 1] === 'that')) {
      out.push({ kind: 'undo' });
      i += w === 'undo' ? 1 : 2;
      continue;
    }
    if (!isNumWord(w) || (WEAK.has(w) && !isNumWord(words[i + 1]) && !isNumWord(words[i - 1]))) { i++; continue; }
    // one spoken number
    const start = i;
    if (/^\d+$/.test(w)) { out.push({ kind: 'number', said: w, value: w }); i++; continue; }
    if (w in TEENS) { out.push({ kind: 'number', said: w, value: String(TEENS[w]) }); i++; continue; }
    if (w in TENS) {
      let v = TENS[w]; i++;
      if (words[i] in UNITS && UNITS[words[i]] > 0) { v += UNITS[words[i]]; i++; }
      out.push({ kind: 'number', said: words.slice(start, i).join(' '), value: String(v) });
      continue;
    }
    if (w === 'hundred') { i++; continue; }
    // a unit: "one", or "one hundred (and) twenty three"
    const u = UNITS[w];
    if (words[i + 1] === 'hundred') {
      let v = u * 100; i += 2;
      if (words[i] === 'and') i++;
      if (words[i] in TEENS) { v += TEENS[words[i]]; i++; } else if (words[i] in TENS) {
        v += TENS[words[i]]; i++;
        if (words[i] in UNITS && UNITS[words[i]] > 0) { v += UNITS[words[i]]; i++; }
      } else if (words[i] in UNITS && UNITS[words[i]] > 0) { v += UNITS[words[i]]; i++; }
      out.push({ kind: 'number', said: words.slice(start, i).join(' '), value: String(v) });
      continue;
    }
    out.push({ kind: 'number', said: w, value: String(u) });
    i++;
  }
  return out;
}

export type Call =
  | { kind: 'undo' }
  | { kind: 'boat'; said: string; index: number }
  /** A boat that already has a finish or a letter score: left as it is. */
  | { kind: 'seen'; said: string; index: number }
  | { kind: 'ask'; said: string; options: number[] };

const oneEditApart = (a: string, b: string) => {
  if (a === b) return false;
  if (Math.abs(a.length - b.length) > 1) return false;
  if (a.length === b.length) { let d = 0; for (let k = 0; k < a.length; k++) if (a[k] !== b[k]) d++; return d === 1; }
  const [s, l] = a.length < b.length ? [a, b] : [b, a];
  for (let k = 0; k < l.length; k++) if (l.slice(0, k) + l.slice(k + 1) === s) return true;
  return false;
};

/**
 * Turns heard numbers into boats of this race. Neighbouring digits join when they make a sail
 * number in the race ("one oh one" → 101); anything that isn't a boat here asks, offering the
 * nearest sail numbers. Boats that already finished are reported, not moved.
 */
export function matchCalls(heard: Heard[], skippers: Skipper[], indices: number[], finished: Set<number>): Call[] {
  const bySail = new Map<string, number>();
  for (const i of indices) { const s = norm(sailOf(skippers[i])); if (s) bySail.set(s, i); }
  const out: Call[] = [];
  let k = 0;
  while (k < heard.length) {
    const h = heard[k];
    if (h.kind === 'undo') { out.push(h); k++; continue; }
    // longest run of neighbouring numbers that is a sail number here
    let best = -1, bestSaid = '', bestIdx = -1;
    let joined = '';
    const said: string[] = [];
    for (let j = k; j < heard.length && heard[j].kind === 'number' && j - k < 4; j++) {
      const hj = heard[j] as Extract<Heard, { kind: 'number' }>;
      joined += hj.value; said.push(hj.said);
      if (bySail.has(joined)) { best = j; bestSaid = said.join(' '); bestIdx = bySail.get(joined)!; }
    }
    if (best >= 0) {
      out.push({ kind: finished.has(bestIdx) ? 'seen' : 'boat', said: bestSaid, index: bestIdx });
      k = best + 1;
      continue;
    }
    const v = h.value;
    const options = indices.filter(i => !finished.has(i)).filter(i => {
      const s = norm(sailOf(skippers[i]));
      // single digits are too short to guess a near miss from
      return s.startsWith(v) || (v.length > 1 && oneEditApart(s, v));
    }).sort((a, b) => norm(sailOf(skippers[a])).localeCompare(norm(sailOf(skippers[b])), undefined, { numeric: true })).slice(0, 4);
    out.push({ kind: 'ask', said: h.said, options });
    k++;
  }
  return out;
}

/* ─────────────── the shared finish order (Score together) ─────────────── */

/** The order as Touch mode shows it once a change is saved and read back. */
export function readBack(changed: FinishingEntry[]): FinishingEntry[] {
  return sortFinishOrder(changed.map(x => ({ ...x, position: x.letterScore && !POSITION_PRESERVING_SCORES.has(x.letterScore) ? 999 : x.position })));
}

export function padInfoOf(boats: PadBoats, up: NextUp): PadInfo {
  return {
    globalOf: boats.globalOf,
    boats: boats.skippers.map(s => ({ sail: sailOf(s), name: s?.name || '' })),
    raceLabel: up.raceLabel,
    heatLabel: up.heat ? up.heatLabel : '',
    heatIndex: up.heatIndex,
  };
}

/** Enough of each boat for the finish order rules (sail number and name). */
export const padSkippers = (pad: PadInfo): Skipper[] => pad.boats.map(b => ({ name: b.name, sailNo: b.sail } as Skipper));

export interface RemoteCall { id: string; g: number; place: number; who: string; at: number }

/**
 * A finish called on another phone: the boat takes the next place. If that phone meant a place
 * this phone has already given to another boat, the place is in dispute until the scorer decides
 * (the new boat sits one place lower meanwhile). Boats already in the order are left alone.
 */
export function applyRemoteCall(s: RaceSession, call: RemoteCall): { session: RaceSession; outcome: 'added' | 'already' | 'conflict' | 'unknown' } {
  const pad = s.pad;
  if (!pad) return { session: s, outcome: 'unknown' };
  const local = pad.globalOf.indexOf(call.g);
  if (local < 0) return { session: s, outcome: 'unknown' };
  // before the finish pad was opened: start from the boats marked OCS at the start
  let order = s.finish || [];
  if (!s.finish) {
    for (const m of s.marks || []) {
      const i = pad.globalOf.indexOf(m.skipperIndex);
      if (i >= 0 && !order.some(e => e.skipperIndex === i)) order = applyLetterScore(order, padSkippers(pad), i, 'OCS');
    }
  }
  if (order.some(e => e.skipperIndex === local)) return { session: s, outcome: 'already' };
  const added = addFinish(order, padSkippers(pad), local);
  if (!added) return { session: s, outcome: 'already' };
  const next = readBack(added);
  const callers = { ...(s.callers || {}), [local]: { who: call.who, at: call.at } };
  const myPlace = next.find(e => e.skipperIndex === local)!.position;
  let conflicts = s.conflicts || [];
  let outcome: 'added' | 'conflict' = 'added';
  if (call.place < myPlace) {
    const occupant = next.find(e => !e.letterScore && e.position === call.place);
    if (occupant && !conflicts.some(c => c.place === call.place)) {
      const oc = callers[occupant.skipperIndex];
      conflicts = [...conflicts, { id: call.id, place: call.place, a: occupant.skipperIndex, aWho: oc?.who || 'You', aAt: oc?.at || 0, b: local, bWho: call.who, bAt: call.at }];
      outcome = 'conflict';
    }
  }
  return { session: { ...s, finish: next, callers, conflicts, added: [...(s.added || []), local] }, outcome };
}

/** The scorer decides who finished in the disputed place; the other boat goes one place lower. */
export function resolveConflict(s: RaceSession, conflictId: string, winner: number): RaceSession {
  const c = (s.conflicts || []).find(x => x.id === conflictId);
  if (!c) return s;
  let order = s.finish || [];
  if (winner === c.b) {
    const target = order.findIndex(e => !e.letterScore && e.position === c.place);
    const from = order.findIndex(e => e.skipperIndex === c.b);
    if (target >= 0 && from >= 0 && from !== target && !order[from].letterScore) order = readBack(moveFinish(order, from, target));
  }
  return { ...s, finish: order, conflicts: (s.conflicts || []).filter(x => x.id !== conflictId) };
}

/**
 * Keeps the race session ready for calls from other phones: the boats of the race or heat, and
 * (once the gun has gone) the finish order the finish pad starts from.
 */
export function registerPad(event: RaceEvent, up: NextUp): RaceSession {
  const s0 = loadSession(event.id, up);
  const boats = padBoats(event, up);
  const pad = padInfoOf(boats, up);
  const s: RaceSession = { ...s0, pad, finish: s0.finish || (s0.gunAt ? startingOrder(boats, up.race, s0) : s0.finish) };
  if (JSON.stringify(s.pad) !== JSON.stringify(s0.pad) || s.finish !== s0.finish) saveSession(s);
  return s;
}
