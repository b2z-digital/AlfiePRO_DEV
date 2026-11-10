// Scoring a virtual race event with the club's own results engine (computeEventResults): exactly
// the scoring AlfiePRO's race management uses for real racing, with the same points, letter scores
// (skippers in the event + 1), drop rules, DNC for a race not sailed, and countback. Each race of
// the virtual event is a race of a scratch event, and everyone who has sailed any race of it is
// one of its skippers. The event itself stays a separate, virtual layer: this only borrows the
// arithmetic, and nothing is written to the club's events or results.
import type { RaceEvent } from '@/types/race';
import type { Skipper } from '@/types';
import { computeEventResults } from '@/utils/eventResultsEngine';

export type EntryStatus = 'finished' | 'dsq' | 'ocs' | 'dnf' | 'started';

/** One skipper's result in one race of the event. */
export interface SeriesEntry {
  userId: string;
  name: string;
  sail: string | null;
  status: EntryStatus;
  /** Elapsed time from the gun, seconds (finishers). */
  elapsed: number | null;
  sailedAt: string;
}

export interface SeriesRace {
  no: number;
  /** Opened: its results can count. */
  opened: boolean;
  /** Still open: skippers can still sail it (or are sailing it). */
  open: boolean;
  entries: SeriesEntry[];
}

/** A skipper's score in one race. */
export interface Score {
  /** Points in the series (when the race counts), or her place in the race. */
  points: number | null;
  /** Her place in the race, if she finished. */
  place: number | null;
  /** DNF, OCS, DSQ, or DNC (didn't sail it); null for a finish. */
  code: 'DNF' | 'OCS' | 'DSQ' | 'DNC' | null;
  /** The race counts in the standings (the results engine decides, as for real racing). */
  counted: boolean;
  /** The race is still open and she hasn't finished it: this may change. */
  pending: boolean;
  /** One of her races dropped from the total. */
  dropped: boolean;
}

export interface StandingRow {
  userId: string;
  name: string;
  sail: string | null;
  /** By race (in race order); null for a race that hasn't opened yet. */
  scores: (Score | null)[];
  total: number;
  net: number;
  rank: number;
}

/** The club's usual drops (RRS Appendix A in AlfiePRO): one race dropped once 4 count, two at 8, ... */
export const STANDARD_DROPS = [4, 8, 16, 24, 32, 40];

/** "One drop after 4 races", "Every race counts" (no drops, or too few races for one). */
export function dropsText(schedule: number[], races = Infinity): string {
  const at = schedule.filter(n => n <= races);
  if (!at.length) return 'Every race counts';
  return `One drop after ${at[0]} races${at.length > 1 ? `, two after ${at[1]}` : ''}`;
}

/** The race's finishers in order of time, each with her place (1, 2, 3, ...), then everyone else. */
export function raceResults(entries: SeriesEntry[]): { entry: SeriesEntry; place: number | null }[] {
  const fin = entries.filter(e => e.status === 'finished' && e.elapsed != null)
    .sort((a, b) => a.elapsed! - b.elapsed! || Date.parse(a.sailedAt) - Date.parse(b.sailedAt));
  const order: Record<EntryStatus, number> = { finished: 0, started: 1, dnf: 2, ocs: 3, dsq: 4 };
  const rest = entries.filter(e => !fin.includes(e)).sort((a, b) => order[a.status] - order[b.status] || Date.parse(a.sailedAt) - Date.parse(b.sailedAt));
  return [...fin.map((entry, k) => ({ entry, place: k + 1 })), ...rest.map(entry => ({ entry, place: null }))];
}

const LETTER: Record<'dnf' | 'ocs' | 'dsq', 'DNF' | 'OCS' | 'DSQ'> = { dnf: 'DNF', ocs: 'OCS', dsq: 'DSQ' };

/** The series standings: every skipper who has sailed any race of it, in the results engine's order. */
export function standings(races: SeriesRace[], dropRules: number[]): StandingRow[] {
  const sorted = [...races].sort((a, b) => a.no - b.no);
  // Everyone in the event, in the order they first sailed, with the name and number from their
  // latest race.
  const people = new Map<string, { name: string; sail: string | null; first: number; at: number }>();
  for (const r of sorted) for (const e of r.entries) {
    const at = Date.parse(e.sailedAt);
    const was = people.get(e.userId);
    if (!was) people.set(e.userId, { name: e.name, sail: e.sail, first: at, at });
    else {
      was.first = Math.min(was.first, at);
      if (at >= was.at) Object.assign(was, { name: e.name, sail: e.sail, at });
    }
  }
  const ids = [...people.keys()].sort((a, b) => people.get(a)!.first - people.get(b)!.first || (a < b ? -1 : 1));
  if (!ids.length) return [];
  const index = new Map(ids.map((id, i) => [id, i]));

  // The event as the results engine sees it: a scratch event, a race for each of ours that has
  // opened. A try still under way in an open race has no result yet; once the race closes it's a DNF.
  const places = new Map<string, number>(); // `${userId}:${race}`
  const results: { race: number; skipperIndex: number; position: number | null; letterScore: string | null }[] = [];
  for (const r of sorted) {
    if (!r.opened) continue;
    for (const { entry, place } of raceResults(r.entries)) {
      const skipperIndex = index.get(entry.userId)!;
      if (place !== null) {
        places.set(`${entry.userId}:${r.no}`, place);
        results.push({ race: r.no, skipperIndex, position: place, letterScore: null });
      } else if (entry.status === 'started') {
        if (!r.open) results.push({ race: r.no, skipperIndex, position: null, letterScore: 'DNF' });
      } else results.push({ race: r.no, skipperIndex, position: null, letterScore: LETTER[entry.status as 'dnf' | 'ocs' | 'dsq'] });
    }
  }
  const closed = sorted.filter(r => r.opened && !r.open);
  const skippers = ids.map(id => ({ name: people.get(id)!.name, sailNo: people.get(id)!.sail ?? '', sailNumber: people.get(id)!.sail ?? '' })) as unknown as Skipper[];
  const event = {
    id: 'virtual', clubName: '', date: '', venue: '', raceClass: 'IOM', raceFormat: 'scratch',
    skippers, raceResults: results, dropRules,
    completed: sorted.length > 0 && sorted.every(r => r.opened && !r.open),
    lastCompletedRace: closed.length ? Math.max(...closed.map(r => r.no)) : 0,
  } as unknown as RaceEvent;
  const res = computeEventResults(event, event);
  const scores = (res.resolvedScores ?? {}) as Record<string, number>;
  const drops = res.drops as Record<string, boolean>;
  const totals = res.totals as Record<number, { gross: number; net: number }>;

  return res.sortedSkippersResolved.map((s: { index: number }, k: number) => {
    const userId = ids[s.index];
    const p = people.get(userId)!;
    const row = sorted.map((r): Score | null => {
      if (!r.opened) return null;
      const key = `${s.index}-${r.no}`;
      const entry = r.entries.find(e => e.userId === userId) ?? null;
      const place = places.get(`${userId}:${r.no}`) ?? null;
      const pending = r.open && place === null && (!entry || entry.status === 'started');
      const code: Score['code'] = place !== null || pending ? null
        : !entry ? 'DNC' : entry.status === 'started' ? 'DNF' : LETTER[entry.status as 'dnf' | 'ocs' | 'dsq'];
      const counted = key in scores;
      return { points: counted ? scores[key] : place, place, code, counted, pending, dropped: !!drops[key] };
    });
    const t = totals[s.index] ?? { gross: 0, net: 0 };
    return { userId, name: p.name, sail: p.sail, scores: row, total: t.gross, net: t.net, rank: k + 1 };
  });
}

/** "3", "(9)" for a dropped race, "DNF 9", "DNC 9"; "–" for a race not sailed yet. In a race that
 *  doesn't count yet, just her place. */
export function scoreText(s: Score | null): string {
  if (!s) return '';
  if (!s.counted) return s.place !== null ? String(s.place) : s.pending ? '–' : s.code ?? '';
  const n = s.points === null ? '' : Number.isInteger(s.points) ? String(s.points) : s.points.toFixed(1);
  const t = s.code ? `${s.code} ${n}` : s.pending ? `– ${n}` : n;
  return s.dropped ? `(${t})` : t;
}
